import { Router } from "express";
import { all, bump, get, now, rules, run, setRules } from "../db.js";
import { audit, verifyChain } from "../audit.js";
import { need } from "../auth.js";
import { formatApaar } from "../apaar.js";
import { publish } from "../live.js";
import { summaries } from "../insights.js";
import { CATALOGUE, countQuotas, groupBy, national as nationalPass } from "../validate.js";
import { programmeTable } from "../records.js";

/** AICTE's view: the whole country. */
export const nationalRoutes = Router();
nationalRoutes.use(need("national.read"));

const actorOf = (u: any) => ({ id: u.id, name: u.name, role: u.role });
const day = (iso: string) => iso.slice(0, 10);

nationalRoutes.get("/overview", (_req, res) => {
  const R = rules();
  const list = summaries();
  const { issues, students } = nationalPass();
  const cohort = students.filter((s) => s.status === "active" && s.academic_year === R.academic_year);
  const q = countQuotas(cohort);
  const sum = (k: keyof (typeof list)[number]) => list.reduce((n, s) => n + (s[k] as number), 0);
  const submitted = list.filter((s) => ["submitted", "accepted"].includes(s.submission.status)).length;
  const conflicts = new Set(issues.filter((i) => i.code === "cross_enrolment").map((i) => i.apaar_id)).size;

  // Records added per day and submissions to date, for the last five weeks.
  const days: string[] = [];
  const end = new Date(); end.setUTCHours(0, 0, 0, 0);
  for (let d = 34; d >= 0; d--) days.push(day(new Date(end.getTime() - d * 86400_000).toISOString()));
  const added = groupBy(cohort, (s: any) => day(s.created_at ?? ""));
  const subs = all<any>("SELECT submitted_at FROM submissions WHERE academic_year = ? AND submitted_at IS NOT NULL", R.academic_year).map((r) => day(r.submitted_at));
  const timeline = days.map((d) => ({ day: d, added: added.get(d)?.length ?? 0, submitted: subs.filter((s) => s <= d).length }));

  const byState = [...groupBy(list, (s) => s.state)].map(([state, xs]) => ({
    state, institutions: xs.length, approved: xs.reduce((n, s) => n + s.approved, 0), enrolled: xs.reduce((n, s) => n + s.enrolled, 0),
    excess: xs.reduce((n, s) => n + s.excess, 0), submitted: xs.filter((s) => ["submitted", "accepted"].includes(s.submission.status)).length,
    high: xs.filter((s) => s.risk.level === "high").length,
  })).sort((a, b) => b.enrolled - a.enrolled);

  const byType = [...groupBy(list, (s) => s.type)].map(([type, xs]) => ({ type, institutions: xs.length, approved: xs.reduce((n, s) => n + s.approved, 0), enrolled: xs.reduce((n, s) => n + s.enrolled, 0) })).sort((a, b) => b.enrolled - a.enrolled);

  const mix = [...groupBy(issues, (i) => i.code)].map(([code, xs]) => ({ code, title: CATALOGUE[code].title, severity: CATALOGUE[code].severity, group: CATALOGUE[code].group, count: xs.length, institutions: new Set(xs.map((x) => x.institution_id)).size })).sort((a, b) => b.count - a.count);

  res.json({
    rules: R,
    kpis: {
      institutions: list.length, submitted, accepted: list.filter((s) => s.submission.status === "accepted").length,
      returned: list.filter((s) => s.submission.status === "returned").length,
      students: cohort.length, approved: sum("approved"), verified: sum("verified"),
      excess: sum("excess"), excessInstitutions: list.filter((s) => s.excess > 0).length,
      conflicts, errors: sum("errors"), highRisk: list.filter((s) => s.risk.level === "high").length,
      lastYear: sum("last_year"),
    },
    quotas: q,
    timeline, byState, byType, mix,
    attention: [...list].sort((a, b) => b.risk.score - a.risk.score).slice(0, 8),
    activity: all<any>("SELECT a.id, a.at, a.actor_name, a.role, a.action, a.institution_id, a.detail, i.name AS institution FROM audit a LEFT JOIN institutions i ON i.id = a.institution_id WHERE a.action != 'session.started' ORDER BY a.id DESC LIMIT 14").map((r) => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null })),
  });
});

nationalRoutes.get("/institutions", (_req, res) => res.json(summaries()));

nationalRoutes.get("/institutions/:id/programmes", (req, res) => res.json(programmeTable(String(req.params.id))));

nationalRoutes.post("/institutions/:id/review", need("submission.review"), (req, res) => {
  const R = rules();
  const { decision, note } = req.body as { decision: "accept" | "return"; note?: string };
  const sub = get<any>("SELECT * FROM submissions WHERE institution_id = ? AND academic_year = ?", String(req.params.id), R.academic_year);
  if (!sub || sub.status !== "submitted") return res.status(409).json({ error: "Only submitted data can be reviewed." });
  if (decision === "return" && !note?.trim()) return res.status(400).json({ error: "Say what needs correcting so the institution can act on it." });
  const status = decision === "accept" ? "accepted" : "returned";
  run("UPDATE submissions SET status = ?, reviewed_at = ?, reviewed_by = ?, note = ? WHERE institution_id = ? AND academic_year = ?", status, now(), req.user!.name, note?.trim() || null, String(req.params.id), R.academic_year);
  bump();
  audit(actorOf(req.user), `submission.${status}`, { entity: "submission", entityId: `${String(req.params.id)}/${R.academic_year}`, institutionId: String(req.params.id), detail: { note } });
  publish({ type: "submission", institution_id: String(req.params.id), status });
  res.json({ ok: true });
});

/** Every APAAR ID that is active at more than one institution, with both sides. */
nationalRoutes.get("/conflicts", (_req, res) => {
  const { issues } = nationalPass();
  const R = rules();
  const ids = [...new Set(issues.filter((i) => i.code === "cross_enrolment").map((i) => i.apaar_id!))];
  const notes = new Map(all<any>("SELECT * FROM conflict_notes").map((n) => [n.apaar_id, n]));
  const resolved = all<any>("SELECT * FROM conflict_notes WHERE status = 'resolved' ORDER BY at DESC LIMIT 20");
  const describe = (id: string) => ({
    apaar_id: id, display: formatApaar(id), note: notes.get(id) ?? null,
    records: all<any>(`SELECT s.id, s.name, s.dob, s.enrolment_no, s.admission_date, s.created_at, s.status, s.academic_year, p.name AS programme, i.id AS institution_id, i.name AS institution, i.city, i.state
      FROM students s JOIN institutions i ON i.id = s.institution_id LEFT JOIN programs p ON p.id = s.program_id WHERE s.apaar_id = ? AND (s.status = 'active' OR s.academic_year = ?) ORDER BY s.admission_date`, id, R.academic_year),
  });
  res.json({ open: ids.map(describe), resolved: resolved.map((r) => ({ ...describe(r.apaar_id), note: r })) });
});

nationalRoutes.post("/conflicts/:apaar", need("conflict.resolve"), (req, res) => {
  const { status, note } = req.body as { status: "resolved" | "notified" | "open"; note?: string };
  if (status === "open") run("DELETE FROM conflict_notes WHERE apaar_id = ?", String(req.params.apaar));
  else run("INSERT INTO conflict_notes (apaar_id, status, note, by_name, at) VALUES (?,?,?,?,?) ON CONFLICT(apaar_id) DO UPDATE SET status = excluded.status, note = excluded.note, by_name = excluded.by_name, at = excluded.at", String(req.params.apaar), status, note ?? null, req.user!.name, now());
  bump();
  const insts = all<any>("SELECT DISTINCT institution_id FROM students WHERE apaar_id = ?", String(req.params.apaar));
  audit(actorOf(req.user), `conflict.${status}`, { entity: "apaar", entityId: String(req.params.apaar), detail: { note, institutions: insts.map((i) => i.institution_id) } });
  for (const i of insts) publish({ type: "conflict", institution_id: i.institution_id, status });
  res.json({ ok: true });
});

/** Find a student anywhere by APAAR ID. Logged: looking someone up is an access too. */
nationalRoutes.get("/lookup/:apaar", (req, res) => {
  const id = String(req.params.apaar).replace(/\D/g, "");
  const reg = get<any>("SELECT * FROM apaar_registry WHERE apaar_id = ?", id);
  const records = all<any>(`SELECT s.*, p.name AS programme, i.name AS institution, i.city, i.state FROM students s JOIN institutions i ON i.id = s.institution_id LEFT JOIN programs p ON p.id = s.program_id WHERE s.apaar_id = ? ORDER BY s.academic_year`, id);
  audit(actorOf(req.user), "lookup.apaar", { entity: "apaar", entityId: id, detail: { found: records.length } });
  res.json({ apaar_id: id, registry: reg ?? null, records, credentials: all<any>("SELECT id, issued_at, revoked_at FROM credentials WHERE apaar_id = ?", id) });
});

nationalRoutes.get("/rules", (_req, res) => res.json(rules()));
nationalRoutes.put("/rules", need("rules.edit"), (req, res) => {
  const before = rules();
  const allowed = ["tfw_cap_pct", "fn_cap_pct", "lateral_cap_pct", "min_age", "max_age", "deadline"] as const;
  const next: any = {};
  for (const k of allowed) if (req.body[k] !== undefined) next[k] = k === "deadline" ? String(req.body[k]) : Number(req.body[k]);
  for (const k of ["tfw_cap_pct", "fn_cap_pct", "lateral_cap_pct"]) if (next[k] !== undefined && (next[k] < 0 || next[k] > 50)) return res.status(400).json({ error: "Caps are between 0 and 50%." });
  const r = setRules(next);
  audit(actorOf(req.user), "rules.changed", { entity: "rules", entityId: r.academic_year, detail: { before: Object.fromEntries(Object.keys(next).map((k) => [k, (before as any)[k]])), after: next } });
  publish({ type: "rules" });
  res.json(r);
});

nationalRoutes.get("/audit", need("audit.read"), (req, res) => {
  const { q = "", action = "" } = req.query as Record<string, string>;
  const before = Number(req.query.before) || 1e15;
  const rows = all<any>(`SELECT a.*, i.name AS institution FROM audit a LEFT JOIN institutions i ON i.id = a.institution_id
    WHERE a.id < ? AND (? = '' OR a.action LIKE ? ) AND (? = '' OR a.actor_name LIKE ? OR i.name LIKE ? OR a.entity_id LIKE ?) ORDER BY a.id DESC LIMIT 60`,
    before, action, `${action}%`, q, `%${q}%`, `%${q}%`, `%${q}%`);
  res.json(rows.map((r) => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null })));
});
nationalRoutes.get("/audit/verify", need("audit.read"), (_req, res) => res.json(verifyChain()));

// ---- Reports

type Report = { title: string; description: string; columns: { key: string; label: string; num?: boolean }[]; rows: Record<string, unknown>[] };

function report(kind: string): Report | null {
  const R = rules();
  const list = summaries();
  if (kind === "intake") {
    const rows = list.flatMap((s) => programmeTable(s.id).map((p) => ({ institution: s.name, aicte_id: s.id, state: s.state, programme: p.name, level: p.level, approved: p.approved ?? 0, regular: p.regular, tfw: p.tfw, fn_oci_pio: p.fn, lateral: p.lateral, total: p.total, excess: p.excess })));
    return { title: "Admissions against approved intake", description: `Every programme's admissions for ${R.academic_year}, by seat type, against its approved intake.`, rows,
      columns: [{ key: "institution", label: "Institution" }, { key: "aicte_id", label: "AICTE ID" }, { key: "state", label: "State" }, { key: "programme", label: "Programme" }, { key: "level", label: "Level" }, { key: "approved", label: "Approved", num: true }, { key: "regular", label: "Regular", num: true }, { key: "tfw", label: "TFW", num: true }, { key: "fn_oci_pio", label: "FN/OCI/PIO", num: true }, { key: "lateral", label: "Lateral", num: true }, { key: "total", label: "Total", num: true }, { key: "excess", label: "Over intake", num: true }] };
  }
  if (kind === "states") {
    const rows = [...groupBy(list, (s) => s.state)].map(([state, xs]) => {
      const approved = xs.reduce((n, s) => n + s.approved, 0), enrolled = xs.reduce((n, s) => n + s.enrolled, 0);
      return { state, institutions: xs.length, approved, enrolled, fill: approved ? Math.round((enrolled / approved) * 1000) / 10 : 0, excess: xs.reduce((n, s) => n + s.excess, 0), submitted: xs.filter((s) => ["submitted", "accepted"].includes(s.submission.status)).length };
    }).sort((a, b) => a.state.localeCompare(b.state));
    return { title: "State summary", description: "Institutions, intake, admissions and submissions per state.", rows,
      columns: [{ key: "state", label: "State" }, { key: "institutions", label: "Institutions", num: true }, { key: "approved", label: "Approved intake", num: true }, { key: "enrolled", label: "Admitted", num: true }, { key: "fill", label: "Fill %", num: true }, { key: "excess", label: "Over intake", num: true }, { key: "submitted", label: "Submitted", num: true }] };
  }
  if (kind === "foreign") {
    const rows = list.filter((s) => s.nri + s.oci + s.foreign + s.fn_quota > 0).map((s) => ({ institution: s.name, state: s.state, nri: s.nri, oci: s.oci, foreign: s.foreign, fn_quota: s.fn_quota, cap: Math.floor((s.approved * R.fn_cap_pct) / 100) }));
    return { title: "NRI, OCI and foreign nationals", description: `Students by status, and supernumerary FN / OCI / PIO / CIWG seats against the ${R.fn_cap_pct}% cap.`, rows,
      columns: [{ key: "institution", label: "Institution" }, { key: "state", label: "State" }, { key: "nri", label: "NRI", num: true }, { key: "oci", label: "OCI", num: true }, { key: "foreign", label: "Foreign nationals", num: true }, { key: "fn_quota", label: "FN/OCI/PIO seats", num: true }, { key: "cap", label: "Cap (all programmes)", num: true }] };
  }
  if (kind === "apaar") {
    const rows = list.map((s) => ({ institution: s.name, state: s.state, enrolled: s.enrolled, verified: s.verified, unverified: s.enrolled - s.verified, coverage: s.enrolled ? Math.round((s.verified / s.enrolled) * 1000) / 10 : 0 })).sort((a, b) => a.coverage - b.coverage);
    return { title: "APAAR coverage", description: "How many admitted students have an APAAR ID that matches the registry.", rows,
      columns: [{ key: "institution", label: "Institution" }, { key: "state", label: "State" }, { key: "enrolled", label: "Admitted", num: true }, { key: "verified", label: "Matched", num: true }, { key: "unverified", label: "Not matched", num: true }, { key: "coverage", label: "Coverage %", num: true }] };
  }
  if (kind === "duplicates") {
    const { issues } = nationalPass();
    const byId = groupBy(issues.filter((i) => i.code === "cross_enrolment"), (i) => i.apaar_id!);
    const names = new Map(list.map((s) => [s.id, s.name]));
    const rows = [...byId].map(([id, xs]) => ({ apaar: `•••• •••• ${id.slice(-4)}`, institutions: xs.length, names: xs.map((x) => names.get(x.institution_id)).join("; ") }));
    return { title: "Duplicate enrolment across institutions", description: "APAAR IDs active at more than one institution this cycle. IDs are masked in exports.", rows,
      columns: [{ key: "apaar", label: "APAAR ID" }, { key: "institutions", label: "Institutions", num: true }, { key: "names", label: "Where" }] };
  }
  if (kind === "submissions") {
    const rows = list.map((s) => ({ institution: s.name, aicte_id: s.id, state: s.state, status: s.submission.status, submitted_at: s.submission.submitted_at?.slice(0, 10) ?? "", records: s.enrolled, errors: s.errors, risk: s.risk.score }));
    return { title: "Submission status", description: `Where every institution stands for ${R.academic_year}, with open errors and risk score.`, rows,
      columns: [{ key: "institution", label: "Institution" }, { key: "aicte_id", label: "AICTE ID" }, { key: "state", label: "State" }, { key: "status", label: "Status" }, { key: "submitted_at", label: "Submitted" }, { key: "records", label: "Records", num: true }, { key: "errors", label: "Open errors", num: true }, { key: "risk", label: "Risk", num: true }] };
  }
  return null;
}

export const REPORTS = ["intake", "states", "foreign", "apaar", "duplicates", "submissions"];

nationalRoutes.get("/reports", (_req, res) => res.json(REPORTS.map((k) => { const r = report(k)!; return { kind: k, title: r.title, description: r.description, rows: r.rows.length }; })));

nationalRoutes.get("/reports/:kind", (req, res) => {
  const r = report(String(req.params.kind));
  if (!r) return res.status(404).json({ error: "No such report." });
  if (req.query.format === "csv") {
    const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [r.columns.map((c) => esc(c.label)).join(","), ...r.rows.map((row) => r.columns.map((c) => esc(row[c.key])).join(","))].join("\n");
    audit(actorOf(req.user), "report.exported", { entity: "report", entityId: String(req.params.kind), detail: { rows: r.rows.length } });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=${String(req.params.kind)}-${rules().academic_year}.csv`);
    return res.send("﻿" + csv);
  }
  res.json(r);
});
