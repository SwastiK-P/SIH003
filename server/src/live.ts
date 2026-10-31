import type { Response } from "express";

/** Server-sent events: dashboards stay current without polling. */

interface Client { res: Response; role: string; institutionId: string | null; apaarId: string | null; verifierId: string | null }

const clients = new Set<Client>();

export function subscribe(c: Client) {
  clients.add(c);
  c.res.on("close", () => clients.delete(c));
}

export interface LiveEvent { type: string; institution_id?: string | null; apaar_id?: string | null; verifier_id?: string | null; [k: string]: unknown }

/** AICTE sees everything; others only what is about them. */
export function publish(e: LiveEvent) {
  const data = `data: ${JSON.stringify(e)}\n\n`;
  for (const c of clients) {
    const mine =
      c.role === "aicte" ||
      (c.role === "institution" && e.institution_id === c.institutionId) ||
      (c.role === "student" && e.apaar_id && e.apaar_id === c.apaarId) ||
      (c.role === "verifier" && e.verifier_id && e.verifier_id === c.verifierId);
    if (mine) c.res.write(data);
  }
}

setInterval(() => { for (const c of clients) c.res.write(": keep-alive\n\n"); }, 25_000).unref();
