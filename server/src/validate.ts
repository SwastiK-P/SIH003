import { all, currentGeneration, rules, type Rules } from "./db.js";
import { APAAR_RE, cleanApaar, compareNames, formatApaar, normName, type RegistryEntry } from "./apaar.js";

/**
 * The checks. One pass over the national set of current-cycle records produces every issue, so a
 * duplicate across two institutions is seen from both sides. An upload preview runs the same pass with
 * one institution's records swapped for what they would be after the import.
 */

export type Severity = "error" | "warning";

export interface Student {
  id: number;                 // negative for rows in an upload that aren't saved yet
  row?: number;               // 1-based row in the uploaded file
  apaar_id: string | null;
  institution_id: string;
  program_id: string | null;
  academic_year: string;
  enrolment_no: string | null;
  name: string | null;
  dob: string | null;
  gender: string | null;
  social_category: string | null;
  quota: string;
  nationality: string | null;
  nri: number; oci: number; fn: number;
  passport_no: string | null;
  admission_date: string | null;
  year_of_study: number;
  status: string;
  email: string | null;
  phone: string | null;
  invalid?: string[];         // fields that couldn't be read from the file
}

export interface Issue {
  key: string;
  code: string;
  severity: Severity;
  scope: "student" | "program" | "institution";
  institution_id: string;
  program_id?: string;
  student_ids: number[];
  rows?: number[];
  apaar_id?: string;
  title: string;
  detail: string;
  numbers?: Record<string, number>;
  others?: { institution_id: string; student_id: number }[];
  note?: { note: string; by_name: string; at: string };
}

/** What each check means, for the issue list and the help beside it. */
export const CATALOGUE: Record<string, { title: string; severity: Severity; group: string; fix: string }> = {
  apaar_missing: { title: "APAAR ID missing", severity: "error", group: "APAAR", fix: "Ask the student for their APAAR ID (on DigiLocker or the ABC portal) and add it." },
  apaar_format: { title: "APAAR ID isn't 12 digits", severity: "error", group: "APAAR", fix: "APAAR IDs are 12 digits. Check for a missing digit or a typed letter." },
  apaar_unknown: { title: "APAAR ID not in the registry", severity: "error", group: "APAAR", fix: "The ID doesn't exist in the APAAR registry. Re-check it with the student's DigiLocker card." },
  apaar_inactive: { title: "APAAR ID deactivated", severity: "error", group: "APAAR", fix: "The registry has deactivated this ID. The student needs to get it restored or use their current one." },
  apaar_name_mismatch: { title: "Name doesn't match APAAR", severity: "error", group: "APAAR", fix: "The name is different from the one on the APAAR record. Correct the record, or the student corrects APAAR first." },
  apaar_name_close: { title: "Name spelt differently from APAAR", severity: "warning", group: "APAAR", fix: "Close, but not the same (initials, order or spelling). Use the APAAR spelling so certificates match." },
  apaar_dob: { title: "Date of birth doesn't match APAAR", severity: "error", group: "APAAR", fix: "Use the date of birth from the APAAR record, or ask the student to correct APAAR." },
  dup_apaar: { title: "Same APAAR ID used twice", severity: "error", group: "Duplicates", fix: "One student can only have one record per admission year. Remove the extra row." },
  dup_enrolment: { title: "Same enrolment number twice", severity: "error", group: "Duplicates", fix: "Enrolment numbers must be unique in the institution. Correct one of them." },
  dup_probable: { title: "Possible duplicate student", severity: "warning", group: "Duplicates", fix: "Same name and date of birth under different APAAR IDs. If it's one person, remove the extra record; if not, explain." },
  cross_enrolment: { title: "Also enrolled at another institution", severity: "error", group: "Duplicates", fix: "The same APAAR ID is active elsewhere. If the student left, mark the record withdrawn or transferred; otherwise AICTE will decide." },
  intake_exceeded: { title: "Admissions over approved intake", severity: "error", group: "Intake", fix: "Regular admissions can't exceed the approved intake. Move students to an eligible supernumerary quota or withdraw the excess." },
  tfw_exceeded: { title: "TFW seats over the cap", severity: "error", group: "Intake", fix: "Tuition Fee Waiver seats are supernumerary and capped as a share of approved intake." },
  fn_exceeded: { title: "FN / OCI / PIO seats over the cap", severity: "error", group: "Intake", fix: "Supernumerary seats for foreign nationals, OCI, PIO and CIWG are capped as a share of approved intake." },
  lateral_exceeded: { title: "Lateral entries over the cap", severity: "warning", group: "Intake", fix: "Lateral entry to the second year is capped as a share of approved intake." },
  program_unknown: { title: "Programme not approved", severity: "error", group: "Record", fix: "The programme isn't in this institution's approval for the year. Pick one from the approved list." },
  missing_fields: { title: "Required details missing", severity: "error", group: "Record", fix: "Name, date of birth, gender, programme and admission date are needed for every student." },
  invalid_value: { title: "Value couldn't be read", severity: "error", group: "Record", fix: "A date or yes/no field is in a format the system can't read. Use DD-MM-YYYY and Y/N." },
  status_conflict: { title: "NRI / OCI / FN status contradicts nationality", severity: "error", group: "Status", fix: "NRIs are Indian citizens; OCI holders and foreign nationals are not. Correct the nationality or the status." },
  passport_missing: { title: "Passport number missing", severity: "error", group: "Status", fix: "Foreign nationals and OCI holders need a passport number on record." },
  fn_quota_status: { title: "Supernumerary quota without matching status", severity: "warning", group: "Status", fix: "A student in the FN / OCI / PIO / CIWG quota is marked as none of these. Correct the status or explain (CIWG students are Indian nationals)." },
  age_implausible: { title: "Unusual age at admission", severity: "warning", group: "Record", fix: "The age at admission is outside the usual range. Check the date of birth." },
  admission_date: { title: "Admission date outside the cycle", severity: "warning", group: "Record", fix: "The admission date falls outside the academic year's admission window, or is in the future." },
  shared_contact: { title: "One phone number on many records", severity: "warning", group: "Patterns", fix: "Several students share a phone number. Often an agent's or office number: replace it with the student's own." },
  dob_placeholder: { title: "Many birthdays on 1 January", severity: "warning", group: "Patterns", fix: "An unusual share of dates of birth fall on 1 January, a sign of placeholder dates. Check them against APAAR." },
};

const issue = (code: string, base: Omit<Issue, "code" | "severity" | "title"> & { severity?: Severity }): Issue => ({
  code, severity: base.severity ?? CATALOGUE[code].severity, title: CATALOGUE[code].title, ...base,
});

const who = (s: Student) => [s.name || "Unnamed", s.row ? `row ${s.row}` : s.enrolment_no].filter(Boolean).join(" · ");

function ageOn(dob: string, on: string) {
  const a = new Date(dob), b = new Date(on);
  let y = b.getFullYear() - a.getFullYear();
  if (b.getMonth() < a.getMonth() || (b.getMonth() === a.getMonth() && b.getDate() < a.getDate())) y--;
  return y;
}

export interface Programme { id: string; institution_id: string; name: string; level: string; approved: number | null }

interface Context {
  rules: Rules;
  registry: Map<string, RegistryEntry>;
  programmes: Map<string, Programme>;
  notes: Map<string, { note: string; by_name: string; at: string }>;
  conflicts: Map<string, { status: string }>;
}

export function check(students: Student[], ctx: Context, only?: string): Issue[] {
  const { rules: R } = ctx;
  const out: Issue[] = [];
  const mine = only ? students.filter((s) => s.institution_id === only) : students;
  const active = (s: Student) => s.status === "active";
  const startYear = Number(R.academic_year.slice(0, 4));

  // ---- Per student
  for (const s of mine) {
    if (!active(s)) continue;
    const base = { scope: "student" as const, institution_id: s.institution_id, program_id: s.program_id ?? undefined, student_ids: [s.id], rows: s.row ? [s.row] : undefined, apaar_id: s.apaar_id ?? undefined };
    const k = (code: string) => `${code}:${s.institution_id}:${s.apaar_id || s.enrolment_no || s.id}`;
    const id = s.apaar_id ?? "";

    if (s.invalid?.length) out.push(issue("invalid_value", { ...base, key: k("invalid_value"), detail: `${who(s)} — couldn't read ${s.invalid.join(", ")}` }));

    if (!id) out.push(issue("apaar_missing", { ...base, key: k("apaar_missing"), detail: who(s) }));
    else if (!APAAR_RE.test(id)) out.push(issue("apaar_format", { ...base, key: k("apaar_format"), detail: `${who(s)} — “${id}” has ${id.replace(/\D/g, "").length} digits` }));
    else {
      const reg = ctx.registry.get(id);
      if (!reg) out.push(issue("apaar_unknown", { ...base, key: k("apaar_unknown"), detail: `${who(s)} — ${formatApaar(id)}` }));
      else if (reg.status !== "active") out.push(issue("apaar_inactive", { ...base, key: k("apaar_inactive"), detail: `${who(s)} — ${formatApaar(id)}` }));
      else {
        if (s.name) {
          const m = compareNames(s.name, reg.name);
          if (m === "different") out.push(issue("apaar_name_mismatch", { ...base, key: k("apaar_name_mismatch"), detail: `“${s.name}” here, “${reg.name}” on APAAR` }));
          else if (m === "close") out.push(issue("apaar_name_close", { ...base, key: k("apaar_name_close"), detail: `“${s.name}” here, “${reg.name}” on APAAR` }));
        }
        if (s.dob && reg.dob !== s.dob) out.push(issue("apaar_dob", { ...base, key: k("apaar_dob"), detail: `${who(s)} — ${fmtDate(s.dob)} here, ${fmtDate(reg.dob)} on APAAR` }));
      }
    }

    const missing = [!s.name && "name", !s.dob && "date of birth", !s.gender && "gender", !s.program_id && "programme", !s.admission_date && "admission date"].filter(Boolean);
    if (missing.length) out.push(issue("missing_fields", { ...base, key: k("missing_fields"), detail: `${who(s)} — no ${missing.join(", ")}` }));

    if (s.program_id && !ctx.programmes.has(s.program_id)) out.push(issue("program_unknown", { ...base, key: k("program_unknown"), detail: `${who(s)} — “${s.program_id}”` }));
    else if (s.program_id && ctx.programmes.get(s.program_id)!.institution_id !== s.institution_id) out.push(issue("program_unknown", { ...base, key: k("program_unknown"), detail: `${who(s)} — programme belongs to another institution` }));

    const indian = !s.nationality || /^(india|indian|in)$/i.test(s.nationality.trim());
    const contradictions = [
      s.nri && !indian && "NRI but not an Indian national",
      s.fn && indian && "foreign national with Indian nationality",
      s.oci && indian && "OCI holder with Indian nationality",
      s.nri && (s.fn || s.oci) && "NRI and foreign national / OCI at once",
    ].filter(Boolean);
    if (contradictions.length) out.push(issue("status_conflict", { ...base, key: k("status_conflict"), detail: `${who(s)} — ${contradictions.join("; ")}` }));
    if ((s.fn || s.oci) && !s.passport_no) out.push(issue("passport_missing", { ...base, key: k("passport_missing"), detail: who(s) }));
    if (s.quota === "fn_oci_pio" && !s.fn && !s.oci && indian) out.push(issue("fn_quota_status", { ...base, key: k("fn_quota_status"), detail: `${who(s)} — in the FN / OCI / PIO quota, marked Indian national` }));

    if (s.dob && s.admission_date) {
      const age = ageOn(s.dob, s.admission_date);
      if (age < R.min_age || age > R.max_age) out.push(issue("age_implausible", { ...base, key: k("age_implausible"), detail: `${who(s)} — ${age} years old at admission`, numbers: { age } }));
    }
    if (s.admission_date) {
      const d = s.admission_date;
      const outside = d < `${startYear}-05-01` || d > `${startYear + 1}-03-31` || d > new Date().toISOString().slice(0, 10);
      if (outside && s.academic_year === R.academic_year) out.push(issue("admission_date", { ...base, key: k("admission_date"), detail: `${who(s)} — admitted ${fmtDate(d)}` }));
    }
  }

  // ---- Duplicates inside an institution
  const byInst = groupBy(mine.filter(active), (s) => s.institution_id);
  for (const [inst, list] of byInst) {
    for (const [id, group] of groupBy(list.filter((s) => s.apaar_id && APAAR_RE.test(s.apaar_id)), (s) => s.apaar_id!)) {
      if (group.length > 1) out.push(issue("dup_apaar", dupBase(inst, group, `dup_apaar:${inst}:${id}`, `${formatApaar(id)} — ${group.map(who).join(", ")}`, id)));
    }
    for (const [no, group] of groupBy(list.filter((s) => s.enrolment_no), (s) => s.enrolment_no!.trim().toUpperCase())) {
      if (group.length > 1) out.push(issue("dup_enrolment", dupBase(inst, group, `dup_enrolment:${inst}:${no}`, `${no} — ${group.map(who).join(", ")}`)));
    }
    for (const [, group] of groupBy(list.filter((s) => s.name && s.dob), (s) => `${normName(s.name!)}|${s.dob}`)) {
      const ids = new Set(group.map((g) => g.apaar_id));
      if (group.length > 1 && ids.size > 1) out.push(issue("dup_probable", dupBase(inst, group, `dup_probable:${inst}:${normName(group[0].name!)}:${group[0].dob}`, `${group[0].name}, born ${fmtDate(group[0].dob!)} — ${group.length} records with different APAAR IDs`)));
    }

    // Patterns across the whole list
    for (const [phone, group] of groupBy(list.filter((s) => s.phone), (s) => s.phone!.replace(/\D/g, "").slice(-10))) {
      if (group.length >= 4) out.push(issue("shared_contact", { ...dupBase(inst, group, `shared_contact:${inst}:${phone}`, `${group.length} students list ${maskPhone(phone)}`), scope: "institution", numbers: { count: group.length } }));
    }
    const dated = list.filter((s) => s.dob);
    const jan1 = dated.filter((s) => s.dob!.endsWith("-01-01"));
    if (dated.length >= 40 && jan1.length / dated.length > 0.12) {
      out.push(issue("dob_placeholder", { scope: "institution", institution_id: inst, student_ids: jan1.map((s) => s.id), rows: rowsOf(jan1), key: `dob_placeholder:${inst}`, detail: `${jan1.length} of ${dated.length} dates of birth (${Math.round((jan1.length / dated.length) * 100)}%) are 1 January — usually about 0.3%`, numbers: { count: jan1.length, total: dated.length } }));
    }
  }

  // ---- The same APAAR ID active at two institutions
  const nationally = groupBy(students.filter((s) => active(s) && s.apaar_id && APAAR_RE.test(s.apaar_id)), (s) => s.apaar_id!);
  for (const [id, group] of nationally) {
    const insts = new Set(group.map((g) => g.institution_id));
    if (insts.size < 2) continue;
    if (ctx.conflicts.get(id)?.status === "resolved") continue;
    for (const s of group) {
      if (only && s.institution_id !== only) continue;
      const others = group.filter((g) => g.institution_id !== s.institution_id);
      out.push(issue("cross_enrolment", {
        scope: "student", institution_id: s.institution_id, program_id: s.program_id ?? undefined, student_ids: [s.id], rows: s.row ? [s.row] : undefined, apaar_id: id,
        key: `cross_enrolment:${s.institution_id}:${id}`,
        detail: `${who(s)} — ${formatApaar(id)} is also active at ${others.length === 1 ? "another institution" : `${others.length} other institutions`}`,
        others: others.map((o) => ({ institution_id: o.institution_id, student_id: o.id })),
      }));
    }
  }

  // ---- Intake per programme
  const cohort = mine.filter((s) => active(s) && s.academic_year === R.academic_year && s.program_id && ctx.programmes.has(s.program_id));
  for (const [pid, list] of groupBy(cohort, (s) => s.program_id!)) {
    const p = ctx.programmes.get(pid)!;
    if (p.institution_id !== list[0].institution_id || p.approved == null) continue;
    const c = countQuotas(list);
    const base = { scope: "program" as const, institution_id: p.institution_id, program_id: pid };
    if (c.regular > p.approved) out.push(issue("intake_exceeded", { ...base, key: `intake_exceeded:${pid}`, student_ids: list.filter((s) => s.quota === "regular").map((s) => s.id), detail: `${p.name} — ${c.regular} admitted against an approved intake of ${p.approved}, ${c.regular - p.approved} over`, numbers: { admitted: c.regular, approved: p.approved, over: c.regular - p.approved } }));
    const tfwCap = Math.floor((p.approved * R.tfw_cap_pct) / 100);
    if (c.tfw > tfwCap) out.push(issue("tfw_exceeded", { ...base, key: `tfw_exceeded:${pid}`, student_ids: list.filter((s) => s.quota === "tfw").map((s) => s.id), detail: `${p.name} — ${c.tfw} TFW seats against a cap of ${tfwCap} (${R.tfw_cap_pct}% of ${p.approved})`, numbers: { seats: c.tfw, cap: tfwCap } }));
    const fnCap = Math.floor((p.approved * R.fn_cap_pct) / 100);
    if (c.fn > fnCap) out.push(issue("fn_exceeded", { ...base, key: `fn_exceeded:${pid}`, student_ids: list.filter((s) => s.quota === "fn_oci_pio").map((s) => s.id), detail: `${p.name} — ${c.fn} FN / OCI / PIO seats against a cap of ${fnCap} (${R.fn_cap_pct}% of ${p.approved})`, numbers: { seats: c.fn, cap: fnCap } }));
    const latCap = Math.floor((p.approved * R.lateral_cap_pct) / 100);
    if (c.lateral > latCap) out.push(issue("lateral_exceeded", { ...base, key: `lateral_exceeded:${pid}`, student_ids: list.filter((s) => s.quota === "lateral").map((s) => s.id), detail: `${p.name} — ${c.lateral} lateral entries against a cap of ${latCap}`, numbers: { seats: c.lateral, cap: latCap } }));
  }

  for (const i of out) { const n = ctx.notes.get(i.key); if (n && i.severity === "warning") i.note = n; }
  return out;
}

function dupBase(inst: string, group: Student[], key: string, detail: string, apaar?: string) {
  return { scope: "student" as const, institution_id: inst, program_id: group[0].program_id ?? undefined, student_ids: group.map((g) => g.id), rows: rowsOf(group), key, detail, apaar_id: apaar };
}
const rowsOf = (g: Student[]) => { const r = g.map((s) => s.row).filter((x): x is number => !!x); return r.length ? r : undefined; };

export function countQuotas(list: Student[]) {
  const c = { regular: 0, tfw: 0, fn: 0, lateral: 0, total: list.length, nri: 0, oci: 0, foreign: 0 };
  for (const s of list) {
    if (s.quota === "tfw") c.tfw++; else if (s.quota === "fn_oci_pio") c.fn++; else if (s.quota === "lateral") c.lateral++; else c.regular++;
    if (s.nri) c.nri++; if (s.oci) c.oci++; if (s.fn) c.foreign++;
  }
  return c;
}

export function groupBy<T, K>(xs: T[], f: (x: T) => K) {
  const m = new Map<K, T[]>();
  for (const x of xs) { const k = f(x); const a = m.get(k); if (a) a.push(x); else m.set(k, [x]); }
  return m;
}

export const fmtDate = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}-${m}-${y}`; };
const maskPhone = (p: string) => `${p.slice(0, 2)}••••••${p.slice(-2)}`;

// ---- Loading and caching the national pass

export function loadContext(): Context {
  const programmes = new Map(all<Programme>(`SELECT p.id, p.institution_id, p.name, p.level, i.approved FROM programs p LEFT JOIN intakes i ON i.program_id = p.id AND i.academic_year = ?`, rules().academic_year).map((p) => [p.id, p]));
  const registry = new Map(all<RegistryEntry>("SELECT * FROM apaar_registry").map((r) => [r.apaar_id, r]));
  const notes = new Map(all<any>("SELECT * FROM issue_notes").map((n) => [n.issue_key, n]));
  const conflicts = new Map(all<any>("SELECT * FROM conflict_notes").map((n) => [n.apaar_id, n]));
  return { rules: rules(), registry, programmes, notes, conflicts };
}

export const loadStudents = () => all<Student>("SELECT * FROM students WHERE status = 'active' OR academic_year = ?", rules().academic_year);

let cache: { gen: number; issues: Issue[]; students: Student[]; ctx: Context } | null = null;

/** Every issue in the country, recomputed only when student data has changed. */
export function national() {
  if (!cache || cache.gen !== currentGeneration()) {
    const ctx = loadContext();
    const students = loadStudents();
    cache = { gen: currentGeneration(), issues: check(students, ctx), students, ctx };
  }
  return cache;
}

export const issuesFor = (institutionId: string) => national().issues.filter((i) => i.institution_id === institutionId);

/**
 * What the institution's issues would be after importing `incoming`. Rows replace the saved record with
 * the same APAAR ID (an update); the rest are added.
 */
export function preview(institutionId: string, incoming: Student[]) {
  const { students, ctx } = national();
  const replaced = new Set(incoming.map((s) => s.apaar_id).filter(Boolean));
  const kept = students.filter((s) => s.institution_id !== institutionId || !(s.apaar_id && replaced.has(s.apaar_id) && s.academic_year === rules().academic_year));
  const merged = [...kept, ...incoming];
  return { issues: check(merged, ctx, institutionId), merged: merged.filter((s) => s.institution_id === institutionId) };
}

export { cleanApaar };
