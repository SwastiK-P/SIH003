import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, useApi } from "../../lib/api";
import { Page } from "../../components/Shell";
import { Icon } from "../../components/Icons";
import { VerifyResult } from "../../components/VerifyResult";
import { Field, Segmented, useUi } from "../../components/ui";

/** Pull a record code out of whatever was pasted: the code, the link, or the QR's URL. */
export const codeFrom = (s: string) => (s.toUpperCase().match(/[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{2}/) ?? [""])[0];

/** Two ways to verify: a record the student hands over, or asking the student through the registry. */
export function Verify() {
  const [mode, setMode] = useState<"record" | "ask">("record");
  return (
    <Page title="Verify a student" sub="Check a record a student gave you, or ask a student to share theirs. You see only what they agree to, for as long as they agree to it."
      actions={<Segmented label="How" value={mode} onChange={setMode} options={[{ value: "record", label: "Check a record" }, { value: "ask", label: "Ask a student" }]} />}>
      {mode === "record" ? <CheckRecord /> : <AskStudent />}
    </Page>
  );
}

function CheckRecord() {
  const [text, setText] = useState("");
  const [r, setR] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const code = codeFrom(text);
  const go = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!code) return;
    setBusy(true); setErr(null);
    try { setR(await api(`/public/credentials/${code}`)); } catch (x) { setR(null); setErr((x as Error).message); } finally { setBusy(false); }
  };
  const fromFile = async (f: File) => {
    setErr(null);
    try {
      const doc = JSON.parse(await f.text());
      const v = await api("/public/verify-document", { body: doc });
      if (!v.signatureValid) { setR(null); setErr("This file's signature doesn't match AICTE's key. It has been altered or isn't a real record."); return; }
      setText(v.statement.id); setR(await api(`/public/credentials/${v.statement.id}`));
    } catch { setErr("That isn't a record file."); }
  };
  return (
    <div className="grid cols-main">
      <div className="stack">
        <section className="panel">
          <form className="panel-body" onSubmit={go}>
            <Field label="Record code or link" hint="On the certificate under the QR, like 7KQM-X3PD-9H. A scanned QR link works too.">
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="XXXX-XXXX-XX" autoFocus spellCheck={false} />
            </Field>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button className="btn primary" disabled={!code || busy}>{busy && <Icon.Spinner className="spin" size={16} />}Check</button>
              <button type="button" className="btn quiet" onClick={() => file.current?.click()}><Icon.File size={16} />Check a record file</button>
              <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) fromFile(f); e.target.value = ""; }} />
            </div>
          </form>
          {err && <div className="notice bad"><Icon.Error /><div>{err}</div></div>}
        </section>
        {r && <VerifyResult r={r} />}
      </div>
      <section className="panel" style={{ alignSelf: "start" }}>
        <div className="panel-head">What a record proves</div>
        {[["It came from AICTE", "The record is signed. A changed letter breaks the signature."], ["It's still in force", "Revoked records say so, with the reason."], ["Whose it is", "Compare the APAAR ID the person gives you — without ever seeing the ID on file."]].map(([a, b]) => <div key={a} className="signal" style={{ display: "block" }}><b>{a}</b><span>{b}</span></div>)}
      </section>
    </div>
  );
}

function AskStudent() {
  const ui = useUi();
  const nav = useNavigate();
  const meta = useApi("/meta");
  const [apaar, setApaar] = useState("");
  const [purpose, setPurpose] = useState("");
  const [fields, setFields] = useState<string[]>(["name", "programme", "institution", "status"]);
  const [busy, setBusy] = useState(false);
  const labels: Record<string, string> = meta.data?.disclosable ?? {};
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { await api("/verifier/requests", { body: { apaar_id: apaar, purpose, fields } }); ui.toast("Request sent. The student decides."); nav("/e/requests"); }
    catch (x) { ui.toast((x as Error).message, { kind: "error" }); } finally { setBusy(false); }
  };
  return (
    <div className="grid cols-main">
      <form className="panel" onSubmit={send}>
        <div className="panel-body stack" style={{ gap: 16 }}>
          <Field label="Student's APAAR ID" hint="Ask the student for it. You won't learn whether it exists unless they share."><input inputMode="numeric" value={apaar} onChange={(e) => setApaar(e.target.value)} placeholder="0000 0000 0000" /></Field>
          <Field label="Why you need it" hint="The student sees this, word for word."><input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Background check for the Graduate Engineer offer" /></Field>
          <div>
            <div className="field-label">What to ask for</div>
            <div className="panel" style={{ marginTop: 6 }}>
              {Object.entries(labels).map(([k, l]) => (
                <label key={k} className="kv check" style={{ alignItems: "center", cursor: "pointer" }}>
                  <input type="checkbox" checked={fields.includes(k)} onChange={(e) => setFields(e.target.checked ? [...fields, k] : fields.filter((f) => f !== k))} />
                  <span style={{ color: "var(--label)", width: "auto", maxWidth: "none" }}>{l}</span>
                </label>
              ))}
            </div>
            <div className="field-hint">Ask for only what you need. Students are likelier to say yes.</div>
          </div>
        </div>
        <div className="panel-body" style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn primary" disabled={busy || apaar.replace(/\D/g, "").length !== 12 || purpose.trim().length < 8 || !fields.length}>Send request</button>
        </div>
      </form>
      <section className="panel" style={{ alignSelf: "start" }}>
        <div className="panel-head">How consent works</div>
        {[["The student is asked", "They see who you are, why you're asking and exactly what you'd see."], ["They choose for how long", "A week, a month or three. They can stop sharing at any time."], ["Every view is logged", "The student can see each time you opened their record."]].map(([a, b]) => <div key={a} className="signal" style={{ display: "block" }}><b>{a}</b><span>{b}</span></div>)}
      </section>
    </div>
  );
}
