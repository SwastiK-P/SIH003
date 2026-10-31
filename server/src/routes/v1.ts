import { Router } from "express";
import { all, rules } from "../db.js";
import { apiKeyAuth } from "../auth.js";
import { cleanApaar } from "../apaar.js";
import { CATALOGUE, issuesFor } from "../validate.js";
import { importRows, isLocked, previewRows, programmesOf, submissionOf } from "../records.js";
import { FIELDS } from "../fields.js";

/**
 * The integration API for institutional systems (ERP, admission software). Keyed by APAAR ID: a PUT with
 * an ID already on record updates it. Every write answers with the checks it triggered.
 */
export const v1 = Router();
v1.use(apiKeyAuth);

const system = (inst: string) => ({ id: `api:${inst}`, name: "Integration API", role: "institution", institution_id: inst });

v1.get("/fields", (_req, res) => res.json(FIELDS.map(({ key, label, required, hint }) => ({ key, label, required: !!required, hint }))));

v1.get("/programmes", (req, res) => res.json(programmesOf(req.apiInstitution!).map(({ id, name, level, duration, approved }) => ({ id, name, level, duration, approved_intake: approved }))));

v1.get("/students", (req, res) => {
  const since = String(req.query.updated_since ?? "");
  const rows = all<any>("SELECT * FROM students WHERE institution_id = ? AND academic_year = ? AND (? = '' OR updated_at > ?) ORDER BY updated_at", req.apiInstitution, rules().academic_year, since, since);
  res.json({ academic_year: rules().academic_year, count: rows.length, students: rows });
});

v1.put("/students/:apaar", (req, res) => {
  if (isLocked(req.apiInstitution!)) return res.status(409).json({ error: "submission_locked", message: "This year's data has been submitted. Changes go through the portal, with a reason." });
  const row = { ...req.body, apaar_id: cleanApaar(String(req.params.apaar)) };
  const dry = req.query.dry_run === "true";
  const p = previewRows(req.apiInstitution!, [row]);
  const issues = p.rows[0].issues;
  if (dry) return res.json({ dry_run: true, action: p.rows[0].action, issues });
  const r = importRows(req.apiInstitution!, [row], system(req.apiInstitution!), { source: "api", skipErrors: false });
  res.status(r.added ? 201 : 200).json({ ...r, issues });
});

v1.post("/students/batch", (req, res) => {
  const rows = req.body?.students;
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: "bad_request", message: "Send { students: [ … ] }." });
  if (rows.length > 5000) return res.status(413).json({ error: "too_many", message: "Up to 5,000 students per call." });
  const p = previewRows(req.apiInstitution!, rows);
  const results = p.rows.map((r) => ({ index: r.row - 1, apaar_id: r.record.apaar_id, action: r.action, issues: r.issues }));
  if (req.query.dry_run === "true") return res.json({ dry_run: true, results, programme_issues: p.programmeIssues.map(({ code, title, detail }) => ({ code, title, detail })) });
  if (isLocked(req.apiInstitution!)) return res.status(409).json({ error: "submission_locked", message: "This year's data has been submitted." });
  const r = importRows(req.apiInstitution!, rows, system(req.apiInstitution!), { source: "api", skipErrors: req.query.skip_errors === "true" });
  res.json({ ...r, results });
});

v1.get("/issues", (req, res) => {
  res.json({
    submission: submissionOf(req.apiInstitution!).status,
    issues: issuesFor(req.apiInstitution!).map(({ key, code, severity, title, detail, apaar_id, program_id }) => ({ key, code, severity, title, detail, apaar_id, program_id, fix: CATALOGUE[code].fix })),
  });
});
