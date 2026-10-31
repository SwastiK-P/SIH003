import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { apaar, date, GENDER } from "../../lib/format";
import { Page } from "../../components/Shell";
import { Icon } from "../../components/Icons";
import { Empty, Table } from "../../components/ui";

/** Every record held for one APAAR ID, across all institutions and years. Each look-up is logged. */
export function Lookup() {
  const [q, setQ] = useState("");
  const [r, setR] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const clean = q.replace(/\D/g, "");
  const go = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (clean.length !== 12) return;
    setBusy(true);
    try { setR(await api(`/national/lookup/${clean}`)); } finally { setBusy(false); }
  };
  return (
    <Page title="Student lookup" sub="Every record held for an APAAR ID, at every institution and in every year. Look-ups are recorded in the audit trail.">
      <form onSubmit={go} className="toolbar">
        <label className="search glass" style={{ maxWidth: 360 }}><Icon.Search size={17} /><input inputMode="numeric" placeholder="12-digit APAAR ID" value={q} onChange={(e) => setQ(e.target.value)} aria-label="APAAR ID" autoFocus /></label>
        <button className="btn primary" disabled={clean.length !== 12 || busy}>Look up</button>
        <button type="button" className="btn quiet" onClick={() => { setQ("731846205519"); }}>Try 7318 4620 5519</button>
      </form>
      {r && (r.records.length === 0 && !r.registry ? <section className="panel"><Empty scene="search" title="Nothing for this ID" text="It isn't in the APAAR registry or on any institution's records." /></section> : (
        <div className="stack">
          <section className="panel">
            <div className="panel-head">APAAR registry</div>
            {r.registry ? <>
              <div className="kv"><span>APAAR ID</span><span className="num">{apaar(r.apaar_id)}</span></div>
              <div className="kv"><span>Name</span><span>{r.registry.name}</span></div>
              <div className="kv"><span>Date of birth</span><span>{date(r.registry.dob)} · {GENDER[r.registry.gender] ?? "—"}</span></div>
              <div className="kv"><span>Status</span><span>{r.registry.status}</span></div>
            </> : <div className="notice bad"><Icon.Error /><div>Not in the APAAR registry, but institutions have used it.</div></div>}
          </section>
          <section className="panel">
            <div className="panel-head">On institutions' records · {r.records.length}</div>
            <Table cols="minmax(0,1.6fr) minmax(0,1.3fr) 90px 100px">
              {r.records.map((s: any) => (
                <Link key={s.id} className="t-row hoverable" to={`/a/institutions/${s.institution_id}/students/${s.id}`}>
                  <span><div className="t-main">{s.institution}</div><div className="t-sub">{s.city}, {s.state}</div></span>
                  <span><div className="t-main" style={{ fontWeight: 400 }}>{s.programme}</div><div className="t-sub">{s.name}</div></span>
                  <span className="t-sub">{s.academic_year}</span>
                  <span><span className={`chip small ${s.status === "active" ? "ok" : ""}`}>{s.status}</span></span>
                </Link>
              ))}
            </Table>
          </section>
          {r.credentials.length > 0 && <section className="panel"><div className="panel-head">Verifiable records</div>{r.credentials.map((c: any) => <div key={c.id} className="kv"><span className="mono">{c.id}</span><span>{c.revoked_at ? "Revoked" : "Valid"} · issued {date(c.issued_at)} · <Link className="link-btn" to={`/v/${c.id}`} target="_blank">open</Link></span></div>)}</section>}
        </div>
      ))}
    </Page>
  );
}
