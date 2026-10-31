import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { NextFunction, Request, Response } from "express";
import { DATA_DIR, SERVERLESS, get, now, run } from "./db.js";

/**
 * Sessions and role-based access. In production sign-in would come from the AICTE portal's SSO (staff,
 * institutions) and DigiLocker (students); here the session is a signed token for a chosen account.
 */

export type Role = "aicte" | "institution" | "verifier" | "student";

export interface User { id: string; name: string; title: string | null; email: string | null; role: Role; institution_id: string | null; verifier_id: string | null; apaar_id: string | null }

/** What each role may do. Routes ask for a permission, never a role, so the matrix lives in one place. */
export const PERMISSIONS = {
  "national.read": ["aicte"],
  "submission.review": ["aicte"],
  "conflict.resolve": ["aicte"],
  "rules.edit": ["aicte"],
  "audit.read": ["aicte", "institution"],
  "records.read": ["aicte", "institution"],
  "records.write": ["institution"],
  "submission.submit": ["institution"],
  "keys.manage": ["institution"],
  "credentials.issue": ["institution", "aicte"],
  "verify.request": ["verifier"],
  "consent.decide": ["student"],
  "self.read": ["student"],
} as const satisfies Record<string, Role[]>;
export type Permission = keyof typeof PERMISSIONS;

const keyDir = resolve(DATA_DIR, "keys");
mkdirSync(keyDir, { recursive: true });
const secretFile = resolve(keyDir, "session.secret");
if (!existsSync(secretFile)) writeFileSync(secretFile, randomBytes(32).toString("hex"), { mode: 0o600 });
// Function instances don't share /tmp, so they share a fixed sandbox secret instead.
const SECRET = process.env.SESSION_SECRET ?? (SERVERLESS ? "apaar-sandbox-demo" : readFileSync(secretFile, "utf8").trim());

const mac = (s: string) => createHmac("sha256", SECRET).update(s).digest("base64url");

export function sessionToken(userId: string) {
  const body = Buffer.from(JSON.stringify({ sub: userId, exp: Date.now() + 12 * 3600_000 })).toString("base64url");
  return `${body}.${mac(body)}`;
}

export function readToken(token: string | undefined): User | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(mac(body)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const { sub, exp } = JSON.parse(Buffer.from(body, "base64url").toString());
  if (Date.now() > exp) return null;
  return get<User>("SELECT * FROM users WHERE id = ?", sub) ?? null;
}

declare module "express-serve-static-core" {
  interface Request { user?: User; apiInstitution?: string }
}

export function attachUser(req: Request, _res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  const token = h?.startsWith("Bearer ") && !h.startsWith("Bearer ak_") ? h.slice(7) : (req.query.token as string | undefined);
  const u = readToken(token);
  if (u) req.user = u;
  next();
}

export const can = (u: User | undefined, p: Permission) => !!u && (PERMISSIONS[p] as readonly Role[]).includes(u.role);

export function need(p: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Sign in to continue." });
    if (!can(req.user, p)) return res.status(403).json({ error: "Your role doesn't allow this." });
    next();
  };
}

/** An institution's records are theirs; AICTE may read any. */
export function institutionScope(req: Request, id: string) {
  const u = req.user!;
  return u.role === "aicte" || (u.role === "institution" && u.institution_id === id);
}

// ---- API keys for institutional systems (ERP, admission software)

const hashKey = (k: string) => createHash("sha256").update(k).digest("hex");

export function createApiKey(institutionId: string, label: string) {
  const secret = `ak_live_${randomBytes(24).toString("base64url")}`;
  const id = randomBytes(6).toString("hex");
  run("INSERT INTO api_keys (id, institution_id, label, prefix, key_hash, created_at) VALUES (?,?,?,?,?,?)", id, institutionId, label, secret.slice(0, 14), hashKey(secret), now());
  return { id, secret };
}

export function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization ?? "";
  const key = h.startsWith("Bearer ") ? h.slice(7) : (req.headers["x-api-key"] as string | undefined);
  if (!key?.startsWith("ak_")) return res.status(401).json({ error: "Send an API key as `Authorization: Bearer ak_live_…`." });
  const row = get<any>("SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL", hashKey(key));
  if (!row) return res.status(401).json({ error: "This API key isn't valid or has been revoked." });
  run("UPDATE api_keys SET last_used_at = ? WHERE id = ?", now(), row.id);
  req.apiInstitution = row.institution_id;
  next();
}
