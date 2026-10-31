import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, useApi } from "../../lib/api";
import { action, apaar, ago, date, GENDER, QUOTA, time } from "../../lib/format";
import { Icon } from "../../components/Icons";
import { Field, MenuButton, MenuItem, Sheet, useUi } from "../../components/ui";
import { changeStatus } from "./Students";

const EMPTY = { apaar_id: "", enrolment_no: "", name: "", dob: "", gender: "", program: "", admission_date: "", social_category: "GEN", quota: "regular", nationality: "Indian", nri: false, oci: false, fn: false, passport_no: "", year_of_study: "1", email: "", phone: "" };
type Form = typeof EMPTY;

const toForm = (s: any): Form => ({
  apaar_id: s.apaar_id ?? "", enrolment_no: s.enrolment_no ?? "", name: s.name ?? "", dob: s.dob ?? "", gender: s.gender ?? "", program: s.program_id ?? "",
  admission_date: s.admission_date ?? "", social_category: s.social_category ?? "GEN", quota: s.quota ?? "regular", nationality: s.nationality ?? "Indian",
  nri: !!s.nri, oci: !!s.oci, fn: !!s.fn, passport_no: s.passport_no ?? "", year_of_study: String(s.year_of_study ?? 1), email: s.email ?? "", phone: s.phone ?? "",
});

/** One student: what's wrong and how to fix it, the record beside the APAAR registry, and its history. */
export function StudentSheet({ institutionId, id, readOnly, programmes, onClose, onChanged, onCreated }: {
  institutionId: string; id: number | null; readOnly?: boolean; programmes: any[]; onClose: () => void; onChanged: () => void; onCreated?: (id: number) => void;
}) {
  const ui = useUi();
  const { data, reload } = useApi(id ? `/institutions/${institutionId}/students/${id}` : null, [id]);
  const [editing, setEditing] = useState(id === null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (data?.student) { setForm(toForm(data.student)); setEditing(false); } }, [data?.student?.id]);

  const save = async () => {
    setErr(null);
    let reason: string | null = "";
    if (data?.locked || (id === null && false)) {
      reason = await ui.prompt({ title: "Reason for the change", message: "The data has been submitted, so this is recorded as an amendment that AICTE can see.", confirm: "Save", field: { label: "Reason", placeholder: "e.g. Corrected spelling to match APAAR", required: true, multiline: true } });
      if (reason === null) return;
    }
    setSaving(true);
    try {
      const record = { ...form, nri: form.nri ? "Y" : "N", oci: form.oci ? "Y" : "N", fn: form.fn ? "Y" : "N" };
      const r = id ? await api(`/institutions/${institutionId}/students/${id}`, { method: "PUT", body: { record, reason } }) : await api(`/institutions/${institutionId}/students`, { body: { record, reason } });
      ui.toast(id ? "Saved. Checks run again." : "Student added");
      onChanged();
      if (id) { setEditing(false); reload(); } else onCreated?.(r.id);
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  };

  const setStatus = async (status: string) => {
    const reason = await ui.prompt({ title: status === "active" ? "Mark as active again?" : `Mark as ${status}?`, message: status === "active" ? "The record counts towards intake again." : "The record stays on file but no longer counts towards intake.", confirm: "Change", field: { label: "Reason", placeholder: status === "transferred" ? "e.g. Moved to another institution on 2 Sep" : "e.g. Withdrew admission on 12 Aug", required: true } });
    if (reason === null) return;
    try { await changeStatus(institutionId, id!, status, reason); ui.toast("Status changed"); onChanged(); reload(); } catch (e) { ui.toast((e as Error).message, { kind: "error" }); }
  };

  const remove = async () => {
    const reason = await ui.prompt({ title: "Delete this record?", message: "Use this only for a record added by mistake. It's logged in the audit trail.", confirm: "Delete", destructive: true, field: { label: "Reason", placeholder: "e.g. Duplicate row from the upload", required: true } });
    if (reason === null) return;
    try { await api(`/institutions/${institutionId}/students/${id}?reason=${encodeURIComponent(reason)}`, { method: "DELETE" }); ui.toast("Record deleted"); onChanged(); onClose(); } catch (e) { ui.toast((e as Error).message, { kind: "error" }); }
  };

  const issueRecord = async () => {
    try { const c = await api(`/institutions/${institutionId}/students/${id}/credential`, { body: {} }); ui.toast(`Verifiable record ${c.id} issued`); reload(); } catch (e) { ui.toast((e as Error).message, { kind: "error" }); }
  };

  const s = data?.student;
  const title = id === null ? "New student" : s?.name ?? "Student";

  if (editing) {
    return (
      <Sheet side title={id === null ? "New student" : `Edit ${s?.name ?? ""}`} onClose={id === null ? onClose : () => setEditing(false)}
        foot={<><span className="spacer" />{id !== null && <button className="btn quiet" onClick={() => { setEditing(false); setForm(toForm(s)); }}>Cancel</button>}<button className="btn primary" disabled={saving} onClick={save}>{saving ? <Icon.Spinner className="spin" size={16} /> : null}{id === null ? "Add student" : "Save"}</button></>}>
        <StudentForm form={form} setForm={setForm} programmes={programmes} />
        {err && <div className="notice bad" style={{ marginTop: 14, borderRadius: 12 }}><Icon.Error /><div>{err}</div></div>}
      </Sheet>
    );
  }

  const reg = data?.registry;
  const nameDiff = data?.issues.find((i: any) => i.code === "apaar_name_mismatch") ? "differs" : data?.issues.find((i: any) => i.code === "apaar_name_close") ? "close" : "";
  const dobDiff = data?.issues.some((i: any) => i.code === "apaar_dob");

  return (
    <Sheet side title={title} onClose={onClose} actions={!readOnly && s && <>
      <button className="btn glass icon" onClick={() => setEditing(true)} aria-label="Edit"><Icon.Edit /></button>
      <MenuButton className="btn glass icon" ariaLabel="More" align="right" label={<Icon.More />}>
        {(close) => <>
          <div className="menu-header">Status</div>
          {["active", "withdrawn", "transferred", "graduated"].map((st) => <MenuItem key={st} on={s.status === st} onClick={() => { close(); if (s.status !== st) setStatus(st); }}>{st[0].toUpperCase() + st.slice(1)}</MenuItem>)}
          {!data.locked && <><div className="menu-sep" /><button className="menu-item" style={{ color: "var(--red)" }} onClick={() => { close(); remove(); }}><span className="lead"><Icon.Trash size={16} /></span>Delete record</button></>}
        </>}
      </MenuButton>
    </>}>
      {!s ? <div style={{ padding: 30 }}><div className="progress-sweep" /></div> : (
        <div className="stack" style={{ gap: 14 }}>
          <div style={{ padding: "4px 2px 2px" }}>
            <div className="secondary" style={{ fontSize: 13.5 }}>{s.programme} · {s.academic_year}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <span className={`chip ${s.status === "active" ? "ok" : ""}`}>{s.status[0].toUpperCase() + s.status.slice(1)}</span>
              <span className="chip">{QUOTA[s.quota]}</span>
              {s.nri ? <span className="chip">NRI</span> : null}{s.oci ? <span className="chip">OCI</span> : null}{s.fn ? <span className="chip">Foreign national</span> : null}
              {s.amended_after_submit ? <span className="chip warn">Amended after submission</span> : null}
            </div>
          </div>

          {data.issues.length > 0 ? (
            <section className="panel">
              {data.issues.map((i: any) => (
                <div key={i.key} className={`notice ${i.severity === "error" ? "bad" : "warn"}`}>
                  {i.severity === "error" ? <Icon.Error /> : <Icon.Warning />}
                  <div>
                    <b>{i.title}</b><div style={{ fontSize: 13.5, marginTop: 2 }}>{i.detail}</div>
                    {i.others?.length > 0 && <div style={{ fontSize: 13.5, marginTop: 6 }}>Also at {i.others.map((o: any) => `${o.institution}, ${o.city} (admitted ${date(o.admission_date)})`).join("; ")}</div>}
                    <div style={{ fontSize: 13, marginTop: 6, color: "var(--secondary)" }}>{i.fix}</div>
                  </div>
                </div>
              ))}
            </section>
          ) : (
            <section className="panel"><div className="notice ok"><Icon.CheckCircle /><div><b>Passes every check.</b> Matches the APAAR registry.</div></div></section>
          )}

          <section className="panel">
            <div className="panel-head"><span style={{ flex: 1 }}>On this record</span><span style={{ flex: 1, paddingLeft: 18 }}>On APAAR {reg?.status === "deactivated" && "(deactivated)"}</span></div>
            {[
              ["Name", s.name, reg?.name, nameDiff],
              ["Date of birth", date(s.dob), reg ? date(reg.dob) : null, dobDiff ? "differs" : ""],
              ["Gender", GENDER[s.gender] ?? "—", reg ? GENDER[reg.gender] ?? "—" : null, ""],
            ].map(([k, a, b, d]) => (
              <div key={k as string} className="compare">
                <div><div className="k">{k}</div><div className={`v ${d}`}>{a || "—"}</div></div>
                <div><div className="k">{k}</div><div className="v">{b ?? <span className="tertiary">{s.apaar_id ? "Not in registry" : "No APAAR ID"}</span>}</div></div>
              </div>
            ))}
          </section>

          <section className="panel">
            <div className="kv"><span>APAAR ID</span><span className="num">{apaar(s.apaar_id)}</span></div>
            <div className="kv"><span>Enrolment no.</span><span>{s.enrolment_no ?? "—"}</span></div>
            <div className="kv"><span>Programme</span><span>{s.programme ?? s.program_id ?? "—"}</span></div>
            <div className="kv"><span>Admitted</span><span>{date(s.admission_date)} · year {s.year_of_study}</span></div>
            <div className="kv"><span>Category</span><span>{s.social_category ?? "—"}</span></div>
            <div className="kv"><span>Nationality</span><span>{s.nationality ?? "—"}{s.passport_no ? ` · passport ${s.passport_no}` : ""}</span></div>
            <div className="kv"><span>Contact</span><span>{[s.email, s.phone].filter(Boolean).join(" · ") || "—"}</span></div>
            <div className="kv"><span>Last changed</span><span>{time(s.updated_at)} · via {s.source} · version {s.version}</span></div>
          </section>

          <section className="panel">
            <div className="panel-head">Verifiable record</div>
            {data.credentials.length ? data.credentials.map((c: any) => (
              <div key={c.id} className="kv" style={{ alignItems: "center" }}>
                <span className="num" style={{ color: "var(--label)", fontWeight: 600 }}>{c.id}</span>
                <span style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
                  {c.revoked_at ? <span className="chip bad">Revoked</span> : <span className="chip ok">Valid</span>}
                  <Link className="btn small quiet" to={`/v/${c.id}`} target="_blank"><Icon.External size={15} />Open</Link>
                </span>
              </div>
            )) : (
              <div className="panel-body" style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span className="secondary" style={{ flex: 1, fontSize: 14 }}>A signed record anyone can check by its code or QR, linked to the APAAR ID.</span>
                <button className="btn small quiet" onClick={issueRecord} disabled={data.issues.some((i: any) => i.severity === "error" && i.code.startsWith("apaar"))}>Issue</button>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-head">History</div>
            {data.history.length === 0 && <div className="t-empty">No changes since it was uploaded.</div>}
            {data.history.map((h: any) => (
              <div key={h.id} className="feed-item"><span className="when">{ago(h.at)}</span><span><b>{h.actor_name}</b> {action(h.action)}
                {h.detail?.changed?.length > 0 && <span className="where">Changed {h.detail.changed.join(", ")}</span>}
                {h.detail?.reason && <span className="where">“{h.detail.reason}”</span>}
                {h.detail?.to && <span className="where">{h.detail.from} → {h.detail.to}</span>}
              </span></div>
            ))}
          </section>
        </div>
      )}
    </Sheet>
  );
}

function StudentForm({ form, setForm, programmes }: { form: Form; setForm: (f: Form) => void; programmes: any[] }) {
  const up = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  const toggle = (k: "nri" | "oci" | "fn") => setForm({ ...form, [k]: !form[k] });
  return (
    <div className="stack" style={{ gap: 16, paddingTop: 4 }}>
      <div className="field-row">
        <Field label="APAAR ID" hint="12 digits, from DigiLocker or the ABC portal"><input inputMode="numeric" value={form.apaar_id} onChange={up("apaar_id")} placeholder="0000 0000 0000" /></Field>
        <Field label="Enrolment no."><input value={form.enrolment_no} onChange={up("enrolment_no")} /></Field>
      </div>
      <Field label="Name" hint="Exactly as on the APAAR record"><input value={form.name} onChange={up("name")} autoComplete="off" /></Field>
      <div className="field-row">
        <Field label="Date of birth"><input type="date" value={form.dob} onChange={up("dob")} /></Field>
        <Field label="Gender"><select value={form.gender} onChange={up("gender")}><option value="">Choose…</option><option value="F">Female</option><option value="M">Male</option><option value="T">Transgender</option></select><Icon.UpDown size={15} className="secondary" /></Field>
      </div>
      <Field label="Programme"><select value={form.program} onChange={up("program")}><option value="">Choose…</option>{programmes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><Icon.UpDown size={15} className="secondary" /></Field>
      <div className="field-row">
        <Field label="Admission date"><input type="date" value={form.admission_date} onChange={up("admission_date")} /></Field>
        <Field label="Year of study"><select value={form.year_of_study} onChange={up("year_of_study")}>{[1, 2, 3, 4, 5].map((y) => <option key={y}>{y}</option>)}</select><Icon.UpDown size={15} className="secondary" /></Field>
      </div>
      <div className="field-row">
        <Field label="Seat type"><select value={form.quota} onChange={up("quota")}>{Object.entries(QUOTA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><Icon.UpDown size={15} className="secondary" /></Field>
        <Field label="Category"><select value={form.social_category} onChange={up("social_category")}>{["GEN", "EWS", "OBC", "SC", "ST"].map((c) => <option key={c}>{c}</option>)}</select><Icon.UpDown size={15} className="secondary" /></Field>
      </div>
      <div className="panel">
        {([["nri", "NRI", "Non-resident Indian — an Indian citizen"], ["oci", "OCI card holder", "Overseas Citizen of India — a foreign citizen"], ["fn", "Foreign national", "Neither Indian nor OCI"]] as const).map(([k, l, h]) => (
          <div key={k} className="kv" style={{ alignItems: "center" }}>
            <span style={{ width: "auto", maxWidth: "none", flex: 1 }}><span style={{ color: "var(--label)", display: "block" }}>{l}</span><span style={{ fontSize: 12.5 }}>{h}</span></span>
            <button type="button" className="switch" role="switch" aria-checked={form[k]} aria-label={l} onClick={() => toggle(k)} />
          </div>
        ))}
      </div>
      <div className="field-row">
        <Field label="Nationality"><input value={form.nationality} onChange={up("nationality")} /></Field>
        <Field label="Passport no." hint={form.fn || form.oci ? "Needed for OCI and foreign nationals" : undefined}><input value={form.passport_no} onChange={up("passport_no")} /></Field>
      </div>
      <div className="field-row">
        <Field label="Email"><input type="email" value={form.email} onChange={up("email")} /></Field>
        <Field label="Mobile" hint="The student's own number"><input inputMode="tel" value={form.phone} onChange={up("phone")} /></Field>
      </div>
    </div>
  );
}
