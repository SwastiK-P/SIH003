import { Router } from "express";
import { randomBytes } from "node:crypto";
import { all, get, now, run } from "../db.js";
import { audit } from "../audit.js";
import { need } from "../auth.js";
import { checkSignature, issue as issueCredential, publicKey, verifyCredential } from "../credentials.js";
import { APAAR_RE, cleanApaar, formatApaar } from "../apaar.js";
import { publish } from "../live.js";
import { issuesFor } from "../validate.js";

const actorOf = (u: any) => ({ id: u.id, name: u.name, role: u.role });

/** The fields a verifier can ask for, and what each shows. Students see this list when deciding. */
export const DISCLOSABLE: Record<string, string> = {
  name: "Name", dob: "Date of birth", programme: "Programme", institution: "Institution",
  status: "Enrolment status", admission_year: "Year of admission", enrolment_no: "Enrolment number",
};

const masked = (id: string) => `•••• •••• ${id.slice(-4)}`;

function disclosed(apaar: string, fields: string[]) {
  const recs = all<any>(`SELECT s.*, p.name AS programme, i.name AS institution, i.city FROM students s JOIN institutions i ON i.id = s.institution_id LEFT JOIN programs p ON p.id = s.program_id WHERE s.apaar_id = ? ORDER BY s.academic_year DESC`, apaar);
  return recs.map((r) => Object.fromEntries(fields.map((f) => [f, f === "admission_year" ? r.academic_year : f === "institution" ? `${r.institution}, ${r.city}` : r[f]])));
}

// ---- Public: anyone holding a record can check it

export const publicRoutes = Router();

publicRoutes.get("/key", (_req, res) => res.json(publicKey()));

publicRoutes.get("/credentials/:id", (req, res) => {
  const v = verifyCredential(String(req.params.id));
  if (!v) return res.status(404).json({ error: "There's no record with this code. Check it against the printed code." });
  const { apaar_id, dob, ...subject } = v.statement.subject;
  run("INSERT INTO access_log (apaar_id, verifier_id, at, via, purpose) VALUES (?,?,?,?,?)", apaar_id, null, now(), "credential", `Record ${v.id} checked`);
  publish({ type: "access", apaar_id });
  res.json({ ...v, statement: { ...v.statement, subject: { ...subject, apaar_masked: masked(apaar_id) } }, signature: undefined });
});

/** Does this APAAR ID belong to the record? Answers yes or no, never the ID itself. */
publicRoutes.post("/credentials/:id/match", (req, res) => {
  const v = verifyCredential(String(req.params.id));
  if (!v) return res.status(404).json({ error: "No such record." });
  res.json({ matches: cleanApaar(req.body.apaar_id) === v.statement.subject.apaar_id });
});

/** Offline check of a downloaded record file: is the signature AICTE's? */
publicRoutes.post("/verify-document", (req, res) => {
  const { statement, signature } = req.body ?? {};
  if (!statement || !signature) return res.status(400).json({ error: "This isn't a record file." });
  const signatureValid = checkSignature(statement, signature);
  const stored = statement.id ? get<any>("SELECT revoked_at, revoke_reason FROM credentials WHERE id = ?", statement.id) : null;
  res.json({ signatureValid, known: !!stored, revoked: stored?.revoked_at ? { at: stored.revoked_at, reason: stored.revoke_reason } : null, valid: signatureValid && !!stored && !stored.revoked_at, statement });
});

// ---- Verifiers: employers, universities, regulators

export const verifierRoutes = Router();
verifierRoutes.use(need("verify.request"));

verifierRoutes.get("/requests", (req, res) => {
  const rows = all<any>("SELECT * FROM consents WHERE verifier_id = ? ORDER BY requested_at DESC", req.user!.verifier_id);
  res.json({ fields: DISCLOSABLE, requests: rows.map((r) => ({ ...r, fields: JSON.parse(r.fields), apaar_masked: masked(r.apaar_id), apaar_id: undefined, expired: r.expires_at && r.expires_at < now() })) });
});

verifierRoutes.post("/requests", (req, res) => {
  const apaar = cleanApaar(req.body.apaar_id);
  const purpose = String(req.body.purpose ?? "").trim();
  const fields = (Array.isArray(req.body.fields) ? req.body.fields : []).filter((f: string) => f in DISCLOSABLE);
  if (!APAAR_RE.test(apaar)) return res.status(400).json({ error: "An APAAR ID is 12 digits." });
  if (purpose.length < 8) return res.status(400).json({ error: "Say why you need the record. The student sees this." });
  if (!fields.length) return res.status(400).json({ error: "Pick at least one detail to ask for." });
  const id = `c-${randomBytes(5).toString("hex")}`;
  // The request is made either way, so a verifier can't learn whether an ID exists by asking.
  run("INSERT INTO consents (id, apaar_id, verifier_id, purpose, fields, status, requested_at) VALUES (?,?,?,?,?,?,?)", id, apaar, req.user!.verifier_id, purpose, JSON.stringify(fields), "pending", now());
  audit(actorOf(req.user), "consent.requested", { entity: "consent", entityId: id, detail: { purpose, fields } });
  publish({ type: "consent", apaar_id: apaar, verifier_id: req.user!.verifier_id, status: "pending" });
  res.json({ id });
});

verifierRoutes.get("/requests/:id", (req, res) => {
  const c = get<any>("SELECT * FROM consents WHERE id = ? AND verifier_id = ?", String(req.params.id), req.user!.verifier_id);
  if (!c) return res.status(404).json({ error: "No such request." });
  const fields = JSON.parse(c.fields);
  const live = c.status === "granted" && (!c.expires_at || c.expires_at > now());
  let records: any[] | null = null;
  if (live) {
    records = disclosed(c.apaar_id, fields);
    run("INSERT INTO access_log (apaar_id, verifier_id, at, via, purpose) VALUES (?,?,?,?,?)", c.apaar_id, c.verifier_id, now(), "consent", c.purpose);
    audit(actorOf(req.user), "record.viewed", { entity: "consent", entityId: c.id, detail: { fields } });
    publish({ type: "access", apaar_id: c.apaar_id });
  }
  res.json({ ...c, fields, apaar_masked: masked(c.apaar_id), apaar_id: undefined, live, records, labels: DISCLOSABLE });
});

// ---- Students: their own record, and who may see it

export const studentRoutes = Router();
studentRoutes.use(need("self.read"));

studentRoutes.get("/me", (req, res) => {
  const apaar = req.user!.apaar_id!;
  const records = all<any>(`SELECT s.*, p.name AS programme, p.level, i.name AS institution, i.city, i.state FROM students s JOIN institutions i ON i.id = s.institution_id LEFT JOIN programs p ON p.id = s.program_id WHERE s.apaar_id = ? ORDER BY s.academic_year DESC`, apaar);
  const reg = get<any>("SELECT * FROM apaar_registry WHERE apaar_id = ?", apaar);
  res.json({
    apaar_id: apaar, display: formatApaar(apaar), registry: reg,
    records: records.map((r) => ({ ...r, issues: issuesFor(r.institution_id).filter((i) => i.student_ids.includes(r.id)).map((i) => ({ code: i.code, title: i.title, severity: i.severity })) })),
    credentials: all<any>("SELECT id, student_id, issued_at, revoked_at, payload, signature FROM credentials WHERE apaar_id = ? ORDER BY issued_at DESC", apaar).map((c) => ({ ...c, statement: JSON.parse(c.payload), payload: undefined })),
    consents: all<any>("SELECT c.*, v.name AS verifier, v.kind FROM consents c JOIN verifiers v ON v.id = c.verifier_id WHERE c.apaar_id = ? ORDER BY c.requested_at DESC", apaar).map((c) => ({ ...c, fields: JSON.parse(c.fields), expired: c.expires_at && c.expires_at < now() })),
    access: all<any>("SELECT a.*, v.name AS verifier FROM access_log a LEFT JOIN verifiers v ON v.id = a.verifier_id WHERE a.apaar_id = ? ORDER BY a.at DESC LIMIT 50", apaar),
    labels: DISCLOSABLE,
  });
});

studentRoutes.post("/consents/:id", (req, res) => {
  const c = get<any>("SELECT * FROM consents WHERE id = ? AND apaar_id = ?", String(req.params.id), req.user!.apaar_id);
  if (!c) return res.status(404).json({ error: "No such request." });
  const { decision, days = 30 } = req.body as { decision: "grant" | "deny" | "revoke"; days?: number };
  if (decision === "revoke") {
    if (c.status !== "granted") return res.status(409).json({ error: "Only shared records can be stopped." });
    run("UPDATE consents SET status = 'revoked', decided_at = ? WHERE id = ?", now(), c.id);
  } else {
    if (c.status !== "pending") return res.status(409).json({ error: "You've already answered this request." });
    const d = Math.min(365, Math.max(1, Number(days)));
    run("UPDATE consents SET status = ?, decided_at = ?, expires_at = ? WHERE id = ?", decision === "grant" ? "granted" : "denied", now(), decision === "grant" ? new Date(Date.now() + d * 86400_000).toISOString() : null, c.id);
  }
  const status = decision === "grant" ? "granted" : decision === "deny" ? "denied" : "revoked";
  audit(actorOf(req.user), `consent.${status}`, { entity: "consent", entityId: c.id, detail: { verifier: c.verifier_id, days: decision === "grant" ? days : undefined } });
  publish({ type: "consent", apaar_id: c.apaar_id, verifier_id: c.verifier_id, status });
  res.json({ ok: true });
});

studentRoutes.post("/records/:sid/credential", (req, res) => {
  const s = get<any>("SELECT * FROM students WHERE id = ? AND apaar_id = ?", Number(String(req.params.sid)), req.user!.apaar_id);
  if (!s) return res.status(404).json({ error: "No such record." });
  const blocking = issuesFor(s.institution_id).filter((i) => i.student_ids.includes(s.id) && i.severity === "error" && i.code.startsWith("apaar"));
  if (blocking.length) return res.status(400).json({ error: "Your institution's record doesn't match APAAR yet. Ask them to correct it." });
  const existing = get<any>("SELECT id FROM credentials WHERE student_id = ? AND revoked_at IS NULL", s.id);
  if (existing) return res.json({ id: existing.id });
  const c = issueCredential(s, req.user!.name);
  audit(actorOf(req.user), "credential.issued", { entity: "credential", entityId: c.id, institutionId: s.institution_id, detail: { requestedBy: "student" } });
  res.json({ id: c.id });
});
