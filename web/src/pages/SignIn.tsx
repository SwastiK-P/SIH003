import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApi } from "../lib/api";
import { homeFor, useSession } from "../lib/session";
import { Brand } from "../components/Shell";
import { RowCard, type RowName } from "../components/Drawings";
import { Icon } from "../components/Icons";
import { useUi } from "../components/ui";

const ART: Record<string, RowName> = { aicte: "overview", institution: "institutions", verifier: "verify", student: "me" };
const ROLE: Record<string, string> = { aicte: "AICTE", institution: "Institution", verifier: "Verifier", student: "Student" };
const WHAT: Record<string, string> = {
  aicte: "National dashboard, reviews, duplicates and reports",
  institution: "Upload, validate, submit and issue records",
  verifier: "Verify records and request consent",
  student: "Own record, consent and access history",
};

/** The sandbox has four accounts, one per role. */
export function SignIn() {
  const { data, error } = useApi("/accounts");
  const { signIn } = useSession();
  const nav = useNavigate();
  const ui = useUi();
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { document.title = "Sign in · APAAR Registry"; }, []);
  const go = async (id: string) => {
    setBusy(id);
    try { const u = await signIn(id); nav(homeFor(u.role)); } catch (e) { ui.toast((e as Error).message, { kind: "error" }); setBusy(null); }
  };
  return (
    <div className="solo">
      <div className="solo-top"><div className="wrap"><Link to="/"><Brand /></Link><span className="spacer" /><Link className="btn quiet" to="/v">Verify a record</Link></div></div>
      <div className="solo-body">
        <div className="solo-col narrow">
          <h1>Sign in</h1>
          <p className="lede">Choose a sandbox account. Each role sees only what it is permitted to see.</p>
          <section className="panel" style={{ marginTop: 22 }}>
            {data?.map((a: any) => (
              <button key={a.id} className="account-row" onClick={() => go(a.id)} disabled={!!busy}>
                <RowCard name={ART[a.role]} size={40} />
                <span className="who"><span className="tag role-tag">{ROLE[a.role]}</span><b>{a.name}</b><span className="t">{a.title}</span><span className="t" style={{ color: "var(--text-3)" }}>{WHAT[a.role]}</span></span>
                {busy === a.id ? <Icon.Spinner className="spin secondary" size={18} /> : <Icon.Next size={18} className="tertiary" />}
              </button>
            ))}
            {!data && !error && <div style={{ padding: 24 }}><div className="progress-sweep" /></div>}
            {error && <div style={{ padding: 24 }}><div className="notice bad"><Icon.Info /><div style={{ fontSize: 13 }}>{error}</div></div></div>}
          </section>
          <div className="panel" style={{ marginTop: 14 }}>
            <div className="notice info"><Icon.Info /><div style={{ fontSize: 13 }}>In production, AICTE staff and institutions sign in through AICTE single sign-on, and students through DigiLocker. Every sign-in is recorded in the audit trail.</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}
