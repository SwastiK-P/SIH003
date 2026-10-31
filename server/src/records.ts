import { all, bump, get, now, rules, run, tx } from "./db.js";
import { audit, type Actor } from "./audit.js";
import { readRow } from "./fields.js";
import { publish } from "./live.js";
import { countQuotas, groupBy, issuesFor, national, preview, type Issue, type Programme, type Student } from "./validate.js";

/** Reading and writing an institution's student records. */

export const COLUMNS = ["apaar_id", "program_id", "enrolment_no", "name", "dob", "gender", "social_category", "quota", "nationality", "nri", "oci", "fn", "passport_no", "admission_date", "year_of_study", "status", "email", "phone"] as const;

export const programmesOf = (institutionId: string) =>
  all<Programme & { duration: number; last_year: number | null }>(`SELECT p.id, p.institution_id, p.name, p.level, p.duration, i.approved, i.last_year_enrolled AS last_year FROM programs p
    LEFT JOIN intakes i ON i.program_id = p.id AND i.academic_year = ? WHERE p.institution_id = ? ORDER BY p.level DESC, p.name`, rules().academic_year, institutionId);

export function submissionOf(institutionId: string) {
  const R = rules();
  return get<any>("SELECT * FROM submissions WHERE institution_id = ? AND academic_year = ?", institutionId, R.academic_year)
    ?? { institution_id: institutionId, academic_year: R.academic_year, status: "draft" };
}

/** Records may change freely until submitted; after that each change is an amendment with a reason. */
export const isLocked = (institutionId: string) => ["submitted", "accepted"].includes(submissionOf(institutionId).status);

export function programmeTable(institutionId: string) {
  const R = rules();
  const progs = programmesOf(institutionId);
  const cohort = national().students.filter((s) => s.institution_id === institutionId && s.status === "active" && s.academic_year === R.academic_year);
  const by = groupBy(cohort, (s) => s.program_id);
  return progs.map((p) => {
    const c = countQuotas(by.get(p.id) ?? []);
    const approved = p.approved ?? 0;
    return {
      ...p, ...c,
      caps: { tfw: Math.floor((approved * R.tfw_cap_pct) / 100), fn: Math.floor((approved * R.fn_cap_pct) / 100), lateral: Math.floor((approved * R.lateral_cap_pct) / 100) },
      excess: Math.max(0, c.regular - approved),
    };
  });
}

/** Rows from a file, read and checked as if they were saved. Nothing is written. */
export function previewRows(institutionId: string, raw: Record<string, unknown>[]) {
  const R = rules();
  const progs = programmesOf(institutionId);
  const rows = raw.map((r, i) => readRow(r, institutionId, R.academic_year, progs, -(i + 1), i + 1));
  const { issues, merged } = preview(institutionId, rows);
  const existing = new Map(national().students.filter((s) => s.institution_id === institutionId && s.academic_year === R.academic_year && s.apaar_id).map((s) => [s.apaar_id!, s]));
  const byRow = new Map<number, Issue[]>();
  for (const i of issues) for (const r of i.rows ?? []) { const a = byRow.get(r) ?? []; a.push(i); byRow.set(r, a); }
  const programmeIssues = issues.filter((i) => i.scope === "program");
  // Programme-level problems that exist only because of this file.
  const before = new Set(issuesFor(institutionId).map((i) => i.key));
  const by = groupBy(merged.filter((s) => s.status === "active" && s.academic_year === R.academic_year), (s) => s.program_id);
  const projection = progs.map((p) => ({ id: p.id, name: p.name, approved: p.approved ?? 0, ...countQuotas(by.get(p.id) ?? []), adding: rows.filter((r) => r.program_id === p.id).length }));
  return {
    rows: rows.map((r) => ({
      row: r.row!, record: r,
      action: r.apaar_id && existing.has(r.apaar_id) ? "update" : "add",
      issues: (byRow.get(r.row!) ?? []).map(({ code, severity, title, detail }) => ({ code, severity, title, detail })),
    })),
    programmeIssues: programmeIssues.map((i) => ({ ...i, isNew: !before.has(i.key) })),
    projection,
  };
}

function upsert(s: Student, institutionId: string, actor: Actor, source: string, locked: boolean) {
  const R = rules();
  const at = now();
  const existing = s.apaar_id
    ? get<any>("SELECT * FROM students WHERE institution_id = ? AND academic_year = ? AND apaar_id = ?", institutionId, R.academic_year, s.apaar_id)
    : s.enrolment_no ? get<any>("SELECT * FROM students WHERE institution_id = ? AND academic_year = ? AND enrolment_no = ? AND apaar_id IS NULL", institutionId, R.academic_year, s.enrolment_no) : undefined;
  const values = COLUMNS.map((c) => (s as any)[c] ?? null);
  if (existing) {
    const changed = COLUMNS.filter((c) => String(existing[c] ?? "") !== String((s as any)[c] ?? ""));
    if (!changed.length) return { id: existing.id as number, action: "unchanged" as const };
    run(`UPDATE students SET ${COLUMNS.map((c) => `${c} = ?`).join(", ")}, updated_at = ?, version = version + 1, source = ?, amended_after_submit = amended_after_submit OR ? WHERE id = ?`, ...values, at, source, locked ? 1 : 0, existing.id);
    return { id: existing.id as number, action: "updated" as const, changed };
  }
  const r = run(`INSERT INTO students (${COLUMNS.join(", ")}, institution_id, academic_year, source, amended_after_submit, created_at, updated_at) VALUES (${COLUMNS.map(() => "?").join(", ")}, ?, ?, ?, ?, ?, ?)`, ...values, institutionId, R.academic_year, source, locked ? 1 : 0, at, at);
  return { id: Number(r.lastInsertRowid), action: "added" as const };
}

export function importRows(institutionId: string, raw: Record<string, unknown>[], actor: Actor, opts: { source: string; skipErrors: boolean; fileName?: string }) {
  const p = previewRows(institutionId, raw);
  const take = p.rows.filter((r) => !opts.skipErrors || !r.issues.some((i) => i.severity === "error"));
  const locked = isLocked(institutionId);
  const result = { added: 0, updated: 0, unchanged: 0, skipped: p.rows.length - take.length };
  tx(() => {
    for (const r of take) {
      const { invalid, row, id, ...rec } = r.record;
      const out = upsert(rec as Student, institutionId, actor, opts.source, locked);
      result[out.action]++;
    }
  });
  bump();
  audit(actor, "records.imported", { entity: "institution", entityId: institutionId, institutionId, detail: { ...result, file: opts.fileName ?? null, source: opts.source } });
  publish({ type: "records", institution_id: institutionId, ...result });
  return result;
}

export function saveOne(institutionId: string, raw: Record<string, unknown>, actor: Actor, studentId?: number, reason?: string) {
  const R = rules();
  const progs = programmesOf(institutionId);
  const s = readRow(raw, institutionId, R.academic_year, progs, studentId ?? 0);
  if (s.invalid?.length) return { error: `Couldn't read ${s.invalid.join(", ")}.` };
  const locked = isLocked(institutionId);
  if (locked && !reason?.trim()) return { error: "The data has been submitted. Give a reason for this change; it's recorded as an amendment." };
  let id: number;
  if (studentId) {
    const before = get<any>("SELECT * FROM students WHERE id = ? AND institution_id = ?", studentId, institutionId);
    if (!before) return { error: "No such student." };
    const clash = s.apaar_id && get<any>("SELECT id FROM students WHERE institution_id = ? AND academic_year = ? AND apaar_id = ? AND id != ?", institutionId, before.academic_year, s.apaar_id, studentId);
    if (clash) return { error: "Another record here already uses this APAAR ID." };
    const changed = COLUMNS.filter((c) => c !== "status" && String(before[c] ?? "") !== String((s as any)[c] ?? ""));
    const cols = COLUMNS.filter((c) => c !== "status");
    run(`UPDATE students SET ${cols.map((c) => `${c} = ?`).join(", ")}, updated_at = ?, version = version + 1, source = 'form', amended_after_submit = amended_after_submit OR ? WHERE id = ?`, ...cols.map((c) => (s as any)[c] ?? null), now(), locked ? 1 : 0, studentId);
    id = studentId;
    audit(actor, locked ? "record.amended" : "record.updated", { entity: "student", entityId: id, institutionId, detail: { changed, reason: reason || undefined, before: Object.fromEntries(changed.map((c) => [c, before[c]])) } });
  } else {
    id = upsert(s, institutionId, actor, "form", locked).id;
    audit(actor, "record.added", { entity: "student", entityId: id, institutionId, detail: { name: s.name, reason: reason || undefined } });
  }
  bump();
  publish({ type: "records", institution_id: institutionId });
  return { id };
}

export function setStatus(institutionId: string, studentId: number, status: string, reason: string, actor: Actor) {
  if (!["active", "withdrawn", "transferred", "graduated"].includes(status)) return { error: "Unknown status." };
  const s = get<any>("SELECT * FROM students WHERE id = ? AND institution_id = ?", studentId, institutionId);
  if (!s) return { error: "No such student." };
  const locked = isLocked(institutionId);
  run("UPDATE students SET status = ?, updated_at = ?, version = version + 1, amended_after_submit = amended_after_submit OR ? WHERE id = ?", status, now(), locked ? 1 : 0, studentId);
  bump();
  audit(actor, "record.status", { entity: "student", entityId: studentId, institutionId, detail: { from: s.status, to: status, reason } });
  publish({ type: "records", institution_id: institutionId });
  return { ok: true };
}

export function remove(institutionId: string, studentId: number, reason: string, actor: Actor) {
  if (isLocked(institutionId)) return { error: "Submitted records can't be deleted. Mark the student withdrawn instead." };
  const s = get<any>("SELECT * FROM students WHERE id = ? AND institution_id = ?", studentId, institutionId);
  if (!s) return { error: "No such student." };
  if (get("SELECT 1 FROM credentials WHERE student_id = ?", studentId)) return { error: "A verifiable record was issued for this student; mark them withdrawn instead." };
  run("DELETE FROM students WHERE id = ?", studentId);
  bump();
  audit(actor, "record.deleted", { entity: "student", entityId: studentId, institutionId, detail: { name: s.name, apaar_id: s.apaar_id, reason } });
  publish({ type: "records", institution_id: institutionId });
  return { ok: true };
}
