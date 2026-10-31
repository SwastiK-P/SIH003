import { useApi } from "../../lib/api";
import { useLive, useSession } from "../../lib/session";
import { action, time } from "../../lib/format";
import { Page } from "../../components/Shell";
import { Empty, ErrorNote, Loading } from "../../components/ui";

/** Everything done to this institution's records, by whom. The same entries AICTE sees. */
export function Activity() {
  const { user } = useSession();
  const { data, error, reload } = useApi(`/institutions/${user!.institution_id}/audit`);
  useLive((e) => { if (e.type === "audit") reload(); });
  return (
    <Page title="Activity log" sub="Every upload, change and submission, from the tamper-evident audit trail AICTE keeps.">
      {error ? <ErrorNote text={error} retry={reload} /> : !data ? <Loading rows={8} /> : !data.length ? <section className="panel"><Empty title="Nothing yet" /></section> : (
        <section className="panel">
          {data.map((r: any) => <AuditRow key={r.id} r={r} />)}
        </section>
      )}
    </Page>
  );
}

export function AuditRow({ r, institution }: { r: any; institution?: string }) {
  const d = r.detail;
  const extra = d && [
    d.added != null && `${d.added} added, ${d.updated} updated${d.skipped ? `, ${d.skipped} skipped` : ""}${d.file ? ` · ${d.file}` : ""}`,
    d.changed?.length && `Changed ${d.changed.join(", ")}`,
    d.reason && `“${d.reason}”`,
    d.note && `“${d.note}”`,
    d.to && `${d.from} → ${d.to}`,
    d.records != null && `${d.records} records`,
    d.purpose && d.purpose,
    d.after && Object.entries(d.after).map(([k, v]) => `${k.replace(/_/g, " ")}: ${d.before?.[k]} → ${v}`).join(", "),
  ].filter(Boolean).join(" · ");
  return (
    <div className="feed-item">
      <span className="when" style={{ width: 128 }}>{time(r.at)}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <b>{r.actor_name}</b> {action(r.action)}{institution && <> · <span className="secondary">{institution}</span></>}
        {extra && <span className="where" style={{ whiteSpace: "normal" }}>{extra}</span>}
      </span>
      <span className="mono tertiary hide-phone" style={{ fontSize: 11.5, flex: "none" }} title={`Entry hash ${r.hash}`}>{r.hash?.slice(0, 8)}</span>
    </div>
  );
}
