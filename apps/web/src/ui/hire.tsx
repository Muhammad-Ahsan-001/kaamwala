import { CalendarDays, CheckCheck, Lock, Minus, Plus } from "lucide-react";
import type { JobDay } from "../data";
import { rupees } from "../data/labels";
import { cue } from "../lib/audio";
import { MAX_DAYS, MAX_START_AHEAD, MIN_DAYS, addDays, dateLabel, rangeLabel, today } from "../lib/dates";
import { useSettings } from "../lib/settings";
import { Card, Chip, cx } from "./primitives";

const DAY_PRESETS = [1, 2, 3, 5, 7];

export type Schedule = { durationDays: number; startDate: string };

export const defaultSchedule = (durationDays = 1): Schedule => ({ durationDays, startDate: today() });

/** "Kitne din?" and "Kab se?": used by every way of hiring. */
export function DurationPicker({ value, onChange }: { value: Schedule; onChange: (next: Schedule) => void }) {
  const { t, lang, audioCues } = useSettings();
  const { durationDays, startDate } = value;
  const first = today();
  const second = addDays(first, 1);
  const last = addDays(first, MAX_START_AHEAD);
  const customDate = startDate !== first && startDate !== second;

  const setDays = (next: number) => {
    const days = Math.min(MAX_DAYS, Math.max(MIN_DAYS, next));
    if (days !== durationDays) cue("tap", audioCues);
    onChange({ ...value, durationDays: days });
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-lg">{t("کتنے دن؟", "Kitne din?", "How many days?")}</h3>
        <div className="grid grid-cols-5 gap-2">
          {DAY_PRESETS.map((days) => (
            <button
              key={days}
              type="button"
              aria-pressed={durationDays === days}
              onClick={() => setDays(days)}
              className={cx("latin h-14 rounded-2xl text-xl font-extrabold transition active:scale-95", durationDays === days ? "bg-brand-600 text-white" : "border border-line bg-surface text-ink")}
            >
              {days}
            </button>
          ))}
        </div>
        <div dir="ltr" className="mt-2 flex items-center gap-2 rounded-2xl bg-sunken p-1">
          <button type="button" onClick={() => setDays(durationDays - 1)} disabled={durationDays <= MIN_DAYS} aria-label={t("ایک دن کم", "Ek din kam", "One day fewer")} className="flex h-12 w-14 items-center justify-center rounded-xl bg-surface text-ink transition active:scale-95 disabled:opacity-40">
            <Minus className="h-6 w-6" aria-hidden />
          </button>
          <output className="flex-1 text-center text-lg font-bold" aria-live="polite">
            <span className="latin">{durationDays}</span> {t("دن", "din", durationDays === 1 ? "day" : "days")}
          </output>
          <button type="button" onClick={() => setDays(durationDays + 1)} disabled={durationDays >= MAX_DAYS} aria-label={t("ایک دن زیادہ", "Ek din zyada", "One more day")} className="flex h-12 w-14 items-center justify-center rounded-xl bg-brand-600 text-white transition active:scale-95 disabled:opacity-40">
            <Plus className="h-6 w-6" aria-hidden />
          </button>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-lg">{t("کب سے؟", "Kab se?", "Starting when?")}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Chip active={startDate === first} onClick={() => onChange({ ...value, startDate: first })}>
            {t("آج", "Aaj", "Today")}
          </Chip>
          <Chip active={startDate === second} onClick={() => onChange({ ...value, startDate: second })}>
            {t("کل", "Kal", "Tomorrow")}
          </Chip>
          <label className={cx("relative inline-flex min-h-12 min-w-28 flex-1 items-center justify-center gap-2 rounded-full border px-4 font-semibold focus-within:ring-2 focus-within:ring-brand-500", customDate ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-surface text-soft")}>
            <CalendarDays className="h-5 w-5 shrink-0" aria-hidden />
            {customDate ? dateLabel(startDate, lang) : t("تاریخ چنیں", "Tareekh chunein", "Pick a date")}
            <input
              type="date"
              min={first}
              max={last}
              value={startDate}
              aria-label={t("تاریخ چنیں", "Tareekh chunein", "Pick a date")}
              onChange={(event) => {
                const picked = event.target.value;
                if (picked && picked >= first && picked <= last) onChange({ ...value, startDate: picked });
              }}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
        </div>
        {durationDays > 1 && (
          <p className="mt-2 text-sm font-semibold text-soft">
            <CalendarDays className="me-1 inline h-4 w-4" aria-hidden />
            {rangeLabel(startDate, durationDays, lang)}
          </p>
        )}
      </div>
    </div>
  );
}

/** Per-day price, days and total, e.g. Rs 1,000 / din × 3 din = Rs 3,000. */
export function PriceMath({ perDay, days, className }: { perDay: number; days: number; className?: string }) {
  const { t } = useSettings();
  const unit = t("دن", "din", days === 1 ? "day" : "days");
  return (
    <p className={cx("flex flex-wrap items-baseline justify-center gap-x-1.5 font-semibold", className)}>
      <span>
        <span className="latin">{rupees(perDay)}</span> / {t("دن", "din", "day")}
      </span>
      <span>
        × <span className="latin">{days}</span> {unit}
      </span>
      <span className="font-extrabold text-brand-700">
        = <span className="latin">{rupees(perDay * days)}</span>
      </span>
    </p>
  );
}

export function BusyNotice() {
  const { t } = useSettings();
  return (
    <p className="flex items-center gap-2 rounded-2xl bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-800">
      <Lock className="h-4 w-4 shrink-0" aria-hidden />
      {t("بکنگ پکی ہونے سے کام ختم ہونے تک کاریگر مصروف رہے گا۔", "Booking pakki hone se kaam khatam hone tak kaarigar masroof rahega.", "The worker stays busy from confirmation until the job ends.")}
    </p>
  );
}

/** "Din 2 / 5" progress for a job that runs over several days. */
export function DayProgress({ days }: { days: JobDay[] }) {
  const { t, lang } = useSettings();
  const done = days.filter((d) => d.status === "completed").length;
  const current = Math.min(days.length, done + 1);
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-lg font-bold">
          {t("دن", "Din", "Day")} <span dir="ltr" className="latin inline-block">{current} / {days.length}</span>
        </span>
        <span className="flex items-center gap-1 text-sm font-semibold text-brand-700">
          <CheckCheck className="h-4 w-4" aria-hidden />
          <span className="latin">{done}</span> {t("مکمل", "mukammal", "done")}
        </span>
      </div>
      <ol dir="ltr" className="m-0 mt-2 flex list-none gap-1 p-0" aria-label={t("دنوں کی پیش رفت", "Dinon ki progress", "Day progress")}>
        {days.map((day) => (
          <li
            key={day.dayNumber}
            title={dateLabel(day.date, lang)}
            className={cx(
              "h-2.5 min-w-0 flex-1 rounded-full transition-colors duration-300",
              day.status === "completed" ? "bg-brand-600" : day.status === "skipped" ? "bg-busy-100" : day.dayNumber === current ? "animate-pulse bg-brand-200" : "bg-line",
            )}
          />
        ))}
      </ol>
    </Card>
  );
}
