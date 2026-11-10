import { useState } from "react";
import { cx } from "./primitives";

export type Bar = { key: string; label: string; value: number; display: string; emphasised?: boolean };

/** A single-series bar chart: thin rounded bars on one baseline, with a label per bar on hover or tap. */
export function Bars({ bars, title, height = 120 }: { bars: Bar[]; title: string; height?: number }) {
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(1, ...bars.map((b) => b.value));
  const emphasised = bars.find((b) => b.emphasised);

  return (
    <figure className="m-0">
      <figcaption className="sr-only">
        {title}: {bars.map((b) => `${b.label} ${b.display}`).join(", ")}
      </figcaption>
      <div dir="ltr" aria-hidden className="flex items-end justify-between gap-1 border-b border-line" style={{ height }} onMouseLeave={() => setActive(null)}>
        {bars.map((bar) => {
          const barHeight = bar.value === 0 ? 3 : Math.max(6, (bar.value / max) * (height - 26));
          const showLabel = active ? active === bar.key : emphasised?.key === bar.key;
          return (
            <div key={bar.key} className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-end" onMouseEnter={() => setActive(bar.key)} onClick={() => setActive(bar.key)}>
              {showLabel && <span className="latin mb-1 whitespace-nowrap text-xs font-bold text-ink">{bar.display}</span>}
              <span className={cx("block w-4 rounded-t transition-colors", bar.value === 0 ? "bg-line" : bar.emphasised || active === bar.key ? "bg-brand-600" : "bg-brand-200")} style={{ height: barHeight }} />
            </div>
          );
        })}
      </div>
      <div dir="ltr" aria-hidden className="mt-1 flex justify-between gap-1">
        {bars.map((bar) => (
          <span key={bar.key} className="latin min-w-0 flex-1 text-center text-xs text-soft">
            {bar.label}
          </span>
        ))}
      </div>
    </figure>
  );
}
