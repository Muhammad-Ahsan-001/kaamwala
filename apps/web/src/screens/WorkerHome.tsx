import { Bell, BellRing, CalendarDays, Check, CheckCheck, ChevronLeft, Eye, Flag, Hourglass, Lock, MapPin, MessageCircle, MonitorSmartphone, Send, Settings as SettingsIcon, Users, UsersRound, Volume2, Wallet, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { data, type Category, type Crew, type CrewInvite, type Job, type JobFeedItem, type LatLng, type OfflinePreset, type Offer, type WorkerCard } from "../data";
import { errorCode, errorText } from "../data/errors";
import { areaName, categoryName, firstName, isLatin, personName, rupees } from "../data/labels";
import { cue, speakUrdu } from "../lib/audio";
import { LogoutButton } from "../ui/LogoutButton";
import { clockLabel, dateLabel, isoDate, rangeLabel } from "../lib/dates";
import { staleSince } from "../lib/offline";
import { useConnection, useData } from "../lib/useData";
import { useSettings, type Lang } from "../lib/settings";
import { ErrorState } from "../ui/async";
import { CategoryIcon } from "../ui/CategoryIcon";
import { DayProgress, PriceMath } from "../ui/hire";
import { Avatar } from "../ui/people";
import { PriceCard } from "../ui/PriceCard";
import { Auto, Button, Card, Chip, EmptyState, InlineError, ListSkeleton, Rating, SectionTitle, Sheet, Skeleton, Switch, Tag, cx } from "../ui/primitives";
import { LangCycle, ReadAloud, Screen } from "../ui/shell";
import { Asked } from "../ui/QuestionVoice";

type Translate = (ur: string, roman: string, en: string) => string;

const PRESETS: { value: OfflinePreset; ur: string; roman: string; en: string }[] = [
  { value: "1h", ur: "1 گھنٹہ", roman: "1 ghanta", en: "1 hour" },
  { value: "2h", ur: "2 گھنٹے", roman: "2 ghante", en: "2 hours" },
  { value: "today", ur: "آج", roman: "Aaj", en: "Today" },
  { value: "manual", ur: "جب تک خود نہ بدلوں", roman: "Jab tak khud na badloon", en: "Until I switch back" },
];

const STATUS_WORDS = {
  farigh: { ur: "میں فارغ ہوں", hi: "मैं फ़ारिग़ हूँ", roman: "Main farigh hoon" },
  masroof: { ur: "میں مصروف ہوں", hi: "मैं मसरूफ़ हूँ", roman: "Main masroof hoon" },
} as const;

function sayStatus(word: keyof typeof STATUS_WORDS, enabled: boolean) {
  speakUrdu(STATUS_WORDS[word].ur, enabled);
}

type Mode = "available" | "busy" | "engaged" | "requested" | "pending";

function modeOf(me: WorkerCard): Mode {
  if (!me.approved) return "pending";
  if (me.status === "engaged") return "engaged";
  if (me.status === "requested") return "requested";
  if (me.status === "offline") return "busy";
  // "completed" lasts a few seconds on the way back to available.
  return "available";
}

const MODE_LOOK: Record<Mode, { bg: string; thumb: string; icon: LucideIcon }> = {
  available: { bg: "bg-brand-600", thumb: "text-brand-600", icon: Check },
  busy: { bg: "bg-busy-600", thumb: "text-busy-600", icon: Hourglass },
  engaged: { bg: "bg-soft", thumb: "text-soft", icon: Lock },
  requested: { bg: "bg-amber-700", thumb: "text-amber-700", icon: BellRing },
  pending: { bg: "bg-soft", thumb: "text-soft", icon: Hourglass },
};

function kmBetween(a: LatLng, b: LatLng) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(12742 * Math.asin(Math.sqrt(h)) * 10) / 10;
}

function ago(iso: string, t: Translate) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return t("ابھی", "Abhi", "Just now");
  if (minutes < 60) return t(`${minutes} منٹ پہلے`, `${minutes} minute pehle`, `${minutes} min ago`);
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t(`${hours} گھنٹے پہلے`, `${hours} ghante pehle`, `${hours} h ago`);
  const days = Math.round(hours / 24);
  return t(`${days} دن پہلے`, `${days} din pehle`, `${days} d ago`);
}

function useSecondTicker() {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
}

/** Its own component, so the once-a-second tick repaints only this line. */
function TimeLeft({ until }: { until: string }) {
  const { t } = useSettings();
  useSecondTicker();
  const left = new Date(until).getTime() - Date.now();
  if (left <= 0) return <>{t("بس واپس آ رہے ہیں…", "Bas wapas aa rahe hain…", "Coming back now…")}</>;
  if (left < 60_000) {
    const seconds = Math.ceil(left / 1000);
    return <>{t(`${seconds} سیکنڈ باقی`, `${seconds} second baqi`, `${seconds} seconds left`)}</>;
  }
  const minutes = Math.ceil(left / 60_000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return <>{t(`${rest} منٹ باقی`, `${rest} minute baqi`, `${rest} min left`)}</>;
  const hourWord = hours === 1 ? t("گھنٹہ", "ghanta", "h") : t("گھنٹے", "ghante", "h");
  if (rest === 0) return <>{t(`${hours} ${hourWord} باقی`, `${hours} ${hourWord} baqi`, `${hours} ${hourWord} left`)}</>;
  return <>{t(`${hours} ${hourWord} ${rest} منٹ باقی`, `${hours} ${hourWord} ${rest} minute baqi`, `${hours} ${hourWord} ${rest} min left`)}</>;
}

function StatusCard({ me, chosen, notice, error, onFlip, onPreset, onLockedTap }: { me: WorkerCard; chosen: OfflinePreset | null; notice: string | null; error: string | null; onFlip: () => void; onPreset: (preset: OfflinePreset) => void; onLockedTap: () => void }) {
  const { t, lang } = useSettings();
  const mode = modeOf(me);
  const look = MODE_LOOK[mode];
  const Icon = look.icon;
  const on = mode === "available" || mode === "requested";
  const locked = mode === "engaged" || mode === "pending";
  const [burst, setBurst] = useState(0);
  const [nudge, setNudge] = useState(0);

  const main = {
    available: t("میں فارغ ہوں", "Main farigh hoon", "I'm available"),
    busy: t("میں مصروف ہوں", "Main masroof hoon", "I'm busy"),
    engaged: t("کام جاری ہے", "Kaam jari hai", "On a job"),
    requested: t("بات جاری ہے", "Baat jari hai", "In discussion"),
    pending: t("منظوری کا انتظار", "Manzoori ka intezar", "Waiting for approval"),
  }[mode];

  const sub = {
    available: t("گاہک آپ کو دیکھ سکتے ہیں", "Customers aap ko dekh sakte hain", "Customers can see you"),
    busy: t("گاہک آپ کو نہیں دیکھ سکتے", "Customers aap ko nahi dekh sakte", "Customers cannot see you"),
    engaged: t("کام ختم ہونے تک یہ بٹن بند ہے، پھر آپ خود فارغ ہو جائیں گے", "Kaam khatam hone tak ye button band hai, phir aap khud farigh ho jayenge", "Locked until the job ends. You then become available by yourself."),
    requested: t("جواب دینے تک نئے گاہک آپ کو نہیں دیکھ سکتے", "Jawab dene tak naye customers aap ko nahi dekh sakte", "New customers cannot see you until this is settled"),
    pending: t("ایڈمن کی منظوری کے بعد آپ کام لے سکیں گے", "Admin ki manzoori ke baad aap kaam le sakenge", "You can take work once an admin approves your profile"),
  }[mode];

  const tap = () => {
    if (locked) {
      setNudge((n) => n + 1);
      onLockedTap();
      return;
    }
    setBurst((n) => n + 1);
    onFlip();
  };

  return (
    <section aria-label={t("میری حالت", "Meri halat", "My status")} className={cx("on-color overflow-hidden rounded-4xl p-4 text-white shadow-lift transition-colors duration-300", look.bg)}>
      <button type="button" role="switch" aria-checked={on} aria-disabled={locked} aria-label={main} onClick={tap} className={cx("flex min-h-24 w-full items-center gap-3 text-start", locked && "cursor-not-allowed")}>
        <span className="min-w-0 flex-1">
          <span key={main} className={cx("block animate-pop", lang === "ur" ? "ur" : "latin text-2xl font-extrabold")} style={lang === "ur" ? { fontSize: "min(1.75rem, 29px)" } : undefined}>
            {main}
          </span>
          <span key={nudge} className={cx("block text-sm text-white/90", nudge > 0 && "animate-pop")} aria-live="polite">
            {sub}
          </span>
        </span>
        <span className={cx("relative flex h-14 w-24 shrink-0 items-center rounded-full p-1 transition-colors duration-300", on ? "bg-white/30" : "bg-black/20")}>
          <span className={cx("status-thumb relative flex h-12 w-12 items-center justify-center rounded-full bg-white", look.thumb, on ? "translate-x-10 rtl:-translate-x-10" : "translate-x-0")}>
            {burst > 0 && <span key={burst} className="absolute inset-0 animate-thumb rounded-full bg-white" aria-hidden />}
            <Icon className="relative h-7 w-7" strokeWidth={2.75} aria-hidden />
          </span>
        </span>
      </button>

      {mode === "busy" && me.offlineUntil && (
        <p className="mt-1 flex flex-wrap items-center gap-x-2 rounded-2xl bg-black/15 px-3 py-1 font-semibold">
          <Hourglass className="h-4 w-4 shrink-0" aria-hidden />
          <TimeLeft until={me.offlineUntil} />
          <span className="text-sm font-normal text-white/90">
            <span className="latin">{clockLabel(me.offlineUntil)}</span> {t("پر خود فارغ", "par khud farigh", "back by itself")}
          </span>
        </p>
      )}

      {mode === "busy" && (
        <button type="button" onClick={onFlip} className="mt-2 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white text-lg font-bold text-busy-700 transition active:scale-[0.98]">
          <Check className="h-6 w-6" aria-hidden />
          {t("میں اب فارغ ہوں", "Main ab farigh hoon", "I'm available now")}
        </button>
      )}

      {!locked && mode !== "requested" && (
        <div className="mt-2 border-t border-white/25 pt-2">
          <Asked voice={mode === "busy" ? "busy-change" : "busy-how-long"} tone="onColor">
            <p className="text-sm text-white/90">{mode === "busy" ? t("وقت بدلیں", "Waqt badlein", "Change how long") : t("مصروف ہونا ہے؟ کتنی دیر؟", "Masroof hona hai? Kitni der?", "Going busy? For how long?")}</p>
          </Asked>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {PRESETS.map((preset, index) => {
              const selected = mode === "busy" && (chosen === preset.value || (preset.value === "manual" && !me.offlineUntil));
              return (
                <button key={preset.value} type="button" aria-pressed={selected} onClick={() => onPreset(preset.value)} className={cx("min-h-12 rounded-2xl px-2 font-bold transition active:scale-95", index === 3 && "col-span-3", selected ? "bg-white text-ink" : "bg-white/20 hover:bg-white/30")}>
                  {t(preset.ur, preset.roman, preset.en)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {notice && (
        <p role="status" className="mt-2 flex animate-rise items-center gap-2 rounded-2xl bg-white/20 px-3 py-1 font-semibold">
          <Bell className="h-5 w-5 shrink-0" aria-hidden />
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 rounded-2xl bg-white px-3 py-1 font-semibold text-busy-700">
          {error}
        </p>
      )}
    </section>
  );
}

function LiveBadge() {
  const { t } = useSettings();
  const state = useConnection();
  if (state === "live") {
    return (
      <Tag>
        <span className="h-2 w-2 animate-pulse rounded-full bg-brand-600" aria-hidden />
        {t("لائیو", "Live", "Live")}
      </Tag>
    );
  }
  return <Tag tone="plain">{state === "offline" ? t("انٹرنیٹ نہیں", "Internet nahi", "No internet") : t("جوڑ رہے ہیں…", "Jor rahe hain…", "Connecting…")}</Tag>;
}

function SpeakButton({ text }: { text: string }) {
  const { t } = useSettings();
  return (
    <button type="button" onClick={() => speakUrdu(text)} aria-label={t("سنیں", "Sunein", "Listen")} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 transition active:scale-95">
      <Volume2 className="h-6 w-6" aria-hidden />
    </button>
  );
}

function CategoryBadge({ icon }: { icon?: string }) {
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sunken text-brand-700">
      <CategoryIcon name={icon} className="h-6 w-6" />
    </span>
  );
}

function Fact({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-1 h-5 w-5 shrink-0 text-brand-700" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function DayCount({ days }: { days: number }) {
  const { t } = useSettings();
  return (
    <span className="font-bold">
      <span className="latin">{days}</span> {t("دن", "din", days === 1 ? "day" : "days")}
    </span>
  );
}

function JobFacts({ area, km, days, startDate, children }: { area: string; km: number | null; days: number; startDate: string; children?: ReactNode }) {
  const { t, lang } = useSettings();
  return (
    <div className="mt-2 space-y-1 rounded-2xl bg-sunken px-3 py-2">
      <Fact icon={MapPin}>
        <Auto text={area} className="font-semibold" />
        {km !== null && (
          <span className="text-soft">
            {" · "}
            {km < 1 ? (
              t("1 کلومیٹر سے کم", "1 km se kam", "under 1 km")
            ) : (
              <>
                <span className="latin font-bold">{km}</span> {t("کلومیٹر", "km", "km")}
              </>
            )}
          </span>
        )}
      </Fact>
      <Fact icon={CalendarDays}>
        <DayCount days={days} /> <span className="text-soft">· {rangeLabel(startDate, days, lang)}</span>
      </Fact>
      {children}
    </div>
  );
}

function PerDayAmount({ amount }: { amount: number }) {
  const { t } = useSettings();
  return (
    <>
      <span className="latin font-extrabold">{rupees(amount)}</span> <span className="text-sm text-soft">/ {t("دن", "din", "day")}</span>
    </>
  );
}

function RequestCard({ job, category, area, km, speech, canAnswer, working, error, onAccept, onDecline }: { job: Job; category?: Category; area: string; km: number; speech: string; canAnswer: boolean | null; working: boolean; error?: string; onAccept: () => void; onDecline: () => void }) {
  const { t, lang } = useSettings();
  const hirer = useData(() => data.getHirer(job.customerId), [job.customerId]);
  const perDay = job.proposedPrice ?? job.floor;

  return (
    <Card className="border-2 border-amber-400 p-3">
      <div className="flex items-start gap-3">
        <CategoryBadge icon={category?.icon} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <span className="font-bold">{categoryName(category, lang)}</span>
            {job.crewId && (
              <Tag tone="plain">
                <Users className="h-3.5 w-3.5" aria-hidden />
                {t("ٹیم", "Crew", "Crew")}
              </Tag>
            )}
            {job.urgency === "urgent" && <Tag tone="busy">{t("فوری", "Jaldi", "Urgent")}</Tag>}
          </div>
          <p className="text-sm text-soft">{ago(job.createdAt, t)}</p>
        </div>
        <SpeakButton text={speech} />
      </div>

      <p className="mt-2 font-semibold">
        <Auto text={job.description} />
      </p>

      <Link to={`/app/hirers/${job.customerId}`} className="mt-1 flex min-h-12 items-center gap-2 rounded-2xl">
        <Avatar name={job.customerName} url={hirer.data?.photoUrl ?? null} size={36} />
        <span className="min-w-0 flex-1">
          <span className="font-semibold">
            <Auto text={firstName(job.customerName, lang)} />
          </span>{" "}
          {hirer.data && hirer.data.ratingCount > 0 ? <Rating value={hirer.data.rating} count={hirer.data.ratingCount} /> : hirer.data ? <span className="text-sm text-soft">{t("نیا گاہک", "Naya customer", "New customer")}</span> : null}
        </span>
        <ChevronLeft className="h-5 w-5 shrink-0 text-faint ltr:rotate-180" aria-hidden />
      </Link>

      <JobFacts area={area} km={km} days={job.durationDays} startDate={job.startDate}>
        <Fact icon={Wallet}>
          <PerDayAmount amount={perDay} />
          <span className="text-sm text-soft"> · {t("گاہک کی پیشکش", "Customer ki offer", "Customer's offer")}</span>
        </Fact>
      </JobFacts>
      {job.durationDays > 1 && <PriceMath perDay={perDay} days={job.durationDays} className="mt-1 text-sm" />}

      {error && (
        <div className="mt-2">
          <InlineError>{error}</InlineError>
        </div>
      )}

      {canAnswer === false ? (
        <p className="mt-2 flex items-center gap-2 rounded-2xl bg-amber-50 px-3 py-2 font-semibold text-amber-800">
          <UsersRound className="h-5 w-5 shrink-0" aria-hidden />
          {t("ٹیم لیڈر جواب دے گا", "Crew leader jawab dega", "Your crew leader will answer")}
        </p>
      ) : (
        <div className="mt-2 grid grid-cols-[auto_1fr] gap-2">
          <Button variant="secondary" size="xl" icon={X} disabled={working || canAnswer === null} onClick={onDecline}>
            {t("نہیں", "Nahi", "No")}
          </Button>
          <Button size="xl" icon={Check} disabled={working || canAnswer === null} onClick={onAccept}>
            {t("قبول کریں", "Qubool karein", "Accept")}
          </Button>
        </div>
      )}
    </Card>
  );
}

function DealRow({ job, category, area, canAct }: { job: Job; category?: Category; area: string; canAct: boolean }) {
  const { t, lang } = useSettings();
  const waitingForMe = job.status === "pending_confirmation" && !job.workerConfirmed && canAct;
  const status =
    job.status === "negotiating"
      ? t("قیمت کی بات", "Qeemat ki baat", "Agreeing price")
      : waitingForMe
        ? t("پکا کریں", "Pakka karein", "Confirm now")
        : t("گاہک کا انتظار", "Customer ka intezar", "Waiting for customer");
  return (
    <Link to={`/app/jobs/${job.id}`} className={cx("flex min-h-16 items-center gap-3 rounded-3xl border bg-surface p-3 transition active:scale-[0.99]", waitingForMe ? "border-2 border-brand-600" : "border-line")}>
      <CategoryBadge icon={category?.icon} />
      <span className="min-w-0 flex-1">
        <span className="block font-bold">
          <Auto text={firstName(job.customerName, lang)} />
          <span className="font-normal text-soft"> · {categoryName(category, lang)}</span>
        </span>
        <span className="block text-sm text-soft">
          <Auto text={area} />
          {job.proposedPrice !== null && (
            <>
              {" · "}
              <PerDayAmount amount={job.proposedPrice} />
            </>
          )}
        </span>
        <span className="mt-1 block">
          <Tag tone={waitingForMe ? "brand" : "plain"}>{status}</Tag>
        </span>
      </span>
      <ChevronLeft className="h-5 w-5 shrink-0 text-faint ltr:rotate-180" aria-hidden />
    </Link>
  );
}

function ActiveJob({ job, category, area, canComplete, earnedSoFar, working, error, doneNote, onComplete, onFinishEarly }: { job: Job; category?: Category; area: string; canComplete: boolean | null; earnedSoFar: number; working: boolean; error: string | null; doneNote: string | null; onComplete: () => void; onFinishEarly: () => void }) {
  const { t, lang, keepAwake, setKeepAwake, wakeLockSupported, screenHeld } = useSettings();
  const multi = job.durationDays > 1;
  const today = isoDate(new Date());
  const next = job.days.find((day) => day.status === "scheduled") ?? null;
  const nextDate = next?.date.slice(0, 10) ?? null;
  const startsLater = nextDate !== null && nextDate > today;
  // Every day done but the job still engaged means the last one is waiting to be sent.
  const allDone = job.days.length > 0 && next === null;
  const doneDays = job.days.filter((day) => day.status === "completed").length;
  const perDay = job.agreedPrice ?? job.proposedPrice ?? job.floor;

  const label = !multi
    ? t("کام مکمل ہو گیا", "Kaam mukammal ho gaya", "Job finished")
    : next && startsLater
      ? t(`دن ${next.dayNumber} کا کام مکمل`, `Din ${next.dayNumber} ka kaam mukammal`, `Day ${next.dayNumber} is done`)
      : t("آج کا کام مکمل", "Aaj ka kaam mukammal", "Today's work is done");

  return (
    <section aria-label={t("جاری کام", "Jari kaam", "Current job")} className="mt-3 animate-rise space-y-2">
      <Card className="border-2 border-brand-600 p-3">
        <div className="flex items-start gap-3">
          <CategoryBadge icon={category?.icon} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2">
              <span className="font-bold">{categoryName(category, lang)}</span>
              <Tag tone="busy">{t("جاری", "Jari", "In progress")}</Tag>
            </div>
            <p className="text-sm text-soft">
              <Auto text={personName(job.customerName, lang)} />
            </p>
          </div>
          <Link to={`/app/jobs/${job.id}`} aria-label={t("بات چیت", "Baat cheet", "Open chat")} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 transition active:scale-95">
            <MessageCircle className="h-6 w-6" aria-hidden />
          </Link>
        </div>

        <p className="mt-2 font-semibold">
          <Auto text={job.card?.task ?? job.description} />
        </p>
      </Card>

      {multi && <DayProgress days={job.days} />}

      {startsLater && nextDate && (
        <p className="flex items-center gap-2 rounded-2xl bg-amber-50 px-3 py-2 font-semibold text-amber-800">
          <CalendarDays className="h-5 w-5 shrink-0" aria-hidden />
          <span>
            {next && next.dayNumber > 1 ? t(`دن ${next.dayNumber} کی تاریخ:`, `Din ${next.dayNumber} ki tareekh:`, `Day ${next.dayNumber} is on`) : t("کام شروع ہو گا:", "Kaam shuru hoga:", "Work starts on")} {dateLabel(nextDate, lang)}
          </span>
        </p>
      )}

      {doneNote && (
        <p role="status" className="flex animate-rise items-center gap-2 rounded-2xl bg-brand-100 px-3 py-2 font-bold text-brand-800">
          <CheckCheck className="h-6 w-6 shrink-0" aria-hidden />
          {doneNote}
        </p>
      )}

      {error && <InlineError>{error}</InlineError>}

      {canComplete === false ? (
        <p className="flex items-center gap-2 rounded-2xl bg-amber-50 px-3 py-2 font-semibold text-amber-800">
          <UsersRound className="h-5 w-5 shrink-0" aria-hidden />
          {t("روزانہ کا کام ٹیم لیڈر مکمل کرے گا", "Rozana ka kaam crew leader mukammal karega", "Your crew leader marks each day as done")}
        </p>
      ) : (
        <Button size="xl" icon={CheckCheck} className="w-full" disabled={working || canComplete === null || allDone} onClick={onComplete}>
          {allDone ? t("بھیجنے کے انتظار میں", "Bhejne ke intezar mein", "Waiting to send") : label}
        </Button>
      )}

      {multi && doneDays > 0 && canComplete && (
        <Button variant="ghost" size="md" icon={Flag} className="w-full" disabled={working} onClick={onFinishEarly}>
          {t("کام جلدی ختم کریں", "Kaam jaldi khatam karein", "Finish this job early")}
        </Button>
      )}

      <div className="mt-2 space-y-1 rounded-2xl bg-sunken px-3 py-2">
        <Fact icon={MapPin}>
          <Auto text={area} className="font-semibold" />
          {job.address && (
            <span className="block text-sm text-soft">
              <Auto text={job.address} />
            </span>
          )}
        </Fact>
        <Fact icon={CalendarDays}>
          <DayCount days={job.durationDays} /> <span className="text-soft">· {rangeLabel(job.startDate, job.durationDays, lang)}</span>
        </Fact>
        <Fact icon={Wallet}>
          <PerDayAmount amount={perDay} />
        </Fact>
      </div>

      {doneDays > 0 && multi && (
        <p className="flex items-center justify-between gap-2 rounded-2xl bg-brand-50 px-3 py-1 font-semibold text-brand-800">
          <span>{t("اس کام سے اب تک", "Is kaam se ab tak", "Earned on this job so far")}</span>
          <span className="latin font-extrabold">{rupees(earnedSoFar)}</span>
        </p>
      )}

      {wakeLockSupported && (
        <div className="flex items-center gap-3 rounded-2xl bg-sunken px-3">
          <MonitorSmartphone className="h-6 w-6 shrink-0 text-brand-700" aria-hidden />
          <p className="min-w-0 flex-1 text-sm font-semibold">{!keepAwake ? t("کام کے دوران اسکرین جلتی رکھیں", "Kaam ke dauran screen jalti rakhein", "Keep the screen on during this job") : screenHeld ? t("کام کے دوران اسکرین جلتی رہے گی", "Kaam ke dauran screen jalti rahegi", "The screen will stay on during this job") : t("فون نے ابھی اجازت نہیں دی", "Phone ne abhi ijazat nahi di", "The phone has not allowed this right now")}</p>
          <Switch checked={keepAwake} onChange={setKeepAwake} label={t("اسکرین جلتی رکھیں", "Screen jalti rakhein", "Keep screen awake")} />
        </div>
      )}
    </section>
  );
}

function InviteCard({ invite, categories, working, error, onAccept, onDecline }: { invite: CrewInvite; categories: Category[]; working: boolean; error?: string; onAccept: () => void; onDecline: () => void }) {
  const { t, lang } = useSettings();
  const trades = invite.categoryIds.map((id) => categoryName(categories.find((c) => c.id === id), lang)).filter(Boolean);
  return (
    <Card className="border-2 border-amber-400 p-3">
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
          <UsersRound className="h-6 w-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">
            <Auto text={personName(invite.crewName, lang)} />
          </p>
          <p className="text-sm text-soft">
            {t("لیڈر", "Leader", "Leader")}: <Auto text={personName(invite.leaderName, lang)} />
          </p>
        </div>
      </div>
      <div className="mt-2 space-y-1 rounded-2xl bg-sunken px-3 py-2">
        {trades.length > 0 && <Fact icon={Users}>{trades.join("، ")}</Fact>}
        <Fact icon={Wallet}>
          <PerDayAmount amount={invite.rate} />
          <span className="text-sm text-soft"> · {t("پوری ٹیم کا", "poori crew ka", "for the whole crew")}</span>
        </Fact>
      </div>
      {error && (
        <div className="mt-2">
          <InlineError>{error}</InlineError>
        </div>
      )}
      <div className="mt-2 grid grid-cols-[auto_1fr] gap-2">
        <Button variant="secondary" size="xl" icon={X} disabled={working} onClick={onDecline}>
          {t("نہیں", "Nahi", "No")}
        </Button>
        <Button size="xl" icon={Check} disabled={working} onClick={onAccept}>
          {t("شامل ہوں", "Shamil hon", "Join crew")}
        </Button>
      </div>
    </Card>
  );
}

function FeedCard({ job, category, area, speech, fresh, offer, canBid, onOffer, onHide }: { job: JobFeedItem; category?: Category; area: string; speech: string; fresh: boolean; offer?: Offer; canBid: boolean; onOffer: () => void; onHide: () => void }) {
  const { t, lang } = useSettings();
  const hasRange = job.priceMin !== null && job.priceMax !== null;
  return (
    <Card className={cx("p-3", fresh && "ring-2 ring-amber-400")}>
      <div className="flex items-start gap-3">
        <CategoryBadge icon={category?.icon} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <span className="font-bold">{categoryName(category, lang)}</span>
            {job.mode === "crew" && (
              <Tag tone="plain">
                <Users className="h-3.5 w-3.5" aria-hidden />
                {t("ٹیم کا کام", "Crew ka kaam", "Crew job")}
              </Tag>
            )}
            {job.urgency === "urgent" && <Tag tone="busy">{t("فوری", "Jaldi", "Urgent")}</Tag>}
          </div>
          <p className="text-sm text-soft">{ago(job.createdAt, t)}</p>
        </div>
        <SpeakButton text={speech} />
      </div>

      <p className="mt-2 line-clamp-3 font-semibold">
        <Auto text={job.description} />
      </p>

      {job.photoUrls.length > 0 && (
        <div className="scroll-x mt-2 flex gap-2 overflow-x-auto">
          {job.photoUrls.map((url) => (
            <img key={url} src={url} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
          ))}
        </div>
      )}

      <JobFacts area={area} km={job.distanceKm} days={job.durationDays} startDate={job.startDate}>
        {hasRange && (
          <Fact icon={Wallet}>
            <span dir="ltr" className="latin inline-block font-extrabold">
              {rupees(job.priceMin ?? 0)} – {(job.priceMax ?? 0).toLocaleString("en-PK")}
            </span>{" "}
            <span className="text-sm text-soft">
              / {t("دن", "din", "day")} · {t("اندازہ", "andaza", "estimate")}
            </span>
          </Fact>
        )}
        {job.proposedPrice !== null && (
          <Fact icon={Wallet}>
            <PerDayAmount amount={job.proposedPrice} />
            <span className="text-sm text-soft"> · {t("گاہک کی پیشکش", "Customer ki offer", "Customer's offer")}</span>
          </Fact>
        )}
      </JobFacts>

      {offer && offer.status === "pending" ? (
        <div className="mt-2">
          <p className="flex items-center gap-2 rounded-2xl bg-brand-50 px-3 py-2 font-semibold text-brand-800">
            <CheckCheck className="h-6 w-6 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              {t("آپ کی آفر", "Aapki offer", "Your offer")}: <PerDayAmount amount={offer.price} />
              <span className="block text-sm font-normal">{t("گاہک کے جواب کا انتظار", "Customer ke jawab ka intezar", "Waiting for the customer's answer")}</span>
            </span>
          </p>
          <Button variant="secondary" size="md" className="mt-2 w-full" disabled={!canBid} onClick={onOffer}>
            {t("قیمت بدلیں", "Qeemat badlein", "Change my price")}
          </Button>
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-[auto_1fr] gap-2">
          <Button variant="secondary" size="xl" aria-label={t("یہ کام چھپائیں", "Ye kaam chhupayein", "Hide this job")} onClick={onHide} className="w-20">
            <X className="h-6 w-6" aria-hidden />
          </Button>
          <Button size="xl" icon={Send} disabled={!canBid} onClick={onOffer}>
            {t("آفر بھیجیں", "Offer bhejein", "Send offer")}
          </Button>
        </div>
      )}
    </Card>
  );
}

function FeedBlocked({ mode, onGoAvailable }: { mode: Mode; onGoAvailable: () => void }) {
  const { t } = useSettings();
  const message = {
    available: "",
    busy: t("آپ مصروف ہیں۔ آفر بھیجنے کے لیے فارغ ہوں۔", "Aap masroof hain. Offer bhejne ke liye farigh hon.", "You are busy. Become available to send offers."),
    engaged: t("یہ کام ختم ہونے کے بعد نئے کام ملیں گے۔", "Ye kaam khatam hone ke baad naye kaam milenge.", "New jobs will appear when this job is finished."),
    requested: t("پہلے اوپر والی درخواست مکمل کریں۔", "Pehle upar wali darkhwast mukammal karein.", "Settle the request above first."),
    pending: t("منظوری کے بعد آپ آفر بھیج سکیں گے۔", "Manzoori ke baad aap offer bhej sakenge.", "You can send offers once you are approved."),
  }[mode];
  return (
    <div className="mb-3 rounded-2xl bg-sunken px-3 py-2">
      <p className="font-semibold text-soft">{message}</p>
      {mode === "busy" && (
        <Button size="md" icon={Check} className="mt-2 w-full" onClick={onGoAvailable}>
          {t("میں فارغ ہوں", "Main farigh hoon", "I'm available")}
        </Button>
      )}
    </div>
  );
}

function ConfirmSheet({ title, confirmLabel, icon, working, error, children, onConfirm, onClose }: { title: string; confirmLabel: string; icon: LucideIcon; working?: boolean; error?: string | null; children: ReactNode; onConfirm: () => void; onClose: () => void }) {
  const { t } = useSettings();
  return (
    <Sheet title={title} onClose={onClose}>
      {children}
      {error && (
        <div className="mt-2">
          <InlineError>{error}</InlineError>
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" size="xl" onClick={onClose}>
          {t("واپس", "Wapas", "Go back")}
        </Button>
        <Button size="xl" icon={icon} disabled={working} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Sheet>
  );
}

const HIDDEN_KEY = "kw.hiddenJobs";

function readHidden(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(HIDDEN_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeHidden(ids: string[]) {
  try {
    window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(ids.slice(-100)));
  } catch {
    // Private windows can refuse storage. The list then lasts for this visit only.
  }
}

export function WorkerHome() {
  const { t, lang, audioCues } = useSettings();
  const navigate = useNavigate();
  const workerId = data.currentUser()?.workerId ?? null;

  const [me, setMe] = useState<WorkerCard | null>(null);
  const [chosen, setChosen] = useState<OfflinePreset | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmBusy, setConfirmBusy] = useState<OfflinePreset | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [jobErrors, setJobErrors] = useState<Record<string, string>>({});
  const [declining, setDeclining] = useState<Job | null>(null);
  const [finishing, setFinishing] = useState<"day" | "early" | null>(null);
  const [finishBusy, setFinishBusy] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [doneNote, setDoneNote] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>(readHidden);
  const [fresh, setFresh] = useState<string[]>([]);
  const [offerJob, setOfferJob] = useState<JobFeedItem | null>(null);
  const [offerPrice, setOfferPrice] = useState(0);
  const [offerCrewId, setOfferCrewId] = useState<string | null>(null);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const profile = useData(() => data.getMyWorker(), [], {
    reloadOn: ["worker.status"],
    when: (event) => event.type === "worker.status" && event.workerId === workerId,
  });
  const mine = useData(() => data.listMyJobs(), [], { reloadOn: ["job.updated", "offer.updated"] });
  const feed = useData(() => data.listOpenJobs(), [], { reloadOn: ["job.updated", "job.closed", "offer.updated"] });
  const invites = useData(() => data.listCrewInvites(), [], { reloadOn: ["crew.invited"] });
  const crews = useData(() => data.listMyCrews(), [], { reloadOn: ["crew.invited"] });
  const earnings = useData(() => data.getEarnings(), [], {
    reloadOn: ["job.updated"],
    when: (event) => event.type === "job.updated" && workerId !== null && event.job.workerIds.includes(workerId),
  });
  const categories = useData(() => data.listCategories(), [], { reloadOn: ["categories.changed"] });
  const areas = useData(() => data.getAreas(), []);

  const offeredIds = (mine.data ?? []).filter((job) => job.status === "open" && job.customerId !== me?.userId).map((job) => job.id);
  const offeredKey = offeredIds.join(",");
  const myOffers = useData(
    async () => {
      const lists = await Promise.all(offeredKey.split(",").filter(Boolean).map((id) => data.listOffers(id)));
      return new Map(lists.flat().map((offer) => [offer.jobId, offer] as const));
    },
    [offeredKey],
    { reloadOn: ["offer.updated"] },
  );

  // Every worker.status for this worker lands here at once, so a preset running out shows without a reload.
  useEffect(() => {
    if (profile.data) setMe(profile.data);
  }, [profile.data]);

  useEffect(
    () =>
      data.onEvent((event) => {
        if (event.type !== "worker.status" || event.workerId !== workerId) return;
        setMe((current) => (current ? { ...current, status: event.status, offlineUntil: event.offlineUntil } : current));
      }),
    [workerId],
  );

  const previous = useRef<WorkerCard | null>(null);
  const expectAvailable = useRef(false);
  const toggleRequest = useRef(0);

  useEffect(() => {
    const before = previous.current;
    previous.current = me;
    if (!before || !me || before.status === me.status) return;
    const cameBackAlone = before.status === "offline" && before.offlineUntil !== null && me.status === "available" && !expectAvailable.current;
    expectAvailable.current = false;
    if (!cameBackAlone) return;
    setChosen(null);
    cue("up", audioCues);
    sayStatus("farigh", audioCues);
    setNotice(t("وقت پورا ہوا۔ آپ پھر سے فارغ ہیں۔", "Waqt poora hua. Aap phir se farigh hain.", "Your busy time is over. You are available again."));
  }, [me, audioCues, t]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!doneNote) return;
    const timer = setTimeout(() => setDoneNote(null), 6000);
    return () => clearTimeout(timer);
  }, [doneNote]);

  // The server's sweep normally says so first. This covers a socket that has dropped.
  const offlineUntil = me?.status === "offline" ? me.offlineUntil : null;
  const reloadProfile = profile.reload;
  useEffect(() => {
    if (!offlineUntil) return;
    const delay = Math.max(0, new Date(offlineUntil).getTime() - Date.now()) + 8000;
    const timer = setTimeout(reloadProfile, delay);
    return () => clearTimeout(timer);
  }, [offlineUntil, reloadProfile]);

  const allJobs = mine.data ?? [];
  const assigned = allJobs.filter((job) => (me ? job.workerIds.includes(me.id) : false));
  const active = assigned.find((job) => job.status === "engaged");
  const requests = assigned.filter((job) => job.status === "requested");
  const deals = assigned.filter((job) => job.status === "negotiating" || job.status === "pending_confirmation");
  const mode: Mode | null = me ? modeOf(me) : null;
  const allCategories = categories.data ?? [];
  const category = (id: string) => allCategories.find((c) => c.id === id);

  const areaIn = (area: string, inLang: Lang) => (inLang === "ur" ? (areas.data?.find((a) => a.name === area)?.nameUr ?? areaName(area, "ur")) : area);
  const speechFor = (job: Job, km: number | null) =>
    [category(job.categoryId)?.nameUr, isLatin(job.description) ? null : job.description, areaIn(job.area, "ur"), km !== null ? `${km} کلومیٹر دور` : null, job.durationDays === 1 ? "ایک دن کا کام" : `${job.durationDays} دن کا کام`].filter(Boolean).join("۔ ");

  // Answering is the leader's on a crew job. Null until the crews have loaded.
  const leadsCrewOf = (job: Job): boolean | null => {
    if (!job.crewId) return true;
    if (!crews.data || !me) return null;
    return crews.data.find((crew) => crew.id === job.crewId)?.leaderId === me.id;
  };
  const ledCrewsFor = (categoryId: string): Crew[] => (crews.data ?? []).filter((crew) => crew.leaderId === me?.id && crew.categoryIds.includes(categoryId));

  const seenRequests = useRef<Set<string> | null>(null);
  const seenFeed = useRef<Set<string> | null>(null);
  const requestKey = requests.map((job) => job.id).join(",");
  const seenDeals = useRef<Set<string> | null>(null);
  const dealKey = deals.map((job) => job.id).join(",");

  useEffect(() => {
    if (!mine.data) return;
    const ids = requestKey.split(",").filter(Boolean);
    const seen = seenRequests.current;
    seenRequests.current = new Set(ids);
    if (seen && ids.some((id) => !seen.has(id))) {
      cue("success", audioCues);
      speakUrdu("نئی درخواست آئی ہے", audioCues);
    }
  }, [requestKey, mine.data, audioCues]);

  useEffect(() => {
    if (!mine.data) return;
    const ids = dealKey.split(",").filter(Boolean);
    const seen = seenDeals.current;
    seenDeals.current = new Set(ids);
    if (seen && ids.some((id) => !seen.has(id))) {
      cue("success", audioCues);
      speakUrdu("گاہک سے بات شروع ہو گئی", audioCues);
    }
  }, [dealKey, mine.data, audioCues]);

  useEffect(() => {
    if (!feed.data) return;
    const ids = feed.data.map((job) => job.id);
    const seen = seenFeed.current;
    seenFeed.current = new Set(ids);
    if (!seen) return;
    const added = ids.filter((id) => !seen.has(id));
    if (added.length === 0) return;
    setFresh((list) => [...list, ...added]);
    if (mode === "available") {
      cue("up", audioCues);
      speakUrdu("نیا کام آیا ہے", audioCues);
    }
    const timer = setTimeout(() => setFresh((list) => list.filter((id) => !added.includes(id))), 6000);
    return () => clearTimeout(timer);
    // Only a change in the list should ring.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed.data]);

  const applyAvailability = (available: boolean, preset?: OfflinePreset) => {
    if (!me) return;
    const before = me;
    const request = ++toggleRequest.current;
    setToggleError(null);
    setNotice(null);
    setChosen(available ? null : (preset ?? null));
    expectAvailable.current = available;
    cue(available ? "up" : "down", audioCues);
    sayStatus(available ? "farigh" : "masroof", audioCues);
    // Show the change at once and put it back if the server refuses.
    setMe({ ...me, status: available ? "available" : "offline", offlineUntil: available ? null : me.offlineUntil });
    data.setAvailability(available, preset).then(
      (card) => {
        if (request !== toggleRequest.current) return;
        setMe(card);
        mine.reload();
      },
      (error: unknown) => {
        if (request !== toggleRequest.current) return;
        setMe(before);
        setChosen(null);
        expectAvailable.current = false;
        if (errorCode(error) === "WORKER_ENGAGED") profile.reload();
        setToggleError(errorText(error, t));
      },
    );
  };

  const flip = () => {
    if (!me || !mode) return;
    if (mode === "requested") setConfirmBusy("manual");
    else applyAvailability(mode !== "available", mode === "available" ? "manual" : undefined);
  };

  const pickPreset = (preset: OfflinePreset) => {
    if (mode === "requested") setConfirmBusy(preset);
    else applyAvailability(false, preset);
  };

  const explainLock = () => {
    cue("tap", audioCues);
    speakUrdu(mode === "engaged" ? "کام مکمل ہونے تک یہ بٹن بند ہے۔" : "آپ کی پروفائل منظوری کے انتظار میں ہے۔", audioCues);
  };

  const jobErrorText = (error: unknown) => {
    const code = errorCode(error);
    if (code === "INVALID_JOB_STATE" || code === "NOT_FOUND" || code === "FORBIDDEN") return t("یہ کام اب دستیاب نہیں", "Ye kaam ab dastyab nahi", "This job is no longer available");
    if (code === "WORKER_NOT_AVAILABLE") return t("آپ یا آپ کی ٹیم ابھی فارغ نہیں", "Aap ya aapki crew abhi farigh nahi", "You or your crew are not available right now");
    return errorText(error, t);
  };

  const runOnJob = async (id: string, work: () => Promise<void>) => {
    setWorkingId(id);
    setJobErrors(({ [id]: _old, ...rest }) => rest);
    try {
      await work();
    } catch (error) {
      setJobErrors((errors) => ({ ...errors, [id]: jobErrorText(error) }));
      mine.reload();
      feed.reload();
      invites.reload();
    } finally {
      setWorkingId(null);
    }
  };

  const acceptRequest = (job: Job) =>
    void runOnJob(job.id, async () => {
      const updated = await data.acceptRequest(job.id);
      cue("success", audioCues);
      navigate(`/app/jobs/${updated.id}`);
    });

  const declineRequest = (job: Job) => {
    setDeclining(null);
    void runOnJob(job.id, async () => {
      await data.declineRequest(job.id);
      cue("down", audioCues);
      mine.reload();
    });
  };

  const answerInvite = (invite: CrewInvite, accept: boolean) =>
    void runOnJob(invite.crewId, async () => {
      if (accept) await data.acceptCrewInvite(invite.crewId);
      else await data.declineCrewInvite(invite.crewId);
      cue(accept ? "success" : "down", audioCues);
      if (accept) setNotice(t("آپ ٹیم میں شامل ہو گئے", "Aap crew mein shamil ho gaye", "You have joined the crew"));
      invites.reload();
      crews.reload();
      feed.reload();
    });

  const finishDay = async () => {
    if (!active) return;
    const next = active.days.find((day) => day.status === "scheduled");
    setFinishBusy(true);
    setFinishError(null);
    try {
      const updated = active.durationDays > 1 && next ? await data.completeDay(active.id, next.dayNumber) : await data.completeJob(active.id);
      cue("success", audioCues);
      setFinishing(null);
      mine.reload();
      earnings.reload();
      if (updated.status === "completed") {
        speakUrdu("کام مکمل ہو گیا۔ شکریہ۔", audioCues);
        navigate(`/app/jobs/${updated.id}/review`);
      } else {
        speakUrdu("آج کا کام مکمل ہو گیا۔", audioCues);
        const waitingToSend = staleSince(updated) !== null;
        setDoneNote(
          !next
            ? null
            : waitingToSend
              ? t(`دن ${next.dayNumber} محفوظ۔ انٹرنیٹ آنے پر کمائی میں شامل ہو گا۔`, `Din ${next.dayNumber} mehfooz. Internet aane par kamai mein shamil hoga.`, `Day ${next.dayNumber} saved. It reaches your earnings once you are online.`)
              : t(`دن ${next.dayNumber} مکمل۔ کمائی میں شامل ہو گیا۔`, `Din ${next.dayNumber} mukammal. Kamai mein shamil ho gaya.`, `Day ${next.dayNumber} done and added to your earnings.`),
        );
      }
    } catch (error) {
      setFinishError(errorText(error, t));
      mine.reload();
    } finally {
      setFinishBusy(false);
    }
  };

  const finishEarly = async () => {
    if (!active) return;
    setFinishBusy(true);
    setFinishError(null);
    try {
      const updated = await data.completeJob(active.id);
      cue("success", audioCues);
      setFinishing(null);
      navigate(`/app/jobs/${updated.id}/review`);
    } catch (error) {
      setFinishError(errorText(error, t));
      mine.reload();
    } finally {
      setFinishBusy(false);
    }
  };

  const hideJob = (id: string) => {
    const next = [...hidden, id];
    setHidden(next);
    writeHidden(next);
  };

  const showHidden = () => {
    setHidden([]);
    writeHidden([]);
  };

  const openOffer = (job: JobFeedItem) => {
    const existing = myOffers.data?.get(job.id);
    const led = job.mode === "crew" ? ledCrewsFor(job.categoryId) : [];
    const crew = led.find((c) => c.id === existing?.crewId) ?? led[0] ?? null;
    setOfferPrice(Math.max(job.floor, existing?.price ?? crew?.rate ?? me?.rate ?? job.floor));
    setOfferCrewId(crew?.id ?? null);
    setOfferError(null);
    setOfferJob(job);
  };

  const sendOffer = async () => {
    if (!offerJob) return;
    setSending(true);
    setOfferError(null);
    try {
      await data.sendOffer(offerJob.id, offerPrice, offerCrewId ? { crewId: offerCrewId } : undefined);
      cue("success", audioCues);
      setOfferJob(null);
      mine.reload();
      myOffers.reload();
    } catch (error) {
      setOfferError(jobErrorText(error));
      feed.reload();
    } finally {
      setSending(false);
    }
  };

  const feedJobs = feed.data ?? [];
  const visibleJobs = feedJobs.filter((job) => !hidden.includes(job.id));
  const hiddenCount = feedJobs.length - visibleJobs.length;
  const canBid = mode === "available";
  const offerCrews = offerJob?.mode === "crew" ? ledCrewsFor(offerJob.categoryId) : [];
  const earningsValue = earnings.data;
  const nextDay = active?.days.find((day) => day.status === "scheduled") ?? null;
  const perDay = active ? (active.agreedPrice ?? active.proposedPrice ?? active.floor) : 0;
  const lastDay = active ? active.days.filter((day) => day.status === "scheduled").length <= 1 : false;
  const doneDays = active?.days.filter((day) => day.status === "completed").length ?? 0;
  const earnedOnActive = active ? (earningsValue?.items.filter((item) => item.jobId === active.id).reduce((sum, item) => sum + item.amount, 0) ?? 0) : 0;

  const spokenStatus = !me ? "" : mode === "available" ? "آپ فارغ ہیں۔ گاہک آپ کو دیکھ سکتے ہیں۔" : mode === "engaged" ? "آپ کا کام جاری ہے۔ کام مکمل ہونے تک بٹن بند ہے۔" : mode === "requested" ? "آپ کے پاس ایک درخواست ہے۔" : mode === "pending" ? "آپ کی پروفائل منظوری کے انتظار میں ہے۔" : "آپ مصروف ہیں۔ گاہک آپ کو نہیں دیکھ سکتے۔";

  return (
    <Screen nav="worker" bare>
      <div className="px-4 pb-6">
        <header className="flex min-h-16 items-center gap-2 pt-1">
          {me ? <Avatar name={me.name} url={me.photoUrl} size={44} /> : <Skeleton className="h-11 w-11 rounded-full" />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-soft">{t("السلام علیکم", "Assalam o Alaikum", "Assalam o Alaikum")}</p>
            <p className="truncate text-lg font-bold">{me ? <Auto text={firstName(me.name, lang)} /> : ""}</p>
          </div>
          <ReadAloud text={spokenStatus} />
          <LangCycle />
          <Link to="/app/settings" aria-label={t("ترتیبات", "Settings", "Settings")} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-soft hover:bg-sunken">
            <SettingsIcon className="h-6 w-6" aria-hidden />
          </Link>
          <LogoutButton />
        </header>

        {me ? <StatusCard me={me} chosen={chosen} notice={notice} error={toggleError} onFlip={flip} onPreset={pickPreset} onLockedTap={explainLock} /> : profile.error ? <ErrorState onRetry={profile.reload} /> : <Skeleton className="h-64 w-full rounded-4xl" />}

        {active && (
          <ActiveJob
            job={active}
            category={category(active.categoryId)}
            area={areaIn(active.area, lang)}
            canComplete={leadsCrewOf(active)}
            earnedSoFar={earnedOnActive}
            working={finishBusy}
            error={finishing ? null : finishError}
            doneNote={doneNote}
            onComplete={() => {
              setFinishError(null);
              setFinishing("day");
            }}
            onFinishEarly={() => {
              setFinishError(null);
              setFinishing("early");
            }}
          />
        )}

        {requests.length > 0 && (
          <section>
            <SectionTitle action={requests.length > 1 ? <Tag tone="busy">{requests.length}</Tag> : undefined}>{t("آپ کے لیے درخواست", "Aap ke liye darkhwast", "A request for you")}</SectionTitle>
            <div className="space-y-3">
              {requests.map((job) => {
                const km = me ? kmBetween(me.location, job.location) : 0;
                return (
                  <RequestCard
                    key={job.id}
                    job={job}
                    category={category(job.categoryId)}
                    area={areaIn(job.area, lang)}
                    km={km}
                    speech={`نئی درخواست۔ ${speechFor(job, km)}`}
                    canAnswer={leadsCrewOf(job)}
                    working={workingId === job.id}
                    error={jobErrors[job.id]}
                    onAccept={() => acceptRequest(job)}
                    onDecline={() => setDeclining(job)}
                  />
                );
              })}
            </div>
          </section>
        )}

        {deals.length > 0 && (
          <section>
            <SectionTitle>{t("بات چیت جاری", "Baat cheet jari", "In discussion")}</SectionTitle>
            <div className="space-y-2">
              {deals.map((job) => (
                <DealRow key={job.id} job={job} category={category(job.categoryId)} area={areaIn(job.area, lang)} canAct={leadsCrewOf(job) === true} />
              ))}
            </div>
          </section>
        )}

        {invites.data && invites.data.length > 0 && (
          <section>
            <SectionTitle>{t("ٹیم کی دعوت", "Crew ki dawat", "Crew invitations")}</SectionTitle>
            <div className="space-y-3">
              {invites.data.map((invite) => (
                <InviteCard key={invite.crewId} invite={invite} categories={allCategories} working={workingId === invite.crewId} error={jobErrors[invite.crewId]} onAccept={() => answerInvite(invite, true)} onDecline={() => answerInvite(invite, false)} />
              ))}
            </div>
          </section>
        )}

        <section>
          <SectionTitle action={<LiveBadge />}>{t("قریب کے نئے کام", "Qareeb ke naye kaam", "New jobs nearby")}</SectionTitle>
          {mode && mode !== "available" && <FeedBlocked mode={mode} onGoAvailable={() => applyAvailability(true)} />}
          {mode === "engaged" || mode === "pending" ? null : feed.error && !feed.data ? (
            <ErrorState onRetry={feed.reload} />
          ) : !feed.data ? (
            <ListSkeleton rows={2} />
          ) : visibleJobs.length === 0 ? (
            <EmptyState icon={Bell} title={t("ابھی کوئی نیا کام نہیں", "Abhi koi naya kaam nahi", "No new jobs right now")} body={t("کام آتے ہی یہاں خود نظر آئے گا", "Kaam aate hi yahan khud nazar aayega", "A new job appears here by itself the moment it is posted")} />
          ) : (
            <div className="stagger space-y-3">
              {visibleJobs.map((job) => (
                <FeedCard key={job.id} job={job} category={category(job.categoryId)} area={areaIn(job.area, lang)} speech={`نیا کام۔ ${speechFor(job, job.distanceKm)}`} fresh={fresh.includes(job.id)} offer={myOffers.data?.get(job.id)} canBid={canBid} onOffer={() => openOffer(job)} onHide={() => hideJob(job.id)} />
              ))}
            </div>
          )}
          {hiddenCount > 0 && mode !== "engaged" && (
            <Button variant="ghost" size="md" icon={Eye} className="mt-2 w-full" onClick={showHidden}>
              {t(`چھپے ہوئے کام دکھائیں (${hiddenCount})`, `Chhupe hue kaam dikhayein (${hiddenCount})`, `Show hidden jobs (${hiddenCount})`)}
            </Button>
          )}
        </section>

        <Link to="/app/earnings" className="mt-4 block rounded-3xl border border-line bg-surface p-4 transition active:scale-[0.99]">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base">{t("میری کمائی", "Meri kamai", "My earnings")}</h2>
            <ChevronLeft className="h-5 w-5 shrink-0 text-faint ltr:rotate-180" aria-hidden />
          </div>
          {earnings.error && !earnings.data ? (
            <p className="text-soft">{t("کمائی نہیں مل سکی", "Kamai nahi mil saki", "Could not load your earnings")}</p>
          ) : (
            <div className="mt-1 grid grid-cols-3 gap-2">
              <div>
                <div className="text-sm text-soft">{t("آج", "Aaj", "Today")}</div>
                <div className="latin text-lg font-extrabold">{earningsValue ? rupees(earningsValue.today) : "–"}</div>
              </div>
              <div>
                <div className="text-sm text-soft">{t("اس ہفتے", "Is hafte", "This week")}</div>
                <div className="latin text-lg font-extrabold">{earningsValue ? rupees(earningsValue.week) : "–"}</div>
              </div>
              <div>
                <div className="text-sm text-soft">{t("کام", "Kaam", "Jobs")}</div>
                <div className="latin text-lg font-extrabold">{earningsValue?.jobCount ?? "–"}</div>
              </div>
            </div>
          )}
        </Link>
      </div>

      {confirmBusy && (
        <ConfirmSheet
          title={t("مصروف ہو جائیں؟", "Masroof ho jayein?", "Go busy?")}
          confirmLabel={t("ہاں، مصروف", "Haan, masroof", "Yes, go busy")}
          icon={Hourglass}
          onClose={() => setConfirmBusy(null)}
          onConfirm={() => {
            applyAvailability(false, confirmBusy);
            setConfirmBusy(null);
          }}
        >
          <p className="rounded-2xl bg-busy-50 p-3 font-semibold text-busy-700">{t("آپ کی جاری درخواست ختم ہو جائے گی اور گاہک کو بتا دیا جائے گا۔", "Aapki jari darkhwast khatam ho jayegi aur customer ko bata diya jayega.", "Your current request will end and the customer will be told.")}</p>
        </ConfirmSheet>
      )}

      {declining && (
        <ConfirmSheet title={t("درخواست واپس کریں؟", "Darkhwast wapas karein?", "Decline this request?")} confirmLabel={t("ہاں، واپس", "Haan, wapas", "Yes, decline")} icon={X} onClose={() => setDeclining(null)} onConfirm={() => declineRequest(declining)}>
          <p className="rounded-2xl bg-sunken p-3 font-semibold">{t("گاہک کو بتا دیا جائے گا کہ آپ دستیاب نہیں۔", "Customer ko bata diya jayega ke aap dastyab nahi.", "The customer will be told you are not available.")}</p>
        </ConfirmSheet>
      )}

      {active && finishing === "day" && (
        <ConfirmSheet title={active.durationDays > 1 && nextDay ? t(`دن ${nextDay.dayNumber} مکمل کریں؟`, `Din ${nextDay.dayNumber} mukammal karein?`, `Mark day ${nextDay.dayNumber} as done?`) : t("کام مکمل ہو گیا؟", "Kaam mukammal ho gaya?", "Is the job finished?")} confirmLabel={t("ہاں، مکمل", "Haan, mukammal", "Yes, done")} icon={CheckCheck} working={finishBusy} error={finishError} onClose={() => setFinishing(null)} onConfirm={() => void finishDay()}>
          <div className="rounded-2xl bg-brand-50 p-3">
            <p className="text-sm font-semibold text-brand-800">{active.crewId ? t("ٹیم میں برابر تقسیم ہوں گے", "Crew mein barabar taqseem honge", "Split equally across the crew") : t("آپ کی کمائی میں شامل ہوں گے", "Aapki kamai mein shamil honge", "Will be added to your earnings")}</p>
            <p className="latin text-3xl font-extrabold">{rupees(perDay)}</p>
          </div>
          {lastDay && active.durationDays > 1 && <p className="mt-2 font-semibold text-soft">{t("یہ آخری دن ہے۔ اس کے بعد کام ختم ہو جائے گا۔", "Ye aakhri din hai. Is ke baad kaam khatam ho jayega.", "This is the last day. The job ends after this.")}</p>}
        </ConfirmSheet>
      )}

      {active && finishing === "early" && (
        <ConfirmSheet title={t("کام جلدی ختم کریں؟", "Kaam jaldi khatam karein?", "Finish this job early?")} confirmLabel={t("ہاں، ختم", "Haan, khatam", "Yes, finish")} icon={Flag} working={finishBusy} error={finishError} onClose={() => setFinishing(null)} onConfirm={() => void finishEarly()}>
          <p className="rounded-2xl bg-sunken p-3 font-semibold">{t("صرف مکمل دنوں کے پیسے بنیں گے۔ باقی دن منسوخ ہو جائیں گے۔", "Sirf mukammal dinon ke paise banenge. Baqi din mansookh ho jayenge.", "Only completed days are paid. The remaining days are cancelled.")}</p>
          <PriceMath perDay={perDay} days={doneDays} className="mt-2 text-lg" />
        </ConfirmSheet>
      )}

      {offerJob && (
        <Sheet title={myOffers.data?.get(offerJob.id) ? t("قیمت بدلیں", "Qeemat badlein", "Change your price") : t("آپ کی قیمت", "Aapki qeemat", "Your price")} onClose={() => setOfferJob(null)}>
          {offerCrews.length > 1 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {offerCrews.map((crew) => (
                <Chip key={crew.id} active={offerCrewId === crew.id} onClick={() => setOfferCrewId(crew.id)}>
                  <Auto text={personName(crew.name, lang)} />
                </Chip>
              ))}
            </div>
          )}
          {offerCrews.length === 1 && offerCrews[0] && (
            <p className="mb-2 flex items-center gap-2 font-semibold">
              <UsersRound className="h-5 w-5 shrink-0 text-brand-700" aria-hidden />
              <Auto text={personName(offerCrews[0].name, lang)} />
            </p>
          )}
          <PriceCard
            label={offerCrewId ? t("پوری ٹیم کی فی دن قیمت", "Poori crew ki fi din qeemat", "Price per day for the whole crew") : t("فی دن قیمت", "Fi din qeemat", "Price per day")}
            value={offerPrice}
            step={offerJob.step}
            floor={offerJob.floor}
            days={offerJob.durationDays}
            onStep={(direction) => setOfferPrice((price) => Math.max(offerJob.floor, price + (direction === "up" ? offerJob.step : -offerJob.step)))}
          />
          {offerError && (
            <div className="mt-2">
              <InlineError>{offerError}</InlineError>
            </div>
          )}
          <Button className="mt-3 w-full" size="xl" icon={Send} disabled={sending} onClick={() => void sendOffer()}>
            {myOffers.data?.get(offerJob.id) ? t("نئی قیمت بھیجیں", "Nayi qeemat bhejein", "Send new price") : t("آفر بھیجیں", "Offer bhejein", "Send offer")}
          </Button>
        </Sheet>
      )}
    </Screen>
  );
}
