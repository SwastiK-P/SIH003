import { useRef } from "react";

/** One highlight that slides between rows (DESIGN.md §7.4). Put `pill` inside a positioned container. */
export function useSlideHover(rows: string) {
  const pill = useRef<HTMLSpanElement>(null);
  const over = (e: React.PointerEvent<HTMLElement>) => {
    const el = pill.current, row = (e.target as Element).closest<HTMLElement>(rows);
    if (!el || e.pointerType !== "mouse") return;
    if (!row || !e.currentTarget.contains(row)) { el.classList.remove("on"); return; }
    const box = e.currentTarget.getBoundingClientRect(), r = row.getBoundingClientRect();
    const shown = el.classList.contains("on");
    if (!shown) el.style.transition = "none";
    el.style.transform = `translate(${r.left - box.left}px, ${r.top - box.top + e.currentTarget.scrollTop}px)`;
    el.style.width = `${r.width}px`; el.style.height = `${r.height}px`;
    if (!shown) { void el.offsetWidth; el.style.transition = ""; }
    el.classList.add("on");
  };
  return { pill, handlers: { onPointerOver: over, onPointerLeave: () => pill.current?.classList.remove("on") } };
}
