import { Link } from "react-router-dom";
import { api, useApi } from "../../lib/api";
import { useLive } from "../../lib/session";
import { action, ago, date, n, pct, plural, shortProgramme, time } from "../../lib/format";
import { Page } from "../../components/Shell";
import { Icon } from "../../components/Icons";
import { ErrorNote, Loading, Severity, SubmissionState, Table, useUi } from "../../components/ui";
import { RiskMeter, SeatLegend, SeatMeter } from "../../components/Charts";

/** One institution from AICTE's side: the risk and why, the programmes against approval, and the decision. */
export function InstitutionDetail({ id }: { id: string }) {
  const ui = useUi();
  const { data, error, reload } = useApi(`/institutions/${id}`, [id]);
  useLive((e) => { if (e.institution_id === id || e.type === "conflict") reload(); });
  if (error) return <Page title="Institution" back={{ to: "/a/institutions", label: "Institutions" }}><ErrorNote text={error} retry={reload} /></Page>;
  if (!data) return <Page title="Institution" back={{ to: "/a/institutions", label: "Institutions" }}><Loading rows={6} /></Page>;
  const { institution: inst, summary: s, programmes, submission: sub, issueCounts, recent } = data;

  const review = async (decision: "accept" | "return") => {
    let note: string | null = "";
    if (decision === "return") {
      note = await ui.prompt({ title: "Return for correction", message: "The institution sees this note and can edit again. Be specific.", confirm: "Return", field: { label: "What needs correcting", required: true, multiline: true, placeholder: "e.g. B.Tech AI&DS is 4 over approved intake; withdraw or move to an eligible quota." } });
      if (note === null) return;
    } else if (!(await ui.confirm({ title: `Accept ${inst.name}?`, message: `${plural(s.enrolled, "record")} for 2026–27 become the official count.${s.errors ? ` ${plural(s.errors, "error")} are still open.` : ""}`, confirm: "Accept" }))) return;
    try { await api(`/national/institutions/${id}/review`, { body: { decision, note } }); ui.toast(decision === "accept" ? "Accepted" : "Returned to the institution"); reload(); } catch (e) { ui.toast((e as Error).message, { kind: "error" }); }
  };

  const q = programmes.reduce((a: any, p: any) => ({ regular: a.regular + Math.min(p.regular, p.approved ?? 0), tfw: a.tfw + p.tfw, fn: a.fn + p.fn, lateral: a.lateral + p.lateral, over: a.over + p.excess }), { regular: 0, tfw: 0, fn: 0, lateral: 0, over: 0 });
  const base = `/a/institutions/${id}/students`;

  return (
    <Page title={inst.name} back={{ to: "/a/institutions", label: "Institutions" }}
      sub={<>{inst.city}, {inst.state} · {inst.type} · {inst.university} · est. {inst.established} · AICTE ID <span className="num">{inst.id}</span></>}
      actions={<>
        <Link className="btn glass" to={base}>Open records</Link>
        {sub.status === "submitted" && <><button className="btn glass" onClick={() => review("return")}>Return</button><button className="btn primary" onClick={() => review("accept")}>Accept</button></>}
      </>}>
      <div className="grid cols-main">
        <div className="stack">
          <section className="panel">
            {sub.status === "returned" && <div className="notice bad"><Icon.Error /><div><b>Returned {date(sub.reviewed_at)}.</b> {sub.note}</div></div>}
            {sub.status === "submitted" && s.errors > 0 && <div className="notice warn"><Icon.Warning /><div><b>Submitted with {plural(s.errors, "open error")}.</b> Checks run on AICTE's side found things the institution's didn't at the time — usually duplicates with another institution that submitted later.</div></div>}
            <div className="stats">
              <div className="stat"><div className="stat-label">Submission</div><div style={{ marginTop: 8 }}><SubmissionState status={sub.status} /></div><div className="stat-note">{sub.submitted_at ? time(sub.submitted_at) : "Not submitted"}</div></div>
              <div className="stat"><div className="stat-label">Students on record</div><div className="stat-value">{n(s.enrolled)}</div><div className="stat-note">{pct(s.enrolled, s.approved)} of {n(s.approved)} approved</div></div>
              <div className="stat"><div className="stat-label">Matched with APAAR</div><div className="stat-value">{pct(s.verified, s.enrolled, 1)}</div><div className="stat-note">{n(s.enrolled - s.verified)} not matched</div></div>
              <div className="stat"><div className="stat-label">On last year</div><div className="stat-value">{s.last_year ? `${s.enrolled >= s.last_year ? "+" : ""}${pct(s.enrolled - s.last_year, s.last_year)}` : "—"}</div><div className="stat-note">{n(s.last_year)} in 2025–26</div></div>
            </div>
            {sub.snapshot_hash && <div className="kv"><span>Snapshot</span><span className="mono" style={{ fontSize: 12 }}>{sub.snapshot_hash} · {n(sub.snapshot_count)} records</span></div>}
          </section>

          <section className="panel">
            <div className="panel-head">Programmes against approval</div>
            <Table cols="minmax(0,1.5fr) 56px minmax(150px,1.5fr) 50px 50px" head={<><span>Programme</span><span className="r">Intake</span><span>Admitted</span><span className="r hide-phone">TFW</span><span className="r hide-phone">FN</span></>}>
              {programmes.map((p: any) => (
                <Link key={p.id} to={`${base}?program=${encodeURIComponent(p.id)}`} className="t-row hoverable">
                  <span title={p.name}><div className="t-main">{shortProgramme(p.name)}</div><div className="t-sub">{p.level} · last year {n(p.last_year)}</div></span>
                  <span className="r t-num">{n(p.approved)}</span>
                  <span><SeatMeter approved={p.approved ?? 0} regular={p.regular} tfw={p.tfw} fn={p.fn} lateral={p.lateral} /><div className="t-sub" style={{ marginTop: 5 }}>{n(p.regular)} regular{p.excess ? <b style={{ color: "var(--bad)" }}> · {n(p.excess)} over</b> : ""}</div></span>
                  <span className="r t-num hide-phone" style={p.tfw > p.caps.tfw ? { color: "var(--bad)", fontWeight: 600 } : undefined}>{p.tfw}<span className="tertiary">/{p.caps.tfw}</span></span>
                  <span className="r t-num hide-phone" style={p.fn > p.caps.fn ? { color: "var(--bad)", fontWeight: 600 } : undefined}>{p.fn}<span className="tertiary">/{p.caps.fn}</span></span>
                </Link>
              ))}
            </Table>
            <div className="panel-body" style={{ paddingTop: 12, paddingBottom: 12 }}><SeatLegend q={q} /></div>
          </section>

          <section className="panel">
            <div className="panel-head">Open issues<span className="spacer" /><span>{plural(s.errors, "error")} · {plural(s.warnings, "unexplained warning")}</span></div>
            {issueCounts.length === 0 && <div className="notice ok"><Icon.CheckCircle /><div>Every record passes every check.</div></div>}
            <Table cols="minmax(0,1fr) auto">
              {issueCounts.map((c: any) => (
                <Link key={c.code} className="t-row hoverable" to={`${base}?issue=${c.code}&status=all`} style={{ minHeight: 46 }}>
                  <span className="t-main" style={{ fontWeight: 400 }}>{c.title}<span className="t-sub"> · {c.group}</span></span>
                  <span><Severity s={c.severity} label={c.open === c.count ? n(c.count) : `${n(c.open)} of ${n(c.count)} open`} /></span>
                </Link>
              ))}
            </Table>
          </section>
        </div>

        <div className="stack">
          <section className="panel">
            <div className="panel-body" style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ flex: 1 }}><div className="stat-label">Risk score</div><div className="stat-value" style={{ fontSize: 34 }}>{s.risk.score}<span className="tertiary" style={{ fontSize: 17 }}> / 100</span></div></div>
              <span className={`chip ${s.risk.level === "high" ? "bad" : s.risk.level === "medium" ? "warn" : "ok"}`}>{s.risk.level[0].toUpperCase() + s.risk.level.slice(1)} risk</span>
            </div>
            {s.risk.signals.length === 0 && <div className="signal"><span className="pts">0</span><span>Nothing unusual in this institution's records.</span></div>}
            {s.risk.signals.map((x: any) => <div key={x.code} className="signal"><span className="pts">+{x.points}</span><div><b>{x.label}</b><span>{x.detail}</span></div></div>)}
            <div className="notice info"><Icon.Info /><div style={{ fontSize: 13.5 }}>The score adds up plain signals, each explained above. It points to where to look, not a finding.</div></div>
          </section>
          <section className="panel">
            <div className="panel-head">Activity</div>
            {recent.map((r: any) => <div key={r.id} className="feed-item"><span className="when">{ago(r.at)}</span><span><b>{r.actor_name}</b> {action(r.action)}{r.detail?.note && <span className="where" style={{ whiteSpace: "normal" }}>“{r.detail.note}”</span>}</span></div>)}
          </section>
          <section className="panel">
            <div className="kv"><span>Contact</span><span>{inst.email}</span></div>
            <div className="kv"><span>University</span><span>{inst.university}</span></div>
          </section>
        </div>
      </div>
    </Page>
  );
}
