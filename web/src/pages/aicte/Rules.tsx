import { useEffect, useState } from "react";
import { api, useApi } from "../../lib/api";
import { date } from "../../lib/format";
import { Page } from "../../components/Shell";
import { Icon } from "../../components/Icons";
import { ErrorNote, Field, Loading, Table, useUi } from "../../components/ui";

const ROWS = [
  ["tfw_cap_pct", "Tuition Fee Waiver seats", "% of approved intake", "Supernumerary TFW seats allowed per programme."],
  ["fn_cap_pct", "FN / OCI / PIO / CIWG seats", "% of approved intake", "Supernumerary seats for foreign nationals, OCI, PIO and children of Indian workers in the Gulf."],
  ["lateral_cap_pct", "Lateral entry", "% of approved intake", "Diploma holders admitted to the second year."],
  ["min_age", "Youngest at admission", "years", "Younger than this is flagged for a date-of-birth check."],
  ["max_age", "Oldest at admission", "years", "Older than this is flagged for a date-of-birth check."],
] as const;

/** The numbers the checks use. Changing one re-runs every check in the country at once. */
export function Rules() {
  const ui = useUi();
  const { data, error, reload } = useApi("/national/rules");
  const meta = useApi("/meta");
  const [form, setForm] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setForm(data); }, [data]);
  const dirty = form && data && Object.keys(form).some((k) => String(form[k]) !== String(data[k]));
  const save = async () => {
    if (!(await ui.confirm({ title: "Apply these rules?", message: "Every institution's checks run again straight away. The change is logged.", confirm: "Apply" }))) return;
    setBusy(true);
    try { await api("/national/rules", { method: "PUT", body: form }); ui.toast("Rules applied. Checks re-run."); reload(); } catch (e) { ui.toast((e as Error).message, { kind: "error" }); } finally { setBusy(false); }
  };
  if (error) return <Page title="Validation rules"><ErrorNote text={error} retry={reload} /></Page>;
  if (!form) return <Page title="Validation rules"><Loading /></Page>;
  return (
    <Page title="Validation rules" sub={<>The limits used for admissions <b>{form.academic_year}</b>. Set them from the approval handbook for the year.</>}
      actions={dirty && <><button className="btn glass" onClick={() => setForm(data)}>Discard</button><button className="btn primary" disabled={busy} onClick={save}>Apply</button></>}>
      <div className="grid cols-main">
        <div className="stack">
          <section className="panel">
            <div className="panel-head">Caps and limits</div>
            {ROWS.map(([k, label, unit, help]) => (
              <div key={k} className="kv" style={{ alignItems: "center" }}>
                <span style={{ width: "auto", maxWidth: "none", flex: 1 }}><span style={{ color: "var(--label)", display: "block", fontWeight: 500 }}>{label}</span><span style={{ fontSize: 13 }}>{help}</span></span>
                <span style={{ flex: "none", width: 150 }}><div className="field-box" style={{ height: 38 }}><input type="number" min={0} max={k.includes("age") ? 80 : 50} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} style={{ textAlign: "right" }} aria-label={label} /><span className="affix">{unit.startsWith("%") ? "%" : "yrs"}</span></div></span>
              </div>
            ))}
          </section>
          <section className="panel">
            <div className="panel-body">
              <Field label="Submission deadline" hint={`Institutions see a countdown to ${date(form.deadline)}.`}><input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></Field>
            </div>
          </section>
        </div>
        <section className="panel" style={{ alignSelf: "start" }}>
          <div className="panel-head">Every check</div>
          {meta.data && <Table cols="minmax(0,1fr) auto">
            {Object.entries(meta.data.catalogue).map(([code, c]: any) => (
              <div key={code} className="t-row" style={{ minHeight: 42 }}><span className="t-main" style={{ fontWeight: 400, whiteSpace: "normal", fontSize: 14 }}>{c.title}</span><span className={`chip small ${c.severity === "error" ? "bad" : "warn"}`}><span className="dot" />{c.severity === "error" ? "Error" : "Warning"}</span></div>
            ))}
          </Table>}
          <div className="notice info"><Icon.Info /><div style={{ fontSize: 13.5 }}>Errors block submission until fixed. Warnings can be explained by the institution, and AICTE sees the explanation.</div></div>
        </section>
      </div>
    </Page>
  );
}
