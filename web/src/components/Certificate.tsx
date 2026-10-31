import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { apaar } from "../lib/format";

/** A QR code as inline SVG, so it prints sharp. */
export function QR({ text, className }: { text: string; className?: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => { QRCode.toString(text, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#1f1b16", light: "#ffffff" } }).then(setSvg); }, [text]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: svg }} aria-label="QR code linking to the verification page" role="img" />;
}

export const verifyUrl = (id: string) => `${location.origin}/v/${id}`;

export interface CertificateData {
  name: string; apaar_id: string; enrolment_no: string | null; programme: string; institution: string; place?: string;
  admission_year: string; status: string; code: string; issued_at?: string;
}

/**
 * How a degree-awarding body prints a certificate with the APAAR ID beside the student's own ID
 * (requirement 10). The QR opens the public verification page for the signed record.
 */
export function Certificate({ d }: { d: CertificateData }) {
  const done = d.status === "graduated";
  return (
    <div className="certificate">
      <svg className="cert-seal" viewBox="0 0 100 100" aria-hidden>
        <circle cx="50" cy="50" r="46" fill="#eaf0f8" /><circle cx="50" cy="50" r="38" fill="none" stroke="#1f4b85" strokeWidth="1.2" strokeDasharray="3 2.4" />
        <circle cx="50" cy="50" r="30" fill="#1f4b85" />
        <path d="m38 51 8 8 17-18" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="cert-inner">
        <div className="cert-issuer">{done ? "Certificate of completion" : "Certificate of enrolment"}</div>
        <div className="cert-inst">{d.institution}</div>
        {d.place && <div className="cert-place">{d.place}</div>}
        <div className="cert-lead">This is to certify that</div>
        <div className="cert-name">{d.name}</div>
        <div className="cert-body">
          {done ? <>has completed the programme <b>{d.programme}</b>, admitted in the academic year <b>{d.admission_year}</b>.</>
            : <>is enrolled in the programme <b>{d.programme}</b>, admitted in the academic year <b>{d.admission_year}</b>.</>}
        </div>
        <div className="cert-foot">
          <div className="cert-ids">
            <div className="cert-id"><div className="k">APAAR ID</div><div className="v">{apaar(d.apaar_id)}</div></div>
            <div className="cert-id"><div className="k">Enrolment no.</div><div className="v">{d.enrolment_no ?? "—"}</div></div>
          </div>
          <div>
            <QR className="cert-qr" text={verifyUrl(d.code)} />
            <div className="cert-code">{d.code}</div>
          </div>
          <div className="cert-sign"><span className="line">Controller of Examinations</span></div>
        </div>
      </div>
    </div>
  );
}
