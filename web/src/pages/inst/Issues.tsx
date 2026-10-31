import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api, useApi } from "../../lib/api";
import { useLive, useSession } from "../../lib/session";
import { n, plural } from "../../lib/format";
import { Page } from "../../components/Shell";
import { Icon } from "../../components/Icons";
import { Empty, ErrorNote, Loading, Segmented, useUi } from "../../components/ui";

const GROUPS = ["Intake", "APAAR", "Duplicates", "Status", "Record", "Patterns"];

/** Every open issue, grouped by check, each with what to do about it. */
export function Issues({ institutionId, readOnly }: { institutionId?: string; readOnly?: boolean }) {
  const { user } = useSession();
  const id = institutionId ?? user!.institution_id!;
  const ui = useUi();
  const { data, error, reload } = useApi(`/institutions/${id}/issues`);
  useLive((e) => { if (["records", "conflict", "rules"].includes(e.type)) reload(); });
  const [sev, setSev] = useState<"all" | "error" | "warning">("all");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const loc = useLocation();
  useEffect(() => { if (data && loc.hash) document.getElementById(loc.hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [data, loc.hash]);

  const explain = async (i: any) => {
    const note = await ui.prompt({
      title: i.note ? "Edit explanation" : "Explain this warning", message: "AICTE sees your explanation next to the warning. Errors can't be explained, only fixed.",
      confirm: "Save", field: { label: "Explanation", value: i.note?.note ?? "", placeholder: "e.g. Twins, admitted on the same day — separate APAAR IDs checked", multiline: true },
    });
    if (note === null) return;
    try { await api(`/institutions/${id}/issues/note`, { body: { key: i.key, note } }); ui.toast(note.trim() ? "Explanation saved" : "Explanation removed"); reload(); } catch (e) { ui.toast((e as Error).message, { kind: "error" }); }
  };

  const base = readOnly ? `/a/institutions/${id}/students` : "/i/students";
  const body = () => {
    if (error) return <ErrorNote text={error} retry={reload} />;
    if (!data) return <Loading rows={6} />;
    const issues = data.issues.filter((i: any) => sev === "all" || i.severity === sev);
    if (!data.issues.length) return <section className="panel"><Empty scene="clear" title="No issues" text="Every record passes every check. When you're ready, submit the year's data to AICTE." action={!readOnly && <Link to="/i/submit" className="btn primary">Submit to AICTE</Link>} /></section>;
    const byCode = new Map<string, any[]>();
    for (const i of issues) { const a = byCode.get(i.code) ?? []; a.push(i); byCode.set(i.code, a); }
    return GROUPS.map((g) => {
      const codes = [...byCode.keys()].filter((c) => data.catalogue[c].group === g);
      if (!codes.length) return null;
      return (
        <div key={g} className="issue-group">
          <div className="section-title">{g === "Intake" ? "Intake and seats" : g === "APAAR" ? "APAAR registry" : g === "Status" ? "NRI, OCI and foreign nationals" : g === "Record" ? "Record details" : g}</div>
          <div className="stack">
            {codes.map((code) => {
              const list = byCode.get(code)!;
              const c = data.catalogue[code];
              const all = open[code];
              const shown = all ? list : list.slice(0, 6);
              return (
                <section key={code} className="panel" id={code} style={{ scrollMarginTop: 80 }}>
                  <div className="issue-head">
                    <span className={`mark ${c.severity}`}>{c.severity === "error" ? <Icon.Error size={17} /> : <Icon.Warning size={17} />}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="panel-title">{c.title} <span className="secondary num" style={{ fontWeight: 500 }}>· {n(list.length)}</span></div>
                      <div className="issue-fix">{c.fix}</div>
                    </div>
                    {list[0].scope === "student" && <Link className="btn small quiet hide-phone" to={`${base}?issue=${code}&status=all`}>See students</Link>}
                  </div>
                  {shown.map((i: any) => (
                    <div key={i.key} className="issue-row">
                      <span className="detail">{i.detail}{i.note && <span className="note">{i.note.note} — {i.note.by_name}</span>}</span>
                      {i.scope === "student" && i.student_ids.length === 1 && <Link className="btn small quiet" to={`${base}/${i.student_ids[0]}`}>Open</Link>}
                      {i.scope === "student" && i.student_ids.length > 1 && <Link className="btn small quiet" to={`${base}/${i.student_ids[0]}`}>Open first</Link>}
                      {i.scope === "program" && <Link className="btn small quiet" to={`${base}?program=${encodeURIComponent(i.program_id)}`}>Programme</Link>}
                      {!readOnly && i.severity === "warning" && <button className="btn small quiet" onClick={() => explain(i)}>{i.note ? "Edit note" : "Explain"}</button>}
                    </div>
                  ))}
                  {list.length > 6 && <div className="issue-more"><button className="link-btn" onClick={() => setOpen({ ...open, [code]: !all })}>{all ? "Show fewer" : `Show all ${n(list.length)}`}</button></div>}
                </section>
              );
            })}
          </div>
        </div>
      );
    });
  };

  const errors = data?.issues.filter((i: any) => i.severity === "error").length ?? 0;
  const warnings = data?.issues.filter((i: any) => i.severity === "warning").length ?? 0;
  const explained = data?.issues.filter((i: any) => i.note).length ?? 0;
  return (
    <Page title="Validation issues" sub={data ? (data.issues.length ? <>{plural(errors, "error")} to fix and {plural(warnings - explained, "warning")} to fix or explain{explained ? `, ${n(explained)} explained` : ""}. Checks run again on every change.</> : "Nothing to fix.") : " "}
      actions={data?.issues.length > 0 && <Segmented label="Severity" value={sev} onChange={setSev} options={[{ value: "all", label: "All", count: data.issues.length }, { value: "error", label: "Errors", count: errors }, { value: "warning", label: "Warnings", count: warnings }]} />}>
      {body()}
    </Page>
  );
}
