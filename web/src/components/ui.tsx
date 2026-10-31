import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icons";
import { Scene, type SceneName } from "./Drawings";
import { useSlideHover } from "../lib/slideHover";
import { n, STATUS } from "../lib/format";

// ---------- Toasts and alerts: one provider, called from anywhere

interface ToastT { id: number; text: string; kind?: "error"; action?: { label: string; run: () => void }; leaving?: boolean }
interface AlertT { title: string; message?: string; confirm: string; destructive?: boolean; field?: { label: string; placeholder?: string; required?: boolean; value?: string; multiline?: boolean }; resolve: (v: string | boolean | null) => void }

const UiCtx = createContext<{ toast: (text: string, o?: Partial<ToastT>) => void; confirm: (a: Omit<AlertT, "resolve">) => Promise<boolean>; prompt: (a: Omit<AlertT, "resolve">) => Promise<string | null> }>(null as any);
export const useUi = () => useContext(UiCtx);

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastT[]>([]);
  const [alert, setAlert] = useState<AlertT | null>(null);
  const seq = useRef(0);
  const toast = useCallback((text: string, o: Partial<ToastT> = {}) => {
    const id = ++seq.current;
    setToasts([{ id, text, ...o }]);
    setTimeout(() => setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x))), o.action ? 6000 : 3200);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), o.action ? 6300 : 3500);
  }, []);
  const confirm = useCallback((a: Omit<AlertT, "resolve">) => new Promise<boolean>((resolve) => setAlert({ ...a, resolve: (v) => resolve(!!v) })), []);
  const prompt = useCallback((a: Omit<AlertT, "resolve">) => new Promise<string | null>((resolve) => setAlert({ ...a, resolve: (v) => resolve(typeof v === "string" ? v : null) })), []);
  return (
    <UiCtx.Provider value={{ toast, confirm, prompt }}>
      {children}
      {createPortal(
        <div className="toast-wrap" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast glass${t.leaving ? " leaving" : ""}${t.kind === "error" ? " error" : ""}`} role="status">
              {t.kind === "error" ? <Icon.Error size={18} /> : <Icon.CheckCircle size={18} />}
              <span>{t.text}</span>
              {t.action && <button onClick={() => { t.action!.run(); setToasts([]); }}>{t.action.label}</button>}
            </div>
          ))}
        </div>, document.body)}
      {alert && <Alert a={alert} close={() => setAlert(null)} />}
    </UiCtx.Provider>
  );
}

function Alert({ a, close }: { a: AlertT; close: () => void }) {
  const [value, setValue] = useState(a.field?.value ?? "");
  const done = (v: string | boolean | null) => { a.resolve(v); close(); };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") done(null); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  const blocked = !!a.field?.required && !value.trim();
  return createPortal(
    <div className="alert-wrap" onPointerDown={(e) => e.target === e.currentTarget && done(null)}>
      <div className="alert" role="alertdialog" aria-labelledby="alert-title">
        <div className="alert-text">
          <div className="alert-title" id="alert-title">{a.title}</div>
          {a.message && <div className="alert-msg">{a.message}</div>}
          {a.field && (
            <label className="alert-field">
              <span className="sr-only">{a.field.label}</span>
              {a.field.multiline
                ? <textarea autoFocus rows={3} value={value} placeholder={a.field.placeholder} onChange={(e) => setValue(e.target.value)} />
                : <input autoFocus value={value} placeholder={a.field.placeholder} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !blocked && done(value)} />}
            </label>
          )}
        </div>
        <div className="alert-buttons">
          <button className="btn secondary" onClick={() => done(null)}>Cancel</button>
          <button className={`btn ${a.destructive ? "danger" : "primary"}`} disabled={blocked} autoFocus={!a.field} onClick={() => done(a.field ? value : true)}>{a.confirm}</button>
        </div>
      </div>
    </div>, document.body);
}

// ---------- Sheet

export function Sheet({ title, onClose, children, foot, side, width, actions }: { title: ReactNode; onClose: () => void; children: ReactNode; foot?: ReactNode; side?: boolean; width?: number; actions?: ReactNode }) {
  const [leaving, setLeaving] = useState(false);
  const close = useCallback(() => { setLeaving(true); setTimeout(onClose, 190); }, [onClose]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector(".alert-wrap")) close(); };
    window.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, [close]);
  return createPortal(
    <>
      <div className={`scrim${leaving ? " leaving" : ""}`} onClick={close} />
      <div className={`sheet${side ? " side" : ""}${leaving ? " leaving" : ""}`} role="dialog" aria-modal="true" style={width ? { ["--sheet-w" as any]: `${width}px` } : undefined}>
        <div className={`sheet-bar${actions ? " wide-actions" : ""}`}>
          <button className="btn glass icon" onClick={close} aria-label="Close"><Icon.Close /></button>
          <div className="sheet-title">{title}</div>
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>{actions}</div>
        </div>
        <div className="sheet-body">{children}</div>
        {foot && <div className="sheet-foot">{foot}</div>}
      </div>
    </>, document.body);
}

// ---------- Segmented switch: one highlight slides between options

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode; count?: number }[]; onChange: (v: T) => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  const first = useRef(true);
  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(`[aria-checked="true"]`), t = thumb.current;
    if (!el || !t) return;
    if (first.current) { t.style.transition = "none"; }
    t.style.width = `${el.offsetWidth}px`; t.style.transform = `translateX(${el.offsetLeft}px)`;
    if (first.current) { void t.offsetWidth; t.style.transition = ""; first.current = false; }
  });
  return (
    <div className="seg glass" role="radiogroup" aria-label={label} ref={ref}>
      <span className="seg-thumb" ref={thumb} />
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}{o.count != null && <span className="count">{n(o.count)}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------- Menu: anchored to its button, opens from it

export function MenuButton({ label, children, className = "btn glass", align = "left", ariaLabel }: { label: ReactNode; children: (close: () => void) => ReactNode; className?: string; align?: "left" | "right"; ariaLabel?: string }) {
  const [box, setBox] = useState<DOMRect | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const { pill, handlers } = useSlideHover(".menu-item");
  useEffect(() => {
    if (!box) return;
    const off = (e: Event) => { if (!(e.target as Element).closest?.(".menu")) setBox(null); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setBox(null);
    window.addEventListener("pointerdown", off, true); window.addEventListener("scroll", off, true); window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", off, true); window.removeEventListener("scroll", off, true); window.removeEventListener("keydown", esc); };
  }, [box]);
  const style = box ? (align === "right"
    ? { top: box.bottom + 6, right: window.innerWidth - box.right, ["--origin" as any]: "top right" }
    : { top: box.bottom + 6, left: Math.min(box.left, window.innerWidth - 230), ["--origin" as any]: "top left" }) : undefined;
  return (
    <>
      <button ref={btn} className={className} aria-haspopup="menu" aria-expanded={!!box} aria-label={ariaLabel} onClick={() => setBox(box ? null : btn.current!.getBoundingClientRect())}>{label}</button>
      {box && createPortal(<div className="menu glass" role="menu" style={style} {...handlers}><span className="slide-hover" ref={pill} />{children(() => setBox(null))}</div>, document.body)}
    </>
  );
}

export function MenuItem({ children, onClick, on, lead, trail }: { children: ReactNode; onClick: () => void; on?: boolean; lead?: ReactNode; trail?: ReactNode }) {
  return (
    <button className={`menu-item${on ? " on" : ""}`} role="menuitemradio" aria-checked={!!on} onClick={onClick}>
      <span className="lead">{lead ?? (on ? <Icon.Check size={16} strokeWidth={2.4} /> : null)}</span>
      <span style={{ minWidth: 0, flex: 1 }}>{children}</span>
      {trail != null && <span className="trail">{trail}</span>}
    </button>
  );
}

// ---------- Tables with the sliding hover pill

export function Table({ cols, head, children, className = "" }: { cols: string; head?: ReactNode; children: ReactNode; className?: string }) {
  const { pill, handlers } = useSlideHover(".t-row.hoverable");
  return (
    <div className={`table ${className}`} style={{ ["--cols" as any]: cols }} {...handlers}>
      <span className="slide-hover" ref={pill} />
      {head && <div className="t-head">{head}</div>}
      {children}
    </div>
  );
}

// ---------- Small pieces

export function Empty({ scene = "empty", title, text, action }: { scene?: SceneName; title: string; text?: ReactNode; action?: ReactNode }) {
  return <div className="empty"><Scene name={scene} /><div className="empty-title">{title}</div>{text && <div className="empty-text">{text}</div>}{action}</div>;
}

export const SubmissionState = ({ status }: { status: string }) => <span className={`state ${status}`}>{STATUS[status] ?? status}</span>;

export function Severity({ s, count, label }: { s: "error" | "warning"; count?: number; label?: string }) {
  return <span className={`chip small ${s === "error" ? "bad" : "warn"}`}><span className="dot" />{label ?? (s === "error" ? "Error" : "Warning")}{count != null && <> · {n(count)}</>}</span>;
}

export function Loading({ rows = 4 }: { rows?: number }) {
  return <div className="panel" aria-busy="true">{Array.from({ length: rows }, (_, i) => <div key={i} style={{ padding: "16px 18px" }}><div className="skeleton" style={{ height: 14, width: `${70 - i * 9}%` }} /></div>)}</div>;
}

export function ErrorNote({ text, retry }: { text: string; retry?: () => void }) {
  return <div className="panel"><div className="empty" style={{ padding: 32 }}><div className="empty-title" style={{ fontSize: 17 }}>Couldn't load this</div><div className="empty-text">{text}</div>{retry && <button className="btn quiet" onClick={retry}><Icon.Refresh size={16} />Try again</button>}</div></div>;
}

export function Copyable({ text, label }: { text: string; label?: string }) {
  const { toast } = useUi();
  return <button className="btn small quiet" onClick={() => navigator.clipboard.writeText(text).then(() => toast(`${label ?? "Copied"} to clipboard`))}><Icon.Copy size={15} />Copy</button>;
}

export function Pager({ page, size, total, onPage }: { page: number; size: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages < 2) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px" }}>
      <span className="secondary num" style={{ fontSize: 13.5 }}>{n((page - 1) * size + 1)}–{n(Math.min(total, page * size))} of {n(total)}</span>
      <span className="spacer" />
      <button className="btn small quiet icon" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><Icon.Back size={16} /></button>
      <button className="btn small quiet icon" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><Icon.Next size={16} /></button>
    </div>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className={`field${error ? " invalid" : ""}`}>
      <span className="field-label">{label}</span>
      <div className="field-box">{children}</div>
      {(error || hint) && <div className="field-hint">{error ?? hint}</div>}
    </label>
  );
}

/** Close enough to keyboard order: the bars hidden until scrolled. */
export function useScrolled() {
  const [s, setS] = useState(false);
  useEffect(() => { const f = () => setS(window.scrollY > 40); f(); window.addEventListener("scroll", f, { passive: true }); return () => window.removeEventListener("scroll", f); }, []);
  return s;
}
