import { useState } from "react";
import { Link } from "react-router-dom";
import { api, saveBlob, useApi } from "../../lib/api";
import { useLive, useSession } from "../../lib/session";
import { date, GENDER, plural, time } from "../../lib/format";
import { Page } from "../../components/Shell";
import { Icon } from "../../components/Icons";
import { Copyable, Empty, ErrorNote, Loading, MenuButton, MenuItem, Sheet, useUi } from "../../components/ui";
import { Certificate, verifyUrl } from "../../components/Certificate";
import { printCertificate } from "../inst/Records";

function useMe() {
  const r = useApi("/student/me");
  useLive((e) => { if (["consent", "access", "credential", "records"].includes(e.type)) r.reload(); });
  return r;
}

/** A student's own view: what institutions have on record for their APAAR ID, and their verifiable records. */
export function Me() {
  const { user } = useSession();
  const ui = useUi();
  const { data, error, reload } = useMe();
  const [cert, setCert] = useState<any>(null);
  if (error) return <Page title="My record"><ErrorNote text={error} retry={reload} /></Page>;
  if (!data) return <Page title="My record"><Loading /></Page>;
  const pending = data.consents.filter((c: any) => c.status === "pending");

  const getRecord = async (rec: any) => {
    try { const r = await api(`/student/records/${rec.id}/credential`, { body: {} }); ui.toast(`Verifiable record ${r.id} ready`); reload(); } catch (e) { ui.toast((e as Error).message, { kind: "error" }); }
  };
  const save = (c: any) => saveBlob(new Blob([JSON.stringify({ statement: c.statement, signature: c.signature }, null, 2)], { type: "application/json" }), `record-${c.id}.json`);

  return (
    <Page title={user!.name} sub={<>APAAR ID <b className="num">{data.display}</b>{data.registry ? ` · born ${date(data.registry.dob)} · ${GENDER[data.registry.gender] ?? ""}` : ""}</>}>
      {pending.length > 0 && (
        <section className="panel" style={{ marginBottom: 14 }}>
          <div className="notice warn"><Icon.Info /><div style={{ flex: 1 }}><b>{plural(pending.length, "request")} to see your record.</b> {pending.map((p: any) => p.verifier).join(", ")} {pending.length === 1 ? "is" : "are"} asking.</div><Link to="/s/sharing" className="btn small primary">Review</Link></div>
        </section>
      )}
      <div className="section-title">On record at institutions</div>
      <div className="stack">
        {data.records.map((r: any) => {
          const cred = data.credentials.find((c: any) => c.student_id === r.id && !c.revoked_at);
          return (
            <section key={r.id} className="panel">
              <div className="panel-body" style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 280px" }}>
                  <div className="panel-title">{r.programme}</div>
                  <div className="panel-sub">{r.institution}, {r.city} · admitted {r.academic_year}</div>
                </div>
                <span className={`chip ${r.status === "active" || r.status === "graduated" ? "ok" : ""}`}>{r.status === "graduated" ? "Completed" : r.status === "active" ? "Enrolled" : r.status}</span>
              </div>
              {r.issues.filter((i: any) => i.code.startsWith("apaar") || i.code === "cross_enrolment").map((i: any) => (
                <div key={i.code} className={`notice ${i.severity === "error" ? "bad" : "warn"}`}><Icon.Warning /><div><b>{i.title}.</b> {i.code === "cross_enrolment" ? "Another institution also has you as enrolled. If you've left one, ask them to update their records." : "Ask your institution to correct their record, or correct your APAAR record on DigiLocker."}</div></div>
              ))}
              <div className="kv"><span>Enrolment no.</span><span>{r.enrolment_no ?? "—"}</span></div>
              <div className="kv"><span>Name on record</span><span>{r.name}{data.registry && r.name !== data.registry.name && <span className="secondary"> · APAAR has “{data.registry.name}”</span>}</span></div>
              <div className="kv" style={{ alignItems: "center" }}>
                <span>Verifiable record</span>
                <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {cred ? <>
                    <span className="mono" style={{ fontWeight: 600 }}>{cred.id}</span>
                    <span className="spacer" />
                    <button className="btn small quiet" onClick={() => setCert({ r, cred })}>Certificate</button>
                    <MenuButton className="btn small quiet icon" ariaLabel="Share" align="right" label={<Icon.More size={16} />}>
                      {(close) => <>
                        <MenuItem lead={<Icon.Copy size={16} />} onClick={() => { navigator.clipboard.writeText(verifyUrl(cred.id)); ui.toast("Link copied"); close(); }}>Copy link</MenuItem>
                        <MenuItem lead={<Icon.Download size={16} />} onClick={() => { save(cred); close(); }}>Download signed file</MenuItem>
                        <MenuItem lead={<Icon.External size={16} />} onClick={() => { window.open(verifyUrl(cred.id), "_blank"); close(); }}>Open check page</MenuItem>
                      </>}
                    </MenuButton>
                  </> : <><span className="secondary">None yet</span><span className="spacer" /><button className="btn small quiet" onClick={() => getRecord(r)}>Get one</button></>}
                </span>
              </div>
            </section>
          );
        })}
        {!data.records.length && <section className="panel"><Empty title="No institution has you on record" text="When an AICTE-approved institution submits your admission, it shows here." /></section>}
      </div>
      {cert && (
        <Sheet title="Your certificate" width={860} onClose={() => setCert(null)} foot={<><span className="spacer" /><Copyable text={verifyUrl(cert.cred.id)} label="Link copied" /><button className="btn primary" onClick={printCertificate}><Icon.Print size={16} />Print</button></>}>
          <Certificate d={{ name: cert.r.name, apaar_id: data.apaar_id, enrolment_no: cert.r.enrolment_no, programme: cert.r.programme, institution: cert.r.institution, place: `${cert.r.city}, ${cert.r.state}`, admission_year: cert.r.academic_year, status: cert.r.status, code: cert.cred.id }} />
        </Sheet>
      )}
    </Page>
  );
}

/** Who has asked to see the record, who can see it now, and stopping that. */
export function Sharing() {
  const ui = useUi();
  const { data, error, reload } = useMe();
  if (error) return <Page title="Consent and sharing"><ErrorNote text={error} retry={reload} /></Page>;
  if (!data) return <Page title="Consent and sharing"><Loading /></Page>;
  const pending = data.consents.filter((c: any) => c.status === "pending");
  const live = data.consents.filter((c: any) => c.status === "granted" && !c.expired);
  const past = data.consents.filter((c: any) => !pending.includes(c) && !live.includes(c));

  const decide = async (c: any, decision: "grant" | "deny" | "revoke", days?: number) => {
    if (decision === "revoke" && !(await ui.confirm({ title: `Stop sharing with ${c.verifier}?`, message: "They lose access straight away.", confirm: "Stop sharing", destructive: true }))) return;
    try { await api(`/student/consents/${c.id}`, { body: { decision, days } }); ui.toast(decision === "grant" ? `Shared with ${c.verifier} for ${days} days` : decision === "deny" ? "Declined" : "Stopped sharing"); reload(); } catch (e) { ui.toast((e as Error).message, { kind: "error" }); }
  };

  return (
    <Page title="Consent and sharing" sub="Employers, universities and government offices can ask to see your record. Nothing is shared unless you say yes, and you choose for how long.">
      <div className="section-title">Asking now</div>
      {!pending.length ? <section className="panel"><div className="t-empty">No one is waiting for an answer.</div></section> : (
        <div className="stack">
          {pending.map((c: any) => (
            <section key={c.id} className="panel">
              <div className="panel-body">
                <div className="panel-title">{c.verifier}</div>
                <div className="panel-sub">{c.kind[0].toUpperCase() + c.kind.slice(1)} · asked {time(c.requested_at)}</div>
                <p style={{ marginTop: 12, fontSize: 15 }}>“{c.purpose}”</p>
              </div>
              <div className="panel-head">They'd see</div>
              <div className="panel-body chips" style={{ gap: 6 }}>{c.fields.map((f: string) => <span key={f} className="chip">{data.labels[f]}</span>)}</div>
              <div className="panel-body" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button className="btn quiet" onClick={() => decide(c, "deny")}>Decline</button>
                <span className="spacer" />
                <MenuButton className="btn primary" align="right" label={<>Share…<Icon.Down size={15} /></>}>
                  {(close) => <><div className="menu-header">Share for</div>{[7, 30, 90].map((d) => <MenuItem key={d} onClick={() => { close(); decide(c, "grant", d); }}>{d === 7 ? "A week" : d === 30 ? "A month" : "Three months"}</MenuItem>)}</>}
                </MenuButton>
              </div>
            </section>
          ))}
        </div>
      )}
      <div className="section-title">Can see your record</div>
      <section className="panel">
        {!live.length && <div className="t-empty">No one.</div>}
        {live.map((c: any) => (
          <div key={c.id} className="kv" style={{ alignItems: "center" }}>
            <span style={{ width: "auto", maxWidth: "none", flex: 1 }}><span style={{ color: "var(--label)", display: "block", fontWeight: 500 }}>{c.verifier}</span><span style={{ fontSize: 13 }}>{c.fields.map((f: string) => data.labels[f]).join(", ")} · until {date(c.expires_at)}</span></span>
            <button className="btn small quiet destructive" onClick={() => decide(c, "revoke")}>Stop sharing</button>
          </div>
        ))}
      </section>
      {past.length > 0 && <>
        <div className="section-title">Earlier</div>
        <section className="panel">{past.map((c: any) => <div key={c.id} className="kv"><span>{c.verifier}</span><span className="secondary">{c.status === "denied" ? "Declined" : c.status === "revoked" ? "You stopped sharing" : "Expired"} · {date(c.decided_at ?? c.requested_at)}</span></div>)}</section>
      </>}
    </Page>
  );
}

/** Every time someone looked at the record: by consent, or by checking a certificate. */
export function Views() {
  const { data, error, reload } = useMe();
  if (error) return <Page title="Access history"><ErrorNote text={error} retry={reload} /></Page>;
  if (!data) return <Page title="Access history"><Loading /></Page>;
  return (
    <Page title="Access history" sub="Each time an organisation opened what you shared, or someone checked one of your certificates.">
      <section className="panel">
        {!data.access.length && <Empty scene="search" title="No one yet" />}
        {data.access.map((a: any) => (
          <div key={a.id} className="feed-item">
            <span className="when" style={{ width: 128 }}>{time(a.at)}</span>
            <span><b>{a.verifier ?? "Someone with your certificate"}</b> {a.via === "consent" ? "viewed what you shared" : "checked your verifiable record"}<span className="where">{a.purpose}</span></span>
          </div>
        ))}
      </section>
    </Page>
  );
}
