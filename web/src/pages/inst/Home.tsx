import { Link } from "react-router-dom";
import { useApi } from "../../lib/api";
import { useLive, useSession } from "../../lib/session";
import { action, ago, date, daysUntil, n, pct, plural } from "../../lib/format";
import { Page } from "../../components/Shell";
import { Icon } from "../../components/Icons";
import { ErrorNote, Loading, Severity, SubmissionState, Table } from "../../components/ui";
import { SeatLegend, SeatMeter } from "../../components/Charts";

/** Where this year's data stands, and the one thing to do next. */
export function InstHome() {
  const { user } = useSession();
  const { data, error, reload } = useApi(`/institutions/${user!.institution_id}`);
  useLive((e) => { if (["records", "submission", "conflict", "rules"].includes(e.type)) reload(); });
  if (error) return <Page title="Overview"><ErrorNote text={error} retry={reload} /></Page>;
  if (!data) return <Page title="Overview"><Loading /></Page>;
  const { institution: inst, summary: s, programmes, submission, rules, issueCounts, recent } = data;
  const errors = issueCounts.filter((c: any) => c.severity === "error").reduce((a: number, c: any) => a + c.count, 0);
  const warnings = issueCounts.filter((c: any) => c.severity === "warning").reduce((a: number, c: any) => a + c.open, 0);
  const left = daysUntil(rules.deadline);
  const st = submission.status;
  const sent = ["submitted", "accepted"].includes(st);
  const steps = [
    { label: "Upload records", done: s.enrolled > 0 },
    { label: "Fix errors", done: sent || (s.enrolled > 0 && errors === 0) },
    { label: "Explain warnings", done: sent || (s.enrolled > 0 && errors === 0 && warnings === 0) },
    { label: st === "accepted" ? "Accepted" : "Submit", done: sent },
  ];
  const now = steps.findIndex((x) => !x.done);
  const next = st === "accepted" ? null
    : st === "submitted" ? { text: "Waiting for AICTE to review", to: "/i/submit", label: "See submission" }
    : !s.enrolled ? { text: "Upload this year's admissions", to: "/i/upload", label: "Upload students" }
    : errors ? { text: `${plural(errors, "error")} to fix before you can submit`, to: "/i/issues", label: "Fix errors" }
    : warnings ? { text: `${plural(warnings, "warning")} to fix or explain`, to: "/i/issues", label: "Review warnings" }
    : { text: "Everything checks out", to: "/i/submit", label: "Submit to AICTE" };
  const q = programmes.reduce((a: any, p: any) => ({ regular: a.regular + Math.min(p.regular, p.approved ?? 0), tfw: a.tfw + p.tfw, fn: a.fn + p.fn, lateral: a.lateral + p.lateral, over: a.over + p.excess }), { regular: 0, tfw: 0, fn: 0, lateral: 0, over: 0 });

  return (
    <Page title={inst.name} sub={<>{inst.city}, {inst.state} · {inst.type} · AICTE ID <span className="num">{inst.id}</span> · Admissions {rules.academic_year}</>}>
      <div className="grid cols-main">
        <div className="stack">
          <section className="panel">
            {st === "returned" && <div className="notice bad"><Icon.Error /><div><b>AICTE returned your submission.</b> {submission.note}</div></div>}
            {sent && errors > 0 && <div className="notice warn"><Icon.Warning /><div><b>{plural(errors, "error")} found since you submitted</b> — usually a student also enrolled at an institution that submitted later. Correct them from <Link className="link-btn" to="/i/issues">Validation issues</Link>; each change is recorded as an amendment.</div></div>}
            <div className="panel-body" style={{ padding: "20px 22px 22px" }}>
              <div style={{ display: "flex", gap: 24, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 260px" }}>
                  <div className="stat-label">Students on record</div>
                  <div className="hero-num num" style={{ marginTop: 6 }}>{n(s.enrolled)}</div>
                  <div className="hero-sub">against {n(s.approved)} approved seats across {plural(programmes.length, "programme")}</div>
                </div>
                <div style={{ flex: "0 1 300px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}><SubmissionState status={st} /><span className="secondary" style={{ fontSize: 14 }}>
                    {st === "draft" || st === "returned" ? (left >= 0 ? `Due ${date(rules.deadline)}, ${left === 0 ? "today" : `in ${plural(left, "day")}`}` : `Deadline passed ${date(rules.deadline)}`) : `on ${date(submission.submitted_at)}`}
                  </span></div>
                  {next && <p style={{ marginTop: 10, fontSize: 15, fontWeight: 500 }}>{next.text}</p>}
                  {next && <Link to={next.to} className="btn primary" style={{ marginTop: 12 }}>{next.label}<Icon.Next size={16} /></Link>}
                </div>
              </div>
              <div className="progress-steps">
                {steps.map((x, i) => <div key={x.label} className={x.done ? "done" : i === now ? "now" : ""}><b>{x.label}</b>{x.done ? "Done" : i === now ? "Now" : "Next"}</div>)}
              </div>
            </div>
            <div className="stats">
              <div className="stat"><div className="stat-label">Matched with APAAR</div><div className="stat-value">{pct(s.verified, s.enrolled, 1)}</div><div className="stat-note">{n(s.verified)} of {n(s.enrolled)}</div></div>
              <div className="stat"><div className="stat-label">Over intake</div><div className={`stat-value${s.excess ? " bad" : ""}`}>{n(s.excess)}</div><div className="stat-note">{s.excess ? "regular admissions" : "within approval"}</div></div>
              <div className="stat"><div className="stat-label">NRI · OCI · FN</div><div className="stat-value">{n(s.nri)} · {n(s.oci)} · {n(s.foreign)}</div><div className="stat-note">{n(s.fn_quota)} supernumerary seats</div></div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">Programmes<span className="spacer" /><span>Regular seats against approved intake; supernumerary beside</span></div>
            <Table cols="minmax(0,2.2fr) 70px minmax(120px,1.4fr) 64px 64px" head={<><span>Programme</span><span className="r">Intake</span><span>Admitted</span><span className="r hide-phone">TFW</span><span className="r hide-phone">FN</span></>}>
              {programmes.map((p: any) => (
                <Link key={p.id} to={`/i/students?program=${encodeURIComponent(p.id)}`} className="t-row hoverable">
                  <span><div className="t-main">{p.name}</div><div className="t-sub">{p.level} · {p.duration} years</div></span>
                  <span className="r t-num">{n(p.approved)}</span>
                  <span>
                    <SeatMeter approved={p.approved ?? 0} regular={p.regular} tfw={p.tfw} fn={p.fn} lateral={p.lateral} />
                    <div className="t-sub" style={{ marginTop: 5 }}>{n(p.regular)} regular{p.excess ? <b style={{ color: "var(--bad)", fontWeight: 600 }}> · {n(p.excess)} over</b> : ` · ${n((p.approved ?? 0) - p.regular)} free`}</div>
                  </span>
                  <span className={`r t-num hide-phone${p.tfw > p.caps.tfw ? " bad-text" : ""}`} style={p.tfw > p.caps.tfw ? { color: "var(--bad)", fontWeight: 600 } : undefined}>{p.tfw}<span className="tertiary">/{p.caps.tfw}</span></span>
                  <span className="r t-num hide-phone" style={p.fn > p.caps.fn ? { color: "var(--bad)", fontWeight: 600 } : undefined}>{p.fn}<span className="tertiary">/{p.caps.fn}</span></span>
                </Link>
              ))}
            </Table>
            <div className="panel-body" style={{ paddingTop: 12, paddingBottom: 12 }}><SeatLegend q={q} /></div>
          </section>
        </div>

        <div className="stack">
          <section className="panel">
            <div className="panel-head">Checks<span className="spacer" /><Link to="/i/issues">All issues</Link></div>
            {issueCounts.length === 0 && <div className="notice ok"><Icon.CheckCircle /><div><b>No issues.</b> Every record passes every check.</div></div>}
            {issueCounts.slice(0, 7).map((c: any) => (
              <Link key={c.code} to={`/i/issues#${c.code}`} className="kv" style={{ alignItems: "center" }}>
                <span style={{ width: "auto", maxWidth: "none", flex: 1, color: "var(--label)" }}>{c.title}</span>
                <span style={{ flex: "none" }}><Severity s={c.severity} label={n(c.open)} /></span>
              </Link>
            ))}
          </section>
          <section className="panel">
            <div className="panel-head">Recent activity<span className="spacer" /><Link to="/i/activity">All</Link></div>
            {recent.map((r: any) => (
              <div key={r.id} className="feed-item"><span className="when">{ago(r.at)}</span><span><b>{r.actor_name}</b> {action(r.action)}{r.detail?.added != null && <span className="where">{n(r.detail.added)} added · {n(r.detail.updated)} updated{r.detail.file ? ` · ${r.detail.file}` : ""}</span>}</span></div>
            ))}
          </section>
        </div>
      </div>
    </Page>
  );
}
