import { all } from "./db.js";

/**
 * Everything that knows what an APAAR ID is. The registry lookup goes through `registry`, so the
 * sandbox table can be swapped for the national APAAR/ABC verification API without touching the checks.
 */

export const APAAR_RE = /^\d{12}$/;

export const cleanApaar = (v: unknown) => String(v ?? "").replace(/[\s-]/g, "");

export function formatApaar(id: string) {
  return APAAR_RE.test(id) ? `${id.slice(0, 4)} ${id.slice(4, 8)} ${id.slice(8)}` : id;
}

export interface RegistryEntry { apaar_id: string; name: string; dob: string; gender: string | null; status: string }

export interface Registry { lookup(ids: string[]): Map<string, RegistryEntry> }

/** Sandbox registry: a local table seeded alongside the institutions. */
export const registry: Registry = {
  lookup(ids) {
    const out = new Map<string, RegistryEntry>();
    const wanted = [...new Set(ids.filter((i) => APAAR_RE.test(i)))];
    for (let i = 0; i < wanted.length; i += 500) {
      const chunk = wanted.slice(i, i + 500);
      const rows = all<RegistryEntry>(`SELECT * FROM apaar_registry WHERE apaar_id IN (${chunk.map(() => "?").join(",")})`, ...chunk);
      for (const r of rows) out.set(r.apaar_id, r);
    }
    return out;
  },
};

const TITLES = /\b(MR|MRS|MS|MISS|DR|SHRI|SMT|KUM|KUMARI)\b\.?/g;

export function normName(n: string) {
  return n.toUpperCase().replace(TITLES, " ").replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = t;
    }
  }
  return prev[b.length];
}

export type NameMatch = "exact" | "close" | "different";

/**
 * Names on admission forms drift from the registry: initials, word order, a missing middle name,
 * one letter off. Those are "close" and only warn; anything further is "different".
 */
export function compareNames(given: string, registered: string): NameMatch {
  const a = normName(given), b = normName(registered);
  if (!a || !b) return "different";
  if (a === b) return "exact";
  const ta = a.split(" "), tb = b.split(" ");
  const sorted = (t: string[]) => [...t].sort().join(" ");
  if (sorted(ta) === sorted(tb)) return "close";
  // Initials: "R KUMAR" against "RAHUL KUMAR".
  const initialsOk = ta.length === tb.length && ta.every((t, i) => t === tb[i] || (t.length === 1 && tb[i].startsWith(t)) || (tb[i].length === 1 && t.startsWith(tb[i])));
  if (initialsOk) return "close";
  // A dropped middle name: every word of the shorter is in the longer, first and last agree.
  const [short, long] = ta.length < tb.length ? [ta, tb] : [tb, ta];
  if (short.length >= 2 && short[0] === long[0] && short.at(-1) === long.at(-1)) return "close";
  const ratio = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  return ratio >= 0.86 ? "close" : "different";
}
