import { Router } from "express";
import { all, bump, get, now, rules, run } from "../db.js";
import { audit } from "../audit.js";
import { createApiKey, institutionScope, need } from "../auth.js";
import { issue as issueCredential } from "../credentials.js";
import { FIELDS } from "../fields.js";
import { publish } from "../live.js";
import { CATALOGUE, issuesFor, national } from "../validate.js";
import { summaries } from "../insights.js";
import { importRows, isLocked, previewRows, programmeTable, remove, saveOne, setStatus, submissionOf } from "../records.js";
import { createHash } from "node:crypto";

export const institution = Router();

const actorOf = (u: any) => ({ id: u.id, name: u.name, role: u.role, institution_id: u.institution_id });

institution.use("/:id", need("records.read"), (req, res, next) => {
  if (!institutionScope(req, String(req.params.id))) return res.status(403).json({ error: "You can only see your own institution's records." });
  next();
});

const writer = (req: any, res: any, next: any) => (req.user.role === "institution" ? next() : res.status(403).json({ error: "Only the institution can change its records." }));

institution.get("/:id", (req, res) => {
  const inst = get<any>("SELECT * FROM institutions WHERE id = ?", String(req.params.id));
  if (!inst) return res.status(404).json({ error: "No such institution." });
  const summary = summaries().find((s) => s.id === inst.id)!;
  const issues = issuesFor(inst.id);
  res.json({
    institution: inst, summary, programmes: programmeTable(inst.id), submission: submissionOf(inst.id), rules: rules(), locked: isLocked(inst.id),
    issueCounts: countBy(issues),
    recent: all<any>("SELECT id, at, actor_name, action, detail FROM audit WHERE institution_id = ? AND action != 'session.started' ORDER BY id DESC LIMIT 8", inst.id).map(parseDetail),
  });
});

function countBy(issues: ReturnType<typeof issuesFor>) {
  const m: Record<string, { code: string; title: string; severity: string; group: string; count: number; open: number }> = {};
  for (const i of issues) {
    const c = (m[i.code] ??= { code: i.code, title: i.title, severity: i.severity, group: CATALOGUE[i.code].group, count: 0, open: 0 });
    c.count++; if (!i.note) c.open++;
  }
  return Object.values(m).sort((a, b) => (a.severity === b.severity ? b.count - a.count : a.severity === "error" ? -1 : 1));
}

const parseDetail = (r: any) => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null });

institution.get("/:id/students", (req, res) => {
  const R = rules();
  const { q = "", program = "", issue = "", status = "active", year = R.academic_year } = req.query as Record<string, string>;
  const page = Math.max(1, Number(req.query.page) || 1), size = 50;
  const issues = issuesFor(String(req.params.id));
  const byStudent = new Map<number, { code: string; severity: string }[]>();
  for (const i of issues) for (const s of i.student_ids) { const a = byStudent.get(s) ?? []; a.push({ code: i.code, severity: i.severity }); byStudent.set(s, a); }
  let rows = all<any>("SELECT s.*, p.name AS programme FROM students s LEFT JOIN programs p ON p.id = s.program_id WHERE s.institution_id = ? AND (? = 'all' OR s.academic_year = ?) ORDER BY s.name", String(req.params.id), year, year);
  if (status !== "all") rows = rows.filter((r) => r.status === status);
  if (program) rows = rows.filter((r) => r.program_id === program);
  if (q) {
    const n = q.toLowerCase().replace(/\s/g, "");
    rows = rows.filter((r) => [r.name, r.apaar_id, r.enrolment_no, r.email].some((v) => v && String(v).toLowerCase().replace(/\s/g, "").includes(n)));
  }
  if (issue === "any") rows = rows.filter((r) => byStudent.has(r.id));
  else if (issue === "errors") rows = rows.filter((r) => byStudent.get(r.id)?.some((i) => i.severity === "error"));
  else if (issue) rows = rows.filter((r) => byStudent.get(r.id)?.some((i) => i.code === issue));
  const total = rows.length;
  res.json({
    total, page, size,
    students: rows.slice((page - 1) * size, page * size).map((r) => ({ ...r, issues: byStudent.get(r.id) ?? [] })),
  });
});

institution.get("/:id/students/:sid", (req, res) => {
  const s = get<any>("SELECT s.*, p.name AS programme, p.level FROM students s LEFT JOIN programs p ON p.id = s.program_id WHERE s.id = ? AND s.institution_id = ?", Number(String(req.params.sid)), String(req.params.id));
  if (!s) return res.status(404).json({ error: "No such student." });
  const reg = s.apaar_id ? get<any>("SELECT * FROM apaar_registry WHERE apaar_id = ?", s.apaar_id) : null;
  const issues = issuesFor(String(req.params.id)).filter((i) => i.student_ids.includes(s.id)).map((i) => ({
    ...i, fix: CATALOGUE[i.code].fix,
    others: i.others?.map((o) => { const st = get<any>("SELECT s.name, s.admission_date, i.name AS institution, i.city FROM students s JOIN institutions i ON i.id = s.institution_id WHERE s.id = ?", o.student_id); return { ...o, ...st }; }),
  }));
  res.json({
    student: s,
    registry: reg ? { name: reg.name, dob: reg.dob, gender: reg.gender, status: reg.status } : null,
    issues,
    credentials: all<any>("SELECT id, issued_at, issued_by, revoked_at FROM credentials WHERE student_id = ? ORDER BY issued_at DESC", s.id),
    history: all<any>("SELECT id, at, actor_name, action, detail FROM audit WHERE entity = 'student' AND entity_id = ? ORDER BY id DESC", String(s.id)).map(parseDetail),
    locked: isLocked(String(req.params.id)),
  });
});

institution.post("/:id/students", writer, (req, res) => {
  const r = saveOne(String(req.params.id), req.body.record ?? {}, actorOf(req.user), undefined, req.body.reason);
  "error" in r ? res.status(400).json(r) : res.json(r);
});

institution.put("/:id/students/:sid", writer, (req, res) => {
  const r = saveOne(String(req.params.id), req.body.record ?? {}, actorOf(req.user), Number(String(req.params.sid)), req.body.reason);
  "error" in r ? res.status(400).json(r) : res.json(r);
});

institution.post("/:id/students/:sid/status", writer, (req, res) => {
  const r = setStatus(String(req.params.id), Number(String(req.params.sid)), req.body.status, req.body.reason ?? "", actorOf(req.user));
  "error" in r ? res.status(400).json(r) : res.json(r);
});

institution.delete("/:id/students/:sid", writer, (req, res) => {
  const r = remove(String(req.params.id), Number(String(req.params.sid)), String(req.query.reason ?? ""), actorOf(req.user));
  "error" in r ? res.status(400).json(r) : res.json(r);
});

institution.post("/:id/preview", writer, (req, res) => {
  const rows = req.body.rows;
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: "The file has no rows." });
  if (rows.length > 20000) return res.status(400).json({ error: "Up to 20,000 rows per file. Split it and upload in parts." });
  res.json(previewRows(String(req.params.id), rows));
});

institution.post("/:id/import", writer, (req, res) => {
  const rows = req.body.rows;
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: "The file has no rows." });
  const sub = submissionOf(String(req.params.id));
  if (["submitted", "accepted"].includes(sub.status)) return res.status(409).json({ error: "This year's data has been submitted. Edit records one at a time, with a reason, or ask AICTE to return it." });
  res.json(importRows(String(req.params.id), rows, actorOf(req.user), { source: "upload", skipErrors: !!req.body.skipErrors, fileName: req.body.fileName }));
});

institution.get("/:id/issues", (req, res) => {
  const issues = issuesFor(String(req.params.id));
  const ids = [...new Set(issues.flatMap((i) => i.student_ids))];
  const names = new Map(ids.length ? all<any>(`SELECT id, name, enrolment_no FROM students WHERE id IN (${ids.join(",")})`).map((s) => [s.id, s]) : []);
  res.json({
    catalogue: CATALOGUE,
    counts: countBy(issues),
    issues: issues.map((i) => ({ ...i, students: i.scope === "student" ? i.student_ids.slice(0, 6).map((s) => names.get(s)) : undefined })),
  });
});

institution.post("/:id/issues/note", writer, (req, res) => {
  const { key, note } = req.body as { key: string; note: string };
  const i = issuesFor(String(req.params.id)).find((x) => x.key === key);
  if (!i) return res.status(404).json({ error: "That issue is no longer open." });
  if (i.severity === "error") return res.status(400).json({ error: "Errors need to be fixed, not explained." });
  if (!note?.trim()) { run("DELETE FROM issue_notes WHERE issue_key = ?", key); }
  else run("INSERT INTO issue_notes (issue_key, institution_id, note, by_name, at) VALUES (?,?,?,?,?) ON CONFLICT(issue_key) DO UPDATE SET note = excluded.note, by_name = excluded.by_name, at = excluded.at", key, String(req.params.id), note.trim(), req.user!.name, now());
  bump();
  audit(actorOf(req.user), note?.trim() ? "issue.explained" : "issue.reopened", { entity: "issue", entityId: key, institutionId: String(req.params.id), detail: { note } });
  res.json({ ok: true });
});

institution.post("/:id/submit", writer, (req, res) => {
  const id = String(req.params.id);
  const R = rules();
  const sub = submissionOf(id);
  if (["submitted", "accepted"].includes(sub.status)) return res.status(409).json({ error: "Already submitted." });
  if (!req.body.declaration) return res.status(400).json({ error: "Confirm the declaration to submit." });
  const issues = issuesFor(id);
  const errors = issues.filter((i) => i.severity === "error");
  if (errors.length) return res.status(400).json({ error: `${errors.length} error${errors.length > 1 ? "s" : ""} still open. Fix them before submitting.` });
  const open = issues.filter((i) => i.severity === "warning" && !i.note);
  if (open.length) return res.status(400).json({ error: `${open.length} warning${open.length > 1 ? "s" : ""} not yet fixed or explained.` });
  const records = all<any>("SELECT id, apaar_id, version FROM students WHERE institution_id = ? AND academic_year = ? ORDER BY id", id, R.academic_year);
  const hash = createHash("sha256").update(JSON.stringify(records)).digest("hex");
  run(`INSERT INTO submissions (institution_id, academic_year, status, submitted_at, submitted_by, snapshot_hash, snapshot_count) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(institution_id, academic_year) DO UPDATE SET status = 'submitted', submitted_at = excluded.submitted_at, submitted_by = excluded.submitted_by, snapshot_hash = excluded.snapshot_hash, snapshot_count = excluded.snapshot_count, note = NULL, reviewed_at = NULL, reviewed_by = NULL`,
    id, R.academic_year, "submitted", now(), req.user!.name, hash, records.length);
  bump();
  audit(actorOf(req.user), "submission.submitted", { entity: "submission", entityId: `${id}/${R.academic_year}`, institutionId: id, detail: { records: records.length, snapshot: hash.slice(0, 16) } });
  publish({ type: "submission", institution_id: id, status: "submitted" });
  res.json({ ok: true, snapshot: hash, records: records.length });
});

institution.post("/:id/students/:sid/credential", need("credentials.issue"), (req, res) => {
  const s = get<any>("SELECT * FROM students WHERE id = ? AND institution_id = ?", Number(String(req.params.sid)), String(req.params.id));
  if (!s) return res.status(404).json({ error: "No such student." });
  const blocking = issuesFor(String(req.params.id)).filter((i) => i.student_ids.includes(s.id) && i.severity === "error" && i.code.startsWith("apaar"));
  if (!s.apaar_id || blocking.length) return res.status(400).json({ error: "The record must match the APAAR registry before a verifiable record can be issued." });
  const c = issueCredential(s, req.user!.name);
  audit(actorOf(req.user), "credential.issued", { entity: "credential", entityId: c.id, institutionId: String(req.params.id), detail: { student: s.id } });
  publish({ type: "credential", institution_id: String(req.params.id), apaar_id: s.apaar_id });
  res.json(c);
});

institution.post("/:id/credentials/:cid/revoke", need("credentials.issue"), (req, res) => {
  const c = get<any>("SELECT c.* FROM credentials c JOIN students s ON s.id = c.student_id WHERE c.id = ? AND s.institution_id = ?", String(req.params.cid), String(req.params.id));
  if (!c) return res.status(404).json({ error: "No such record." });
  if (!req.body.reason?.trim()) return res.status(400).json({ error: "Give a reason for revoking." });
  run("UPDATE credentials SET revoked_at = ?, revoke_reason = ? WHERE id = ?", now(), req.body.reason.trim(), c.id);
  audit(actorOf(req.user), "credential.revoked", { entity: "credential", entityId: c.id, institutionId: String(req.params.id), detail: { reason: req.body.reason } });
  res.json({ ok: true });
});

institution.get("/:id/credentials", (req, res) => {
  res.json(all<any>(`SELECT c.id, c.issued_at, c.issued_by, c.revoked_at, s.name, s.apaar_id, s.enrolment_no, s.status, s.academic_year, s.id AS student_id, p.name AS programme
    FROM credentials c JOIN students s ON s.id = c.student_id LEFT JOIN programs p ON p.id = s.program_id WHERE s.institution_id = ? ORDER BY c.issued_at DESC`, String(req.params.id)));
});

institution.get("/:id/keys", (req, res) => {
  res.json(all<any>("SELECT id, label, prefix, created_at, last_used_at, revoked_at FROM api_keys WHERE institution_id = ? ORDER BY created_at DESC", String(req.params.id)));
});
institution.post("/:id/keys", need("keys.manage"), (req, res) => {
  const label = String(req.body.label ?? "").trim() || "Untitled key";
  const k = createApiKey(String(req.params.id), label);
  audit(actorOf(req.user), "apikey.created", { entity: "api_key", entityId: k.id, institutionId: String(req.params.id), detail: { label } });
  res.json(k);
});
institution.delete("/:id/keys/:kid", need("keys.manage"), (req, res) => {
  run("UPDATE api_keys SET revoked_at = ? WHERE id = ? AND institution_id = ?", now(), String(req.params.kid), String(req.params.id));
  audit(actorOf(req.user), "apikey.revoked", { entity: "api_key", entityId: String(req.params.kid), institutionId: String(req.params.id) });
  res.json({ ok: true });
});

institution.get("/:id/audit", (req, res) => {
  res.json(all<any>("SELECT id, at, actor_name, role, action, entity, entity_id, detail, hash FROM audit WHERE institution_id = ? ORDER BY id DESC LIMIT 200", String(req.params.id)).map(parseDetail));
});

institution.get("/:id/template.csv", (_req, res) => {
  const header = FIELDS.map((f) => f.label).join(",");
  const example = FIELDS.map((f) => (f.example.includes(",") ? `"${f.example}"` : f.example)).join(",");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=student-records-template.csv");
  res.send(`${header}\n${example}\n`);
});


/**
 * A sample admissions file for trying the upload: new students who hold APAAR IDs (added to the sandbox
 * registry), a few corrections to existing records, and the mistakes real files carry.
 */
institution.get("/:id/sample.csv", writer, (req, res) => {
  const id = String(req.params.id);
  const R = rules();
  // New students go where there are free seats, so the file reads like a real one: mostly fine.
  const free = programmeTable(id).map((p) => ({ id: p.id, name: p.name, left: Math.max(0, (p.approved ?? 0) - p.regular) })).filter((p) => p.left > 0);
  const nextProgramme = () => { free.sort((a, b) => b.left - a.left); const p = free[0]; if (p) p.left--; return p ?? programmeTable(id)[0]; };
  const first = "Aarohi Advik Bhavesh Charvi Darsh Esha Farhan Gargi Hriday Ira Jai Kiara Laksh Mahi Neel Ojas Pari Rehan Siya Tara Uday Vani Yuvan Zara Arya Dev Ira Kian Nia Om".split(" ");
  const last = "Acharya Bhatt Chopra Dutta Ganguly Hegde Iyer Joshi Kini Lal Mathur Nayak Oberoi Prabhu Raman Shenoy Talwar Upadhyay Vyas Wadhwa".split(" ");
  let seed = Date.now() % 100000;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const digits = (k: number) => Array.from({ length: k }, () => Math.floor(rnd() * 10)).join("");
  const dmy = (iso: string) => iso.split("-").reverse().join("-");
  const rows: string[][] = [];
  const header = ["APAAR ID", "Enrollment No", "Student Name", "DOB", "Gender", "Course", "Date of Admission", "Category", "Seat Type", "Nationality", "NRI", "OCI", "Foreign National", "Passport No", "Year", "Email", "Mobile"];
  const stamp = Date.now().toString(36).slice(-3).toUpperCase();
  const count = Math.max(28, Math.min(40, free.reduce((n, p) => n + p.left, 0)));
  for (let i = 0; i < count; i++) {
    const name = `${pick(first)} ${pick(last)}`;
    const dob = `2008-${String(1 + Math.floor(rnd() * 12)).padStart(2, "0")}-${String(1 + Math.floor(rnd() * 28)).padStart(2, "0")}`;
    const ap = String(2 + Math.floor(rnd() * 7)) + digits(11);
    const female = rnd() < 0.45;
    run("INSERT OR IGNORE INTO apaar_registry (apaar_id, name, dob, gender, status) VALUES (?,?,?,?, 'active')", ap, name, dob, female ? "F" : "M");
    const p = nextProgramme();
    rows.push([ap, `S${stamp}${String(i + 1).padStart(3, "0")}`, name, dmy(dob), female ? "Female" : "Male", p.name, dmy(`2026-0${8 + Math.floor(rnd() * 2)}-${String(1 + Math.floor(rnd() * 27)).padStart(2, "0")}`), pick(["GEN", "OBC", "SC", "ST", "EWS", "GEN"]), "Regular", "Indian", "N", "N", "N", "", "1", `${name.toLowerCase().replace(/\s/g, ".")}@example.in`, "9" + digits(9)]);
  }
  // The mistakes.
  rows[2][0] = "";                                            // no APAAR ID
  rows[5][0] = rows[5][0].slice(0, 11);                        // 11 digits
  rows[8][0] = "9" + digits(11);                               // not in the registry
  rows[11][2] = rows[11][2].split(" ").reverse().join(" ");     // name order differs from APAAR
  rows[14][3] = "31-02-2008";                                  // no such date
  rows[17][9] = "Indian"; rows[17][12] = "Y";                  // foreign national, Indian nationality
  rows[20][8] = "TFW";
  rows.push([...rows[23]]);                                    // the same student twice
  const elsewhere = get<any>("SELECT apaar_id, name, dob FROM students WHERE institution_id != ? AND status = 'active' AND academic_year = ? AND apaar_id IS NOT NULL ORDER BY RANDOM() LIMIT 1", id, R.academic_year);
  if (elsewhere) { rows[26][0] = elsewhere.apaar_id; rows[26][2] = elsewhere.name; rows[26][3] = dmy(elsewhere.dob); } // already enrolled elsewhere
  // Two corrections to records already here.
  for (const s of all<any>("SELECT s.*, p.name AS programme FROM students s JOIN programs p ON p.id = s.program_id WHERE s.institution_id = ? AND s.academic_year = ? AND s.apaar_id IS NOT NULL ORDER BY RANDOM() LIMIT 2", id, R.academic_year)) {
    rows.push([s.apaar_id, s.enrolment_no, s.name, dmy(s.dob), s.gender === "F" ? "Female" : "Male", s.programme, dmy(s.admission_date), s.social_category, "Regular", s.nationality, "N", "N", "N", "", "1", s.email ?? "", s.phone ?? ""]);
  }
  bump();
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=admissions-2026-sample.csv");
  res.send([header, ...rows].map((r) => r.map(esc).join(",")).join("\n") + "\n");
});
