import { useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApi } from "../../lib/api";
import { useLive } from "../../lib/session";
import { action, ago, date, daysUntil, n, pct, plural } from "../../lib/format";
import { Page } from "../../components/Shell";
import { Icon } from "../../components/Icons";
import { ErrorNote, Loading, SubmissionState, Table } from "../../components/ui";
import { Bars, Bullets, Columns, RiskMeter, SEATS, Stack } from "../../components/Charts";

/** The country at a glance: who has reported, what doesn't add up, and where to look first. */
export function Overview() {
  const { data, error, reload } = useApi("/national/overview");
  const fresh = useRef(new Set<number>());
  const nav = useNavigate();
  useLive((e) => { if (["records", "submission", "conflict", "rules", "audit"].includes(e.type)) reload(); });
  if (error) return <Page title="National overview"><ErrorNote text={error} retry={reload} /></Page>;
  if (!data) return <Page title="National overview"><Loading rows={6} /></Page>;
  const { kpis: k, quotas: q, timeline, byState, mix, attention, activity, rules } = data;
  const left = daysUntil(rules.deadline);
  const latest = activity[0]?.id;
  if (latest && !fresh.current.has(latest)) fresh.current.add(latest);

  return (
    <Page title="National overview" sub={<>Admissions <b>{rules.academic_year}</b> across {plural(k.institutions, "institution")} · submissions due {date(rules.deadline)}{left >= 0 ? `, ${left === 0 ? "today" : `in ${plural(left, "day")}`}` : ""}</>}
      actions={<Link to="/a/reports" className="btn glass"><Icon.Download size={16} />Reports</Link>}>
      <div className="grid cols-main">
        <div className="stack">
          <section className="panel">
            <div className="panel-body" style={{ padding: "20px 22px" }}>
              <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ flex: "1 1 240px" }}>
                  <div className="stat-label">Students on record</div>
                  <div className="hero-num num" style={{ marginTop: 6 }}>{n(k.students)}</div>
                  <div className="hero-sub">{pct(k.students, k.approved)} of {n(k.approved)} approved seats · {pct(k.verified, k.students, 1)} matched with APAAR</div>
                </div>
                <div style={{ flex: "1 1 240px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginBottom: 8 }}><span className="secondary">Institutions reported</span><span className="num"><b>{k.submitted}</b> of {k.institutions}</span></div>
                  <div className="meter big"><span style={{ width: `${(k.accepted / k.institutions) * 100}%`, background: "var(--green)" }} /><span style={{ width: `${((k.submitted - k.accepted) / k.institutions) * 100}%`, background: "var(--accent)" }} /></div>
                  <div className="legend" style={{ marginTop: 10 }}>
                    <span style={{ ["--c" as any]: "var(--green)" }}><i />Accepted <b>{k.accepted}</b></span>
                    <span style={{ ["--c" as any]: "var(--accent)" }}><i />To review <b>{k.submitted - k.accepted}</b></span>
                    <span style={{ ["--c" as any]: "var(--track)" }}><i />Not yet <b>{k.institutions - k.submitted}</b></span>
                  </div>
                </div>
              </div>
            </div>
            <div className="stats">
              <Link to="/a/institutions?filter=excess" className="stat"><div className="stat-label">Admitted over intake</div><div className={`stat-value${k.excess ? " bad" : ""}`}>{n(k.excess)}</div><div className="stat-note">at {plural(k.excessInstitutions, "institution")}</div></Link>
              <Link to="/a/duplicates" className="stat"><div className="stat-label">Enrolled twice</div><div className={`stat-value${k.conflicts ? " bad" : ""}`}>{n(k.conflicts)}</div><div className="stat-note">APAAR IDs at two institutions</div></Link>
              <Link to="/a/institutions?filter=high" className="stat"><div className="stat-label">High risk</div><div className="stat-value">{n(k.highRisk)}</div><div className="stat-note">institutions to look at</div></Link>
              <div className="stat"><div className="stat-label">On last year</div><div className="stat-value">{k.lastYear ? `${k.students >= k.lastYear ? "+" : ""}${pct(k.students - k.lastYear, k.lastYear)}` : "—"}</div><div className="stat-note">{n(k.lastYear)} admitted in 2025–26</div></div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">Records added per day<span className="spacer" /><span>last 5 weeks</span></div>
            <div className="panel-body"><Columns label="Records added per day" data={timeline.map((t: any) => ({ x: t.day, y: t.added, label: date(t.day, false) }))} /></div>
          </section>

          <section className="panel">
            <div className="panel-head">Admitted against approved intake, by state</div>
            <div className="panel-body"><Bullets rows={byState.map((s: any) => ({ key: s.state, label: s.state, approved: s.approved, enrolled: s.enrolled }))} /></div>
          </section>

          <div className="grid cols-2">
            <section className="panel">
              <div className="panel-head">Seat types</div>
              <div className="panel-body"><Stack parts={SEATS.map((s) => ({ key: s.key, label: s.label, value: (q as any)[s.key], color: s.color }))} /></div>
              <div className="stats">
                <div className="stat"><div className="stat-label">NRI</div><div className="stat-value">{n(q.nri)}</div></div>
                <div className="stat"><div className="stat-label">OCI</div><div className="stat-value">{n(q.oci)}</div></div>
                <div className="stat"><div className="stat-label">Foreign</div><div className="stat-value">{n(q.foreign)}</div></div>
              </div>
            </section>
            <section className="panel">
              <div className="panel-head">What the checks find</div>
              <div className="panel-body"><Bars rows={mix.slice(0, 9).map((m: any) => ({ key: m.code, label: m.title, value: m.count, tone: m.severity === "error" ? undefined : "warn", note: `${m.institutions} institutions` }))} /></div>
            </section>
          </div>
        </div>

        <div className="stack">
          <section className="panel">
            <div className="panel-head">Look at these first<span className="spacer" /><Link to="/a/institutions?sort=risk">All</Link></div>
            <Table cols="minmax(0,1fr) auto">
              {attention.map((s: any) => (
                <button key={s.id} className="t-row hoverable" onClick={() => nav(`/a/institutions/${s.id}`)} style={{ alignItems: "start" }}>
                  <span>
                    <div className="t-main">{s.name}</div>
                    <div className="t-sub" style={{ whiteSpace: "normal" }}>{s.risk.signals.slice(0, 2).map((x: any) => x.label).join(" · ")}</div>
                    <div style={{ marginTop: 6 }}><SubmissionState status={s.submission.status} /></div>
                  </span>
                  <span style={{ paddingTop: 2 }}><RiskMeter score={s.risk.score} level={s.risk.level} /></span>
                </button>
              ))}
            </Table>
          </section>
          <section className="panel">
            <div className="panel-head">Happening now</div>
            {activity.map((a: any) => (
              <div key={a.id} className={`feed-item${a.id === latest && fresh.current.size > 1 ? " fresh" : ""}`}>
                <span className="when">{ago(a.at)}</span>
                <span style={{ minWidth: 0 }}><b>{a.actor_name}</b> {action(a.action)}
                  {a.institution && <span className="where">{a.institution}</span>}
                  {a.detail?.added != null && <span className="where">{n(a.detail.added)} added, {n(a.detail.updated)} updated</span>}
                </span>
              </div>
            ))}
          </section>
        </div>
      </div>
    </Page>
  );
}
