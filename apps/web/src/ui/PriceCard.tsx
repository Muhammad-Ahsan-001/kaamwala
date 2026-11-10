import { Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { rupees } from "../data/labels";
import { cue } from "../lib/audio";
import { useSettings } from "../lib/settings";
import { PriceMath } from "./hire";
import { Card, cx } from "./primitives";

/** Long totals must still fit between the two buttons on a 360px phone. */
const amountSize = (value: number) => (value >= 100_000 ? "text-xl" : value >= 10_000 ? "text-2xl" : "text-3xl");

/** Price per day: moves only in the admin's fixed step and never goes below the floor. */
export function PriceCard({
  label,
  value,
  step,
  floor,
  days,
  onStep,
  busy,
  note,
}: {
  label: string;
  value: number;
  step: number;
  floor: number;
  days: number;
  onStep: (direction: "up" | "down") => void;
  busy?: boolean;
  /** One line under the price, such as who last changed it. */
  note?: ReactNode;
}) {
  const { t, audioCues } = useSettings();
  const canLower = value - step >= floor;

  const press = (direction: "up" | "down") => {
    cue(direction, audioCues);
    onStep(direction);
  };

  return (
    <Card>
      <p className="text-center text-sm text-soft">{label}</p>
      <div dir="ltr" className="mt-1 flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={!canLower || busy}
          onClick={() => press("down")}
          aria-label={t(`${step} روپے کم`, `${step} rupay kam`, `Lower by ${step}`)}
          className="latin flex h-[72px] w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-sunken text-ink transition active:scale-95 disabled:opacity-35"
        >
          <Minus className="h-6 w-6" aria-hidden />
          <span className="text-xs font-bold">{step}</span>
        </button>
        <div className="min-w-0 flex-1 text-center">
          <output key={value} className={cx("latin block animate-pop whitespace-nowrap font-extrabold tracking-tight", amountSize(value))} aria-live="polite">
            {rupees(value)}
          </output>
          <span className="text-sm text-soft">/ {t("دن", "din", "day")}</span>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => press("up")}
          aria-label={t(`${step} روپے زیادہ`, `${step} rupay zyada`, `Raise by ${step}`)}
          className="latin flex h-[72px] w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-brand-600 text-white transition active:scale-95 disabled:opacity-35"
        >
          <Plus className="h-6 w-6" aria-hidden />
          <span className="text-xs font-bold">{step}</span>
        </button>
      </div>
      {days > 1 && <PriceMath perDay={value} days={days} className="mt-2 text-sm" />}
      <p className="mt-1 text-center text-sm font-semibold text-amber-700">
        {canLower ? t("کم از کم", "Kam az kam", "Minimum") : t("یہی کم از کم ہے", "Yehi kam az kam hai", "This is the minimum")} <span className="latin">{rupees(floor)}</span>
      </p>
      {note && <p className="text-center text-sm text-soft">{note}</p>}
    </Card>
  );
}
