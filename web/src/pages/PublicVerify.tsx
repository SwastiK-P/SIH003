import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { Brand } from "../components/Shell";
import { Icon } from "../components/Icons";
import { Scene } from "../components/Drawings";
import { VerifyResult } from "../components/VerifyResult";
import { codeFrom } from "./verifier/Verify";

/** Where a certificate's QR lands. Anyone can check a record here; no account needed. */
export function PublicVerify() {
  const { id } = useParams();
  const nav = useNavigate();
  const [text, setText] = useState(id ?? "");
  const [r, setR] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    document.title = "Verify a record · APAAR Registry";
    if (!id) { setR(null); return; }
    setBusy(true); setErr(null); setText(id);
    api(`/public/credentials/${id}`).then(setR).catch((e) => { setR(null); setErr(e.message); }).finally(() => setBusy(false));
  }, [id]);
  const code = codeFrom(text);
  return (
    <div className="solo">
      <div className="solo-top"><div className="wrap"><Link to="/"><Brand /></Link><span className="spacer" /><Link className="btn secondary" to="/sign-in">Sign in</Link></div></div>
      <div className="solo-body">
        <div className="solo-col">
          <h1>Verify a student record</h1>
          <p className="lede">Enter the code printed beneath the QR code on a certificate. You will see whether AICTE issued it, whether it is still valid, and what it states.</p>
          <form className="toolbar" style={{ marginTop: 20 }} onSubmit={(e) => { e.preventDefault(); if (code) nav(`/v/${code}`); }}>
            <label className="search" style={{ maxWidth: 360 }}><Icon.QR size={17} /><input value={text} onChange={(e) => setText(e.target.value)} placeholder="XXXX-XXXX-XX" aria-label="Record code" spellCheck={false} autoFocus={!id} /></label>
            <button className="btn primary" disabled={!code || busy}>{busy && <Icon.Spinner className="spin" size={16} />}Verify</button>
          </form>
          {err && <section className="panel"><div className="notice bad"><Icon.Error /><div>{err}</div></div></section>}
          {r && <VerifyResult r={r} />}
          {!r && !err && !busy && (
            <section className="panel"><div className="empty"><Scene name="record" /><div className="empty-title" style={{ marginTop: 14 }}>No record checked yet</div><div className="empty-text">Scanning a certificate's QR code opens this page with the code already filled in.</div></div></section>
          )}
        </div>
      </div>
    </div>
  );
}
