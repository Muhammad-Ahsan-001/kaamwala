import { CalendarDays, CheckCheck, Lock, MapPin, Minus, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { data, type Area, type JobDay, type LatLng, type ProblemAnalysis } from "../data";
import { areaName, rupees } from "../data/labels";
import { cue } from "../lib/audio";
import { MAX_DAYS, MAX_START_AHEAD, MIN_DAYS, addDays, dateLabel, rangeLabel, today } from "../lib/dates";
import { useSettings, type Lang } from "../lib/settings";
import { useData } from "../lib/useData";
import { Async, type Query } from "./async";
import { Auto, Card, Chip, Sheet, cx } from "./primitives";
import { Asked } from "./QuestionVoice";

const DAY_PRESETS = [1, 2, 3, 5, 7];

export type Schedule = { durationDays: number; startDate: string };

export const defaultSchedule = (durationDays = 1): Schedule => ({ durationDays, startDate: today() });

/** A schedule carried in a link, kept within what a booking allows. */
export function scheduleFromLink(params: URLSearchParams): Schedule {
  const days = Number(params.get("days"));
  const start = params.get("start") ?? "";
  const first = today();
  return {
    durationDays: Number.isInteger(days) && days >= MIN_DAYS && days <= MAX_DAYS ? days : MIN_DAYS,
    startDate: /^\d{4}-\d{2}-\d{2}$/.test(start) && start >= first && start <= addDays(first, MAX_START_AHEAD) ? start : first,
  };
}

export type DescribeMode = "voice" | "photo" | "text";

/** The problem just described. It waits here while the customer looks at workers, so it goes with their request. */
export type DescribedProblem = {
  analysis: ProblemAnalysis;
  /** Set only when the customer corrected the trade. */
  chosenCategory: string | null;
  schedule: Schedule;
  text: string;
  photo: Blob | null;
  mode: DescribeMode;
};

let describedProblem: DescribedProblem | null = null;

export const recallProblem = () => describedProblem;
export const rememberProblem = (problem: DescribedProblem) => {
  describedProblem = problem;
};
export const forgetProblem = () => {
  describedProblem = null;
};

/** What the worker reads: the customer's own words when there are any. */
export function problemDescription(problem: Pick<DescribedProblem, "analysis" | "text">): string {
  return (problem.analysis.transcript?.trim() || problem.text.trim() || problem.analysis.summary.trim()).slice(0, 2000);
}

export type JobPlace = { area: string; location: LatLng };

const placeOf = (area: Area): JobPlace => ({ area: area.name, location: { lat: area.lat, lng: area.lng } });

function nearestArea(point: LatLng, areas: Area[]): Area | null {
  const gap = (area: Area) => (area.lat - point.lat) ** 2 + (area.lng - point.lng) ** 2;
  return areas.reduce<Area | null>((best, area) => (!best || gap(area) < gap(best) ? area : best), null);
}

/** Sector codes are written the same in Urdu. Named places use their Urdu name. */
export function placeName(name: string, areas: Area[] | null, lang: Lang): string {
  if (lang !== "ur" || /^[A-Z]-\d+$/.test(name)) return name;
  return areas?.find((area) => area.name === name)?.nameUr ?? areaName(name, lang);
}

/** Where a customer's job is: their saved place, or an area they pick. Never an invented location. */
export function useJobPlace() {
  const hirer = useData(() => data.getHirer("me"), []);
  const areas = useData(() => data.getAreas(), []);
  const [picked, setPicked] = useState<JobPlace | null>(null);

  const saved = useMemo<JobPlace | null>(() => {
    const profile = hirer.data;
    const list = areas.data ?? [];
    if (!profile) return null;
    if (profile.location) {
      const area = profile.area ?? nearestArea(profile.location, list)?.name;
      return area ? { area, location: profile.location } : null;
    }
    const named = list.find((area) => area.name.toLowerCase() === profile.area?.toLowerCase());
    return named ? placeOf(named) : null;
  }, [hirer.data, areas.data]);

  const pick = (area: Area) => {
    const place = placeOf(area);
    setPicked(place);
    // The first area this customer gives is saved, so they are not asked again. A later pick is for this job only.
    if (hirer.data && !hirer.data.area) void data.updateMyCustomer(place).catch(() => undefined);
  };

  return { place: picked ?? saved, areas, loading: hirer.loading || areas.loading, pick };
}

/** Every area the app knows, from the API, with a search box. */
export function AreaSheet({ areas, onPick, onClose }: { areas: Query<Area[]>; onPick: (area: Area) => void; onClose: () => void }) {
  const { t, lang } = useSettings();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();

  return (
    <Sheet title={t("علاقہ چنیں", "Ilaqa chunein", "Choose an area")} onClose={onClose}>
      <div className="sticky -top-5 z-10 -mx-1 bg-surface px-1 pb-2 pt-1">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-faint" aria-hidden />
          <input
            type="search"
            dir="auto"
            className="field ps-11"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={t("علاقہ تلاش کریں", "Ilaqa talash karein", "Search areas")}
            placeholder={t("جیسے G-9 یا صدر", "Jaise G-9 ya Saddar", "e.g. G-9 or Saddar")}
          />
        </div>
      </div>
      <Async query={areas}>
        {(list) => {
          const shown = [...list]
            .filter((area) => !needle || area.name.toLowerCase().includes(needle) || area.nameUr.includes(needle))
            .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
          if (shown.length === 0) return <p className="py-4 text-center text-soft">{t("یہ علاقہ نہیں ملا", "Ye ilaqa nahi mila", "No area found")}</p>;
          return (
            <div className="grid grid-cols-2 gap-2">
              {shown.map((area) => (
                <button key={area.name} type="button" onClick={() => onPick(area)} className="min-h-12 rounded-2xl border border-line bg-page px-2 font-semibold transition active:scale-95">
                  <Auto text={placeName(area.name, list, lang)} />
                </button>
              ))}
            </div>
          );
        }}
      </Async>
    </Sheet>
  );
}

/** "Kaam kahan hai?": asks for an area when none is known yet. */
export function JobPlaceRow({ jobPlace }: { jobPlace: ReturnType<typeof useJobPlace> }) {
  const { t, lang } = useSettings();
  const [open, setOpen] = useState(false);
  const { place, areas, loading, pick } = jobPlace;
  const missing = !place && !loading;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cx("flex min-h-14 w-full items-center gap-2 rounded-2xl border px-3 text-start font-semibold transition active:scale-[0.99]", missing ? "border-amber-400 bg-amber-50" : "border-line bg-surface")}
      >
        <MapPin className="h-5 w-5 shrink-0 text-brand-600" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{place ? <Auto text={placeName(place.area, areas.data, lang)} /> : loading ? "…" : t("پہلے علاقہ چنیں", "Pehle ilaqa chunein", "Choose your area first")}</span>
        <span className="shrink-0 text-sm font-bold text-brand-700">{place ? t("بدلیں", "Badlein", "Change") : t("چنیں", "Chunein", "Choose")}</span>
      </button>
      {open && (
        <AreaSheet
          areas={areas}
          onClose={() => setOpen(false)}
          onPick={(area) => {
            pick(area);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

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
        <Asked voice="job-days" className="mb-2">
          <h3 className="text-lg">{t("کتنے دن؟", "Kitne din?", "How many days?")}</h3>
        </Asked>
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
        <Asked voice="job-start" className="mb-2">
          <h3 className="text-lg">{t("کب سے؟", "Kab se?", "Starting when?")}</h3>
        </Asked>
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
              onClick={(event) => {
                try {
                  event.currentTarget.showPicker?.();
                } catch {
                  // Some browsers only open it themselves.
                }
              }}
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
