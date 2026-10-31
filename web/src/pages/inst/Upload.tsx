import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Papa from "papaparse";
import { api, download, saveBlob, token, useApi } from "../../lib/api";
import { useSession } from "../../lib/session";
import { apaar, n, pct, plural } from "../../lib/format";
import { Page } from "../../components/Shell";
import { Icon } from "../../components/Icons";
import { Scene } from "../../components/Drawings";
import { Segmented, Severity, Table, useUi } from "../../components/ui";
import { SeatMeter } from "../../components/Charts";

interface FieldSpec { key: string; label: string; required?: boolean; hint?: string; aliases: string[] }
type Parsed = { name: string; headers: string[]; rows: Record<string, string>[] };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Match the file's own headers to our fields: exact label, then any known alias. */
function autoMap(headers: string[], fields: FieldSpec[]) {
  const map: Record<string, string> = {};
  for (const f of fields) {
    const want = [f.label, f.key, ...f.aliases].map(norm);
    const h = headers.find((x) => want.includes(norm(x)));
    if (h) map[f.key] = h;
  }
  return map;
}

/**
 * Upload: choose a file, check its columns, see every row checked against APAAR and the approved intake
 * before anything is saved, then import.
 */
export function Upload() {
  const { user } = useSession();
  const id = user!.institution_id!;
  const ui = useUi();
  const nav = useNavigate();
  const meta = useApi("/meta");
  const inst = useApi(`/institutions/${id}`);
  const [file, setFile] = useState<Parsed | null>(null);
  const [map, setMap] = useState<Record<string, string>>({});
  const [step, setStep] = useState<"choose" | "map" | "check" | "done">("choose");
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"error" | "warning" | "clean" | "all">("error");
  const [shown, setShown] = useState(100);
  const [over, setOver] = useState(false);
  const [result, setResult] = useState<any>(null);
  const input = useRef<HTMLInputElement>(null);
  const fields: FieldSpec[] = meta.data?.fields ?? [];
  const locked = inst.data?.locked;

  const read = (f: File) => {
    if (!/\.(csv|txt)$/i.test(f.name)) { ui.toast("Save the sheet as CSV first (File → Save as → CSV)", { kind: "error" }); return; }
    Papa.parse<Record<string, string>>(f, {
      header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim(),
      complete: (r) => {
        const headers = (r.meta.fields ?? []).filter(Boolean);
        if (!r.data.length) { ui.toast("The file has no rows", { kind: "error" }); return; }
        setFile({ name: f.name, headers, rows: r.data });
        const m = autoMap(headers, fields);
        setMap(m);
        const missing = fields.filter((x) => x.required && !m[x.key]);
        if (missing.length) setStep("map"); else check({ name: f.name, headers, rows: r.data }, m);
      },
      error: () => ui.toast("Couldn't read the file", { kind: "error" }),
    });
  };

  const rowsFor = (f: Parsed, m: Record<string, string>) => f.rows.map((r) => Object.fromEntries(Object.entries(m).filter(([, h]) => h).map(([k, h]) => [k, r[h]])));

  const check = async (f = file!, m = map) => {
    setBusy(true); setStep("check");
    try {
      const p = await api(`/institutions/${id}/preview`, { body: { rows: rowsFor(f, m) } });
      setPreview(p);
      const errs = p.rows.filter((r: any) => r.issues.some((i: any) => i.severity === "error")).length;
      setFilter(errs ? "error" : "all");
    } catch (e) { ui.toast((e as Error).message, { kind: "error" }); setStep("choose"); }
    finally { setBusy(false); }
  };

  const sample = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/institutions/${id}/sample.csv`, { headers: { Authorization: `Bearer ${token.get()}` } });
      const text = await res.text();
      read(new File([text], "admissions-2026-sample.csv", { type: "text/csv" }));
    } finally { setBusy(false); }
  };

  const counts = useMemo(() => {
    if (!preview) return null;
    const c = { all: preview.rows.length, error: 0, warning: 0, clean: 0, add: 0, update: 0 };
    for (const r of preview.rows) {
      const e = r.issues.some((i: any) => i.severity === "error"), w = r.issues.some((i: any) => i.severity === "warning");
      if (e) c.error++; else if (w) c.warning++; else c.clean++;
      if (r.action === "add") c.add++; else c.update++;
    }
    return c;
  }, [preview]);

  const visible = useMemo(() => {
    if (!preview) return [];
    return preview.rows.filter((r: any) => {
      const e = r.issues.some((i: any) => i.severity === "error"), w = r.issues.some((i: any) => i.severity === "warning");
      return filter === "all" || (filter === "error" ? e : filter === "warning" ? !e && w : !e && !w);
    });
  }, [preview, filter]);

  const doImport = async (skipErrors: boolean) => {
    const ok = await ui.confirm({
      title: skipErrors ? `Import ${plural(counts!.all - counts!.error, "row")}?` : `Import all ${plural(counts!.all, "row")}?`,
      message: skipErrors ? `${plural(counts!.error, "row")} with errors stay out. Fix them in the file and upload again.` : "Rows with errors are saved as they are; you'll need to fix them here before submitting.",
      confirm: "Import",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api(`/institutions/${id}/import`, { body: { rows: rowsFor(file!, map), skipErrors, fileName: file!.name } });
      setResult(r); setStep("done");
    } catch (e) { ui.toast((e as Error).message, { kind: "error" }); }
    finally { setBusy(false); }
  };

  const errorReport = () => {
    const issuesBy = new Map(preview.rows.map((r: any) => [r.row, r.issues]));
    const csv = Papa.unparse({
      fields: ["Row", ...file!.headers, "Problems"],
      data: file!.rows.map((r, i) => [i + 1, ...file!.headers.map((h) => r[h]), ((issuesBy.get(i + 1) as any[]) ?? []).map((x) => `${x.severity === "error" ? "Error" : "Warning"}: ${x.title} — ${x.detail}`).join(" | ")]).filter((r) => r.at(-1)),
    });
    saveBlob(new Blob(["﻿" + csv], { type: "text/csv" }), file!.name.replace(/\.csv$/i, "") + "-problems.csv");
  };

  const reset = () => { setFile(null); setPreview(null); setResult(null); setStep("choose"); setShown(100); };

  if (locked) return (
    <Page title="Upload records">
      <section className="panel"><div className="notice info"><Icon.Lock /><div><b>This year's data has been submitted.</b> Uploads are closed. You can still correct a single record from <Link className="link-btn" to="/i/students">Students</Link>, with a reason; each change is recorded as an amendment.</div></div></section>
    </Page>
  );

  return (
    <Page title="Upload records" sub={<>Admissions for <b>{inst.data?.rules.academic_year}</b>. Every row is checked against the APAAR registry and your approved intake before anything is saved. Rows with an APAAR ID already on record update it.</>}
      actions={step !== "choose" && step !== "done" && <button className="btn glass" onClick={reset}>Choose another file</button>}>

      {step === "choose" && (
        <>
          <div className={`drop${over ? " over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) read(f); }}>
            <Scene name="upload" />
            <div className="drop-title">Drop a CSV file here</div>
            <div className="drop-text">One row per student. Your own column names are fine — they're matched to ours, and you can adjust the match.</div>
            <div className="drop-actions">
              <button className="btn primary" onClick={() => input.current?.click()} disabled={!fields.length}>Choose file</button>
              <button className="btn quiet" onClick={() => download(`/institutions/${id}/template.csv`, "template.csv")}><Icon.Download size={16} />Template</button>
              <button className="btn quiet" onClick={sample} disabled={busy || !fields.length}>Try a sample file</button>
            </div>
            <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) read(f); e.target.value = ""; }} />
          </div>
          <div className="section-title">What each row needs</div>
          <section className="panel">
            <Table cols="minmax(0,1fr) minmax(0,1.4fr) 90px" head={<><span>Column</span><span>Format</span><span className="r">Needed</span></>}>
              {fields.map((f) => <div key={f.key} className="t-row" style={{ minHeight: 44 }}><span className="t-main">{f.label}</span><span className="t-sub" style={{ fontSize: 13.5 }}>{f.hint ?? "Text"}</span><span className="r">{f.required ? <span className="chip small">Required</span> : <span className="tertiary" style={{ fontSize: 13 }}>Optional</span>}</span></div>)}
            </Table>
          </section>
        </>
      )}

      {step === "map" && file && (
        <section className="panel">
          <div className="notice warn"><Icon.Warning /><div><b>Some columns weren't recognised.</b> Pick which column in <b>{file.name}</b> holds each detail.</div></div>
          <Table cols="minmax(0,1fr) minmax(0,1.3fr) minmax(0,1.3fr)" head={<><span>Our field</span><span>Column in your file</span><span className="hide-phone">First value</span></>}>
            {fields.map((f) => (
              <div key={f.key} className="t-row map-row">
                <span><div className="t-main">{f.label}{f.required && <span style={{ color: "var(--red)" }}> *</span>}</div><div className="t-sub">{f.hint}</div></span>
                <span><div className="field-box" style={{ height: 38 }}><select value={map[f.key] ?? ""} onChange={(e) => setMap({ ...map, [f.key]: e.target.value })}><option value="">Not in this file</option>{file.headers.map((h) => <option key={h}>{h}</option>)}</select><Icon.UpDown size={15} className="secondary" /></div></span>
                <span className="t-sub hide-phone">{map[f.key] ? file.rows[0][map[f.key]] || "—" : ""}</span>
              </div>
            ))}
          </Table>
          <div className="panel-body" style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span className="secondary" style={{ fontSize: 14, flex: 1 }}>{plural(file.rows.length, "row")} in the file</span>
            <button className="btn primary" disabled={fields.some((f) => f.required && !map[f.key])} onClick={() => check()}>Check rows</button>
          </div>
        </section>
      )}

      {step === "check" && (busy || !preview) && (
        <section className="panel"><div className="panel-body" style={{ padding: "28px 22px" }}><div style={{ fontWeight: 600, marginBottom: 12 }}>Checking {file ? plural(file.rows.length, "row") : "rows"} against APAAR and your intake…</div><div className="progress-sweep" /></div></section>
      )}

      {step === "check" && preview && counts && !busy && (
        <div className="stack">
          <section className="panel">
            <div className="panel-body" style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
              <Icon.File size={22} className="secondary" />
              <div style={{ flex: 1, minWidth: 200 }}><div className="panel-title">{file!.name}</div><div className="panel-sub">{plural(counts.all, "row")} · {n(counts.add)} new, {n(counts.update)} updates · <button className="link-btn" onClick={() => setStep("map")}>columns</button></div></div>
              {counts.error + counts.warning > 0 && <button className="btn quiet" onClick={errorReport}><Icon.Download size={16} />Problems as CSV</button>}
            </div>
            <div className="stats">
              <div className="stat"><div className="stat-label">Ready</div><div className="stat-value">{n(counts.clean)}</div><div className="stat-note">{pct(counts.clean, counts.all)} of rows</div></div>
              <div className="stat"><div className="stat-label">Warnings</div><div className="stat-value">{n(counts.warning)}</div><div className="stat-note">can be explained</div></div>
              <div className="stat"><div className="stat-label">Errors</div><div className={`stat-value${counts.error ? " bad" : ""}`}>{n(counts.error)}</div><div className="stat-note">must be fixed</div></div>
            </div>
          </section>

          {preview.programmeIssues.length > 0 && (
            <section className="panel">
              {preview.programmeIssues.map((i: any) => <div key={i.key} className="notice bad"><Icon.Error /><div><b>{i.title}{i.isNew ? " after this import" : ""}.</b> {i.detail}</div></div>)}
            </section>
          )}

          <section className="panel">
            <div className="panel-head">Programmes after import</div>
            <Table cols="minmax(0,2fr) 70px minmax(120px,1.5fr) 80px" head={<><span>Programme</span><span className="r">Intake</span><span>Admitted</span><span className="r">This file</span></>}>
              {preview.projection.filter((p: any) => p.total || p.adding).map((p: any) => (
                <div key={p.id} className="t-row">
                  <span className="t-main">{p.name}</span><span className="r t-num">{n(p.approved)}</span>
                  <span><SeatMeter approved={p.approved} regular={p.regular} tfw={p.tfw} fn={p.fn} lateral={p.lateral} /><div className="t-sub" style={{ marginTop: 5 }}>{n(p.regular)} of {n(p.approved)} regular{p.regular > p.approved ? <b style={{ color: "var(--bad)" }}> · {n(p.regular - p.approved)} over</b> : null}</div></span>
                  <span className="r t-num">{p.adding ? `+${n(p.adding)}` : "—"}</span>
                </div>
              ))}
            </Table>
          </section>

          <div className="toolbar" style={{ marginBottom: 0 }}>
            <Segmented label="Rows" value={filter} onChange={(v) => { setFilter(v); setShown(100); }} options={[{ value: "error", label: "Errors", count: counts.error }, { value: "warning", label: "Warnings", count: counts.warning }, { value: "clean", label: "Ready", count: counts.clean }, { value: "all", label: "All", count: counts.all }]} />
          </div>
          <section className="panel">
            {visible.length === 0 ? <div className="t-empty">No rows here.</div> : (
              <Table cols="48px minmax(0,1.2fr) 150px minmax(0,2fr)" head={<><span>Row</span><span>Student</span><span className="hide-phone">APAAR ID</span><span>Checks</span></>}>
                {visible.slice(0, shown).map((r: any) => (
                  <div key={r.row} className="t-row">
                    <span className="row-num">{r.row}</span>
                    <span><div className="t-main">{r.record.name ?? "—"}</div><div className="t-sub">{r.record.enrolment_no ?? "—"} · {r.action === "add" ? "new" : "update"}</div></span>
                    <span className="t-num hide-phone">{apaar(r.record.apaar_id)}</span>
                    <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {r.issues.length === 0 ? <span className="chip small ok" style={{ alignSelf: "flex-start" }}><Icon.Check size={12} strokeWidth={2.6} />Ready</span>
                        : r.issues.map((i: any, k: number) => <span key={k} style={{ fontSize: 13.5, lineHeight: 1.35 }}><Severity s={i.severity} label={i.title} /> <span className="secondary">{i.detail.includes(" — ") ? i.detail.replace(/^.*? — /, "") : ""}</span></span>)}
                    </span>
                  </div>
                ))}
              </Table>
            )}
            {visible.length > shown && <div className="panel-body" style={{ textAlign: "center" }}><button className="btn quiet small" onClick={() => setShown(shown + 200)}>Show {n(Math.min(200, visible.length - shown))} more</button></div>}
          </section>

          <section className="panel">
            <div className="panel-body" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 280px" }}><div className="panel-title">Nothing is saved yet</div><div className="panel-sub">Import the rows that are ready now, and fix the rest in the file. Or import everything and fix it here.</div></div>
              <button className="btn quiet" disabled={busy} onClick={() => doImport(false)}>Import all {n(counts.all)}</button>
              <button className="btn primary" disabled={busy || counts.all === counts.error} onClick={() => doImport(true)}>{busy && <Icon.Spinner className="spin" size={16} />}Import {n(counts.all - counts.error)} rows</button>
            </div>
          </section>
        </div>
      )}

      {step === "done" && result && (
        <section className="panel">
          <div className="empty">
            <svg width="64" height="64" viewBox="0 0 64 64" className="tick-in" aria-hidden><circle cx="32" cy="32" r="30" fill="var(--green)" /><path d="m19 33 9 9 17-19" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <div className="empty-title" style={{ marginTop: 14 }}>Imported</div>
            <div className="empty-text">{n(result.added)} added, {n(result.updated)} updated{result.unchanged ? `, ${n(result.unchanged)} unchanged` : ""}{result.skipped ? `, ${n(result.skipped)} left out with errors` : ""}. AICTE's dashboard already shows them.</div>
            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              <button className="btn quiet" onClick={reset}>Upload another</button>
              <button className="btn primary" onClick={() => nav("/i/issues")}>Review issues</button>
            </div>
          </div>
        </section>
      )}
    </Page>
  );
}
