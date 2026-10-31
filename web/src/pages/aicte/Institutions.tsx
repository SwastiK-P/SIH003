import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApi } from "../../lib/api";
import { useLive } from "../../lib/session";
import { ago, n, pct, plural } from "../../lib/format";
import { Page } from "../../components/Shell";
import { Icon } from "../../components/Icons";
import { Empty, ErrorNote, Loading, MenuButton, MenuItem, Segmented, SubmissionState, Table } from "../../components/ui";
import { RiskMeter } from "../../components/Charts";

type Filter = "all" | "review" | "draft" | "high" | "excess";
const SORTS = { risk: "Risk, highest first", name: "Name", enrolled: "Students on record", errors: "Open errors", updated: "Last updated" } as const;

/** Every institution, with where its submission stands and how much to trust it. */
export function Institutions({ preset }: { preset?: "review" }) {
  const { data, error, reload } = useApi("/national/institutions");
  useLive((e) => { if (["records", "submission", "conflict"].includes(e.type)) reload(); });
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const filter = (preset ?? sp.get("filter") ?? "all") as Filter;
  const sort = (sp.get("sort") ?? (preset ? "updated" : "risk")) as keyof typeof SORTS;
  const [state, setState] = useState("");
  const set = (k: string, v: string) => { const s = new URLSearchParams(sp); v ? s.set(k, v) : s.delete(k); setSp(s, { replace: true }); };

  const states = useMemo(() => [...new Set((data ?? []).map((s: any) => s.state))].sort() as string[], [data]);
  const rows = useMemo(() => {
    if (!data) return [];
    let r = data.filter((s: any) =>
      (filter === "all" || (filter === "review" && s.submission.status === "submitted") || (filter === "draft" && ["draft", "returned"].includes(s.submission.status)) || (filter === "high" && s.risk.level === "high") || (filter === "excess" && s.excess > 0)) &&
      (!state || s.state === state) &&
      (!q || `${s.name} ${s.city} ${s.id}`.toLowerCase().includes(q.toLowerCase())));
    const by: Record<string, (a: any, b: any) => number> = {
      risk: (a, b) => b.risk.score - a.risk.score, name: (a, b) => a.name.localeCompare(b.name), enrolled: (a, b) => b.enrolled - a.enrolled,
      errors: (a, b) => b.errors - a.errors, updated: (a, b) => String(b.submission.submitted_at ?? b.updated_at).localeCompare(String(a.submission.submitted_at ?? a.updated_at)),
    };
    return [...r].sort(by[sort]);
  }, [data, filter, state, q, sort]);

  const count = (f: Filter) => (data ?? []).filter((s: any) => f === "all" || (f === "review" && s.submission.status === "submitted") || (f === "draft" && ["draft", "returned"].includes(s.submission.status)) || (f === "high" && s.risk.level === "high") || (f === "excess" && s.excess > 0)).length;

  return (
    <Page title={preset ? "Awaiting review" : "Institutions"} sub={preset ? "Submitted and waiting for a decision. Each one shows the checks AICTE's side ran." : data ? `${plural(data.length, "institution")} approved for 2026–27.` : " "}>
      <div className="toolbar">
        <label className="search glass"><Icon.Search size={17} /><input placeholder="Name, city or AICTE ID" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search institutions" /></label>
        {!preset && <Segmented label="Show" value={filter} onChange={(v) => set("filter", v === "all" ? "" : v)} options={[{ value: "all", label: "All", count: count("all") }, { value: "review", label: "To review", count: count("review") }, { value: "draft", label: "Not submitted", count: count("draft") }, { value: "high", label: "High risk", count: count("high") }, { value: "excess", label: "Over intake", count: count("excess") }]} />}
        <MenuButton label={<><Icon.Filter size={16} />{state || "All states"}</>}>
          {(close) => <><MenuItem on={!state} onClick={() => { setState(""); close(); }}>All states</MenuItem><div className="menu-sep" />{states.map((s) => <MenuItem key={s} on={state === s} onClick={() => { setState(s); close(); }}>{s}</MenuItem>)}</>}
        </MenuButton>
        <MenuButton label={<>{SORTS[sort]}<Icon.UpDown size={15} /></>} align="right">
          {(close) => Object.entries(SORTS).map(([k, l]) => <MenuItem key={k} on={sort === k} onClick={() => { set("sort", k); close(); }}>{l}</MenuItem>)}
        </MenuButton>
      </div>
      {error ? <ErrorNote text={error} retry={reload} /> : !data ? <Loading rows={10} /> : (
        <section className="panel">
          {!rows.length ? <Empty scene="search" title="No institutions match" text={preset ? "Nothing is waiting for review." : "Try another search or filter."} /> : (
            <Table cols="minmax(0,2fr) 120px minmax(110px,1fr) 70px 100px" head={<><span>Institution</span><span className="hide-phone">Submission</span><span className="hide-phone">Admitted / intake</span><span className="r hide-phone">Errors</span><span className="r">Risk</span></>}>
              {rows.map((s: any) => (
                <button key={s.id} className="t-row hoverable" onClick={() => nav(`/a/institutions/${s.id}`)}>
                  <span><div className="t-main">{s.name}</div><div className="t-sub">{s.city}, {s.state} · {s.type} · {s.id}</div></span>
                  <span className="hide-phone"><SubmissionState status={s.submission.status} /><div className="t-sub" style={{ marginTop: 2 }}>{s.submission.submitted_at ? ago(s.submission.submitted_at) : s.updated_at ? `edited ${ago(s.updated_at)}` : "—"}</div></span>
                  <span className="hide-phone">
                    <div className="meter"><span style={{ width: `${Math.min(100, (Math.min(s.regular, s.approved) / Math.max(s.approved, s.enrolled)) * 100)}%`, background: "var(--s-regular)" }} />{s.excess > 0 && <span className="over" style={{ width: `${(s.excess / Math.max(s.approved, s.enrolled)) * 100}%` }} />}</div>
                    <div className="t-sub" style={{ marginTop: 4 }}>{n(s.enrolled)} / {n(s.approved)} · {s.excess ? <b style={{ color: "var(--bad)" }}>{s.excess} over</b> : pct(s.enrolled, s.approved)}</div>
                  </span>
                  <span className={`r t-num hide-phone`} style={s.errors ? { color: "var(--bad)", fontWeight: 600 } : { color: "var(--secondary)" }}>{n(s.errors)}</span>
                  <span className="r"><RiskMeter score={s.risk.score} level={s.risk.level} /></span>
                </button>
              ))}
            </Table>
          )}
        </section>
      )}
    </Page>
  );
}
