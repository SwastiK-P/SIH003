import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The central repository. One SQLite file; the schema mirrors what AICTE would hold per student. */

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const DATA_DIR = resolve(ROOT, "data");
mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(resolve(DATA_DIR, "registry.db"));
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS institutions (
  id TEXT PRIMARY KEY,            -- AICTE permanent institute id
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  type TEXT NOT NULL,             -- Engineering, Management, PGDM, Pharmacy, Architecture…
  university TEXT,
  established INTEGER,
  email TEXT
);
CREATE TABLE IF NOT EXISTS programs (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  name TEXT NOT NULL,
  level TEXT NOT NULL,            -- UG, PG, Diploma, PGDM
  duration INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS intakes (
  program_id TEXT NOT NULL REFERENCES programs(id),
  academic_year TEXT NOT NULL,
  approved INTEGER NOT NULL,      -- approved intake from the Extension of Approval
  last_year_enrolled INTEGER,     -- the previous cycle's count, for year-on-year checks
  PRIMARY KEY (program_id, academic_year)
);
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  apaar_id TEXT,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  program_id TEXT REFERENCES programs(id),
  academic_year TEXT NOT NULL,    -- year of admission, e.g. 2026-27
  enrolment_no TEXT,
  name TEXT,
  dob TEXT,
  gender TEXT,
  social_category TEXT,
  quota TEXT NOT NULL DEFAULT 'regular',  -- regular, tfw, fn_oci_pio, lateral
  nationality TEXT,
  nri INTEGER NOT NULL DEFAULT 0,
  oci INTEGER NOT NULL DEFAULT 0,
  fn INTEGER NOT NULL DEFAULT 0,
  passport_no TEXT,
  admission_date TEXT,
  year_of_study INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',  -- active, withdrawn, transferred, graduated
  email TEXT,
  phone TEXT,
  source TEXT NOT NULL DEFAULT 'upload',  -- upload, api, form
  amended_after_submit INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS students_inst ON students(institution_id, academic_year);
CREATE INDEX IF NOT EXISTS students_apaar ON students(apaar_id);

CREATE TABLE IF NOT EXISTS submissions (
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  academic_year TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',   -- draft, submitted, accepted, returned
  submitted_at TEXT, submitted_by TEXT,
  reviewed_at TEXT, reviewed_by TEXT, note TEXT,
  snapshot_hash TEXT, snapshot_count INTEGER,
  PRIMARY KEY (institution_id, academic_year)
);

-- A stand-in for the national APAAR registry (ABC). The adapter in apaar.ts is the only reader.
CREATE TABLE IF NOT EXISTS apaar_registry (
  apaar_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  dob TEXT NOT NULL,
  gender TEXT,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS verifiers (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, city TEXT
);
CREATE TABLE IF NOT EXISTS consents (
  id TEXT PRIMARY KEY,
  apaar_id TEXT NOT NULL,
  verifier_id TEXT NOT NULL REFERENCES verifiers(id),
  purpose TEXT NOT NULL,
  fields TEXT NOT NULL,                  -- JSON array of disclosed fields
  status TEXT NOT NULL,                  -- pending, granted, denied, revoked
  requested_at TEXT NOT NULL, decided_at TEXT, expires_at TEXT
);
CREATE TABLE IF NOT EXISTS access_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  apaar_id TEXT NOT NULL, verifier_id TEXT, at TEXT NOT NULL, via TEXT NOT NULL, purpose TEXT
);
CREATE TABLE IF NOT EXISTS credentials (
  id TEXT PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  apaar_id TEXT NOT NULL,
  payload TEXT NOT NULL,                 -- canonical JSON that was signed
  signature TEXT NOT NULL,
  issued_at TEXT NOT NULL, issued_by TEXT,
  revoked_at TEXT, revoke_reason TEXT
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor_id TEXT, actor_name TEXT, role TEXT,
  action TEXT NOT NULL,
  entity TEXT, entity_id TEXT, institution_id TEXT,
  detail TEXT,
  prev_hash TEXT NOT NULL, hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  label TEXT NOT NULL, prefix TEXT NOT NULL, key_hash TEXT NOT NULL,
  created_at TEXT NOT NULL, last_used_at TEXT, revoked_at TEXT
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, title TEXT, email TEXT, role TEXT NOT NULL,
  institution_id TEXT, verifier_id TEXT, apaar_id TEXT
);
-- Warnings an institution has explained. Errors can't be explained away, only fixed.
CREATE TABLE IF NOT EXISTS issue_notes (
  issue_key TEXT PRIMARY KEY, institution_id TEXT, note TEXT NOT NULL, by_name TEXT, at TEXT NOT NULL
);
-- AICTE's decision on an APAAR ID enrolled at more than one institution.
CREATE TABLE IF NOT EXISTS conflict_notes (
  apaar_id TEXT PRIMARY KEY, status TEXT NOT NULL, note TEXT, by_name TEXT, at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

export type Row = Record<string, any>;

export const all = <T = Row>(sql: string, ...p: any[]) => db.prepare(sql).all(...p) as T[];
export const get = <T = Row>(sql: string, ...p: any[]) => db.prepare(sql).get(...p) as T | undefined;
export const run = (sql: string, ...p: any[]) => db.prepare(sql).run(...p);

export function tx<T>(fn: () => T): T {
  db.exec("BEGIN");
  try { const r = fn(); db.exec("COMMIT"); return r; } catch (e) { db.exec("ROLLBACK"); throw e; }
}

export interface Rules {
  academic_year: string;
  deadline: string;          // submission deadline, ISO date
  tfw_cap_pct: number;       // Tuition Fee Waiver seats, % of approved intake
  fn_cap_pct: number;        // Foreign national / OCI / PIO / CIWG seats, % of approved intake
  lateral_cap_pct: number;   // lateral entry into year 2, % of approved intake
  min_age: number; max_age: number;
}

export const DEFAULT_RULES: Rules = {
  academic_year: "2026-27", deadline: "2026-10-31",
  tfw_cap_pct: 5, fn_cap_pct: 15, lateral_cap_pct: 10, min_age: 15, max_age: 40,
};

export function rules(): Rules {
  const r = get<{ value: string }>("SELECT value FROM settings WHERE key = 'rules'");
  return r ? { ...DEFAULT_RULES, ...JSON.parse(r.value) } : DEFAULT_RULES;
}

export function setRules(next: Partial<Rules>) {
  const merged = { ...rules(), ...next };
  run("INSERT INTO settings (key, value) VALUES ('rules', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify(merged));
  bump();
  return merged;
}

/** Bumped on every write to student data, so cached checks know to run again. */
let generation = 0;
export const bump = () => { generation++; };
export const currentGeneration = () => generation;

export const now = () => new Date().toISOString();
