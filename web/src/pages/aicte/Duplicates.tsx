import { useState } from "react";
import { Link } from "react-router-dom";
import { api, useApi } from "../../lib/api";
import { useLive } from "../../lib/session";
import { date, plural, shortProgramme } from "../../lib/format";
import { Page } from "../../components/Shell";
import { Icon } from "../../components/Icons";
import { Empty, ErrorNote, Loading, Segmented, useUi } from "../../components/ui";

/** The same APAAR ID active at two institutions: both sides together, and a decision. */
export function Duplicates() {
  const ui = useUi();
  const { data, error, reload } = useApi("/national/conflicts");
  useLive((e) => { if (["records", "conflict"].includes(e.type)) reload(); });
  const [tab, setTab] = useState<"open" | "resolved">("open");

  const decide = async (c: any, status: "resolved" | "notified" | "open") => {
    const note = status === "open" ? "" : await ui.prompt({
      title: status === "resolved" ? "Mark as resolved" : "Ask both institutions to resolve",
      message: status === "resolved" ? "Use this when it isn't a real duplicate — say why. It stops being flagged." : "Both institutions see the conflict flagged on the student's record with your note.",
      confirm: status === "resolved" ? "Resolve" : "Send", field: { label: "Note", required: true, multiline: true, placeholder: status === "resolved" ? "e.g. Dual-degree arrangement approved by both universities" : "e.g. Confirm which institution the student attends and withdraw the other record" },
    });
    if (note === null) return;
    try { await api(`/national/conflicts/${c.apaar_id}`, { body: { status, note } }); ui.toast(status === "resolved" ? "Resolved" : status === "open" ? "Reopened" : "Both institutions notified"); reload(); } catch (e) { ui.toast((e as Error).message, { kind: "error" }); }
  };

  const list = tab === "open" ? data?.open : data?.resolved;
  return (
    <Page title="Duplicate enrolment" sub="APAAR IDs active at more than one institution this cycle. Usually one record should have been withdrawn after the student moved; sometimes it's a mistyped ID."
      actions={data && <Segmented label="Show" value={tab} onChange={setTab} options={[{ value: "open", label: "Open", count: data.open.length }, { value: "resolved", label: "Resolved", count: data.resolved.length }]} />}>
      {error ? <ErrorNote text={error} retry={reload} /> : !data ? <Loading rows={6} /> : !list.length ? (
        <section className="panel"><Empty scene="clear" title={tab === "open" ? "No duplicate enrolment" : "Nothing resolved yet"} text={tab === "open" ? "Every active APAAR ID belongs to one institution." : undefined} /></section>
      ) : (
        <div className="stack">
          {list.map((c: any) => {
            const first = c.records[0];
            const sameName = c.records.every((r: any) => r.name === first.name);
            return (
              <section key={c.apaar_id} className="panel">
                <div className="panel-body" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 260px" }}>
                    <div className="panel-title"><span className="num">{c.display}</span> · {sameName ? first.name : plural(c.records.length, "different name")}</div>
                    <div className="panel-sub">{plural(new Set(c.records.map((r: any) => r.institution_id)).size, "institution")}{sameName ? ` · born ${date(first.dob)}` : " · names differ, so the ID may be mistyped at one of them"}</div>
                  </div>
                  {tab === "open" ? <>
                    {c.note?.status === "notified" && <span className="chip accent">Institutions notified {date(c.note.at)}</span>}
                    <button className="btn small quiet" onClick={() => decide(c, "notified")}>Ask both to resolve</button>
                    <button className="btn small quiet" onClick={() => decide(c, "resolved")}>Not a duplicate</button>
                  </> : <button className="btn small quiet" onClick={() => decide(c, "open")}>Reopen</button>}
                </div>
                <div className="compare" style={{ gridTemplateColumns: `repeat(${Math.min(3, c.records.length)}, 1fr)` }}>
                  {c.records.map((r: any) => (
                    <Link key={r.id} to={`/a/institutions/${r.institution_id}/students/${r.id}`} className="dup-side">
                      <div className="k">{r.city}, {r.state}</div>
                      <div className="v">{r.institution}</div>
                      <div className="t-sub" style={{ whiteSpace: "normal", marginTop: 4 }}>{r.name} · {shortProgramme(r.programme)}</div>
                      <div className="t-sub">Admitted {date(r.admission_date)} · added {date(r.created_at)}{r.status !== "active" ? ` · ${r.status}` : ""}</div>
                    </Link>
                  ))}
                </div>
                {c.note?.note && <div className="notice info"><Icon.Info /><div style={{ fontSize: 13.5 }}><b>{c.note.by_name}:</b> {c.note.note}</div></div>}
              </section>
            );
          })}
        </div>
      )}
    </Page>
  );
}
