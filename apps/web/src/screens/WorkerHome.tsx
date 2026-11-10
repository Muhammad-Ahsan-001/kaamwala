import { Bell, Check, CheckCheck, CloudOff, Lock, Moon, Play, Send, Settings as SettingsIcon, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { data, type Job, type JobFeedItem, type OfflinePreset, type WorkerCard } from "../data";
import { errorCode } from "../data/errors";
import { categoryName, firstName, rupees } from "../data/labels";
import { cue, speakUrdu } from "../lib/audio";
import { clockLabel, rangeLabel } from "../lib/dates";
import { cached } from "../lib/offline";
import { useData } from "../lib/useData";
import { useSettings } from "../lib/settings";
import { ErrorState } from "../ui/async";
import { CategoryIcon } from "../ui/CategoryIcon";
import { DayProgress } from "../ui/hire";
import { Avatar } from "../ui/people";
import { PriceCard } from "../ui/PriceCard";
import { Button, Card, EmptyState, InlineError, ListSkeleton, SectionTitle, Sheet, Skeleton, Tag, cx } from "../ui/primitives";
import { LangCycle, ReadAloud, Screen } from "../ui/shell";

const PRESETS: { value: OfflinePreset; ur: string; roman: string; en: string }[] = [
  { value: "1h", ur: "1 گھنٹہ", roman: "1 ghanta", en: "1 hour" },
  { value: "2h", ur: "2 گھنٹے", roman: "2 ghante", en: "2 hours" },
  { value: "today", ur: "آج", roman: "Aaj", en: "Today" },
  { value: "manual", ur: "جب تک بدلوں", roman: "Jab tak badloon", en: "Until I switch back" },
];

function StatusCard({ me, onChange, error }: { me: WorkerCard; onChange: (available: boolean, preset?: OfflinePreset) => void; error: boolean }) {
  const { t, lang } = useSettings();
  const locked = me.status === "engaged";
  const available = me.status === "available" || me.status === "requested";
  const [burst, setBurst] = useState(0);

  const english = lang === "en";
  const main = locked ? (english ? "On a job" : "کام جاری ہے") : available ? (english ? "I'm available" : "میں فارغ ہوں") : english ? "I'm busy" : "میں مصروف ہوں";
  const sub = locked
    ? t("کام مکمل ہونے تک بٹن بند ہے", "Kaam mukammal hone tak band hai", "Locked until this job is finished")
    : available
      ? t("گاہک آپ کو دیکھ سکتے ہیں", "Customers aap ko dekh sakte hain", "Customers can see you")
      : me.offlineUntil
        ? `${t("خود کھل جائے گا", "Khud khul jayega", "Back automatically at")} ${clockLabel(me.offlineUntil)}`
        : t("آپ کسی کو نظر نہیں آ رہے", "Aap kisi ko nazar nahi aa rahe", "You are hidden from customers");

  const flip = () => {
    if (locked) return;
    setBurst((n) => n + 1);
    onChange(!available, available ? "manual" : undefined);
  };

  const Icon = locked ? Lock : available ? Check : Moon;

  return (
    <div className={cx("on-color rounded-4xl p-4 text-white shadow-lift transition-colors duration-300", locked ? "bg-soft" : available ? "bg-brand-600" : "bg-busy-500")}>
      <button type="button" role="switch" aria-checked={available} disabled={locked} onClick={flip} className="flex w-full items-center justify-between gap-3 text-start disabled:cursor-not-allowed">
        <span className="min-w-0 flex-1">
          <span key={main} className={cx("block animate-pop text-3xl", english ? "latin font-extrabold" : "ur")}>
            {main}
          </span>
          <span className="block text-sm text-white/90">{sub}</span>
        </span>
        <span dir="ltr" className={cx("relative flex h-12 w-[88px] shrink-0 items-center rounded-full p-1 transition-colors duration-300", available ? "bg-white/30" : "bg-black/20")}>
          <span className={cx("status-thumb relative flex h-10 w-10 items-center justify-center rounded-full bg-white", available ? "translate-x-10" : "translate-x-0", available ? "text-brand-600" : locked ? "text-soft" : "text-busy-500")}>
            {burst > 0 && <span key={burst} className="absolute inset-0 animate-thumb rounded-full bg-white" aria-hidden />}
            <Icon className="relative h-6 w-6" strokeWidth={2.75} aria-hidden />
          </span>
        </span>
      </button>

      {!locked && (
        <div className="mt-3">
          <p className="text-sm text-white/90">{t("مصروف؟ کتنی دیر کے لیے:", "Masroof? Kitni der ke liye:", "Busy? For how long:")}</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button key={preset.value} type="button" onClick={() => onChange(false, preset.value)} className="min-h-12 rounded-full bg-white/20 px-4 font-semibold transition hover:bg-white/30 active:scale-95">
                {t(preset.ur, preset.roman, preset.en)}
              </button>
            ))}
          </div>
        </div>
      )}
      {error && <p className="mt-2 rounded-xl bg-white/20 px-3 py-1 text-sm font-semibold">{t("تبدیل نہیں ہو سکا، دوبارہ کوشش کریں", "Badal nahi saka, dobara koshish karein", "Could not change that. Please try again")}</p>}
    </div>
  );
}

function NewJobCard({ job, onAccept, onDismiss, categoryLabel, categoryIcon }: { job: JobFeedItem; onAccept: () => void; onDismiss: () => void; categoryLabel: string; categoryIcon?: string }) {
  const { t, lang, audioCues } = useSettings();
  const multi = job.durationDays > 1;
  const announce = () => speakUrdu(`نیا کام۔ ${job.description}۔ ${multi ? `${job.durationDays} دن کا کام۔` : ""}`, audioCues);
  const hasEstimate = job.priceMin !== null && job.priceMax !== null;

  return (
    <Card className={cx("border-2", hasEstimate ? "border-amber-400" : "border-line")}>
      <div className="flex items-center justify-between gap-2">
        <Tag>
          <CategoryIcon name={categoryIcon} className="h-4 w-4" />
          {categoryLabel}
        </Tag>
        {job.urgency === "urgent" && <Tag tone="busy">{t("فوری", "Jaldi", "Urgent")}</Tag>}
      </div>
      <div className="mt-2 flex items-start gap-3">
        <button type="button" onClick={announce} aria-label={t("سنیں", "Sunein", "Listen")} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 transition active:scale-95">
          <Play className="h-5 w-5" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{job.description}</p>
          <p className="text-sm text-soft">
            <span className="latin">{job.area}</span>
            {job.distanceKm !== undefined && (
              <>
                {" · "}
                <span className="latin">{job.distanceKm}</span> {t("کلومیٹر", "km", "km")}
              </>
            )}
          </p>
        </div>
      </div>
      <div className="mt-2 rounded-2xl bg-sunken px-3 py-1 font-bold">
        <span className="latin">{job.durationDays}</span> {t("دن کا کام", job.durationDays === 1 ? "din ka kaam" : "din ka kaam", job.durationDays === 1 ? "day of work" : "days of work")} <span className="font-normal text-soft">· {rangeLabel(job.startDate, job.durationDays, lang)}</span>
      </div>
      {hasEstimate && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-soft">{t("اندازہ", "Andaza", "Estimate")}</span>
          <span className="latin text-lg font-extrabold">
            {rupees(job.priceMin ?? 0)} – {(job.priceMax ?? 0).toLocaleString("en-PK")}
            <span className="ms-1 text-sm font-normal text-soft">/ {t("دن", "din", "day")}</span>
          </span>
        </div>
      )}
      <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
        <Button variant="secondary" size="xl" aria-label={t("نہیں", "Nahi", "No")} onClick={onDismiss} className="w-20">
          <X className="h-6 w-6" aria-hidden />
        </Button>
        <Button size="xl" icon={Check} onClick={onAccept}>
          {t("قبول", "Qubool", "Accept")}
        </Button>
      </div>
    </Card>
  );
}

function ActiveJob({ job, onDayDone, working, categoryLabel }: { job: Job; onDayDone: () => void; working: boolean; categoryLabel: string }) {
  const { t, lang } = useSettings();
  const multi = job.durationDays > 1;
  return (
    <div className="mt-3 space-y-2">
      <Link to={`/app/jobs/${job.id}`} className="block">
        <Card className="p-3">
          <p className="text-sm text-soft">{categoryLabel}</p>
          <p className="font-bold">{job.card?.task ?? job.description}</p>
          <p className="text-sm text-soft">
            <span className="latin">{job.area}</span> · {rangeLabel(job.startDate, job.durationDays, lang)}
          </p>
        </Card>
      </Link>
      {multi && <DayProgress days={job.days} />}
      <Button size="xl" icon={CheckCheck} className="w-full" disabled={working} onClick={onDayDone}>
        {multi ? t("آج کا کام مکمل", "Aaj ka kaam mukammal", "Today's work is done") : t("کام مکمل ہو گیا", "Kaam mukammal ho gaya", "Job finished")}
      </Button>
    </div>
  );
}

export function WorkerHome() {
  const { t, lang, audioCues } = useSettings();
  const navigate = useNavigate();
  const [me, setMe] = useState<WorkerCard | null>(null);
  const [meFailed, setMeFailed] = useState(false);
  const [toggleFailed, setToggleFailed] = useState(false);
  const [offerJob, setOfferJob] = useState<JobFeedItem | null>(null);
  const [offerPrice, setOfferPrice] = useState(0);
  const [offerError, setOfferError] = useState(false);
  const [sending, setSending] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const [sent, setSent] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const jobs = useData(() => data.listOpenJobs(), []);
  const mine = useData(() => data.listMyJobs(), []);
  const earnings = useData(() => cached("earnings", () => data.getEarnings()), []);
  const categories = useData(() => data.listCategories(), []);

  const loadMe = useCallback(() => {
    setMeFailed(false);
    data.getMyWorker().then(setMe, () => setMeFailed(true));
  }, []);

  useEffect(loadMe, [loadMe]);

  // Come back to available by itself when a busy preset runs out.
  useEffect(() => {
    if (!me?.offlineUntil) return;
    const delay = new Date(me.offlineUntil).getTime() - Date.now();
    const timer = setTimeout(loadMe, Math.max(0, delay) + 500);
    return () => clearTimeout(timer);
  }, [me?.offlineUntil, loadMe]);

  const changeAvailability = (available: boolean, preset?: OfflinePreset) => {
    if (!me) return;
    const previous = me;
    setToggleFailed(false);
    cue(available ? "up" : "down", audioCues);
    speakUrdu(available ? "میں فارغ ہوں" : "میں مصروف ہوں", audioCues);
    // Show the change at once and put it back if the server refuses.
    setMe({ ...me, status: available ? "available" : "offline" });
    data.setAvailability(available, preset).then(setMe, (error: unknown) => {
      setMe(previous);
      if (errorCode(error) === "WORKER_ENGAGED") loadMe();
      else setToggleFailed(true);
    });
  };

  const category = (id: string) => categories.data?.find((c) => c.id === id);

  const active = mine.data?.find((job) => job.status === "engaged");

  const finishDay = async () => {
    if (!active) return;
    setWorking(true);
    try {
      const nextDay = active.days.find((d) => d.status === "scheduled");
      const updated = active.durationDays > 1 && nextDay ? await data.completeDay(active.id, nextDay.dayNumber) : await data.completeJob(active.id);
      cue("success", audioCues);
      mine.reload();
      loadMe();
      earnings.reload();
      if (updated.status === "completed") navigate(`/app/jobs/${updated.id}/review`);
    } finally {
      setWorking(false);
    }
  };

  const visibleJobs = (jobs.data ?? []).filter((job) => !hidden.includes(job.id));

  const sendOffer = async () => {
    if (!offerJob) return;
    setSending(true);
    setOfferError(false);
    try {
      await data.sendOffer(offerJob.id, offerPrice);
      setSent((list) => [...list, offerJob.id]);
      setOfferJob(null);
      cue("success", audioCues);
    } catch {
      setOfferError(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen nav="worker" bare>
      <div className="px-4 pb-6">
        <header className="flex min-h-16 items-center gap-3">
          {me ? <Avatar name={me.name} url={me.photoUrl} size={44} /> : <Skeleton className="h-11 w-11 rounded-full" />}
          <div className="min-w-0 flex-1">
            <p className="text-sm text-soft">{t("السلام علیکم", "Assalam o Alaikum", "Assalam o Alaikum")}</p>
            <p className="truncate text-lg font-bold">{me ? firstName(me.name, lang) : ""}</p>
          </div>
          <ReadAloud text={me ? (me.status === "available" ? "آپ فارغ ہیں۔ گاہک آپ کو دیکھ سکتے ہیں۔" : me.status === "engaged" ? "آپ کا کام جاری ہے۔" : "آپ مصروف ہیں۔") : ""} />
          <LangCycle />
          <Link to="/app/settings" aria-label={t("ترتیبات", "Settings", "Settings")} className="flex h-12 w-12 items-center justify-center rounded-2xl text-soft hover:bg-sunken">
            <SettingsIcon className="h-6 w-6" aria-hidden />
          </Link>
        </header>

        {meFailed ? <ErrorState onRetry={loadMe} /> : me ? <StatusCard me={me} onChange={changeAvailability} error={toggleFailed} /> : <Skeleton className="h-52 w-full rounded-4xl" />}

        {active && <ActiveJob job={active} working={working} onDayDone={() => void finishDay()} categoryLabel={categoryName(category(active.categoryId), lang)} />}

        <SectionTitle>{t("نیا کام", "Naya kaam", "New jobs")}</SectionTitle>
        {jobs.error ? (
          <ErrorState onRetry={jobs.reload} />
        ) : !jobs.data ? (
          <ListSkeleton rows={1} />
        ) : visibleJobs.length === 0 ? (
          <EmptyState icon={Bell} title={t("ابھی کوئی نیا کام نہیں", "Abhi koi naya kaam nahi", "No new jobs right now")} body={t("کام آتے ہی ہم بتائیں گے", "Kaam aate hi hum batayenge", "We will tell you as soon as one comes in")} />
        ) : (
          <div className="stagger space-y-3">
            {visibleJobs.map((job) =>
              sent.includes(job.id) ? (
                <Card key={job.id} className="flex items-center gap-2 border-brand-200 bg-brand-50 font-bold text-brand-700">
                  <CheckCheck className="h-6 w-6" aria-hidden />
                  {t("آپ کی آفر بھیج دی گئی", "Aapki offer bhej di gayi", "Your offer was sent")}
                </Card>
              ) : (
                <NewJobCard
                  key={job.id}
                  job={job}
                  categoryLabel={categoryName(category(job.categoryId), lang)}
                  categoryIcon={category(job.categoryId)?.icon}
                  onDismiss={() => setHidden((list) => [...list, job.id])}
                  onAccept={() => {
                    setOfferPrice(Math.max(job.floor, me?.rate ?? job.floor));
                    setOfferError(false);
                    setOfferJob(job);
                  }}
                />
              ),
            )}
          </div>
        )}

        <Card className="mt-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base">{t("میری کمائی", "Meri kamai", "My earnings")}</h2>
            <Tag tone="plain">
              <CloudOff className="h-3.5 w-3.5" aria-hidden />
              {t("آف لائن بھی", "offline bhi", "works offline")}
            </Tag>
          </div>
          {earnings.error ? (
            <ErrorState onRetry={earnings.reload} />
          ) : (
            <div className="mt-1 grid grid-cols-3 gap-2">
              <div>
                <div className="text-sm text-soft">{t("آج", "Aaj", "Today")}</div>
                <div className="latin text-lg font-extrabold">{earnings.data ? rupees(earnings.data.value.today) : "–"}</div>
              </div>
              <div>
                <div className="text-sm text-soft">{t("اس ہفتے", "Is hafte", "This week")}</div>
                <div className="latin text-lg font-extrabold">{earnings.data ? rupees(earnings.data.value.week) : "–"}</div>
              </div>
              <div>
                <div className="text-sm text-soft">{t("کام", "Kaam", "Jobs")}</div>
                <div className="latin text-lg font-extrabold">{earnings.data?.value.jobCount ?? "–"}</div>
              </div>
            </div>
          )}
        </Card>
      </div>

      {offerJob && (
        <Sheet title={t("آپ کی قیمت", "Aapki qeemat", "Your price")} onClose={() => setOfferJob(null)}>
          <PriceCard
            label={t("فی دن قیمت", "Fi din qeemat", "Price per day")}
            value={offerPrice}
            step={offerJob.step}
            floor={offerJob.floor}
            days={offerJob.durationDays}
            onStep={(direction) => setOfferPrice((price) => Math.max(offerJob.floor, price + (direction === "up" ? offerJob.step : -offerJob.step)))}
          />
          {offerError && (
            <div className="mt-2">
              <InlineError>{t("آفر نہیں بھیجی جا سکی", "Offer nahi bheji ja saki", "Could not send your offer")}</InlineError>
            </div>
          )}
          <Button className="mt-3 w-full" size="xl" icon={Send} disabled={sending} onClick={() => void sendOffer()}>
            {t("آفر بھیجیں", "Offer bhejein", "Send offer")}
          </Button>
        </Sheet>
      )}
    </Screen>
  );
}
