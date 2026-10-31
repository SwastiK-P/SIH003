import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify, createHash, type KeyObject } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DATA_DIR, get, now, run } from "./db.js";

/**
 * Verifiable student records. AICTE signs a canonical JSON statement with Ed25519; anyone with the
 * public key can check it offline, and the registry answers whether it has since been revoked.
 */

const KEY_DIR = resolve(DATA_DIR, "keys");

function loadKeys(): { priv: KeyObject; pub: KeyObject; kid: string } {
  mkdirSync(KEY_DIR, { recursive: true });
  const file = resolve(KEY_DIR, "issuer-ed25519.pem");
  if (!existsSync(file)) {
    const { privateKey } = generateKeyPairSync("ed25519");
    writeFileSync(file, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  }
  const priv = createPrivateKey(readFileSync(file));
  const pub = createPublicKey(priv);
  const raw = pub.export({ type: "spki", format: "der" });
  const kid = "aicte-" + createHash("sha256").update(raw).digest("hex").slice(0, 12);
  return { priv, pub, kid };
}

const keys = loadKeys();

export const publicKey = () => ({ kid: keys.kid, alg: "Ed25519", pem: keys.pub.export({ type: "spki", format: "pem" }).toString() });

/** Sorted keys, no whitespace: the exact bytes that are signed. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as any)[k])}`).join(",")}}`;
  return JSON.stringify(v);
}

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export function credentialId() {
  const b = randomBytes(10);
  const s = Array.from(b, (x) => ALPHABET[x % ALPHABET.length]).join("");
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 10)}`;
}

export interface Statement {
  v: 1;
  id: string;
  type: "StudentRecord";
  issuer: { name: string; kid: string };
  issued_at: string;
  subject: {
    apaar_id: string; name: string; dob: string; enrolment_no: string | null;
    programme: string; level: string; institution: string; institution_id: string; state: string;
    admission_year: string; status: string;
  };
}

export function issue(student: any, issuedBy: string) {
  const inst = get<any>("SELECT * FROM institutions WHERE id = ?", student.institution_id)!;
  const prog = get<any>("SELECT * FROM programs WHERE id = ?", student.program_id)!;
  const id = credentialId();
  const statement: Statement = {
    v: 1, id, type: "StudentRecord", issuer: { name: "All India Council for Technical Education", kid: keys.kid }, issued_at: now(),
    subject: {
      apaar_id: student.apaar_id, name: student.name, dob: student.dob, enrolment_no: student.enrolment_no,
      programme: prog.name, level: prog.level, institution: inst.name, institution_id: inst.id, state: inst.state,
      admission_year: student.academic_year, status: student.status,
    },
  };
  const payload = canonical(statement);
  const signature = sign(null, Buffer.from(payload), keys.priv).toString("base64url");
  run("INSERT INTO credentials (id, student_id, apaar_id, payload, signature, issued_at, issued_by) VALUES (?,?,?,?,?,?,?)", id, student.id, student.apaar_id, payload, signature, statement.issued_at, issuedBy);
  return { id, statement, signature };
}

export function checkSignature(statement: unknown, signature: string) {
  try { return verify(null, Buffer.from(canonical(statement)), keys.pub, Buffer.from(signature, "base64url")); } catch { return false; }
}

/** The answer a verifier gets: is the signature AICTE's, is it still in force, does the record still say so. */
export function verifyCredential(id: string) {
  const c = get<any>("SELECT * FROM credentials WHERE id = ?", id.toUpperCase());
  if (!c) return null;
  const statement = JSON.parse(c.payload) as Statement;
  const signatureValid = checkSignature(statement, c.signature);
  const student = get<any>("SELECT status FROM students WHERE id = ?", c.student_id);
  return {
    id: c.id, statement, signature: c.signature, signatureValid,
    revoked: c.revoked_at ? { at: c.revoked_at, reason: c.revoke_reason } : null,
    currentStatus: student?.status ?? null,
    valid: signatureValid && !c.revoked_at,
  };
}
