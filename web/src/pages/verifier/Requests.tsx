import { Link, useNavigate, useParams } from "react-router-dom";
import { useApi } from "../../lib/api";
import { useLive } from "../../lib/session";
import { ago, date, plural } from "../../lib/format";
import { Page } from "../../components/Shell";
import { Icon } from "../../components/Icons";
import { Empty, ErrorNote, Loading, Table } from "../../components/ui";

const STATE: Record<string, [string, string]> = { pending: ["Waiting for the student", "accent"], granted: ["Shared", "ok"], denied: ["Declined", "bad"], revoked: ["Stopped by the student", ""] };
const stateOf = (r: any) => (r.status === "granted" && r.expired ? ["Expired", ""] : STATE[r.status]);

/** Requests sent to students, and what each one shared. */
export function Requests() {
  const { data, error, reload } = useApi("/verifier/requests");
  const nav = useNavigate();
  useLive((e) => { if (e.type === "consent") reload(); });
  return (
    <Page title="Consent requests" sub="Updated the moment a student answers." actions={<Link to="/e" className="btn primary"><Icon.Plus size={16} />New request</Link>}>
      {error ? <ErrorNote text={error} retry={reload} /> : !data ? <Loading /> : !data.requests.length ? (
        <section className="panel"><Empty scene="consent" title="No requests yet" text="Ask a student to share their record from Verify a record." /></section>
      ) : (
        <section className="panel">
          <Table cols="minmax(0,1.6fr) 140px 160px" head={<><span>Purpose</span><span className="hide-phone">APAAR ID</span><span>State</span></>}>
            {data.requests.map((r: any) => {
              const [label, tone] = stateOf(r);
              return (
                <button key={r.id} className="t-row hoverable" onClick={() => nav(`/e/requests/${r.id}`)}>
                  <span><div className="t-main">{r.purpose}</div><div className="t-sub">Asked {ago(r.requested_at)} · {plural(r.fields.length, "detail")}</div></span>
                  <span className="t-num hide-phone">{r.apaar_masked}</span>
                  <span><span className={`chip small ${tone}`}>{label}</span>{r.status === "granted" && !r.expired && <div className="t-sub" style={{ marginTop: 3 }}>until {date(r.expires_at)}</div>}</span>
                </button>
              );
            })}
          </Table>
        </section>
      )}
    </Page>
  );
}

export function RequestDetail() {
  const { id } = useParams();
  const { data, error, reload } = useApi(`/verifier/requests/${id}`, [id]);
  useLive((e) => { if (e.type === "consent") reload(); });
  if (error) return <Page title="Request" back={{ to: "/e/requests", label: "Requests" }}><ErrorNote text={error} retry={reload} /></Page>;
  if (!data) return <Page title="Request" back={{ to: "/e/requests", label: "Requests" }}><Loading /></Page>;
  const [label] = stateOf(data);
  return (
    <Page title={data.purpose} back={{ to: "/e/requests", label: "Requests" }} sub={<>APAAR ID {data.apaar_masked} · asked {date(data.requested_at)} · {label}</>}>
      <div className="grid cols-main">
        <div className="stack">
          {!data.live ? (
            <section className="panel"><Empty scene="consent" title={data.status === "pending" ? "Waiting for the student" : label} text={data.status === "pending" ? "They've been asked in their registry account. This page updates when they answer." : data.status === "denied" ? "The student chose not to share. You can ask them directly for a verifiable record instead." : "The record is no longer shared with you."} /></section>
          ) : data.records.length === 0 ? (
            <section className="panel"><Empty scene="search" title="No records for this ID" text="The student shared, but no AICTE-approved institution has a record for this APAAR ID." /></section>
          ) : data.records.map((rec: any, i: number) => (
            <section key={i} className="panel">
              <div className="notice ok"><Icon.CheckCircle /><div><b>Shared by the student</b> until {date(data.expires_at)}. From the AICTE registry, as the institution submitted it.</div></div>
              {data.fields.map((f: string) => <div key={f} className="kv"><span>{data.labels[f]}</span><span>{f === "dob" ? date(rec[f]) : f === "status" ? rec[f][0].toUpperCase() + rec[f].slice(1) : rec[f] ?? "—"}</span></div>)}
            </section>
          ))}
        </div>
        <section className="panel" style={{ alignSelf: "start" }}>
          <div className="panel-head">You asked for</div>
          {data.fields.map((f: string) => <div key={f} className="kv"><span>{data.labels[f]}</span><span>{data.live ? "Shared" : "—"}</span></div>)}
          <div className="notice info"><Icon.Eye /><div style={{ fontSize: 13.5 }}>Opening this page is recorded, and the student can see it.</div></div>
        </section>
      </div>
    </Page>
  );
}
