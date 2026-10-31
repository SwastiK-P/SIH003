import { useState } from "react";
import { api, useApi } from "../../lib/api";
import { useSession } from "../../lib/session";
import { ago, date } from "../../lib/format";
import { Page } from "../../components/Shell";
import { Icon } from "../../components/Icons";
import { Copyable, Segmented, Table, useUi } from "../../components/ui";

const ENDPOINTS = [
  ["GET", "/api/v1/programmes", "Approved programmes and their intake for the year"],
  ["GET", "/api/v1/students?updated_since=…", "Your records, optionally only those changed since a time"],
  ["PUT", "/api/v1/students/{apaar_id}", "Add or update one student. Answers with the checks it triggered"],
  ["POST", "/api/v1/students/batch", "Up to 5,000 students at once. Add ?dry_run=true to check without saving"],
  ["GET", "/api/v1/issues", "Open issues, with what to do about each"],
  ["GET", "/api/public/credentials/{code}", "Check a verifiable record. No key needed"],
];

/** Keys for the institution's own systems (ERP, admission software) and how to use them. */
export function Integration() {
  const { user } = useSession();
  const id = user!.institution_id!;
  const ui = useUi();
  const { data, reload } = useApi(`/institutions/${id}/keys`);
  const [secret, setSecret] = useState<string | null>(null);
  const [lang, setLang] = useState<"curl" | "js" | "python">("curl");
  const origin = location.origin;

  const create = async () => {
    const label = await ui.prompt({ title: "New API key", message: "Name it after the system that will use it, so you know which to revoke later.", confirm: "Create", field: { label: "Name", placeholder: "e.g. Admissions ERP", required: true } });
    if (label === null) return;
    const k = await api(`/institutions/${id}/keys`, { body: { label } });
    setSecret(k.secret); reload();
  };
  const revoke = async (k: any) => {
    if (!(await ui.confirm({ title: `Revoke “${k.label}”?`, message: "Systems using it stop working at once.", confirm: "Revoke", destructive: true }))) return;
    await api(`/institutions/${id}/keys/${k.id}`, { method: "DELETE" }); ui.toast("Key revoked"); reload();
  };

  const key = secret ?? "ak_live_…";
  const sample = {
    curl: `curl -X PUT ${origin}/api/v1/students/482019375561 \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "enrolment_no": "KIT26CS001",
    "name": "Aarav Sharma",
    "dob": "14-03-2008",
    "gender": "M",
    "program": "B.Tech Computer Science and Engineering",
    "admission_date": "08-08-2026",
    "quota": "Regular"
  }'`,
    js: `const res = await fetch("${origin}/api/v1/students/batch?dry_run=true", {
  method: "POST",
  headers: { Authorization: "Bearer ${key}", "Content-Type": "application/json" },
  body: JSON.stringify({ students: rowsFromYourErp }),
});
const { results } = await res.json();
// each result: { index, apaar_id, action: "add" | "update", issues: [...] }`,
    python: `import requests

r = requests.get(
    "${origin}/api/v1/issues",
    headers={"Authorization": "Bearer ${key}"},
)
for issue in r.json()["issues"]:
    print(issue["severity"], issue["title"], "-", issue["detail"])`,
  }[lang];

  return (
    <Page title="API and integrations" sub="Send records straight from your admission software instead of uploading files. Records are keyed by APAAR ID, so sending a student again updates them, and every call answers with the checks it ran.">
      <div className="grid cols-main">
        <div className="stack">
          <section className="panel">
            <div className="panel-head">Endpoints</div>
            <Table cols="58px minmax(0,1.3fr) minmax(0,1.4fr)">
              {ENDPOINTS.map(([m, p, d]) => (
                <div key={p} className="t-row"><span><span className={`method ${m.toLowerCase()}`}>{m}</span></span><span className="mono wrap-anywhere" style={{ fontSize: 12.5 }}>{p}</span><span className="t-sub" style={{ fontSize: 13.5, whiteSpace: "normal" }}>{d}</span></div>
              ))}
            </Table>
          </section>
          <section className="panel">
            <div className="panel-head">Example<span className="spacer" /><Segmented label="Language" value={lang} onChange={setLang} options={[{ value: "curl", label: "curl" }, { value: "js", label: "JavaScript" }, { value: "python", label: "Python" }]} /></div>
            <div className="panel-body"><pre className="code">{sample}</pre></div>
            <div className="notice info"><Icon.Info /><div>Dates may be DD-MM-YYYY or YYYY-MM-DD. Yes/no fields take Y or N. Programmes can be sent by code or by name. Once the year is submitted, writes answer <span className="mono">409 submission_locked</span>.</div></div>
          </section>
        </div>
        <div className="stack">
          <section className="panel">
            <div className="panel-head">Keys<span className="spacer" /><button onClick={create}>New key</button></div>
            {secret && (
              <div className="panel-body">
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Copy it now — it's shown once</div>
                <div className="secret"><span style={{ flex: 1 }}>{secret}</span><Copyable text={secret} label="Key copied" /></div>
              </div>
            )}
            {data?.map((k: any) => (
              <div key={k.id} className="kv" style={{ alignItems: "center" }}>
                <span style={{ width: "auto", maxWidth: "none", flex: 1 }}><span style={{ color: "var(--label)", display: "block", fontWeight: 500 }}>{k.label}</span><span className="mono" style={{ fontSize: 12 }}>{k.prefix}…</span><span style={{ display: "block", fontSize: 12.5 }}>{k.revoked_at ? `Revoked ${date(k.revoked_at)}` : `Created ${date(k.created_at)} · ${k.last_used_at ? `used ${ago(k.last_used_at)}` : "never used"}`}</span></span>
                {!k.revoked_at && <button className="btn small quiet destructive" onClick={() => revoke(k)}>Revoke</button>}
              </div>
            ))}
          </section>
          <section className="panel">
            <div className="panel-head">Good to know</div>
            {[["Keys belong to the institution", "Any key can only read and write this institution's records."], ["Every call is logged", "Changes made through the API appear in Activity as “Integration API”."], ["Check before you send", "Batch calls with ?dry_run=true run every check and save nothing."]].map(([a, b]) => <div key={a} className="signal" style={{ display: "block" }}><b>{a}</b><span>{b}</span></div>)}
          </section>
        </div>
      </div>
    </Page>
  );
}
