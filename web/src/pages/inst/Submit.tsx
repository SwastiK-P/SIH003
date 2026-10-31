import { useState } from "react";
import { Link } from "react-router-dom";
import { api, useApi } from "../../lib/api";
import { useLive, useSession } from "../../lib/session";
import { date, daysUntil, n, plural, time } from "../../lib/format";
import { Page } from "../../components/Shell";
import { Icon } from "../../components/Icons";
import { Scene } from "../../components/Drawings";
import { ErrorNote, Loading, SubmissionState, useUi } from "../../components/ui";

/** Submitting the year's data: a short checklist, a declaration, and a receipt AICTE holds too. */
export function Submit() {
  const { user } = useSession();
  const id = user!.institution_id!;
  const ui = useUi();
  const { data, error, reload } = useApi(`/institutions/${id}`);
  useLive((e) => { if (["records", "submission", "conflict"].includes(e.type)) reload(); });
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  if (error) return <Page title="Submit to AICTE"><ErrorNote text={error} retry={reload} /></Page>;
  if (!data) return <Page title="Submit to AICTE"><Loading /></Page>;
  const { summary: s, submission: sub, rules, issueCounts, institution } = data;
  const errors = issueCounts.filter((c: any) => c.severity === "error").reduce((a: number, c: any) => a + c.count, 0);
  const warnings = issueCounts.filter((c: any) => c.severity === "warning").reduce((a: number, c: any) => a + c.open, 0);
  const checks = [
    { ok: s.enrolled > 0, label: "Admissions uploaded", note: `${plural(s.enrolled, "student")} on record`, to: "/i/upload" },
    { ok: errors === 0, label: "No errors", note: errors ? `${plural(errors, "error")} open` : "Every record matches APAAR and the approved intake", to: "/i/issues" },
    { ok: warnings === 0, label: "Warnings fixed or explained", note: warnings ? `${plural(warnings, "warning")} without an explanation` : "Nothing left unexplained", to: "/i/issues" },
  ];
  const ready = checks.every((c) => c.ok);
  const left = daysUntil(rules.deadline);

  const submit = async () => {
    const ok = await ui.confirm({ title: "Submit to AICTE?", message: `${plural(s.enrolled, "record")} for ${rules.academic_year}. After this, each change is recorded as an amendment with a reason.`, confirm: "Submit" });
    if (!ok) return;
    setBusy(true);
    try { await api(`/institutions/${id}/submit`, { body: { declaration: true } }); ui.toast("Submitted. AICTE has been notified."); reload(); }
    catch (e) { ui.toast((e as Error).message, { kind: "error" }); }
    finally { setBusy(false); }
  };

  if (sub.status === "submitted" || sub.status === "accepted") return (
    <Page title="Submit to AICTE">
      <section className="panel">
        <div className="empty" style={{ paddingBottom: 30 }}>
          <Scene name="submitted" />
          <div className="empty-title">{sub.status === "accepted" ? "Accepted by AICTE" : "Submitted"}</div>
          <div className="empty-text">{sub.status === "accepted" ? `AICTE accepted the data on ${date(sub.reviewed_at)}.` : "AICTE will review it. You'll see their decision here and on the overview."}</div>
        </div>
        <div className="kv"><span>Status</span><span><SubmissionState status={sub.status} /></span></div>
        <div className="kv"><span>Submitted</span><span>{time(sub.submitted_at)} by {sub.submitted_by}</span></div>
        <div className="kv"><span>Records</span><span className="num">{n(sub.snapshot_count)}</span></div>
        {sub.snapshot_hash && <div className="kv"><span>Snapshot</span><span className="mono" style={{ fontSize: 12.5 }}>{sub.snapshot_hash}</span></div>}
        {sub.reviewed_at && <div className="kv"><span>Reviewed</span><span>{time(sub.reviewed_at)} by {sub.reviewed_by}</span></div>}
        <div className="notice info"><Icon.Info /><div>The snapshot is a fingerprint of every record as submitted. If a record changes later it's flagged as an amendment, and the fingerprint no longer matches.</div></div>
      </section>
    </Page>
  );

  return (
    <Page title="Submit to AICTE" sub={<>{institution.name} · admissions {rules.academic_year} · due <b>{date(rules.deadline)}</b>{left >= 0 ? `, ${left === 0 ? "today" : `in ${plural(left, "day")}`}` : ", deadline passed"}</>}>
      <div className="grid cols-main">
        <div className="stack">
          {sub.status === "returned" && <section className="panel"><div className="notice bad"><Icon.Error /><div><b>Returned by AICTE on {date(sub.reviewed_at)}.</b> {sub.note}</div></div></section>}
          <section className="panel">
            <div className="panel-head">Before you submit</div>
            {checks.map((c) => (
              <div key={c.label} className="kv" style={{ alignItems: "center" }}>
                <span style={{ width: 28, flex: "none" }}>{c.ok ? <Icon.CheckCircle size={22} style={{ color: "var(--green)" }} /> : <Icon.Error size={22} style={{ color: "var(--red)" }} />}</span>
                <span style={{ flex: 1, width: "auto", maxWidth: "none", color: "var(--text)", fontSize: 14 }}><b style={{ fontWeight: 600, display: "block" }}>{c.label}</b><span className="secondary" style={{ fontSize: 13.5 }}>{c.note}</span></span>
                {!c.ok && <Link to={c.to} className="btn small quiet" style={{ flex: "none" }}>Fix</Link>}
              </div>
            ))}
          </section>
          <section className="panel">
            <div className="panel-body">
              <label className="check">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} disabled={!ready} />
                <span>I confirm that these {n(s.enrolled)} records are the students actually admitted to {institution.name} for {rules.academic_year}, that every APAAR ID was given by the student, and that seats are within the approved intake and supernumerary caps.</span>
              </label>
            </div>
            <div className="panel-body" style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span className="secondary" style={{ flex: 1, fontSize: 14 }}>{ready ? "Signed as " + user!.name : "Fix what's above to submit."}</span>
              <button className="btn prominent" disabled={!ready || !agree || busy} onClick={submit}>{busy && <Icon.Spinner className="spin" size={16} />}Submit {n(s.enrolled)} records</button>
            </div>
          </section>
        </div>
        <section className="panel" style={{ alignSelf: "start" }}>
          <div className="panel-head">What happens next</div>
          {[["AICTE reviews", "Counts are checked against your approval letter; the checks you've seen run again on their side."], ["Accepted or returned", "If something needs correcting, it comes back with a note and opens for edits again."], ["Amendments after that", "Single records can still be corrected, with a reason. AICTE sees every amendment."]].map(([a, b]) => (
            <div key={a} className="signal" style={{ display: "block" }}><b>{a}</b><span>{b}</span></div>
          ))}
        </section>
      </div>
    </Page>
  );
}
