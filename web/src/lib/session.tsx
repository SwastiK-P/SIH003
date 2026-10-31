import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, token } from "./api";

export type Role = "aicte" | "institution" | "verifier" | "student";
export interface User { id: string; name: string; title: string | null; email: string | null; role: Role; institution_id: string | null; verifier_id: string | null; apaar_id: string | null }

interface Session { user: User | null; ready: boolean; signIn: (id: string) => Promise<User>; signOut: () => void; live: boolean }

const Ctx = createContext<Session>(null as any);
export const useSession = () => useContext(Ctx);

export const homeFor = (r: Role) => ({ aicte: "/a", institution: "/i", verifier: "/e", student: "/s" })[r];

type Listener = (e: any) => void;
const listeners = new Set<Listener>();

/** Server-sent events for the signed-in account. Pages subscribe to what they show. */
export function useLive(fn: Listener, deps: unknown[] = []) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const l: Listener = (e) => ref.current(e);
    listeners.add(l);
    return () => { listeners.delete(l); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!token.get()) { setReady(true); return; }
    api<User>("/me").then(setUser).catch(() => token.set(null)).finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!user) return;
    const es = new EventSource(`/api/live?token=${encodeURIComponent(token.get() ?? "")}`);
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.onmessage = (m) => { try { const e = JSON.parse(m.data); for (const l of listeners) l(e); } catch { /* keep-alive */ } };
    return () => { es.close(); setLive(false); };
  }, [user]);

  const signIn = useCallback(async (id: string) => {
    const r = await api<{ token: string; user: User }>("/session", { body: { userId: id } });
    token.set(r.token); setUser(r.user);
    return r.user;
  }, []);
  const signOut = useCallback(() => { token.set(null); setUser(null); }, []);

  return <Ctx.Provider value={{ user, ready, signIn, signOut, live }}>{children}</Ctx.Provider>;
}
