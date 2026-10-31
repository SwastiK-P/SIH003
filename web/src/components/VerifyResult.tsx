import { useState } from "react";
import { api } from "../lib/api";
import { date, time } from "../lib/format";
import { Icon } from "./Icons";

const STATUS: Record<string, string> = { active: "Enrolled", graduated: "Completed", withdrawn: "Withdrawn", transferred: "Transferred" };

/** What a verifier sees for a record: valid or not, what it says, and how that was established. */
export function VerifyResult({ r }: { r: any }) {
  const s = r.statement.subject;
  const [id, setId] = useState("");
  const [match, setMatch] = useState<boolean | null>(null);
  const changed = r.currentStatus && r.currentStatus !== s.status;
  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    const m = await api(`/public/credentials/${r.id}/match`, { body: { apaar_id: id } });
    setMatch(m.matches);
  };
  return (
    <div className="stack" style={{ gap: 12 }}>
      <section className="panel">
        <div className={`verdict ${r.valid ? "ok" : "bad"}`}>
          <svg width="52" height="52" viewBox="0 0 64 64" className="tick-in" aria-hidden>
            <circle cx="32" cy="32" r="30" fill={r.valid ? "var(--green)" : "var(--red)"} />
            {r.valid ? <path d="m19 33 9 9 17-19" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /> : <path d="M22 22l20 20M42 22 22 42" stroke="#fff" strokeWidth="5" strokeLinecap="round" />}
          </svg>
          <div>
            <div className="verdict-title">{r.valid ? "Genuine record" : r.revoked ? "Revoked" : "Not genuine"}</div>
            <div className="verdict-sub">{r.valid ? "Signed by AICTE and still in force." : r.revoked ? `Revoked on ${date(r.revoked.at)}: ${r.revoked.reason}` : "The signature doesn't match. Don't rely on this record."}</div>
          </div>
        </div>
        {changed && <div className="notice warn"><Icon.Warning /><div><b>The student's status has changed since this was issued.</b> The institution now records them as {STATUS[r.currentStatus]?.toLowerCase() ?? r.currentStatus}.</div></div>}
        <div className="kv"><span>Name</span><span style={{ fontWeight: 600 }}>{s.name}</span></div>
        <div className="kv"><span>Programme</span><span>{s.programme} <span className="secondary">· {s.level}</span></span></div>
        <div className="kv"><span>Institution</span><span>{s.institution}<span className="secondary"> · {s.state} · AICTE ID {s.institution_id}</span></span></div>
        <div className="kv"><span>Admitted</span><span>{s.admission_year}</span></div>
        <div className="kv"><span>Status when issued</span><span>{STATUS[s.status] ?? s.status}</span></div>
        <div className="kv"><span>Enrolment no.</span><span>{s.enrolment_no ?? "—"}</span></div>
        <div className="kv"><span>APAAR ID</span><span className="num">{s.apaar_masked}</span></div>
      </section>
      <section className="panel">
        <form className="panel-body" onSubmit={check} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 220px" }}><div className="panel-title" style={{ fontSize: 14.5 }}>Is this the person in front of you?</div><div className="panel-sub">Enter the APAAR ID they give you. You'll get a yes or no; the ID is never shown.</div></div>
          <div className="field-box" style={{ width: 190, height: 40 }}><input inputMode="numeric" placeholder="12 digits" value={id} onChange={(e) => { setId(e.target.value); setMatch(null); }} aria-label="APAAR ID to compare" /></div>
          <button className="btn quiet" disabled={id.replace(/\D/g, "").length !== 12}>Compare</button>
        </form>
        {match !== null && <div className={`notice ${match ? "ok" : "bad"}`}>{match ? <Icon.CheckCircle /> : <Icon.Error />}<div><b>{match ? "It matches." : "It doesn't match."}</b> {match ? "This record belongs to that APAAR ID." : "This record belongs to a different APAAR ID."}</div></div>}
      </section>
      <details className="panel disclosure">
        <summary className="panel-head">How this was checked</summary>
        <div className="kv"><span>Record code</span><span className="mono">{r.id}</span></div>
        <div className="kv"><span>Signature</span><span>{r.signatureValid ? "Valid" : "Invalid"} · Ed25519 · key {r.statement.issuer.kid}</span></div>
        <div className="kv"><span>Issued</span><span>{time(r.statement.issued_at)} by {r.statement.issuer.name}</span></div>
        <div className="kv"><span>Revocation</span><span>{r.revoked ? `Revoked ${date(r.revoked.at)}` : "Checked against the registry just now: not revoked"}</span></div>
        <div className="panel-body secondary" style={{ fontSize: 13.5 }}>The record is a signed statement. Its signature can be checked offline against AICTE's public key at <span className="mono">/api/public/key</span>; the registry only answers whether it has been revoked.</div>
      </details>
    </div>
  );
}
