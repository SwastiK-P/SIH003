import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Brand } from "../components/Shell";
import { RowCard, type RowName } from "../components/Drawings";
import { Icon } from "../components/Icons";
import { homeFor, useSession } from "../lib/session";

const FEATURES: { art: RowName; title: string; text: string }[] = [
  { art: "verify", title: "APAAR validation", text: "Every ID is checked against the APAAR registry: that it exists, is active, and that the name and date of birth match." },
  { art: "overview", title: "Intake and seat monitoring", text: "Admissions against approved intake per programme, with TFW, FN / OCI / PIO and lateral-entry caps checked as data arrives." },
  { art: "duplicates", title: "Duplicate detection", text: "Repeated rows, likely duplicate students, and the same APAAR ID enrolled at two institutions at once." },
  { art: "reports", title: "Real-time dashboards", text: "Submission status, admissions by state and programme, and an explainable risk score for every institution." },
  { art: "records", title: "Verifiable records", text: "Records signed by AICTE with a QR code, so employers and regulators can confirm them in seconds." },
  { art: "audit", title: "Consent and audit", text: "Students decide who sees their record and for how long. Every action is kept in a tamper-evident audit trail." },
];

const STEPS = [
  ["Institution", "The nodal officer signs in after admissions close."],
  ["Data upload", "A CSV file, or a direct feed from the admission system."],
  ["APAAR validation", "Each ID checked against the national registry."],
  ["Data verification", "Duplicates, intake limits and status rules."],
  ["Central repository", "Submitted with a declaration and a snapshot."],
  ["Analytics", "Monitoring across institutions, in real time."],
  ["Verification", "Signed records and consent-based access."],
];

const ROLES = [
  { who: "Institutions", line: "Submit the year's admissions and resolve every issue before submission.", items: ["Bulk upload or ERP integration", "Guided correction for each check", "Issue verifiable records"] },
  { who: "AICTE", line: "Monitor admissions across every approved institution, checked the same way.", items: ["Excess admissions by programme", "Duplicate enrolment nationwide", "Reports for policy and accreditation"] },
  { who: "Employers and regulators", line: "Confirm a student's record without contacting the institution.", items: ["Scan a certificate's QR code", "Request access with consent", "See only what is shared"] },
  { who: "Students", line: "See what institutions hold against their APAAR ID.", items: ["Approve or decline requests", "Withdraw consent at any time", "Review every access"] },
];

const ASSURANCE: [keyof typeof Icon, string, string][] = [
  ["LockKey", "Role-based access", "Each role sees only what it is permitted to see."],
  ["Fingerprint", "Tamper-evident audit trail", "Every entry is hash-chained to the one before it."],
  ["Certificate", "Digitally signed records", "Ed25519 signatures that can be checked offline."],
  ["UserCheck", "Student consent", "Time-limited, specific to the fields requested, revocable."],
  ["Eye", "Minimal disclosure", "APAAR IDs are masked on public checks and in exports."],
  ["Api", "Institution API keys", "Scoped to one institution, revocable, and logged."],
];

const CHECKS: [boolean, string, string][] = [
  [true, "APAAR ID found in registry", "7318 4620 5519"],
  [true, "Name and date of birth match", "Ishita Rao · 17 Jun 2004"],
  [true, "Not enrolled at another institution", "National check"],
  [false, "Programme within approved intake", "64 of 60 admitted"],
  [true, "Supernumerary caps respected", "TFW 3 of 3"],
];

export function Landing() {
  const { user } = useSession();
  useEffect(() => { document.title = "APAAR Registry — Student data management and verification for AICTE"; }, []);
  const enter = user ? homeFor(user.role) : "/sign-in";
  const scrollTo = (id: string) => (e: React.MouseEvent) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }); };

  return (
    <div className="site">
      <div className="utility"><div className="wrap">
        <span>Student data management and verification for AICTE-approved institutions</span>
        <span className="spacer" />
        <span className="hide-small"><span className="env-badge">Sandbox</span></span>
        <Link to="/v">Verify a record</Link>
      </div></div>

      <header className="site-header"><div className="wrap">
        <Link to="/" aria-label="APAAR Registry home"><Brand /></Link>
        <nav>
          <a href="#capabilities" onClick={scrollTo("capabilities")}>Capabilities</a>
          <a href="#process" onClick={scrollTo("process")}>How it works</a>
          <a href="#stakeholders" onClick={scrollTo("stakeholders")}>Stakeholders</a>
          <a href="#security" onClick={scrollTo("security")}>Security</a>
        </nav>
        <span className="spacer" />
        <Link className="btn quiet" to="/v">Verify a record</Link>
        <Link className="btn primary" to={enter}>{user ? "Open portal" : "Sign in"}</Link>
      </div></header>

      <section className="hero">
        <div className="wrap">
          <div>
            <span className="kicker"><Icon.Shield size={14} />APAAR-linked student records</span>
            <h1>Authentic, verifiable student records for <span>every AICTE-approved institution</span></h1>
            <p className="lede">Institutions submit student-level admissions keyed by APAAR ID. Each record is validated before it is saved, AICTE monitors admissions in real time, and authorised stakeholders verify records with the student's consent.</p>
            <div className="hero-ctas">
              <Link className="btn large on-dark" to={enter}>{user ? "Open portal" : "Sign in to the portal"}<Icon.Next size={16} /></Link>
              <Link className="btn large outline-dark" to="/v">Verify a record</Link>
            </div>
            <div className="hero-facts">
              <div><b>25 automated checks</b>on every record</div>
              <div><b>4 stakeholder portals</b>one shared registry</div>
              <div><b>Open verification</b>no account needed</div>
            </div>
          </div>
          <div className="preview" aria-label="Example of a record's validation result">
            <div className="preview-head"><span className="dots"><i /><i /><i /></span><span style={{ fontSize: 13, fontWeight: 600 }}>Validation result</span><span className="spacer" /><span className="chip small">Example record</span></div>
            {CHECKS.map(([ok, label, val]) => (
              <div key={label} className="preview-row">
                {ok ? <Icon.CheckCircle size={18} className="ok" /> : <Icon.Error size={18} className="bad" />}
                <span className="label">{label}</span><span className="val">{val}</span>
              </div>
            ))}
            <div className="notice bad" style={{ borderTop: "1px solid var(--border)" }}><Icon.Error /><div style={{ fontSize: 13 }}><b>Admissions over intake.</b> Regular admissions cannot exceed approved intake. Move students to an eligible quota or withdraw the excess.</div></div>
          </div>
        </div>
      </section>

      <section className="band" id="capabilities">
        <div className="wrap">
          <div className="band-head"><div className="overline">Capabilities</div><h2>Beyond data collection: validation, monitoring and verification</h2><p>One platform replaces annual statistical returns with complete, student-level records that can be trusted and checked.</p></div>
          <div className="features">
            {FEATURES.map((f) => <div key={f.title} className="feature"><RowCard name={f.art} size={40} /><h3>{f.title}</h3><p>{f.text}</p></div>)}
          </div>
        </div>
      </section>

      <section className="band alt" id="process">
        <div className="wrap">
          <div className="band-head"><div className="overline">How it works</div><h2>From admission desk to authorised verification</h2><p>The same sequence for every institution, so figures are comparable across states and programmes.</p></div>
          <ol className="steps">{STEPS.map(([t, d]) => <li key={t}><h3>{t}</h3><p>{d}</p></li>)}</ol>
        </div>
      </section>

      <section className="band" id="stakeholders">
        <div className="wrap">
          <div className="band-head"><div className="overline">Stakeholders</div><h2>One record, four portals</h2></div>
          <div className="roles">
            {ROLES.map((r) => (
              <div className="role" key={r.who}>
                <h3>{r.who}</h3><p>{r.line}</p>
                <ul>{r.items.map((x) => <li key={x}><Icon.Check size={15} strokeWidth={2.2} />{x}</li>)}</ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="band alt" id="security">
        <div className="wrap">
          <div className="band-head"><div className="overline">Security and privacy</div><h2>Designed for records that matter</h2></div>
          <div className="assurance">
            {ASSURANCE.map(([ic, t, d]) => { const G = Icon[ic]; return <div key={t}><span className="icon-tile" style={{ width: 36, height: 36 }}><G size={18} /></span><div><b>{t}</b><span>{d}</span></div></div>; })}
          </div>
          <div className="cta" style={{ marginTop: 40 }}>
            <div style={{ flex: "1 1 320px" }}><h2>Explore the sandbox</h2><p>Sign in as AICTE, an institution, a verifier or a student. All data shown is fictional.</p></div>
            <Link className="btn large on-dark" to={enter}>{user ? "Open portal" : "Sign in"}<Icon.Next size={16} /></Link>
          </div>
        </div>
      </section>

      <footer className="site-foot"><div className="wrap">
        <div style={{ flex: "1 1 320px" }}><Brand sub="Student data management and verification" /><p style={{ marginTop: 14, maxWidth: "36em" }}>A working prototype of an APAAR ID-based student data platform for AICTE-approved institutions. Institutions and students in the sandbox are fictional.</p></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}><b style={{ color: "#fff" }}>Portal</b><Link to="/sign-in">Sign in</Link><Link to="/v">Verify a record</Link></div>
      </div></footer>
    </div>
  );
}
