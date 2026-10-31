import { cleanApaar } from "./apaar.js";
import type { Programme, Student } from "./validate.js";

/** The student record's fields as institutions send them: names, header aliases, and how to read each value. */

export interface FieldSpec { key: string; label: string; required?: boolean; hint?: string; aliases: string[]; example: string }

export const FIELDS: FieldSpec[] = [
  { key: "apaar_id", label: "APAAR ID", required: true, hint: "12 digits", aliases: ["apaar", "apaar id", "apaar_id", "apaar no", "abc id", "apaar number"], example: "482019375561" },
  { key: "enrolment_no", label: "Enrolment no.", required: true, hint: "Your own student ID", aliases: ["enrolment", "enrollment", "enrolment no", "enrollment no", "roll no", "student id", "registration no", "reg no", "admission no"], example: "KIT26CS001" },
  { key: "name", label: "Name", required: true, hint: "As on APAAR", aliases: ["name", "student name", "full name", "candidate name"], example: "Aarav Sharma" },
  { key: "dob", label: "Date of birth", required: true, hint: "DD-MM-YYYY", aliases: ["dob", "date of birth", "birth date", "birthdate"], example: "14-03-2008" },
  { key: "gender", label: "Gender", required: true, hint: "M, F or T", aliases: ["gender", "sex"], example: "M" },
  { key: "program", label: "Programme", required: true, hint: "Code or name", aliases: ["program", "programme", "course", "branch", "program code", "programme code", "course name"], example: "B.Tech Computer Science and Engineering" },
  { key: "admission_date", label: "Admission date", required: true, hint: "DD-MM-YYYY", aliases: ["admission date", "date of admission", "doa", "admitted on"], example: "08-08-2026" },
  { key: "social_category", label: "Category", hint: "GEN, EWS, OBC, SC, ST", aliases: ["category", "social category", "caste category"], example: "GEN" },
  { key: "quota", label: "Seat type", hint: "Regular, TFW, FN/OCI/PIO, Lateral", aliases: ["quota", "seat type", "admission type", "seat category"], example: "Regular" },
  { key: "nationality", label: "Nationality", aliases: ["nationality", "citizenship", "country"], example: "Indian" },
  { key: "nri", label: "NRI", hint: "Y / N", aliases: ["nri", "is nri", "nri status"], example: "N" },
  { key: "oci", label: "OCI", hint: "Y / N", aliases: ["oci", "is oci", "oci status", "oci card"], example: "N" },
  { key: "fn", label: "Foreign national", hint: "Y / N", aliases: ["fn", "foreign national", "is foreign national", "fn status", "foreign"], example: "N" },
  { key: "passport_no", label: "Passport no.", hint: "FN and OCI only", aliases: ["passport", "passport no", "passport number"], example: "" },
  { key: "year_of_study", label: "Year of study", hint: "1 for new admissions", aliases: ["year", "year of study", "current year", "semester year"], example: "1" },
  { key: "email", label: "Email", aliases: ["email", "email id", "e-mail", "mail"], example: "aarav.sharma@example.in" },
  { key: "phone", label: "Mobile", aliases: ["phone", "mobile", "mobile no", "contact", "phone number", "mobile number"], example: "9876543210" },
];

const YES = /^(y|yes|true|1)$/i, NO = /^(n|no|false|0|)$/i;

function readBool(v: unknown, field: string, bad: string[]) {
  const s = String(v ?? "").trim();
  if (YES.test(s)) return 1;
  if (NO.test(s)) return 0;
  bad.push(field); return 0;
}

/** DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY or ISO, into ISO. */
export function readDate(v: unknown): string | null | undefined {
  const s = String(v ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let y: number, mo: number, d: number;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) { d = +m[1]; mo = +m[2]; y = +m[3]; }
  else return undefined;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return undefined;
  return dt.toISOString().slice(0, 10);
}

function readGender(v: unknown) {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return null;
  if (/^(m|male|boy)$/.test(s)) return "M";
  if (/^(f|female|girl)$/.test(s)) return "F";
  if (/^(t|tg|transgender|other|o)$/.test(s)) return "T";
  return undefined;
}

function readQuota(v: unknown) {
  const s = String(v ?? "").trim().toLowerCase().replace(/[^a-z]/g, "");
  if (!s || /^(regular|general|normal|merit|management|mq|cap)$/.test(s)) return "regular";
  if (/^(tfw|tuitionfeewaiver)$/.test(s)) return "tfw";
  if (/^(fn|fnocipio|fnocipiociwg|ocipio|foreign|foreignnational|nrifn|supernumeraryfn|ciwg|pio|oci)$/.test(s)) return "fn_oci_pio";
  if (/^(lateral|le|lateralentry)$/.test(s)) return "lateral";
  return undefined;
}

const clean = (v: unknown) => { const s = String(v ?? "").trim(); return s || null; };

/** One row from a file or the API, read into a student record. Values that can't be read are listed in `invalid`. */
export function readRow(raw: Record<string, unknown>, institutionId: string, year: string, programmes: Programme[], id: number, row?: number): Student {
  const bad: string[] = [];
  const dob = readDate(raw.dob); if (dob === undefined) bad.push("date of birth");
  const adm = readDate(raw.admission_date); if (adm === undefined) bad.push("admission date");
  const gender = readGender(raw.gender); if (gender === undefined) bad.push("gender");
  const quota = readQuota(raw.quota); if (quota === undefined) bad.push("seat type");
  const p = String(raw.program ?? raw.program_id ?? "").trim();
  const prog = p ? programmes.find((x) => x.id.toLowerCase() === p.toLowerCase() || norm(x.name) === norm(p)) : undefined;
  const apaar = cleanApaar(raw.apaar_id);
  const cat = clean(raw.social_category)?.toUpperCase() ?? null;
  return {
    id, row,
    apaar_id: apaar || null,
    institution_id: institutionId,
    program_id: prog ? prog.id : p || null,
    academic_year: year,
    enrolment_no: clean(raw.enrolment_no),
    name: clean(raw.name)?.replace(/\s+/g, " ") ?? null,
    dob: dob ?? null,
    gender: gender ?? null,
    social_category: cat,
    quota: quota ?? "regular",
    nationality: clean(raw.nationality) ?? "Indian",
    nri: readBool(raw.nri, "NRI", bad), oci: readBool(raw.oci, "OCI", bad), fn: readBool(raw.fn, "foreign national", bad),
    passport_no: clean(raw.passport_no),
    admission_date: adm ?? null,
    year_of_study: Number(raw.year_of_study) || 1,
    status: clean(raw.status) ?? "active",
    email: clean(raw.email), phone: clean(raw.phone)?.replace(/[^\d+]/g, "") ?? null,
    invalid: bad.length ? bad : undefined,
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
