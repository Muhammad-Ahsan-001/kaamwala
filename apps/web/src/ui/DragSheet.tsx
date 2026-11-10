import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

/** Resting positions, as a share of the sheet's own height hidden below the fold. */
const SNAPS = [0, 0.42, 0.78];
const HALF = 1;
const PEEK = 2;
export const SHEET_DEFAULT_VISIBLE = 0.93 * (1 - (SNAPS[HALF] ?? 0));

/**
 * A bottom sheet you can drag between full, half and peek. The handle also works by tap and keyboard.
 * When revealKey changes to a value, the sheet comes up from peek and scrolls back to the top.
 */
export function DragSheet({ header, children, label, revealKey }: { header: ReactNode; children: ReactNode; label: string; revealKey?: string | null }) {
  const [snap, setSnap] = useState(HALF);
  const panel = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; startOffset: number; lastY: number; lastTime: number; velocity: number; moved: boolean } | null>(null);

  const offset = SNAPS[snap] ?? 0;

  useEffect(() => {
    if (!revealKey) return;
    setSnap((value) => (value === PEEK ? HALF : value));
    body.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [revealKey]);

  const onDown = (event: PointerEvent<HTMLDivElement>) => {
    const height = panel.current?.offsetHeight ?? 1;
    drag.current = { startY: event.clientY, startOffset: offset * height, lastY: event.clientY, lastTime: event.timeStamp, velocity: 0, moved: false };
  };

  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || !panel.current) return;
    const height = panel.current.offsetHeight;
    const delta = event.clientY - state.startY;
    if (!state.moved) {
      if (Math.abs(delta) <= 6) return;
      // Capture only once this is really a drag, so a plain tap still reaches the handle.
      state.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      panel.current.style.transition = "none";
    }
    const elapsed = Math.max(1, event.timeStamp - state.lastTime);
    state.velocity = (event.clientY - state.lastY) / elapsed;
    state.lastY = event.clientY;
    state.lastTime = event.timeStamp;
    const max = (SNAPS[SNAPS.length - 1] ?? 0) * height;
    const next = Math.min(max, Math.max(0, state.startOffset + delta));
    panel.current.style.transform = `translate3d(0, ${next}px, 0)`;
  };

  const onUp = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    drag.current = null;
    if (!state?.moved || !panel.current) return;
    panel.current.style.transition = "";
    panel.current.style.transform = "";
    const height = panel.current.offsetHeight;
    // A quick flick carries the sheet further than where the finger stopped.
    const projected = (state.startOffset + (event.clientY - state.startY) + state.velocity * 180) / height;
    let nearest = 0;
    SNAPS.forEach((value, index) => {
      if (Math.abs(value - projected) < Math.abs((SNAPS[nearest] ?? 0) - projected)) nearest = index;
    });
    setSnap(nearest);
  };

  return (
    <div ref={panel} className="absolute inset-x-0 bottom-0 z-[450] flex h-[93%] flex-col rounded-t-4xl bg-page shadow-lift transition-transform duration-300 ease-out will-change-transform" style={{ transform: `translate3d(0, ${offset * 100}%, 0)` }}>
      <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} className="shrink-0 cursor-grab touch-none select-none active:cursor-grabbing">
        <button
          type="button"
          aria-label={label}
          onClick={() => setSnap((value) => (value === 0 ? HALF : value === HALF ? PEEK : HALF))}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp") setSnap((value) => Math.max(0, value - 1));
            if (event.key === "ArrowDown") setSnap((value) => Math.min(SNAPS.length - 1, value + 1));
          }}
          className="flex h-12 w-full items-center justify-center"
        >
          <span className="h-1.5 w-12 rounded-full bg-line" aria-hidden />
        </button>
      </div>
      <div className="shrink-0">{header}</div>
      <div ref={body} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-2" style={{ paddingBottom: `calc(${offset} * 93dvh + 1.5rem)` }}>
        {children}
      </div>
    </div>
  );
}
