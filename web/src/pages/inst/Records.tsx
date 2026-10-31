import { useState } from "react";
import { Link } from "react-router-dom";
import { api, useApi } from "../../lib/api";
import { useSession } from "../../lib/session";
import { apaar, date, plural, shortProgramme } from "../../lib/format";
import { Page } from "../../components/Shell";
import { Icon } from "../../components/Icons";
import { Empty, ErrorNote, Loading, Sheet, Table, useUi } from "../../components/ui";
import { Certificate, verifyUrl } from "../../components/Certificate";

export function printCertificate() {
  document.body.classList.add("printing-cert");
  const done = () => { document.body.classList.remove("printing-cert"); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  window.print();
}

/** Signed records issued for this institution's students, and the certificate layout that carries them. */
export function Records() {
  const { user } = useSession();
  const id = user!.institution_id!;
  const ui = useUi();
  const inst = useApi(`/institutions/${id}`);
  const { data, error, reload } = useApi(`/institutions/${id}/credentials`);
  const [open, setOpen] = useState<any>(null);

  const revoke = async (c: any) => {
    const reason = await ui.prompt({ title: `Revoke ${c.id}?`, message: "Anyone who checks it will see it's no longer valid, and why. This can't be undone; issue a new one if needed.", confirm: "Revoke", destructive: true, field: { label: "Reason", placeholder: "e.g. Issued with the wrong programme", required: true } });
    if (reason === null) return;
    try { await api(`/institutions/${id}/credentials/${c.id}/revoke`, { body: { reason } }); ui.toast("Revoked"); setOpen(null); reload(); } catch (e) { ui.toast((e as Error).message, { kind: "error" }); }
  };

  return (
    <Page title="Verifiable records" sub="Each one is signed by AICTE and linked to the student's APAAR ID. Employers and regulators check it by its code or QR — with nothing more than what's printed on it.">
      {error ? <ErrorNote text={error} retry={reload} /> : !data ? <Loading /> : !data.length ? (
        <section className="panel"><Empty scene="record" title="No records issued yet" text="Open a student whose record matches APAAR and choose Issue. Students can also ask for one themselves." action={<Link to="/i/students" className="btn primary">Students</Link>} /></section>
      ) : (
        <section className="panel">
          <div className="panel-head">{plural(data.length, "record")}</div>
          <Table cols="minmax(0,1.5fr) 128px minmax(0,1.3fr) 110px 90px" head={<><span>Student</span><span>Code</span><span className="hide-phone">Programme</span><span className="hide-phone">Issued</span><span className="r">State</span></>}>
            {data.map((c: any) => (
              <button key={c.id} className="t-row hoverable" onClick={() => setOpen(c)}>
                <span><div className="t-main">{c.name}</div><div className="t-sub">{apaar(c.apaar_id)}</div></span>
                <span className="mono" style={{ fontSize: 13 }}>{c.id}</span>
                <span className="hide-phone"><div className="t-main" style={{ fontWeight: 400 }}>{shortProgramme(c.programme)}</div><div className="t-sub">{c.status}</div></span>
                <span className="t-sub hide-phone" style={{ fontSize: 13.5 }}>{date(c.issued_at)}</span>
                <span className="r">{c.revoked_at ? <span className="chip small bad">Revoked</span> : <span className="chip small ok">Valid</span>}</span>
              </button>
            ))}
          </Table>
        </section>
      )}

      {open && inst.data && (
        <Sheet title={open.name} width={860} onClose={() => setOpen(null)}
          foot={<>
            {!open.revoked_at && <button className="btn quiet destructive" onClick={() => revoke(open)}>Revoke</button>}
            <span className="spacer" />
            <a className="btn quiet" href={verifyUrl(open.id)} target="_blank" rel="noreferrer"><Icon.External size={16} />Verification page</a>
            <button className="btn primary" onClick={printCertificate}><Icon.Print size={16} />Print</button>
          </>}>
          {open.revoked_at && <div className="notice bad no-print" style={{ borderRadius: 12, marginBottom: 14 }}><Icon.Error /><div><b>Revoked on {date(open.revoked_at)}.</b> The certificate still prints, but its QR now shows it's not valid.</div></div>}
          <p className="secondary no-print" style={{ fontSize: 13.5, marginBottom: 14 }}>How a degree-awarding body prints the APAAR ID beside the enrolment number. The QR opens the public check for record <span className="mono">{open.id}</span>.</p>
          <Certificate d={{ name: open.name, apaar_id: open.apaar_id, enrolment_no: open.enrolment_no, programme: open.programme, institution: inst.data.institution.name, place: `${inst.data.institution.city}, ${inst.data.institution.state}`, admission_year: open.academic_year, status: open.status, code: open.id }} />
        </Sheet>
      )}
    </Page>
  );
}
