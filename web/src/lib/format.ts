/** Numbers, dates and IDs, written the same way everywhere. */

const nf = new Intl.NumberFormat("en-IN");
export const n = (x: number | null | undefined) => (x == null ? "—" : nf.format(x));
export const compact = (x: number) => (x >= 100000 ? `${(x / 100000).toFixed(x >= 1000000 ? 0 : 1)}L` : x >= 1000 ? `${(x / 1000).toFixed(x >= 10000 ? 0 : 1)}K` : String(x));
export const pct = (a: number, b: number, digits = 0) => (b ? `${((a / b) * 100).toFixed(digits)}%` : "—");
export const plural = (k: number, one: string, many = `${one}s`) => `${n(k)} ${k === 1 ? one : many}`;

export const apaar = (id: string | null | undefined) => (!id ? "—" : /^\d{12}$/.test(id) ? `${id.slice(0, 4)} ${id.slice(4, 8)} ${id.slice(8)}` : id);
export const maskApaar = (id: string) => `•••• •••• ${id.slice(-4)}`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function date(iso: string | null | undefined, withYear = true) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ""}`;
}
export const dmy = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("-") : "");

export function ago(iso: string | null | undefined) {
  if (!iso) return "—";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)} d ago`;
  return date(iso, new Date(iso).getFullYear() !== new Date().getFullYear());
}

export function time(iso: string) {
  const d = new Date(iso);
  return `${date(iso)}, ${d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;
}

export function daysUntil(isoDate: string) {
  const end = new Date(`${isoDate}T23:59:59+05:30`).getTime();
  return Math.ceil((end - Date.now()) / 86400_000);
}

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

export const QUOTA: Record<string, string> = { regular: "Regular", tfw: "TFW", fn_oci_pio: "FN / OCI / PIO", lateral: "Lateral entry" };
export const STATUS: Record<string, string> = { draft: "Draft", submitted: "Submitted", accepted: "Accepted", returned: "Returned" };
export const GENDER: Record<string, string> = { M: "Male", F: "Female", T: "Transgender" };

/** A programme's name without the degree, for tight columns: "B.Tech Computer Science…" → "Computer Science…". */
export const shortProgramme = (name: string | null | undefined) => (name ?? "—").replace(/^(B\.Tech|M\.Tech|B\.Pharm|M\.Pharm|Diploma in)\s+/, "");

const ACTIONS: Record<string, string> = {
  "records.imported": "imported records",
  "record.added": "added a student",
  "record.updated": "edited a record",
  "record.amended": "amended a submitted record",
  "record.status": "changed a student's status",
  "record.deleted": "deleted a record",
  "submission.submitted": "submitted the year's data",
  "submission.accepted": "accepted the submission",
  "submission.returned": "returned the submission",
  "issue.explained": "explained a warning",
  "issue.reopened": "withdrew an explanation",
  "credential.issued": "issued a verifiable record",
  "credential.revoked": "revoked a verifiable record",
  "consent.requested": "asked to verify a student",
  "consent.granted": "shared their record",
  "consent.denied": "declined a request",
  "consent.revoked": "stopped sharing",
  "record.viewed": "viewed a shared record",
  "conflict.resolved": "resolved a duplicate enrolment",
  "conflict.notified": "flagged a duplicate to both institutions",
  "conflict.open": "reopened a duplicate",
  "rules.changed": "changed the validation rules",
  "report.exported": "exported a report",
  "apikey.created": "created an API key",
  "apikey.revoked": "revoked an API key",
  "lookup.apaar": "looked up an APAAR ID",
  "session.started": "signed in",
};
export const action = (a: string) => ACTIONS[a] ?? a.replace(/[._]/g, " ");
