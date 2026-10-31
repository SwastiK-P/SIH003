import { all, currentGeneration, rules } from "./db.js";
import { countQuotas, groupBy, national, type Issue, type Student } from "./validate.js";

/**
 * Per-institution figures and the risk score. The score is a sum of plain, explainable signals —
 * every point on it comes with a sentence saying where it came from.
 */

export interface Signal { code: string; label: string; detail: string; points: number }

export interface InstitutionSummary {
  id: string; name: string; city: string; state: string; type: string;
  approved: number; enrolled: number; regular: number; tfw: number; fn_quota: number; lateral: number;
  nri: number; oci: number; foreign: number; verified: number;
  errors: number; warnings: number; excess: number; programmes: number;
  last_year: number;
  submission: { status: string; submitted_at: string | null; reviewed_at: string | null; note: string | null };
  risk: { score: number; level: "low" | "medium" | "high"; signals: Signal[] };
  updated_at: string | null;
}

const APAAR_FAIL = new Set(["apaar_missing", "apaar_format", "apaar_unknown", "apaar_inactive", "apaar_name_mismatch", "apaar_dob"]);

let cache: { gen: number; list: InstitutionSummary[] } | null = null;

export function summaries(): InstitutionSummary[] {
  if (cache && cache.gen === currentGeneration()) return cache.list;
  const R = rules();
  const { issues, students } = national();
  const insts = all<any>("SELECT * FROM institutions ORDER BY name");
  const progs = all<any>("SELECT p.id, p.institution_id, i.approved, i.last_year_enrolled FROM programs p LEFT JOIN intakes i ON i.program_id = p.id AND i.academic_year = ?", R.academic_year);
  const subs = new Map(all<any>("SELECT * FROM submissions WHERE academic_year = ?", R.academic_year).map((s) => [s.institution_id, s]));
  const updated = new Map(all<any>("SELECT institution_id, MAX(updated_at) AS at FROM students GROUP BY institution_id").map((r) => [r.institution_id, r.at]));
  const byInst = groupBy(students.filter((s) => s.status === "active" && s.academic_year === R.academic_year), (s) => s.institution_id);
  const issuesBy = groupBy(issues, (i) => i.institution_id);
  const progsBy = groupBy(progs, (p) => p.institution_id);
  const created: Map<string, any[]> = new Map(all<any>("SELECT institution_id, created_at, amended_after_submit FROM students WHERE academic_year = ?", R.academic_year).reduce((m, r) => {
    const a = m.get(r.institution_id) ?? []; a.push(r); m.set(r.institution_id, a); return m;
  }, new Map<string, any[]>()));

  const list = insts.map((inst): InstitutionSummary => {
    const cohort = byInst.get(inst.id) ?? [];
    const iss = issuesBy.get(inst.id) ?? [];
    const ps = progsBy.get(inst.id) ?? [];
    const c = countQuotas(cohort);
    const failing = new Set(iss.filter((i) => APAAR_FAIL.has(i.code)).flatMap((i) => i.student_ids));
    const excess = iss.filter((i) => i.code === "intake_exceeded").reduce((n, i) => n + (i.numbers?.over ?? 0), 0);
    const sub = subs.get(inst.id);
    const summary: InstitutionSummary = {
      id: inst.id, name: inst.name, city: inst.city, state: inst.state, type: inst.type,
      approved: ps.reduce((n, p) => n + (p.approved ?? 0), 0),
      enrolled: cohort.length, regular: c.regular, tfw: c.tfw, fn_quota: c.fn, lateral: c.lateral,
      nri: c.nri, oci: c.oci, foreign: c.foreign,
      verified: cohort.filter((s) => !failing.has(s.id)).length,
      errors: iss.filter((i) => i.severity === "error").length,
      warnings: iss.filter((i) => i.severity === "warning" && !i.note).length,
      excess, programmes: ps.length,
      last_year: ps.reduce((n, p) => n + (p.last_year_enrolled ?? 0), 0),
      submission: { status: sub?.status ?? "draft", submitted_at: sub?.submitted_at ?? null, reviewed_at: sub?.reviewed_at ?? null, note: sub?.note ?? null },
      risk: { score: 0, level: "low", signals: [] },
      updated_at: updated.get(inst.id) ?? null,
    };
    summary.risk = score(summary, cohort, iss, created.get(inst.id) ?? [], sub);
    return summary;
  });
  cache = { gen: currentGeneration(), list };
  return list;
}

function score(s: InstitutionSummary, cohort: Student[], iss: Issue[], created: any[], sub: any): InstitutionSummary["risk"] {
  const sig: Signal[] = [];
  const count = (code: string) => iss.filter((i) => i.code === code).length;
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);

  if (s.excess > 0) {
    const programmes = count("intake_exceeded");
    sig.push({ code: "excess", label: "Admissions over intake", detail: `${s.excess} students over approved intake across ${programmes} programme${programmes > 1 ? "s" : ""}`, points: Math.min(40, 24 + Math.round((s.excess / Math.max(1, s.approved)) * 200)) });
  }
  const supern = count("tfw_exceeded") + count("fn_exceeded");
  if (supern) sig.push({ code: "supernumerary", label: "Supernumerary caps crossed", detail: `${supern} programme${supern > 1 ? "s" : ""} over the TFW or FN / OCI / PIO cap`, points: Math.min(16, 8 * supern) });

  const cross = count("cross_enrolment");
  if (cross) sig.push({ code: "cross", label: "Students enrolled elsewhere too", detail: `${cross} APAAR ID${cross > 1 ? "s are" : " is"} active at another institution as well`, points: Math.min(24, 6 + cross * 3) });

  const mismatch = iss.filter((i) => ["apaar_unknown", "apaar_name_mismatch", "apaar_dob", "apaar_inactive"].includes(i.code)).length;
  const mRate = pct(mismatch, s.enrolled);
  if (mRate >= 1.5) sig.push({ code: "registry", label: "Records that disagree with APAAR", detail: `${mismatch} records (${mRate}%) don't match the APAAR registry`, points: Math.min(20, Math.round(mRate * 2.2)) });

  const missing = count("apaar_missing") + count("apaar_format");
  const missRate = pct(missing, s.enrolled);
  if (missRate >= 2) sig.push({ code: "missing", label: "APAAR IDs missing", detail: `${missing} students (${missRate}%) have no valid APAAR ID`, points: Math.min(12, Math.round(missRate * 1.5)) });

  const probable = count("dup_probable") + count("dup_apaar");
  if (probable >= 2) sig.push({ code: "duplicates", label: "Likely duplicate records", detail: `${probable} groups of records look like the same student`, points: Math.min(12, probable * 2) });

  const shared = iss.filter((i) => i.code === "shared_contact");
  if (shared.length) {
    const people = shared.reduce((n, i) => n + i.student_ids.length, 0);
    sig.push({ code: "contact", label: "Shared phone numbers", detail: `${people} students share ${shared.length} phone number${shared.length > 1 ? "s" : ""}`, points: Math.min(16, 6 * shared.length) });
  }
  if (count("dob_placeholder")) {
    const i = iss.find((x) => x.code === "dob_placeholder")!;
    sig.push({ code: "dob", label: "Placeholder dates of birth", detail: `${pct(i.numbers!.count, i.numbers!.total)}% of birthdays are 1 January`, points: 12 });
  }

  if (s.last_year > 40) {
    const change = pct(s.enrolled - s.last_year, s.last_year);
    if (change >= 30) sig.push({ code: "growth", label: "Unusual growth on last year", detail: `${s.enrolled} admitted against ${s.last_year} last year, up ${change}%`, points: change >= 60 ? 12 : 8 });
  }

  // Last-minute bulk additions: much of the cohort created in the final 72 hours before submission.
  if (created.length >= 40) {
    const end = sub?.submitted_at ? new Date(sub.submitted_at).getTime() : Date.now();
    const late = created.filter((r) => { const t = new Date(r.created_at).getTime(); return t <= end && end - t < 72 * 3600_000; }).length;
    const share = pct(late, created.length);
    if (share >= 35) sig.push({ code: "burst", label: "Bulk additions at the last minute", detail: `${share}% of records were added in the 72 hours before ${sub?.submitted_at ? "submission" : "now"}`, points: 8 });
    const amended = created.filter((r) => r.amended_after_submit).length;
    if (amended) sig.push({ code: "amended", label: "Changed after submission", detail: `${amended} record${amended > 1 ? "s" : ""} edited after the data was submitted`, points: Math.min(12, 4 + amended) });
  }

  const total = Math.min(100, sig.reduce((n, x) => n + x.points, 0));
  sig.sort((a, b) => b.points - a.points);
  return { score: total, level: total >= 45 ? "high" : total >= 18 ? "medium" : "low", signals: sig };
}
