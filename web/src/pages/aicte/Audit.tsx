import { useEffect, useState } from "react";
import { api, useApi } from "../../lib/api";
import { useLive } from "../../lib/session";
import { n, time } from "../../lib/format";
import { Page } from "../../components/Shell";
import { Icon } from "../../components/Icons";
import { ErrorNote, Loading, MenuButton, MenuItem } from "../../components/ui";
import { AuditRow } from "../inst/Activity";

const KINDS = [["", "Everything"], ["records", "Uploads"], ["record.", "Record changes"], ["submission", "Submissions"], ["consent", "Consent"], ["credential", "Verifiable records"], ["record.viewed", "Records viewed"], ["conflict", "Duplicates"], ["rules", "Rule changes"], ["report", "Exports"], ["lookup", "Look-ups"]] as const;

/**
 * The audit trail. Each entry's hash covers the one before it, so editing or deleting any past entry
 * breaks the chain from that point; "Check the chain" recomputes every hash.
 */
export function Audit() {
  const [q, setQ] = useState("");
  const [typed, setTyped] = useState("");
  const [kind, setKind] = useState("");
  const [rows, setRows] = useState<any[] | null>(null);
  const [more, setMore] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const chain = useApi("/national/audit/verify");
  useEffect(() => { const t = setTimeout(() => setQ(typed), 250); return () => clearTimeout(t); }, [typed]);
  const load = async (before?: number) => {
    try {
      const r = await api(`/national/audit?${new URLSearchParams({ q, action: kind, ...(before ? { before: String(before) } : {}) })}`);
      setRows((x) => (before ? [...(x ?? []), ...r] : r)); setMore(r.length === 60); setErr(null);
    } catch (e) { setErr((e as Error).message); }
  };
  useEffect(() => { setRows(null); load(); }, [q, kind]);
  useLive((e) => { if (e.type === "audit" && !q && !kind) load(); });
  const c = chain.data;
  return (
    <Page title="Audit trail" sub="Who did what, and when — uploads, edits, submissions, every time a student's record was viewed. Entries can't be changed without it showing.">
      <section className="panel" style={{ marginBottom: 14 }}>
        {c ? (
          <div className={`notice ${c.ok ? "ok" : "bad"}`}>{c.ok ? <Icon.Shield /> : <Icon.Error />}
            <div style={{ flex: 1 }}><b>{c.ok ? "Chain intact." : `Chain broken at entry ${c.brokenAt}.`}</b> {n(c.entries)} entries checked{c.ok && <>; latest hash <span className="mono" style={{ fontSize: 12.5 }}>{c.head.slice(0, 16)}…</span></>}.</div>
            <button className="btn small quiet" onClick={chain.reload} disabled={chain.loading}>{chain.loading ? <Icon.Spinner className="spin" size={15} /> : <Icon.Refresh size={15} />}Check the chain</button>
          </div>
        ) : <div className="panel-body"><div className="progress-sweep" /></div>}
      </section>
      <div className="toolbar">
        <label className="search glass"><Icon.Search size={17} /><input placeholder="Person, institution or ID" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Search audit trail" /></label>
        <MenuButton label={<><Icon.Filter size={16} />{KINDS.find((k) => k[0] === kind)?.[1]}</>}>
          {(close) => KINDS.map(([v, l]) => <MenuItem key={v} on={kind === v} onClick={() => { setKind(v); close(); }}>{l}</MenuItem>)}
        </MenuButton>
      </div>
      {err ? <ErrorNote text={err} retry={() => load()} /> : !rows ? <Loading rows={10} /> : (
        <section className="panel">
          {rows.length === 0 && <div className="t-empty">No entries match.</div>}
          {rows.map((r) => <AuditRow key={r.id} r={r} institution={r.institution} />)}
          {more && rows.length > 0 && <div className="panel-body" style={{ textAlign: "center" }}><button className="btn small quiet" onClick={() => load(rows.at(-1).id)}>Older entries</button></div>}
        </section>
      )}
      {rows?.length ? <p className="tertiary" style={{ fontSize: 12.5, marginTop: 10 }}>Oldest shown: {time(rows.at(-1).at)}</p> : null}
    </Page>
  );
}
