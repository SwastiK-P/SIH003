import { createHash } from "node:crypto";
import { all, get, now, run } from "./db.js";
import { publish } from "./live.js";

/**
 * The audit trail. Each entry's hash covers the entry and the hash before it, so changing or deleting
 * any past entry breaks every hash after it — `verifyChain` finds the first break.
 */

export interface Actor { id: string; name: string; role: string; institution_id?: string | null }

const GENESIS = "0".repeat(64);

function digest(e: { at: string; actor_id: string | null; action: string; entity: string | null; entity_id: string | null; institution_id: string | null; detail: string | null; prev_hash: string }) {
  return createHash("sha256").update([e.prev_hash, e.at, e.actor_id ?? "", e.action, e.entity ?? "", e.entity_id ?? "", e.institution_id ?? "", e.detail ?? ""].join("␟")).digest("hex");
}

export function audit(actor: Actor | null, action: string, opts: { entity?: string; entityId?: string | number; institutionId?: string | null; detail?: unknown; at?: string } = {}) {
  const prev = get<{ hash: string }>("SELECT hash FROM audit ORDER BY id DESC LIMIT 1")?.hash ?? GENESIS;
  const e = {
    at: opts.at ?? now(),
    actor_id: actor?.id ?? null,
    action,
    entity: opts.entity ?? null,
    entity_id: opts.entityId != null ? String(opts.entityId) : null,
    institution_id: opts.institutionId ?? actor?.institution_id ?? null,
    detail: opts.detail != null ? JSON.stringify(opts.detail) : null,
    prev_hash: prev,
  };
  const hash = digest(e);
  run("INSERT INTO audit (at, actor_id, actor_name, role, action, entity, entity_id, institution_id, detail, prev_hash, hash) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    e.at, e.actor_id, actor?.name ?? "System", actor?.role ?? "system", e.action, e.entity, e.entity_id, e.institution_id, e.detail, e.prev_hash, hash);
  publish({ type: "audit", action, institution_id: e.institution_id, actor: actor?.name ?? "System", at: e.at, detail: opts.detail ?? null });
  return hash;
}

export function verifyChain() {
  const rows = all<any>("SELECT * FROM audit ORDER BY id");
  let prev = GENESIS;
  for (const r of rows) {
    if (r.prev_hash !== prev || digest(r) !== r.hash) return { ok: false, entries: rows.length, brokenAt: r.id as number, head: prev };
    prev = r.hash;
  }
  return { ok: true, entries: rows.length, brokenAt: null, head: prev };
}
