import { Ban, Briefcase, Calendar, Check, CheckCheck, CircleCheck, Clock, ClipboardList, Flag, Frown, Hourglass, Info, LoaderCircle, MapPin, Meh, Mic, RotateCcw, Send, Smile, Sparkles, Star, Timer, UsersRound, Wallet, Wrench, X, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { data, type Category, type Job, type Message, type Offer } from "../data";
import { errorCode, errorText } from "../data/errors";
import { areaName, bestOfferId, categoryName, firstName, personName, phrase, rupees } from "../data/labels";
import { cue } from "../lib/audio";
import { clockLabel, rangeLabel, today } from "../lib/dates";
import { useSession } from "../lib/session";
import { clock, useRecorder } from "../lib/useRecorder";
import { useConnection, useData } from "../lib/useData";
import { useSettings } from "../lib/settings";
import { Async } from "../ui/async";
import { CategoryIcon } from "../ui/CategoryIcon";
import { BusyNotice, DayProgress, PriceMath } from "../ui/hire";
import { Avatar } from "../ui/people";
import { PriceCard } from "../ui/PriceCard";
import { AiTag, Auto, Button, Card, Chip, EmptyState, InlineError, LinkButton, ListSkeleton, OneLine, Rating, SectionTitle, Sheet, Tag, cx } from "../ui/primitives";
import { Screen } from "../ui/shell";
import { Asked, QuestionVoice } from "../ui/QuestionVoice";
import type { VoiceId } from "../lib/question-voices";
import { BigMic, LiveWave, TextBubble, VoiceNote, Waveform } from "../ui/voice";

const useCategories = () => useData(() => data.listCategories(), []);

const Spinner = () => <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden />;

function NotFound() {
  const { t } = useSettings();
  return <EmptyState icon={Briefcase} title={t("یہ کام نہیں ملا", "Ye kaam nahi mila", "Job not found")} />;
}

/** A worker whose offer lost can no longer open the job, but can still see their own offer's result. */
function JobGone({ id }: { id: string }) {
  const { t } = useSettings();
  const { user } = useSession();
  const offers = useData(() => (user?.role === "worker" ? data.listOffers(id).catch((): Offer[] => []) : Promise.resolve<Offer[]>([])), [id, user?.role]);
  if (offers.loading && !offers.data) return <ListSkeleton rows={1} />;
  if (offers.data?.some((offer) => offer.status === "rejected")) {
    return <EmptyState icon={Briefcase} title={t("گاہک نے کسی اور کو چن لیا", "Gahak ne kisi aur ko chun liya", "The customer chose someone else")} body={t("اگلا کام جلد آئے گا", "Agla kaam jald aayega", "The next job will come soon")} />;
  }
  return <NotFound />;
}

function JobSummary({ job, categories }: { job: Job; categories: Category[] }) {
  const { t, lang } = useSettings();
  const category = categories.find((c) => c.id === job.categoryId);
  return (
    <Card className="p-3">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sunken text-brand-700">
          <CategoryIcon name={category?.icon} className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-words font-bold">
            <Auto text={job.description} />
          </p>
          <p className="text-sm text-soft">
            <Auto text={areaName(job.area, lang)} /> · <span className="latin">{job.durationDays}</span> {t("دن", "din", job.durationDays === 1 ? "day" : "days")} · {rangeLabel(job.startDate, job.durationDays, lang)}
          </p>
        </div>
      </div>
      {job.photoUrls.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto">
          {job.photoUrls.map((url) => (
            <img key={url} src={url} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-2xl object-cover" />
          ))}
        </div>
      )}
    </Card>
  );
}

function Banner({ tone = "brand", icon: Icon, children }: { tone?: "brand" | "busy" | "plain" | "amber"; icon: LucideIcon; children: ReactNode }) {
  const tones = {
    brand: "bg-brand-100 text-brand-700",
    busy: "bg-busy-50 text-busy-700",
    plain: "bg-sunken text-soft",
    amber: "bg-amber-50 text-amber-800",
  };
  return (
    <div className={cx("flex animate-rise items-center gap-2 rounded-2xl px-3 py-2 font-bold", tones[tone])}>
      <Icon className="h-6 w-6 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

/** Says so when live updates have stopped, so nobody waits on a screen that cannot change. */
function ConnectionNote() {
  const { t } = useSettings();
  const state = useConnection();
  const [late, setLate] = useState(false);

  useEffect(() => {
    if (state === "live") {
      setLate(false);
      return;
    }
    const timer = setTimeout(() => setLate(true), 3000);
    return () => clearTimeout(timer);
  }, [state]);

  if (state === "live" || !late) return null;
  return <Banner tone="amber" icon={Hourglass}>{t("رابطہ ٹوٹ گیا، دوبارہ جوڑ رہے ہیں", "Rabta toot gaya, dobara jor rahe hain", "Connection lost. Reconnecting")}</Banner>;
}

function LiveBadge() {
  const { t } = useSettings();
  return useConnection() === "live" ? <Tag>{t("لائیو", "Live", "Live")}</Tag> : null;
}

type Tone = "brand" | "busy" | "plain";
type StatusWords = { ur: string; roman: string; en: string; tone: Tone };

const JOB_STATUS: Record<Job["status"], StatusWords> = {
  open: { ur: "آفرز آ رہی ہیں", roman: "Offers aa rahi hain", en: "Collecting offers", tone: "plain" },
  requested: { ur: "درخواست بھیجی", roman: "Darkhwast bheji", en: "Requested", tone: "plain" },
  negotiating: { ur: "قیمت کی بات", roman: "Qeemat ki baat", en: "Negotiating", tone: "plain" },
  pending_confirmation: { ur: "تصدیق باقی", roman: "Tasdeeq baqi", en: "To confirm", tone: "brand" },
  engaged: { ur: "کام جاری", roman: "Kaam jari", en: "In progress", tone: "busy" },
  completed: { ur: "مکمل", roman: "Mukammal", en: "Completed", tone: "brand" },
  cancelled: { ur: "منسوخ", roman: "Mansookh", en: "Cancelled", tone: "plain" },
  disputed: { ur: "شکایت", roman: "Shikayat", en: "Disputed", tone: "busy" },
};

function statusWords(job: Job, isCustomer: boolean): StatusWords {
  if (!isCustomer && job.status === "requested") return { ur: "نئی درخواست", roman: "Nayi darkhwast", en: "New request", tone: "brand" };
  if (!isCustomer && job.status === "open") return { ur: "آفر بھیجی", roman: "Offer bheji", en: "Offer sent", tone: "plain" };
  return JOB_STATUS[job.status];
}

const ACTIVE_STATUSES: Job["status"][] = ["open", "requested", "negotiating", "pending_confirmation", "engaged"];

function JobRow({ job, category, isCustomer }: { job: Job; category: Category | undefined; isCustomer: boolean }) {
  const { t, lang } = useSettings();
  const status = statusWords(job, isCustomer);
  const perDay = job.agreedPrice ?? job.proposedPrice;
  return (
    <Link to={job.status === "open" ? `/app/jobs/${job.id}/offers` : `/app/jobs/${job.id}`} className="flex items-center gap-3 rounded-3xl border border-line bg-surface p-3 transition active:scale-[0.99]">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sunken text-brand-700">
        <CategoryIcon name={category?.icon} className="h-6 w-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{categoryName(category, lang)}</span>
        <OneLine text={job.description} className="text-sm text-soft" />
        <span className="block text-sm text-soft">
          <span className="latin">{job.durationDays}</span> {t("دن", "din", job.durationDays === 1 ? "day" : "days")}
          {perDay !== null && (
            <>
              {" · "}
              <span className="latin">{rupees(perDay)}</span>
            </>
          )}
        </span>
      </span>
      <Tag tone={status.tone}>{t(status.ur, status.roman, status.en)}</Tag>
    </Link>
  );
}

function CrewEntry() {
  const { t } = useSettings();
  const { user } = useSession();
  const worker = user?.role === "worker";
  const invites = useData(() => (worker ? data.listCrewInvites() : Promise.resolve([])), [worker], { reloadOn: ["crew.invited"] });
  const count = invites.data?.length ?? 0;
  return (
    <Link to={worker ? "/app/crews" : "/app/crew-job"} className="mb-3 flex min-h-16 items-center gap-3 rounded-3xl border border-line bg-surface p-3 transition active:scale-[0.99]">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
        <UsersRound className="h-6 w-6" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 font-bold">{worker ? t("میری ٹیم", "Meri crew", "My crew") : t("پوری ٹیم بلائیں", "Poori crew bulao", "Hire a whole crew")}</span>
      {count > 0 && (
        <Tag tone="busy">
          <span className="latin">{count}</span> {t("دعوت", "dawat", count === 1 ? "invite" : "invites")}
        </Tag>
      )}
    </Link>
  );
}

export function MyJobs() {
  const { t } = useSettings();
  const { user } = useSession();
  const categories = useCategories();
  const jobs = useData(() => data.listMyJobs(), [], { reloadOn: ["job.updated", "offer.created", "offer.updated"] });
  const worker = user?.role === "worker";

  const row = (job: Job) => <JobRow key={job.id} job={job} isCustomer={job.customerId === user?.id} category={categories.data?.find((c) => c.id === job.categoryId)} />;

  return (
    <Screen title={t("میرے کام", "Mere kaam", "My jobs")} nav={worker ? "worker" : "customer"}>
      <CrewEntry />
      <Async query={jobs} skeleton={<ListSkeleton />}>
        {(list) => {
          if (list.length === 0) {
            return (
              <EmptyState
                icon={Briefcase}
                title={t("ابھی کوئی کام نہیں", "Abhi koi kaam nahi", "No jobs yet")}
                body={worker ? t("فارغ رہیں، کام آئے گا", "Farigh rahein, kaam aayega", "Stay available and jobs will come") : t("مسئلہ بتا کر کام شروع کریں", "Masla bata kar shuru karein", "Describe a problem to get started")}
              />
            );
          }
          const active = list.filter((job) => ACTIVE_STATUSES.includes(job.status));
          const past = list.filter((job) => !ACTIVE_STATUSES.includes(job.status));
          return (
            <>
              {active.length > 0 && <div className="stagger space-y-3">{active.map(row)}</div>}
              {past.length > 0 && (
                <>
                  <SectionTitle>{t("پرانے کام", "Purane kaam", "Past jobs")}</SectionTitle>
                  <div className="space-y-3">{past.map(row)}</div>
                </>
              )}
            </>
          );
        }}
      </Async>
    </Screen>
  );
}

function CrewOfferLine({ crewId }: { crewId: string }) {
  const { t, lang } = useSettings();
  const crew = useData(() => data.getCrew(crewId), [crewId]);
  if (!crew.data) return null;
  return (
    <Link to={`/app/crews/${crewId}`} className="mt-1 flex min-h-12 items-center gap-2 rounded-2xl bg-amber-50 px-3 font-semibold text-amber-800">
      <UsersRound className="h-5 w-5 shrink-0" aria-hidden />
      <OneLine text={personName(crew.data.name, lang)} className="min-w-0 flex-1" />
      <span className="shrink-0 text-sm">
        <span className="latin">{crew.data.members.length}</span> {t("لوگ", "log", "people")}
      </span>
    </Link>
  );
}

function OfferCard({ offer, job, best, accepting, onAccept }: { offer: Offer; job: Job; best: boolean; accepting: string | null; onAccept: () => void }) {
  const { t, lang } = useSettings();
  const stillFree = offer.worker.status === "available";
  return (
    <Card className={cx("p-3", best && "border-2 border-brand-600")}>
      <div className="flex items-center gap-3">
        <Link to={`/app/workers/${offer.worker.id}`} aria-label={offer.worker.name} className="flex h-12 w-12 shrink-0 items-center justify-center">
          <Avatar name={offer.worker.name} url={offer.worker.photoUrl} size={48} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 font-bold">
            <Auto text={firstName(offer.worker.name, lang)} />
            {best && <Tag>{t("بہترین", "best match", "best match")}</Tag>}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 text-sm text-soft">
            {offer.worker.trust.ratingCount > 0 ? <Rating value={offer.worker.trust.rating} count={offer.worker.trust.ratingCount} /> : <span>{t("ابھی کوئی ریٹنگ نہیں", "Abhi koi rating nahi", "No ratings yet")}</span>}
            {offer.worker.distanceKm !== undefined && (
              <span>
                <span className="latin">{offer.worker.distanceKm}</span> {t("کلومیٹر", "km", "km")}
              </span>
            )}
            {offer.etaMinutes !== null && (
              <span>
                <span className="latin">{offer.etaMinutes}</span> {t("منٹ میں", "minute mein", "min away")}
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 text-end">
          <div className="latin text-lg font-extrabold">{rupees(offer.price)}</div>
          <div className="text-sm text-soft">/ {t("دن", "din", "day")}</div>
        </div>
      </div>
      {offer.crewId && <CrewOfferLine crewId={offer.crewId} />}
      {job.durationDays > 1 && <PriceMath perDay={offer.price} days={job.durationDays} className="mt-1 text-sm" />}
      <Button size="md" variant={best ? "primary" : "secondary"} className="mt-2 w-full" icon={accepting === offer.id ? undefined : Check} disabled={accepting !== null || !stillFree} onClick={onAccept}>
        {accepting === offer.id ? <Spinner /> : stillFree ? t("قبول", "Qubool", "Accept") : t("اب فارغ نہیں", "Ab farigh nahi", "No longer free")}
      </Button>
    </Card>
  );
}

function CustomerOffers({ job, categories }: { job: Job; categories: Category[] }) {
  const { t, audioCues } = useSettings();
  const navigate = useNavigate();
  const id = job.id;
  const bidders = useRef<string[]>([]);
  const offers = useData(() => data.listOffers(id), [id], {
    reloadOn: ["offer.created", "offer.updated", "worker.status"],
    when: (e) => (e.type === "offer.created" || e.type === "offer.updated" ? e.offer.jobId === id : e.type === "worker.status" && bidders.current.includes(e.workerId)),
  });
  bidders.current = offers.data?.map((offer) => offer.worker.id) ?? [];
  const [accepting, setAccepting] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const known = useRef<number | null>(null);

  const pending = useMemo(() => (offers.data ?? []).filter((offer) => offer.status === "pending"), [offers.data]);

  useEffect(() => {
    if (!offers.data) return;
    if (known.current !== null && pending.length > known.current) cue("up", audioCues);
    known.current = pending.length;
  }, [offers.data, pending.length, audioCues]);

  const accept = async (offerId: string) => {
    setAccepting(offerId);
    setError(null);
    try {
      await data.acceptOffer(id, offerId);
      cue("success", audioCues);
      navigate(`/app/jobs/${id}`, { replace: true });
    } catch (err) {
      setError(errorText(err, t));
      offers.reload();
    } finally {
      setAccepting(null);
    }
  };

  const cancel = async () => {
    setCancelling(true);
    setError(null);
    try {
      await data.cancelJob(id);
      navigate("/app/jobs", { replace: true });
    } catch (err) {
      setError(errorText(err, t));
      setCancelling(false);
      setAsking(false);
    }
  };

  const best = bestOfferId(pending);
  const sorted = [...pending].sort((a, b) => (a.worker.distanceKm ?? 0) - (b.worker.distanceKm ?? 0));

  return (
    <div className="space-y-3">
      <ConnectionNote />
      <JobSummary job={job} categories={categories} />
      <p className="flex items-start gap-2 rounded-2xl bg-sunken p-3 text-sm">
        <Info className="mt-1 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
        <span>
          {t("کاریگر اپنی فی دن قیمت بھیجیں گے۔ قبول کرنے کے بعد آپ قیمت پر بات کر سکتے ہیں۔", "Kaarigar apni fi din qeemat bhejenge. Qubool karne ke baad aap qeemat par baat kar sakte hain.", "Workers send their price per day. After you accept one, you can still agree the final price together.")}{" "}
          <span className="font-semibold text-amber-700">
            {t("کم از کم", "Kam az kam", "Minimum")} <span className="latin">{rupees(job.floor)}</span>
          </span>
        </span>
      </p>
      <Async query={offers}>
        {() => (
          <>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg">
                <span className="latin">{pending.length}</span> {t("آفرز آئیں", "offers aayi", pending.length === 1 ? "offer" : "offers")}
              </h2>
              <span className="text-sm text-soft">{t("قریب پہلے", "qareeb pehle", "nearest first")}</span>
            </div>
            {sorted.length === 0 ? (
              <EmptyState icon={Timer} title={t("ابھی کوئی آفر نہیں", "Abhi koi offer nahi", "No offers yet")} body={job.mode === "crew" ? t("قریب کی ٹیموں کو بتا دیا گیا ہے", "Qareeb ki crews ko bata diya gaya hai", "Crews nearby have been told about your job") : t("قریب کے کاریگروں کو بتا دیا گیا ہے", "Qareeb ke kaarigaron ko bata diya gaya hai", "Workers nearby have been told about your job")} />
            ) : (
              <div className="stagger space-y-3">
                {sorted.map((offer) => (
                  <OfferCard key={offer.id} offer={offer} job={job} best={offer.id === best} accepting={accepting} onAccept={() => void accept(offer.id)} />
                ))}
              </div>
            )}
          </>
        )}
      </Async>
      {error && <InlineError>{error}</InlineError>}
      <Button variant="ghost" size="md" icon={Ban} className="w-full !text-busy-700 hover:!bg-busy-50" onClick={() => setAsking(true)}>
        {t("کام منسوخ کریں", "Kaam mansookh karein", "Cancel this job")}
      </Button>
      {asking && (
        <ConfirmSheet title={t("کام منسوخ کریں؟", "Kaam mansookh karein?", "Cancel this job?")} body={t("سب آفرز ختم ہو جائیں گی۔", "Sab offers khatam ho jayengi.", "All offers will end.")} confirm={t("منسوخ کریں", "Mansookh karein", "Cancel job")} working={cancelling} onClose={() => setAsking(false)} onConfirm={() => void cancel()} />
      )}
    </div>
  );
}

/** A worker's side of an open job: what it is, and their price for it. */
function WorkerBid({ job, categories }: { job: Job; categories: Category[] }) {
  const { t, lang, audioCues } = useSettings();
  const { user } = useSession();
  const id = job.id;
  const isCrewJob = job.mode === "crew";
  const offers = useData(() => data.listOffers(id), [id], { reloadOn: ["offer.created", "offer.updated"], when: (e) => (e.type === "offer.created" || e.type === "offer.updated") && e.offer.jobId === id });
  const me = useData(() => data.getMyWorker(), []);
  const crews = useData(() => (isCrewJob ? data.listMyCrews() : Promise.resolve([])), [isCrewJob]);
  const led = useMemo(() => (crews.data ?? []).filter((crew) => crew.leaderId === user?.workerId && crew.categoryIds.includes(job.categoryId)), [crews.data, user?.workerId, job.categoryId]);
  const [crewId, setCrewId] = useState<string | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const crew = led.find((c) => c.id === crewId) ?? led[0] ?? null;
  const mine = offers.data?.find((offer) => offer.status === "pending") ?? null;

  useEffect(() => {
    if (price !== null || !offers.data || !me.data || !crews.data) return;
    setPrice(Math.max(job.floor, mine?.price ?? (isCrewJob ? (crew?.rate ?? job.floor) : me.data.rate)));
  }, [price, offers.data, me.data, crews.data, mine?.price, isCrewJob, crew?.rate, job.floor]);

  const send = async () => {
    if (price === null) return;
    setSending(true);
    setError(null);
    try {
      await data.sendOffer(id, price, crew ? { crewId: crew.id } : undefined);
      cue("success", audioCues);
      offers.reload();
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setSending(false);
    }
  };

  const notFree = isCrewJob ? crew !== null && !crew.available : me.data !== null && me.data.status !== "available";

  return (
    <div className="space-y-3">
      <JobSummary job={job} categories={categories} />
      {job.customerName && (
        <p className="text-sm text-soft">
          {t("گاہک", "Gahak", "Customer")}: <Auto text={firstName(job.customerName, lang)} />
        </p>
      )}
      {mine && (
        <Banner icon={CheckCheck}>
          {t("آپ کی آفر", "Aapki offer", "Your offer")} <span className="latin">{rupees(mine.price)}</span> · {t("جواب کا انتظار", "jawab ka intezar", "waiting for an answer")}
        </Banner>
      )}
      {isCrewJob && crews.data && led.length === 0 ? (
        <EmptyState icon={UsersRound} title={t("صرف ٹیم کا لیڈر آفر دے سکتا ہے", "Sirf crew ka leader offer de sakta hai", "Only a crew leader can bid on this job")} />
      ) : (
        <>
          {led.length > 1 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label={t("ٹیم چنیں", "Crew chunein", "Choose a crew")}>
              {led.map((option) => (
                <Chip
                  key={option.id}
                  active={crew?.id === option.id}
                  onClick={() => {
                    setCrewId(option.id);
                    if (!mine) setPrice(Math.max(job.floor, option.rate));
                  }}
                >
                  <Auto text={personName(option.name, lang)} />
                </Chip>
              ))}
            </div>
          )}
          {crew && (
            <p className="flex items-center gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
              <UsersRound className="h-4 w-4 shrink-0" aria-hidden />
              <span>
                <Auto text={personName(crew.name, lang)} /> · <span className="latin">{crew.members.length}</span> {t("لوگ، سب کی ایک قیمت", "log, sab ki ek qeemat", "people, one price for all")}
              </span>
            </p>
          )}
          {price === null ? (
            <ListSkeleton rows={1} />
          ) : (
            <PriceCard label={crew ? t("پوری ٹیم، فی دن", "Poori crew, fi din", "Whole crew, per day") : t("فی دن قیمت", "Fi din qeemat", "Price per day")} value={price} step={job.step} floor={job.floor} days={job.durationDays} onStep={(direction) => setPrice((p) => Math.max(job.floor, (p ?? job.floor) + (direction === "up" ? job.step : -job.step)))} />
          )}
          {notFree && <Banner tone="amber" icon={Info}>{crew ? t("ٹیم کے سب لوگ فارغ ہوں تو آفر جا سکتی ہے", "Crew ke sab log farigh hon to offer ja sakti hai", "Everyone in the crew must be free to bid") : t("فارغ ہو کر آفر بھیجیں", "Farigh ho kar offer bhejein", "Set yourself as available to send an offer")}</Banner>}
          {error && <InlineError>{error}</InlineError>}
          <Button className="w-full" size="xl" icon={sending ? undefined : Send} disabled={sending || price === null || notFree} onClick={() => void send()}>
            {sending ? <Spinner /> : mine ? t("نئی قیمت بھیجیں", "Nayi qeemat bhejein", "Update my offer") : t("آفر بھیجیں", "Offer bhejein", "Send offer")}
          </Button>
        </>
      )}
    </div>
  );
}

export function Offers() {
  const { id = "" } = useParams();
  const { t } = useSettings();
  const navigate = useNavigate();
  const { user } = useSession();
  const job = useData(() => data.getJob(id), [id], {
    reloadOn: ["job.updated", "offer.updated"],
    when: (e) => (e.type === "job.updated" && e.job.id === id) || (e.type === "offer.updated" && e.offer.jobId === id),
  });
  const categories = useCategories();

  // Picked by the customer, or taken away: this screen is only for a job still collecting offers.
  useEffect(() => {
    if (job.data && job.data.status !== "open") navigate(`/app/jobs/${id}`, { replace: true });
  }, [job.data, id, navigate]);

  const isCustomer = job.data?.customerId === user?.id;

  return (
    <Screen title={isCustomer ? t("آپ کا کام", "Aapka kaam", "Your job") : t("نیا کام", "Naya kaam", "New job")} back="/app/jobs" right={<LiveBadge />}>
      <Async query={job} skeleton={<ListSkeleton />}>
        {(value) => (!value ? <JobGone id={id} /> : value.status !== "open" ? <ListSkeleton /> : isCustomer ? <CustomerOffers job={value} categories={categories.data ?? []} /> : <WorkerBid job={value} categories={categories.data ?? []} />)}
      </Async>
    </Screen>
  );
}

function CardRow({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-0.5">
      <Icon className="mt-1 h-5 w-5 shrink-0 text-brand-600" aria-hidden />
      <div className="min-w-0 flex-1 font-semibold">{children}</div>
    </div>
  );
}

function ConfirmSheet({ title, body, confirm, working, onClose, onConfirm }: { title: string; body: string; confirm: string; working: boolean; onClose: () => void; onConfirm: () => void }) {
  const { t } = useSettings();
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="flex gap-2 rounded-2xl bg-sunken p-3">
        <Info className="mt-1 h-5 w-5 shrink-0 text-brand-600" aria-hidden />
        <p>{body}</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" size="xl" onClick={onClose}>
          {t("واپس", "Wapas", "Go back")}
        </Button>
        <Button size="xl" disabled={working} onClick={onConfirm} className="!bg-busy-600 hover:!bg-busy-700">
          {working ? <Spinner /> : confirm}
        </Button>
      </div>
    </Sheet>
  );
}

const DISPUTE_REASONS = [
  { ur: "کام پورا نہیں ہوا", roman: "Kaam poora nahi hua", en: "The work was not finished" },
  { ur: "پیسوں کا مسئلہ", roman: "Paison ka masla", en: "A problem with payment" },
  { ur: "برا رویہ", roman: "Bura rawaiya", en: "Bad behaviour" },
  { ur: "نہیں آیا", roman: "Nahi aaya", en: "They did not come" },
];

function DisputeSheet({ working, underway, onClose, onSend }: { working: boolean; underway: boolean; onClose: () => void; onSend: (reason: string) => void }) {
  const { t } = useSettings();
  const [reason, setReason] = useState("");
  const ready = reason.trim().length >= 3;
  return (
    <Sheet title={t("شکایت درج کریں", "Shikayat darj karein", "Report a problem")} onClose={onClose}>
      <div className="flex flex-wrap gap-2">
        {DISPUTE_REASONS.map((option) => {
          const words = t(option.ur, option.roman, option.en);
          return (
            <Chip key={option.en} active={reason === words} onClick={() => setReason(words)}>
              {words}
            </Chip>
          );
        })}
      </div>
      <textarea dir="auto" rows={2} maxLength={1000} className="field mt-3 resize-none" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("یا لکھیں کیا ہوا", "Ya likhein kya hua", "Or type what happened")} aria-label={t("شکایت", "Shikayat", "Complaint")} />
      {underway && <p className="mt-2 rounded-2xl bg-amber-50 p-3 text-sm text-amber-800">{t("اس سے کام رک جائے گا۔ صرف مکمل دنوں کے پیسے لگیں گے اور ایڈمن شکایت دیکھے گا۔", "Is se kaam ruk jayega. Sirf mukammal dinon ke paise lagenge aur admin shikayat dekhega.", "This stops the job. Only completed days are charged, and an admin will review it.")}</p>}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" size="xl" onClick={onClose}>
          {t("واپس", "Wapas", "Go back")}
        </Button>
        <Button size="xl" icon={working ? undefined : Flag} disabled={!ready || working} onClick={() => onSend(reason.trim())}>
          {working ? <Spinner /> : t("بھیجیں", "Bhejein", "Send")}
        </Button>
      </div>
    </Sheet>
  );
}

/** Text or a voice note. Typing is always there, for when the microphone is not. */
function Composer({ onVoice, onText }: { onVoice: (audio: Blob) => void; onText: (text: string) => Promise<boolean> }) {
  const { t, audioCues } = useSettings();
  const recorder = useRecorder();
  const recording = recorder.status === "recording";
  const blocked = recorder.status === "denied" || recorder.status === "unsupported";
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const record = () => {
    cue("tap", audioCues);
    void recorder.start();
  };

  const finish = async () => {
    cue("tap", audioCues);
    const audio = await recorder.stop();
    if (audio) onVoice(audio);
  };

  const submit = async () => {
    const message = text.trim();
    if (!message || sending) return;
    setSending(true);
    if (await onText(message)) setText("");
    setSending(false);
  };

  if (recording) {
    return (
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => void recorder.stop()} aria-label={t("ریکارڈنگ مٹائیں", "Recording mitayein", "Discard recording")} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sunken text-ink transition active:scale-95">
          <X className="h-6 w-6" aria-hidden />
        </button>
        <LiveWave analyser={recorder.analyser} bars={18} className="min-w-0 flex-1 justify-center overflow-hidden" />
        <span className="latin shrink-0 text-sm text-soft">{clock(recorder.seconds)}</span>
        <button type="button" onClick={() => void finish()} aria-label={t("بھیجیں", "Bhejein", "Send")} className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white shadow-card transition active:scale-95">
          <Send className="h-6 w-6 rtl:-scale-x-100" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div>
      {blocked && <p className="mb-1 text-center text-sm font-semibold text-busy-700">{t("مائیک نہیں مل سکا، لکھ کر بھیجیں", "Mic nahi mil saka, likh kar bhejein", "Could not use the microphone. Please type instead.")}</p>}
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <input dir="auto" className="field min-w-0 flex-1" maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("لکھیں یا مائیک دبائیں", "Likhein ya mic dabayein", "Type, or tap the mic")} aria-label={t("پیغام", "Paigham", "Message")} />
        {text.trim() ? (
          <button type="submit" disabled={sending} aria-label={t("بھیجیں", "Bhejein", "Send")} className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white shadow-card transition active:scale-95 disabled:opacity-50">
            {sending ? <Spinner /> : <Send className="h-6 w-6 rtl:-scale-x-100" aria-hidden />}
          </button>
        ) : (
          <button type="button" onClick={record} aria-label={t("آواز بھیجیں", "Awaz bhejein", "Record a voice note")} className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white shadow-card transition active:scale-95">
            <Mic className="h-7 w-7" aria-hidden />
          </button>
        )}
      </form>
    </div>
  );
}

/** How long a new note may still be waiting for its transcript before we say none was made. */
const TRANSCRIPT_WAIT_MS = 60_000;
/** Voice-note links stop working after an hour, so messages are fetched again before that. */
const AUDIO_LINK_REFRESH_MS = 50 * 60_000;

const stillTranscribing = (message: Message, now: number) => Boolean(message.audioUrl) && !message.transcript && now - Date.parse(message.createdAt) < TRANSCRIPT_WAIT_MS;

/** A card's time can be the booked dates written as 2026-11-12. The dates row already says that, in words. */
const NAMES_A_DATE = /\d{4}-\d{2}-\d{2}/;

type OutgoingNote = { key: string; url: string; blob: Blob; failed: boolean };
type Busy = null | "card" | "confirm" | "day" | "finish" | "accept" | "decline" | "cancel" | "dispute";
type OpenSheet = null | "finish" | "cancel" | "decline" | "dispute";

const CHAT_STATUSES: Job["status"][] = ["requested", "negotiating", "pending_confirmation", "engaged"];
const PRICE_STATUSES: Job["status"][] = ["requested", "negotiating", "pending_confirmation"];

export function JobChat() {
  const { id = "" } = useParams();
  const { t, lang, audioCues } = useSettings();
  const navigate = useNavigate();
  const { user } = useSession();
  const loaded = useData(() => data.getJob(id), [id], { reloadOn: ["job.updated"], when: (e) => e.type === "job.updated" && e.job.id === id });
  const categories = useCategories();
  const [current, setCurrent] = useState<Job | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [outgoing, setOutgoing] = useState<OutgoingNote[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const [now, setNow] = useState(() => Date.now());
  const pricesInFlight = useRef(0);
  const priceRequest = useRef(0);
  const job = current?.id === id ? current : null;

  useEffect(() => {
    // While prices are on their way, what the user tapped wins until the last reply lands.
    if (loaded.data && pricesInFlight.current === 0) setCurrent(loaded.data);
  }, [loaded.data]);

  useEffect(() => {
    if (job?.status === "open") navigate(`/app/jobs/${id}/offers`, { replace: true });
  }, [job?.status, id, navigate]);

  const workerId = job?.workerIds[0];
  const worker = useData(() => (workerId ? data.getWorker(workerId) : Promise.resolve(null)), [workerId]);
  const crew = useData(() => (job?.crewId ? data.getCrew(job.crewId) : Promise.resolve(null)), [job?.crewId], { reloadOn: ["worker.status"], when: (e) => e.type === "worker.status" && Boolean(job?.workerIds.includes(e.workerId)) });

  const isCustomer = job !== null && job.customerId === user?.id;
  const isAssigned = job !== null && user?.workerId != null && job.workerIds.includes(user.workerId);
  const isParty = isCustomer || isAssigned;
  /** Crew members follow their leader; only the leader and the customer decide. */
  const isFollower = Boolean(!isCustomer && job?.crewId && crew.data && crew.data.leaderId !== user?.workerId);
  const crewReady = !job?.crewId || crew.data !== null || crew.error !== null;
  const canDecide = isParty && crewReady && !isFollower;

  const canChat = isParty;
  const thread = useData(() => (canChat ? data.listMessages(id) : Promise.resolve<Message[]>([])), [id, canChat], {
    reloadOn: ["message.created", "message.transcribed"],
    when: (e) => (e.type === "message.created" || e.type === "message.transcribed") && e.message.jobId === id,
  });

  const addMessages = useCallback((incoming: Message[]) => {
    setMessages((list) => {
      const byId = new Map(list.map((message) => [message.id, message]));
      for (const message of incoming) byId.set(message.id, message);
      return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    });
  }, []);

  const seen = useRef<Set<string> | null>(null);
  const lastFetched = useRef(0);

  useEffect(() => {
    if (!thread.data) return;
    if (canChat) seen.current ??= new Set(thread.data.map((message) => message.id));
    lastFetched.current = Date.now();
    addMessages(thread.data);
  }, [thread.data, canChat, addMessages]);

  // A new note makes a sound, and the thread follows it unless the reader has scrolled up.
  useEffect(() => {
    const known = seen.current;
    if (!known) return;
    const fresh = messages.filter((message) => !known.has(message.id));
    if (fresh.length === 0) return;
    fresh.forEach((message) => known.add(message.id));
    const mine = fresh.some((message) => message.senderId === user?.id);
    if (fresh.some((message) => message.senderId !== user?.id)) cue("tap", audioCues);
    const nearEnd = window.innerHeight + window.scrollY > document.documentElement.scrollHeight - 240;
    if (mine || nearEnd) requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" }));
  }, [messages, user?.id, audioCues]);

  // Tells the reader when the other side moved, even with the phone face up on a table.
  const previousJob = useRef<Job | null>(null);
  useEffect(() => {
    const before = previousJob.current;
    previousJob.current = job;
    if (!before || !job || before.id !== job.id) return;
    if (before.status !== job.status && job.status === "engaged") cue("success", audioCues);
    else if (before.proposedPrice !== job.proposedPrice && job.proposedBy !== user?.id && job.proposedPrice !== null && before.proposedPrice !== null) cue(job.proposedPrice > before.proposedPrice ? "up" : "down", audioCues);
    else if (before.status !== job.status) cue("tap", audioCues);
  }, [job, user?.id, audioCues]);

  // Keep links fresh while the screen stays open, including after the phone wakes up.
  const { reload: reloadThread } = thread;
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible" && Date.now() - lastFetched.current > AUDIO_LINK_REFRESH_MS) reloadThread();
    };
    const timer = setInterval(refresh, 5 * 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [reloadThread]);

  // Lets "transcribing" give way to the truth when no transcript ever comes.
  useEffect(() => {
    if (!messages.some((message) => stillTranscribing(message, Date.now()))) return;
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, [messages, now]);

  const freshAudioLink = useCallback(
    async (messageId: string) => {
      const items = await data.listMessages(id);
      addMessages(items);
      return items.find((message) => message.id === messageId)?.audioUrl ?? null;
    },
    [id, addMessages],
  );

  const stepPrice = async (direction: "up" | "down") => {
    if (!job) return;
    const previous = job;
    const next = (job.proposedPrice ?? job.floor) + (direction === "up" ? job.step : -job.step);
    if (next < job.floor) return;
    setError(null);
    // Update at once. A changed price voids a job card, so nobody confirms a number they did not see.
    setCurrent({
      ...job,
      proposedPrice: next,
      proposedBy: user?.id ?? job.proposedBy,
      ...(job.status === "pending_confirmation" ? { status: "negotiating" as const, card: null, customerConfirmed: false, workerConfirmed: false, agreedPrice: null, totalPrice: null } : {}),
    });
    pricesInFlight.current += 1;
    const request = ++priceRequest.current;
    try {
      const updated = await data.adjustPrice(id, direction);
      if (request === priceRequest.current) setCurrent(updated);
    } catch (err) {
      if (request === priceRequest.current) {
        setCurrent(previous);
        setError(errorText(err, t));
        loaded.reload();
      }
    } finally {
      pricesInFlight.current -= 1;
    }
  };

  const run = async (kind: Busy, action: () => Promise<Job>) => {
    setBusy(kind);
    setError(null);
    try {
      const updated = await action();
      setCurrent(updated);
      return updated;
    } catch (err) {
      setError(errorText(err, t));
      // The refusal usually means the job moved on. CARD_OUTDATED also removed the card, so a new one can be made.
      loaded.reload();
      return null;
    } finally {
      setBusy(null);
    }
  };

  const finishDay = async () => {
    if (!job) return;
    const nextDay = job.days.find((d) => d.status === "scheduled");
    const updated = await run("day", () => (job.durationDays > 1 && nextDay ? data.completeDay(id, nextDay.dayNumber) : data.completeJob(id)));
    if (!updated) return;
    cue("success", audioCues);
    if (updated.status === "completed") navigate(`/app/jobs/${id}/review`);
  };

  const finishEarly = async () => {
    const updated = await run("finish", () => data.completeJob(id));
    setSheet(null);
    if (updated) navigate(`/app/jobs/${id}/review`);
  };

  const cancel = async () => {
    await run("cancel", () => data.cancelJob(id));
    setSheet(null);
  };

  const decline = async () => {
    await run("decline", () => data.declineRequest(id));
    setSheet(null);
  };

  const dispute = async (reason: string) => {
    await run("dispute", () => data.openDispute(id, reason));
    setSheet(null);
  };

  const sendNote = async (note: OutgoingNote) => {
    setOutgoing((list) => list.map((n) => (n.key === note.key ? { ...n, failed: false } : n)));
    try {
      const message = await data.sendVoiceNote(id, note.blob);
      addMessages([message]);
      setOutgoing((list) => list.filter((n) => n.key !== note.key));
      URL.revokeObjectURL(note.url);
    } catch (err) {
      setOutgoing((list) => list.map((n) => (n.key === note.key ? { ...n, failed: true } : n)));
      setError(errorText(err, t));
    }
  };

  const recorded = (blob: Blob) => {
    setError(null);
    const note: OutgoingNote = { key: `${Date.now()}-${Math.random()}`, url: URL.createObjectURL(blob), blob, failed: false };
    setOutgoing((list) => [...list, note]);
    void sendNote(note);
  };

  const dropNote = (note: OutgoingNote) => {
    setOutgoing((list) => list.filter((n) => n.key !== note.key));
    URL.revokeObjectURL(note.url);
  };

  const sendText = async (text: string) => {
    setError(null);
    try {
      addMessages([await data.sendTextMessage(id, text)]);
      return true;
    } catch (err) {
      setError(errorText(err, t));
      return false;
    }
  };

  const otherName = job ? (isCustomer ? (crew.data?.name ?? worker.data?.name ?? "") : job.customerName) : "";
  // The header is narrow on a phone, and the full name is one tap away on the profile.
  const shownName = !otherName ? t("بات چیت", "Baat cheet", "Chat") : job?.crewId && isCustomer ? personName(otherName, lang).split(" ").slice(0, 2).join(" ") : firstName(otherName, lang);
  const otherPhoto = isCustomer && !job?.crewId ? (worker.data?.photoUrl ?? null) : null;
  const otherLink = job ? (isCustomer ? (job.crewId ? `/app/crews/${job.crewId}` : workerId ? `/app/workers/${workerId}` : null) : `/app/hirers/${job.customerId}`) : null;

  const status = job?.status;
  const engaged = status === "engaged";
  const completed = status === "completed";
  const chatOpen = Boolean(status && CHAT_STATUSES.includes(status) && isParty);
  const priceOpen = Boolean(status && PRICE_STATUSES.includes(status));
  const multi = (job?.durationDays ?? 1) > 1;
  const perDay = job ? (job.agreedPrice ?? job.proposedPrice ?? job.floor) : 0;
  const doneDays = job?.days.filter((d) => d.status === "completed").length ?? 0;
  const nextDay = job?.days.find((d) => d.status === "scheduled");
  const iConfirmed = job ? (isCustomer ? job.customerConfirmed : job.workerConfirmed) : false;
  const otherConfirmed = job ? (isCustomer ? job.workerConfirmed : job.customerConfirmed) : false;
  const canCancel = canDecide && (status === "negotiating" || status === "pending_confirmation" || (status === "requested" && isCustomer) || (engaged && doneDays === 0));
  const canFinishEarly = canDecide && engaged && multi && doneDays > 0;
  const canDispute = (engaged && canDecide) || (completed && isParty);
  const proposedByMe = job?.proposedBy === user?.id;
  const whoSet = job?.proposedBy && !isFollower ? (proposedByMe ? t("آپ نے رکھی", "Aap ne rakhi", "You set this") : `${firstName(otherName || "—", lang)} ${t("نے رکھی", "ne rakhi", "set this")}`) : null;

  const senderName = (message: Message) => {
    if (!job?.crewId || message.senderId === user?.id) return null;
    if (message.senderId === job.customerId) return job.customerName;
    return crew.data?.members.find((member) => member.userId === message.senderId)?.name ?? null;
  };

  const metaFor = (message: Message) => {
    const name = senderName(message);
    return (
      <>
        {name && (
          <>
            <Auto text={firstName(name, lang)} /> ·{" "}
          </>
        )}
        <span dir="ltr" className="latin">
          {clockLabel(message.createdAt)}
        </span>
      </>
    );
  };

  const answeringRequest = status === "requested" && !isCustomer && canDecide;
  const canSendMessages = chatOpen && !answeringRequest;

  const footer = !job ? undefined : answeringRequest ? (
    <div className="grid grid-cols-[auto_1fr] gap-2">
      <Button variant="secondary" size="xl" icon={X} disabled={busy !== null} onClick={() => setSheet("decline")}>
        {t("نہیں", "Nahi", "Decline")}
      </Button>
      <Button size="xl" icon={busy === "accept" ? undefined : Check} disabled={busy !== null} onClick={() => void run("accept", () => data.acceptRequest(id))}>
        {busy === "accept" ? <Spinner /> : t("قبول", "Qubool", "Accept")}
      </Button>
    </div>
  ) : chatOpen ? (
    <Composer onVoice={recorded} onText={sendText} />
  ) : completed && canDecide ? (
    <LinkButton to={`/app/jobs/${id}/review`} size="xl" icon={Star} className="w-full">
      {t("جائزہ دیں", "Jaiza dein", "Leave a review")}
    </LinkButton>
  ) : undefined;

  return (
    <Screen
      title={shownName}
      back="/app/jobs"
      speak={job ? `${job.description}۔ ${job.durationDays} دن کا کام۔ فی دن ${perDay} روپے۔` : undefined}
      right={
        otherName && otherLink ? (
          <Link to={otherLink} aria-label={otherName} className="flex h-12 w-12 shrink-0 items-center justify-center">
            <Avatar name={otherName} url={otherPhoto} size={40} />
          </Link>
        ) : undefined
      }
      footer={footer}
    >
      <Async query={{ ...loaded, data: job ?? loaded.data }} skeleton={<ListSkeleton />}>
        {(value) =>
          !value ? (
            <JobGone id={id} />
          ) : value.status === "open" ? (
            <ListSkeleton />
          ) : (
            <div className="space-y-3">
              <ConnectionNote />
              <JobSummary job={value} categories={categories.data ?? []} />

              {job?.crewId && crew.data && (
                <Link to={`/app/crews/${crew.data.id}`} className="flex min-h-12 items-center gap-2 rounded-2xl bg-amber-50 px-3 py-1 font-semibold text-amber-800">
                  <UsersRound className="h-5 w-5 shrink-0" aria-hidden />
                  <OneLine text={personName(crew.data.name, lang)} className="min-w-0 flex-1" />
                  <span className="shrink-0 text-sm">
                    <span className="latin">{value.workerIds.length}</span> {t("لوگ اس کام پر", "log is kaam par", "people on this job")}
                  </span>
                </Link>
              )}

              {status === "requested" &&
                (isCustomer ? (
                  <Banner tone="plain" icon={Hourglass}>
                    {t("جواب کا انتظار ہے۔ 30 منٹ میں جواب نہ آیا تو درخواست ختم ہو جائے گی۔", "Jawab ka intezar hai. 30 minute mein jawab na aaya to darkhwast khatam ho jayegi.", "Waiting for an answer. The request ends if nobody replies in 30 minutes.")}
                  </Banner>
                ) : canDecide ? (
                  <Banner icon={Briefcase}>{t("نئی درخواست آئی ہے، قبول کریں یا انکار", "Nayi darkhwast aayi hai, qubool karein ya inkar", "A new request. Accept or decline")}</Banner>
                ) : (
                  <Banner tone="plain" icon={UsersRound}>
                    {t("ٹیم کے لیے درخواست، لیڈر فیصلہ کرے گا", "Crew ke liye darkhwast, leader faisla karega", "A request for your crew. The leader decides")}
                  </Banner>
                ))}
              {isFollower && (status === "negotiating" || status === "pending_confirmation") && (
                <Banner tone="plain" icon={UsersRound}>
                  {t("قیمت اور تصدیق لیڈر کرے گا", "Qeemat aur tasdeeq leader karega", "Your crew leader agrees the price and confirms")}
                </Banner>
              )}

              {engaged && (
                <>
                  <Banner icon={CircleCheck}>{t("بکنگ پکی، کام ختم ہونے تک کاریگر مصروف ہے", "Booking pakki, kaam khatam hone tak kaarigar masroof hai", "Booked. The worker is busy until the job ends")}</Banner>
                  {multi && <DayProgress days={value.days} />}
                  {multi && doneDays > 0 && (
                    <Card className="p-3">
                      <p className="text-center text-sm text-soft">{t("اب تک مکمل", "Ab tak mukammal", "Completed so far")}</p>
                      <PriceMath perDay={perDay} days={doneDays} />
                    </Card>
                  )}
                  {canDecide && (!isCustomer || !multi) && (
                    <Button size="xl" icon={busy === "day" ? undefined : CheckCheck} className="w-full" disabled={busy !== null} onClick={() => void finishDay()}>
                      {busy === "day" ? (
                        <Spinner />
                      ) : !multi ? (
                        t("کام مکمل ہو گیا", "Kaam mukammal ho gaya", "Job finished")
                      ) : nextDay && nextDay.date > today() ? (
                        <>
                          {t("دن", "Din", "Day")} <span className="latin">{nextDay.dayNumber}</span> {t("مکمل", "mukammal", "done")}
                        </>
                      ) : (
                        t("آج کا کام مکمل", "Aaj ka kaam mukammal", "Today's work is done")
                      )}
                    </Button>
                  )}
                  {isCustomer && multi && <p className="text-center text-sm text-soft">{t("کاریگر ہر دن کا کام مکمل کرتا ہے", "Kaarigar har din ka kaam mukammal karta hai", "The worker marks each day as done")}</p>}
                </>
              )}

              {completed && (
                <Card className="animate-rise text-center">
                  <CircleCheck className="mx-auto h-9 w-9 text-brand-600" aria-hidden />
                  <p className="text-lg font-bold">{t("کام مکمل", "Kaam mukammal", "Job complete")}</p>
                  {value.agreedPrice !== null && <PriceMath perDay={value.agreedPrice} days={multi ? doneDays : 1} className="text-lg" />}
                  {multi && doneDays < value.durationDays && (
                    <p className="mt-1 text-sm font-semibold text-amber-700">
                      {t(`جلدی ختم ہوا: ${value.durationDays} میں سے ${doneDays} دن مکمل۔ صرف انہی کے پیسے لگے۔`, `Jaldi khatam hua: ${value.durationDays} mein se ${doneDays} din mukammal. Sirf unhi ke paise lage.`, `Finished early: ${doneDays} of ${value.durationDays} days done. Only those days were charged.`)}
                    </p>
                  )}
                </Card>
              )}
              {status === "cancelled" && <Banner tone="plain" icon={Ban}>{t("یہ کام منسوخ ہو گیا", "Ye kaam mansookh ho gaya", "This job was cancelled")}</Banner>}
              {status === "disputed" && (
                <Banner tone="busy" icon={Flag}>
                  {t("شکایت درج ہو گئی، ایڈمن دیکھے گا", "Shikayat darj ho gayi, admin dekhega", "A complaint was filed. An admin will review it")}
                </Banner>
              )}

              {priceOpen &&
                (canDecide ? (
                  <PriceCard
                    label={value.durationDays > 1 ? t("فی دن قیمت", "Fi din qeemat", "Price per day") : t("قیمت", "Qeemat", "Price")}
                    value={value.proposedPrice ?? value.floor}
                    step={value.step}
                    floor={value.floor}
                    days={value.durationDays}
                    onStep={(direction) => void stepPrice(direction)}
                    note={value.card ? t("قیمت بدلنے سے کارڈ دوبارہ بنے گا", "Qeemat badalne se card dobara banega", "Changing the price needs a new card") : whoSet}
                  />
                ) : (
                  <Card className="p-3 text-center">
                    <p className="text-sm text-soft">{t("فی دن قیمت", "Fi din qeemat", "Price per day")}</p>
                    <p className="latin text-3xl font-extrabold">{rupees(perDay)}</p>
                    {multi && <PriceMath perDay={perDay} days={value.durationDays} className="mt-1 text-sm" />}
                  </Card>
                ))}

              {value.card && value.status !== "cancelled" && (
                <Card className="animate-rise border-2 border-brand-600">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <h2 className="text-lg">{t("جاب کارڈ", "Job card", "Job card")}</h2>
                    {value.card.source === "gemini" ? <AiTag label={t("AI نے بنایا", "AI ne banaya", "Made by AI")} /> : <Tag tone="plain">{t("AI نہیں چلا", "AI nahi chala", "AI did not run")}</Tag>}
                  </div>
                  <CardRow icon={Wrench}>
                    <Auto text={value.card.task} />
                  </CardRow>
                  <CardRow icon={MapPin}>
                    <Auto text={value.card.addressArea} />
                    {value.address && (
                      <span className="block text-sm font-normal text-soft">
                        <Auto text={value.address} />
                      </span>
                    )}
                  </CardRow>
                  <CardRow icon={Calendar}>
                    <span className="latin">{value.card.durationDays}</span> {t("دن", "din", value.card.durationDays === 1 ? "day" : "days")} · {rangeLabel(value.card.startDate, value.card.durationDays, lang)}
                  </CardRow>
                  {!NAMES_A_DATE.test(value.card.time) && (
                    <CardRow icon={Clock}>
                      <Auto text={value.card.time} />
                    </CardRow>
                  )}
                  <CardRow icon={Wallet}>
                    {value.card.durationDays > 1 ? <PriceMath perDay={value.card.pricePerDay} days={value.card.durationDays} className="!justify-start" /> : <span className="latin text-lg font-extrabold">{rupees(value.card.pricePerDay)}</span>}
                  </CardRow>

                  {status === "pending_confirmation" && (
                    <>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <div className={cx("flex min-h-12 items-center justify-center gap-1 rounded-2xl px-2 text-center font-semibold", otherConfirmed ? "bg-brand-100 text-brand-700" : "bg-sunken text-soft")}>
                          {otherConfirmed ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : <Hourglass className="h-4 w-4 shrink-0" aria-hidden />}
                          <span className="truncate">{firstName(otherName || "—", lang)}</span>
                        </div>
                        <div className={cx("flex min-h-12 items-center justify-center gap-1 rounded-2xl px-2 font-semibold", iConfirmed ? "bg-brand-100 text-brand-700" : "bg-sunken text-soft")}>
                          {iConfirmed ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : <Hourglass className="h-4 w-4 shrink-0" aria-hidden />}
                          {t("آپ", "Aap", "You")}
                        </div>
                      </div>
                      <div className="mt-2">
                        <BusyNotice />
                      </div>
                      {canDecide && (
                        <Button size="xl" icon={busy === "confirm" ? undefined : iConfirmed ? Hourglass : CircleCheck} className="mt-2 w-full" disabled={busy !== null || iConfirmed} onClick={() => void run("confirm", () => data.confirmJob(id))}>
                          {busy === "confirm" ? <Spinner /> : iConfirmed ? t("دوسری طرف کا انتظار", "Doosri taraf ka intezar", "Waiting for the other side") : t("پکا کریں", "Pakka karein", "Confirm booking")}
                        </Button>
                      )}
                    </>
                  )}
                </Card>
              )}

              {status === "negotiating" && canDecide && (
                <Button variant="secondary" size="lg" icon={busy === "card" ? undefined : ClipboardList} className="w-full" disabled={busy !== null} onClick={() => void run("card", () => data.generateCard(id))}>
                  {busy === "card" ? (
                    <>
                      <Spinner /> {t("کارڈ بن رہا ہے…", "Card ban raha hai…", "Making the card…")}
                    </>
                  ) : (
                    t("جاب کارڈ بنائیں", "Job card banayein", "Make the job card")
                  )}
                </Button>
              )}

              {error && <InlineError>{error}</InlineError>}

              {(canFinishEarly || canCancel || canDispute) && (
                <div className="flex flex-wrap justify-center gap-2">
                  {canFinishEarly && (
                    <Button variant="secondary" size="md" icon={CircleCheck} disabled={busy !== null} onClick={() => setSheet("finish")}>
                      {t("جلدی ختم کریں", "Jaldi khatam karein", "Finish early")}
                    </Button>
                  )}
                  {canCancel && (
                    <Button variant="ghost" size="md" icon={Ban} disabled={busy !== null} className="!text-busy-700 hover:!bg-busy-50" onClick={() => setSheet("cancel")}>
                      {t("منسوخ کریں", "Mansookh karein", "Cancel")}
                    </Button>
                  )}
                  {canDispute && (
                    <Button variant="ghost" size="md" icon={Flag} disabled={busy !== null} className="!text-busy-700 hover:!bg-busy-50" onClick={() => setSheet("dispute")}>
                      {t("شکایت", "Shikayat", "Report a problem")}
                    </Button>
                  )}
                </div>
              )}

              {canChat && (
                <Async query={thread} skeleton={<ListSkeleton rows={2} />}>
                  {() =>
                    messages.length === 0 && outgoing.length === 0 ? (
                      canSendMessages ? (
                        <p className="flex items-center justify-center gap-2 rounded-2xl bg-sunken px-3 py-3 text-center text-soft">
                          <Mic className="h-5 w-5 shrink-0 text-brand-600" aria-hidden />
                          {t("مائیک دبا کر بات شروع کریں", "Mic daba kar baat shuru karein", "Tap the mic to start talking")}
                        </p>
                      ) : null
                    ) : (
                      <div className="space-y-3">
                        {messages.map((message) => {
                          const mine = message.senderId === user?.id;
                          return message.audioUrl ? (
                            <VoiceNote
                              key={message.id}
                              src={message.audioUrl}
                              transcript={message.transcript}
                              transcriptState={message.transcript ? undefined : stillTranscribing(message, now) ? "pending" : "none"}
                              mine={mine}
                              onExpired={() => freshAudioLink(message.id)}
                              meta={metaFor(message)}
                            />
                          ) : (
                            <TextBubble key={message.id} text={message.text ?? message.transcript ?? ""} mine={mine} meta={metaFor(message)} />
                          );
                        })}
                        {outgoing.map((note) => (
                          <div key={note.key} className="space-y-1">
                            <VoiceNote src={note.url} transcript={null} mine sending={!note.failed} />
                            {note.failed && (
                              <div className="flex justify-end gap-2 rtl:justify-start">
                                <Button variant="ghost" size="md" icon={X} onClick={() => dropNote(note)}>
                                  {t("ہٹائیں", "Hatayein", "Remove")}
                                </Button>
                                <Button variant="secondary" size="md" icon={RotateCcw} onClick={() => void sendNote(note)}>
                                  {t("دوبارہ بھیجیں", "Dobara bhejein", "Send again")}
                                </Button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )
                  }
                </Async>
              )}
            </div>
          )
        }
      </Async>

      {sheet === "finish" && job && (
        <Sheet title={t("جلدی ختم کریں؟", "Jaldi khatam karein?", "Finish early?")} onClose={() => setSheet(null)}>
          <div className="flex gap-2 rounded-2xl bg-sunken p-3">
            <Info className="mt-1 h-5 w-5 shrink-0 text-brand-600" aria-hidden />
            <p>{t("صرف مکمل دنوں کے پیسے لگیں گے۔ باقی دن منسوخ ہو جائیں گے اور کاریگر فارغ ہو جائے گا۔", "Sirf mukammal dinon ke paise lagenge. Baqi din mansookh ho jayenge aur kaarigar farigh ho jayega.", "Only completed days are charged. The remaining days are cancelled and the worker becomes free.")}</p>
          </div>
          <div className="mt-3">
            <PriceMath perDay={perDay} days={doneDays} className="text-lg" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="secondary" size="xl" onClick={() => setSheet(null)}>
              {t("واپس", "Wapas", "Go back")}
            </Button>
            <Button size="xl" icon={busy === "finish" ? undefined : CheckCheck} disabled={busy !== null} onClick={() => void finishEarly()}>
              {busy === "finish" ? <Spinner /> : t("ختم کریں", "Khatam karein", "Finish")}
            </Button>
          </div>
        </Sheet>
      )}

      {sheet === "cancel" && (
        <ConfirmSheet
          title={t("کام منسوخ کریں؟", "Kaam mansookh karein?", "Cancel this job?")}
          body={engaged ? t("بکنگ ختم ہو جائے گی اور کاریگر فارغ ہو جائے گا۔ کوئی پیسے نہیں لگیں گے۔", "Booking khatam ho jayegi aur kaarigar farigh ho jayega. Koi paise nahi lagenge.", "The booking ends and the worker becomes free. Nothing is charged.") : t("بات چیت ختم ہو جائے گی۔", "Baat cheet khatam ho jayegi.", "The conversation will end.")}
          confirm={t("منسوخ کریں", "Mansookh karein", "Cancel job")}
          working={busy === "cancel"}
          onClose={() => setSheet(null)}
          onConfirm={() => void cancel()}
        />
      )}

      {sheet === "decline" && (
        <ConfirmSheet title={t("انکار کریں؟", "Inkar karein?", "Decline this request?")} body={t("گاہک کو بتا دیا جائے گا اور آپ پھر فارغ ہو جائیں گے۔", "Gahak ko bata diya jayega aur aap phir farigh ho jayenge.", "The customer will be told and you become free again.")} confirm={t("انکار", "Inkar", "Decline")} working={busy === "decline"} onClose={() => setSheet(null)} onConfirm={() => void decline()} />
      )}

      {sheet === "dispute" && <DisputeSheet underway={engaged} working={busy === "dispute"} onClose={() => setSheet(null)} onSend={(reason) => void dispute(reason)} />}
    </Screen>
  );
}

const TAP_TAGS = ["waqt ka paband", "munasib qeemat", "saaf kaam", "khush akhlaq", "mehnati"];

function YesNo({ label, voice, value, onChange }: { label: string; voice: VoiceId; value: boolean | null; onChange: (v: boolean) => void }) {
  const { t } = useSettings();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-1">
      <span className="flex items-center gap-2 text-lg font-bold">
        <QuestionVoice id={voice} />
        {label}
      </span>
      <span className="flex gap-2">
        <Chip active={value === true} onClick={() => onChange(true)}>
          {t("جی ہاں", "Haan", "Yes")}
        </Chip>
        <Chip active={value === false} onClick={() => onChange(false)}>
          {t("نہیں", "Nahi", "No")}
        </Chip>
      </span>
    </div>
  );
}

export function VoiceReview() {
  const { id = "" } = useParams();
  const { t, lang, audioCues } = useSettings();
  const navigate = useNavigate();
  const { user, home } = useSession();
  const job = useData(() => data.getJob(id), [id], { reloadOn: ["job.updated"], when: (e) => e.type === "job.updated" && e.job.id === id });
  const categories = useCategories();
  const workerId = job.data?.workerIds[0];
  const crewId = job.data?.crewId ?? null;
  const worker = useData(() => (workerId ? data.getWorker(workerId) : Promise.resolve(null)), [workerId]);
  const crew = useData(() => (crewId ? data.getCrew(crewId) : Promise.resolve(null)), [crewId]);
  const recorder = useRecorder();
  const recording = recorder.status === "recording";
  const asWorker = job.data ? job.data.customerId !== user?.id : user?.role === "worker";
  const follower = asWorker && Boolean(crew.data && crew.data.leaderId !== user?.workerId);

  // The profile lists its reviews, so a review already left shows here instead of failing on send.
  const leaderId = crew.data?.leaderId ?? workerId;
  const customerId = job.data?.customerId;
  const earlier = useData(
    () => {
      if (!customerId) return Promise.resolve(false);
      if (asWorker) return data.getHirer(customerId).then((hirer) => hirer?.reviews.some((review) => review.jobId === id) ?? false);
      if (!leaderId) return Promise.resolve(false);
      return data.getWorkerReviews(leaderId).then((reviews) => reviews.some((review) => review.jobId === id));
    },
    [customerId, leaderId, asWorker, id],
  );

  const [rating, setRating] = useState(0);
  const [heardRating, setHeardRating] = useState(false);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [suggested, setSuggested] = useState<string[]>([]);
  const [fromAi, setFromAi] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [paidOnTime, setPaidOnTime] = useState<boolean | null>(null);
  const [paidExtra, setPaidExtra] = useState<boolean | null>(null);
  const [behaviour, setBehaviour] = useState<"good" | "okay" | "bad" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const close = () => navigate(home);

  const onMic = async () => {
    cue("tap", audioCues);
    if (!recording) {
      setVoiceError(null);
      await recorder.start();
      return;
    }
    const blob = await recorder.stop();
    if (!blob) return;
    setTranscribing(true);
    setVoiceError(null);
    try {
      const draft = await data.transcribeReview(id, blob);
      if (!draft.transcript.trim()) throw new Error("nothing heard");
      setAudio(blob);
      setTranscript(draft.transcript);
      setSuggested(draft.tags);
      setTags(draft.tags);
      setFromAi(true);
      if (draft.rating !== null) {
        setRating(draft.rating);
        setHeardRating(true);
      }
    } catch (err) {
      // Nothing was understood, so the note is not kept. The review goes on by tapping.
      setAudio(null);
      setTranscript("");
      setFromAi(false);
      setVoiceError(errorCode(err) === "AI_UNAVAILABLE" ? t("آواز ابھی سمجھی نہیں جا سکی۔ ستارے اور ٹیگ دبا کر جائزہ دیں۔", "Awaz abhi samjhi nahi ja saki. Sitaray aur tags daba kar jaiza dein.", "Your voice could not be understood right now. Please tap the stars and tags instead.") : t("آواز سمجھ نہیں آئی۔ دوبارہ بولیں یا ستارے دبائیں۔", "Awaz samajh nahi aayi. Dobara bolein ya sitaray dabayein.", "We could not understand that. Try again, or tap the stars instead."));
    } finally {
      setTranscribing(false);
    }
  };

  const toggle = (tag: string) => setTags((list) => (list.includes(tag) ? list.filter((x) => x !== tag) : [...list, tag]));

  const faces: { value: "good" | "okay" | "bad"; icon: LucideIcon; ur: string; roman: string; en: string }[] = [
    { value: "good", icon: Smile, ur: "اچھا", roman: "Acha", en: "Good" },
    { value: "okay", icon: Meh, ur: "ٹھیک", roman: "Theek", en: "Okay" },
    { value: "bad", icon: Frown, ur: "برا", roman: "Bura", en: "Bad" },
  ];

  const canSend = asWorker ? paidOnTime !== null && behaviour !== null : rating > 0;
  // AI may write a tag in Urdu that a tap option already says in Roman. One chip each.
  const shownTags = new Set<string>();
  const tagOptions = [...suggested, ...TAP_TAGS].filter((tag) => {
    const key = phrase(tag, "ur");
    if (shownTags.has(key)) return false;
    shownTags.add(key);
    return true;
  });
  const category = categories.data?.find((c) => c.id === job.data?.categoryId);
  const alreadyDone = sent || earlier.data === true;

  const send = async () => {
    setSaving(true);
    setError(null);
    try {
      await data.submitReview(id, {
        // A worker's rating follows from the behaviour answer, which the server scores.
        rating: asWorker ? 0 : rating,
        tags,
        audio: audio ?? undefined,
        paidOnTime: paidOnTime ?? undefined,
        paidExtra: paidExtra ?? undefined,
        behaviour: behaviour ?? undefined,
      });
      cue("success", audioCues);
      setSent(true);
    } catch (err) {
      if (errorCode(err) === "ALREADY_REVIEWED") setSent(true);
      else setError(errorText(err, t));
    } finally {
      setSaving(false);
    }
  };

  const otherName = asWorker ? (job.data?.customerName ?? "") : (crew.data?.name ?? worker.data?.name ?? "");
  const doneDays = job.data?.days.filter((d) => d.status === "completed").length ?? 0;
  const reviewable = job.data?.status === "completed" && !follower && !alreadyDone;

  return (
    <Screen
      title=""
      right={
        <button type="button" onClick={close} aria-label={t("بند کریں", "Band karein", "Close")} className="flex h-12 w-12 items-center justify-center rounded-2xl text-soft hover:bg-sunken">
          <X className="h-6 w-6" aria-hidden />
        </button>
      }
      footer={
        reviewable ? (
          <Button size="xl" className="w-full" icon={saving ? undefined : Send} disabled={!canSend || saving} onClick={() => void send()}>
            {saving ? <Spinner /> : t("بھیج دیں", "Bhej dein", "Send")}
          </Button>
        ) : undefined
      }
    >
      <Async query={job} skeleton={<ListSkeleton />}>
        {(value) =>
          !value ? (
            <NotFound />
          ) : alreadyDone ? (
            <div className="space-y-3 pt-6">
              <EmptyState icon={CheckCheck} title={t("شکریہ! آپ کا جائزہ مل گیا", "Shukriya! Aapka jaiza mil gaya", "Thank you! Your review was received")} body={t("یہ پروفائل پر نظر آئے گا", "Ye profile par nazar aayega", "It now shows on the profile")} />
              <Button size="lg" variant="secondary" className="w-full" onClick={close}>
                {t("واپس جائیں", "Wapas jayein", "Go back")}
              </Button>
            </div>
          ) : value.status !== "completed" ? (
            <div className="space-y-3 pt-6">
              <EmptyState icon={Timer} title={t("کام مکمل ہونے پر جائزہ دیں", "Kaam mukammal hone par jaiza dein", "Reviews open when the job is complete")} />
              <LinkButton to={`/app/jobs/${id}`} size="lg" variant="secondary" className="w-full">
                {t("کام دیکھیں", "Kaam dekhein", "See the job")}
              </LinkButton>
            </div>
          ) : follower ? (
            <div className="space-y-3 pt-6">
              <EmptyState icon={UsersRound} title={t("گاہک کا جائزہ لیڈر دے گا", "Gahak ka jaiza leader dega", "Your crew leader reviews the customer")} />
              <Button size="lg" variant="secondary" className="w-full" onClick={close}>
                {t("واپس جائیں", "Wapas jayein", "Go back")}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col items-center text-center">
                <span className="flex h-16 w-16 animate-pop items-center justify-center rounded-full bg-brand-100 text-brand-700">
                  <CheckCheck className="h-9 w-9" aria-hidden />
                </span>
                <h1 className="mt-1 text-2xl">{t("کام مکمل", "Kaam mukammal", "Job complete")}</h1>
                <p className="text-sm text-soft">
                  {categoryName(category, lang)}
                  {otherName && (
                    <>
                      {" · "}
                      <Auto text={firstName(otherName, lang)} />
                    </>
                  )}
                  {value.totalPrice !== null && (
                    <>
                      {" · "}
                      <span className="latin font-bold">{rupees(value.totalPrice)}</span>
                    </>
                  )}
                </p>
                {value.durationDays > 1 && doneDays < value.durationDays && (
                  <p className="text-sm font-semibold text-amber-700">
                    <span className="latin">{doneDays}</span> {t("دن کے پیسے", "din ke paise", doneDays === 1 ? "day charged" : "days charged")}
                  </p>
                )}
              </div>

              {asWorker ? (
                <Card>
                  <YesNo voice="hirer-paid-on-time" label={t("پیسے وقت پر ملے؟", "Paise waqt par mile?", "Paid on time?")} value={paidOnTime} onChange={setPaidOnTime} />
                  <YesNo voice="hirer-paid-extra" label={t("زیادہ دیے؟", "Zyada diye?", "Paid extra?")} value={paidExtra} onChange={setPaidExtra} />
                  <Asked voice="hirer-behaviour" className="mt-2">
                    <div className="text-lg font-bold">{t("رویہ کیسا تھا؟", "Rawaiya kaisa tha?", "How was their behaviour?")}</div>
                  </Asked>
                  <div className="mt-1 grid grid-cols-3 gap-2">
                    {faces.map((face) => (
                      <button key={face.value} type="button" aria-pressed={behaviour === face.value} onClick={() => setBehaviour(face.value)} className={cx("flex min-h-24 flex-col items-center justify-center rounded-3xl border font-semibold transition active:scale-95", behaviour === face.value ? "border-brand-600 bg-brand-100" : "border-line bg-surface")}>
                        <face.icon className="h-10 w-10 text-brand-600" aria-hidden />
                        {t(face.ur, face.roman, face.en)}
                      </button>
                    ))}
                  </div>
                </Card>
              ) : (
                <>
                  <Asked voice="review-rating">
                    <p className="text-lg font-bold">{t("کام کیسا لگا؟", "Kaam kaisa laga?", "How was the work?")}</p>
                  </Asked>
                  <div dir="ltr" className="flex justify-center gap-1" role="radiogroup" aria-label={t("ریٹنگ", "Rating", "Rating")}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n}`} onClick={() => { setRating(n); setHeardRating(false); cue("tap", audioCues); }} className="flex h-14 w-14 items-center justify-center transition active:scale-90">
                        <Star className={cx("h-11 w-11 transition-colors", n <= rating ? "fill-amber-400 text-amber-400" : "text-line")} aria-hidden />
                      </button>
                    ))}
                  </div>
                  {heardRating && <p className="text-center text-sm text-soft">{t("یہ آپ کی آواز سے سمجھا گیا، بدلنے کے لیے ستارہ دبائیں", "Ye aapki awaz se samjha gaya, badalne ke liye sitara dabayein", "Understood from your voice. Tap a star to change it")}</p>}

                  <Card className="p-3">
                    <div className="flex items-center gap-2">
                      <BigMic recording={recording} onClick={() => void onMic()} disabled={transcribing} size={56} label={recording ? t("ریکارڈنگ ختم کریں", "Recording khatam karein", "Stop recording") : t("بول کر جائزہ دیں", "Bol kar jaiza dein", "Speak your review")} />
                      {recording ? <LiveWave analyser={recorder.analyser} bars={18} className="min-w-0 flex-1 overflow-hidden" /> : <Waveform bars={18} className="min-w-0 flex-1 opacity-60" />}
                      {recording && <span className="latin shrink-0 text-sm text-soft">{clock(recorder.seconds)}</span>}
                    </div>
                    <p className="mt-1 text-center text-sm text-soft">{t("بول کر بتائیں یا نیچے دبائیں", "Bol kar batayein ya neeche dabayein", "Say it, or tap below")}</p>
                    {transcribing && (
                      <p className="mt-2 flex items-center justify-center gap-2 font-semibold text-soft">
                        <Spinner /> {t("سمجھ رہے ہیں…", "Samajh rahe hain…", "Understanding…")}
                      </p>
                    )}
                    {transcript && !transcribing && (
                      <p className="mt-2 animate-rise rounded-2xl bg-sunken p-3">
                        "<Auto text={transcript} />"
                      </p>
                    )}
                    {voiceError && (
                      <div className="mt-2">
                        <InlineError>{voiceError}</InlineError>
                      </div>
                    )}
                    {(recorder.status === "denied" || recorder.status === "unsupported") && (
                      <div className="mt-2">
                        <InlineError>{t("مائیک نہیں مل سکا۔ ستارے اور ٹیگ دبا کر جائزہ دیں۔", "Mic nahi mil saka. Sitaray aur tags daba kar jaiza dein.", "We could not use the microphone. Please tap the stars and tags instead.")}</InlineError>
                      </div>
                    )}
                  </Card>

                  <SectionTitle action={<span className="flex items-center gap-2">{fromAi && <AiTag label="AI" icon={Sparkles} />}<QuestionVoice id="review-tags" /></span>}>{fromAi ? t("یہ ٹیگ صحیح ہیں؟", "Ye tags sahi hain?", "Are these tags right?") : t("کیا اچھا لگا؟", "Kya acha laga?", "What was good?")}</SectionTitle>
                  <div className="flex flex-wrap gap-2">
                    {tagOptions.map((tag) => (
                      <Chip key={tag} active={tags.includes(tag)} icon={tags.includes(tag) ? Check : undefined} onClick={() => toggle(tag)}>
                        {phrase(tag, lang)}
                      </Chip>
                    ))}
                  </div>

                  {otherName && (
                    <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-800">
                      {t(`${firstName(otherName, lang)} بھی آپ کو ریٹ کرے گا۔ اچھے گاہک کو کاریگر جلدی جواب دیتے ہیں۔`, `${firstName(otherName, lang)} bhi aap ko rate karega. Achhe customer ko kaarigar jaldi jawab dete hain.`, `${firstName(otherName, lang)} will rate you too. Workers reply faster to good customers.`)}
                    </p>
                  )}
                </>
              )}
              {error && <InlineError>{error}</InlineError>}
            </div>
          )
        }
      </Async>
    </Screen>
  );
}
