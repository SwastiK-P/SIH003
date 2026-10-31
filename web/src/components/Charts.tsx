import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { n, pct } from "../lib/format";

/**
 * Charts, drawn by hand so they read as part of the app: thin marks, 4px rounded data-ends from one
 * baseline, hairline grid, a 2px surface gap between touching marks, a tooltip on every mark.
 */

export const SEATS = [
  { key: "regular", label: "Regular", color: "var(--s-regular)" },
  { key: "tfw", label: "TFW", color: "var(--s-tfw)" },
  { key: "fn", label: "FN / OCI / PIO", color: "var(--s-fn)" },
  { key: "lateral", label: "Lateral", color: "var(--s-lateral)" },
] as const;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function useTip() {
  const [tip, setTip] = useState<{ x: number; y: number; body: ReactNode } | null>(null);
  const el = tip && <div className="chart-tip" style={{ left: tip.x, top: tip.y }}>{tip.body}</div>;
  return { tip: el, show: (e: React.PointerEvent, body: ReactNode) => { const b = (e.currentTarget as Element).closest(".chart")!.getBoundingClientRect(); setTip({ x: e.clientX - b.left, y: e.clientY - b.top, body }); }, hide: () => setTip(null) };
}

/** Admissions in a programme against its approved intake: seat types side by side, the excess in red past the intake line. */
export function SeatMeter({ approved, regular, tfw, fn, lateral, big }: { approved: number; regular: number; tfw: number; fn: number; lateral: number; big?: boolean }) {
  const total = regular + tfw + fn + lateral;
  const scale = Math.max(approved * 1.08, total, 1);
  const within = Math.min(regular, approved), over = Math.max(0, regular - approved);
  const parts = [
    { w: within, c: "var(--s-regular)" }, { w: over, c: "var(--red)" },
    { w: tfw, c: "var(--s-tfw)" }, { w: fn, c: "var(--s-fn)" }, { w: lateral, c: "var(--s-lateral)" },
  ].filter((p) => p.w > 0);
  return (
    <div className={`seat-meter${big ? " big" : ""}`} role="img" aria-label={`${regular} regular of ${approved} approved; ${tfw} TFW, ${fn} FN/OCI/PIO, ${lateral} lateral`}>
      <div className="seat-track">
        {parts.map((p, i) => <span key={i} style={{ width: `${(p.w / scale) * 100}%`, background: p.c }} />)}
      </div>
      <i className="seat-line" style={{ left: `${(approved / scale) * 100}%` }} />
    </div>
  );
}

export function SeatLegend({ q }: { q?: Partial<Record<string, number>> }) {
  return (
    <div className="legend">
      {SEATS.map((s) => <span key={s.key} style={{ ["--c" as any]: s.color }}><i />{s.label}{q && <b>{n(q[s.key] ?? 0)}</b>}</span>)}
      <span style={{ ["--c" as any]: "var(--red)" }}><i />Over intake{q && <b>{n(q.over ?? 0)}</b>}</span>
    </div>
  );
}

/** Columns over time, one series. Value on hover; the last column labelled. */
export function Columns({ data, label, height = 150, unit = "" }: { data: { x: string; y: number; label?: string }[]; label: string; height?: number; unit?: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  const max = Math.max(1, ...data.map((d) => d.y));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const padL = 34, padB = 22, ih = height - padB - 8;
  const bw = data.length ? (w - padL) / data.length : 0;
  const barW = Math.min(18, Math.max(2, bw - 2));
  const ticks = Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => i * step);
  return (
    <div className="chart" ref={ref} aria-label={label}>
      {w > 0 && (
        <svg width={w} height={height} role="img">
          {ticks.map((t) => { const y = 8 + ih - (t / top) * ih; return <g key={t}><line x1={padL} x2={w} y1={y} y2={y} className="grid-line" /><text x={padL - 8} y={y + 4} className="axis" textAnchor="end">{compactTick(t)}</text></g>; })}
          {data.map((d, i) => {
            const h = (d.y / top) * ih, x = padL + i * bw + (bw - barW) / 2, y = 8 + ih - h;
            return (
              <g key={d.x} onPointerMove={(e) => show(e, <><b>{n(d.y)}{unit}</b><span>{d.label ?? d.x}</span></>)} onPointerLeave={hide}>
                <rect x={padL + i * bw} y={8} width={bw} height={ih} fill="transparent" />
                {h > 0 && <path d={roundTop(x, y, barW, h, Math.min(4, barW / 2))} className={i === data.length - 1 ? "col last" : "col"} />}
              </g>
            );
          })}
          {data.filter((_, i) => i % Math.ceil(data.length / 6) === 0 || i === data.length - 1).map((d) => {
            const i = data.indexOf(d);
            return <text key={d.x} x={padL + i * bw + bw / 2} y={height - 6} className="axis" textAnchor="middle">{d.label ?? d.x}</text>;
          })}
        </svg>
      )}
      {tip}
    </div>
  );
}

/** Ranked horizontal bars, one series; value at the tip. */
export function Bars({ rows, format = n, onPick }: { rows: { key: string; label: ReactNode; value: number; note?: string; tone?: "bad" | "warn" }[]; format?: (v: number) => string; onPick?: (k: string) => void }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="hbars">
      {rows.map((r) => {
        const Row = onPick ? "button" : "div";
        return (
          <Row key={r.key} className="hbar" onClick={onPick ? () => onPick(r.key) : undefined} title={r.note}>
            <span className="hbar-label">{r.label}</span>
            <span className="hbar-track"><span className={`hbar-fill ${r.tone ?? ""}`} style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%` }} /></span>
            <span className="hbar-value">{format(r.value)}</span>
          </Row>
        );
      })}
    </div>
  );
}

/** Admitted against approved: the intake is the track, admissions fill it, any excess runs past in red. */
export function Bullets({ rows }: { rows: { key: string; label: string; approved: number; enrolled: number; note?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.approved, r.enrolled)));
  const { tip, show, hide } = useTip();
  return (
    <div className="chart bullets">
      {rows.map((r) => {
        const within = Math.min(r.enrolled, r.approved), over = Math.max(0, r.enrolled - r.approved);
        return (
          <div key={r.key} className="bullet" onPointerMove={(e) => show(e, <><b>{r.label}</b><span>{n(r.enrolled)} admitted of {n(r.approved)} approved · {pct(r.enrolled, r.approved)}</span>{over > 0 && <span className="bad">{n(over)} over intake</span>}</>)} onPointerLeave={hide}>
            <span className="bullet-label">{r.label}</span>
            <span className="bullet-track">
              <span className="bullet-cap" style={{ width: `${(r.approved / max) * 100}%` }} />
              <span className="bullet-fill" style={{ width: `${(within / max) * 100}%` }} />
              {over > 0 && <span className="bullet-over" style={{ left: `calc(${(r.approved / max) * 100}% + 2px)`, width: `max(3px, ${(over / max) * 100}%)` }} />}
            </span>
            <span className="bullet-value num">{pct(r.enrolled, r.approved)}</span>
          </div>
        );
      })}
      {tip}
    </div>
  );
}

/** Parts of a whole, one bar, with a legend that carries the numbers. */
export function Stack({ parts }: { parts: { key: string; label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const { tip, show, hide } = useTip();
  return (
    <div className="chart">
      <div className="stack-bar">
        {parts.filter((p) => p.value > 0).map((p) => (
          <span key={p.key} style={{ flexGrow: p.value, background: p.color }} onPointerMove={(e) => show(e, <><b>{p.label}</b><span>{n(p.value)} · {pct(p.value, total, 1)}</span></>)} onPointerLeave={hide} />
        ))}
      </div>
      <div className="legend" style={{ marginTop: 12 }}>
        {parts.map((p) => <span key={p.key} style={{ ["--c" as any]: p.color }}><i />{p.label}<b>{n(p.value)}</b><span className="tertiary">{pct(p.value, total, 1)}</span></span>)}
      </div>
      {tip}
    </div>
  );
}

/** A 0–100 score as a short ruled meter: the fill carries severity. */
export function RiskMeter({ score, level }: { score: number; level: "low" | "medium" | "high" }) {
  return (
    <span className={`risk ${level}`} title={`Risk ${score} of 100`}>
      <span className="risk-num num">{score}</span>
      <span className="risk-track"><span style={{ width: `${Math.max(4, score)}%` }} /></span>
    </span>
  );
}

function niceStep(max: number) {
  const raw = max / 4, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag;
}
const compactTick = (t: number) => (t >= 1000 ? `${t / 1000}K` : String(t));
function roundTop(x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
