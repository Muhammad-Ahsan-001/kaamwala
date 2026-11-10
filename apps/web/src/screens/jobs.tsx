import { Briefcase, Calendar, Check, CheckCheck, CircleCheck, Clock, ClipboardList, Frown, Info, LoaderCircle, MapPin, Meh, Mic, Smile, Sparkles, Square, Star, Timer, Wallet, Wrench, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { data, type Category, type Job, type Message } from "../data";
import { errorCode } from "../data/errors";
import { areaName, bestOfferId, categoryName, firstName, personName, phrase, rupees } from "../data/labels";
import { cue } from "../lib/audio";
import { rangeLabel } from "../lib/dates";
import { clock, useRecorder } from "../lib/useRecorder";
import { useData } from "../lib/useData";
import { useSettings } from "../lib/settings";
import { Async } from "../ui/async";
import { CategoryIcon } from "../ui/CategoryIcon";
import { BusyNotice, DayProgress, PriceMath } from "../ui/hire";
import { Avatar } from "../ui/people";
import { PriceCard } from "../ui/PriceCard";
import { AiTag, Auto, Button, Card, Chip, EmptyState, InlineError, LinkButton, ListSkeleton, Rating, SectionTitle, Sheet, Tag, cx } from "../ui/primitives";
import { Screen } from "../ui/shell";
import { BigMic, LiveWave, VoiceNote, Waveform } from "../ui/voice";

const useCategories = () => useData(() => data.listCategories(), []);

function NotFound() {
  const { t } = useSettings();
  return <EmptyState icon={Briefcase} title={t("یہ کام نہیں ملا", "Ye kaam nahi mila", "Job not found")} />;
}

function JobSummary({ job, categories }: { job: Job; categories: Category[] }) {
  const { t, lang } = useSettings();
  const category = categories.find((c) => c.id === job.categoryId);
  return (
    <Card className="flex items-center gap-3 p-3">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sunken text-brand-700">
        <CategoryIcon name={category?.icon} className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{job.description}</p>
        <p className="text-sm text-soft">
          <Auto text={areaName(job.area, lang)} /> · <span className="latin">{job.durationDays}</span> {t("دن", "din", job.durationDays === 1 ? "day" : "days")} · {rangeLabel(job.startDate, job.durationDays, lang)}
        </p>
      </div>
    </Card>
  );
}

const JOB_STATUS: Record<Job["status"], { ur: string; roman: string; en: string; tone: "brand" | "busy" | "plain" }> = {
  open: { ur: "آفرز آ رہی ہیں", roman: "Offers aa rahi hain", en: "Collecting offers", tone: "plain" },
  requested: { ur: "درخواست بھیجی", roman: "Request bheji", en: "Requested", tone: "plain" },
  negotiating: { ur: "قیمت کی بات", roman: "Qeemat ki baat", en: "Negotiating", tone: "plain" },
  pending_confirmation: { ur: "تصدیق باقی", roman: "Tasdeeq baqi", en: "To confirm", tone: "brand" },
  engaged: { ur: "کام جاری", roman: "Kaam jari", en: "In progress", tone: "busy" },
  completed: { ur: "مکمل", roman: "Mukammal", en: "Completed", tone: "brand" },
  cancelled: { ur: "منسوخ", roman: "Mansookh", en: "Cancelled", tone: "plain" },
  disputed: { ur: "شکایت", roman: "Shikayat", en: "Disputed", tone: "busy" },
};

export function MyJobs() {
  const { t, lang } = useSettings();
  const session = useData(() => data.session(), []);
  const categories = useCategories();
  const jobs = useData(() => data.listMyJobs(), []);
  const worker = session.data?.role === "worker";

  return (
    <Screen title={t("میرے کام", "Mere kaam", "My jobs")} nav={worker ? "worker" : "customer"}>
      <Async query={jobs} skeleton={<ListSkeleton />}>
        {(list) =>
          list.length === 0 ? (
            <EmptyState
              icon={Briefcase}
              title={t("ابھی کوئی کام نہیں", "Abhi koi kaam nahi", "No jobs yet")}
              body={worker ? t("فارغ رہیں، کام آئے گا", "Farigh rahein, kaam aayega", "Stay available and jobs will come") : t("مسئلہ بتا کر کام شروع کریں", "Masla bata kar shuru karein", "Describe a problem to get started")}
            />
          ) : (
            <div className="stagger space-y-3">
              {list.map((job) => {
                const category = categories.data?.find((c) => c.id === job.categoryId);
                const status = JOB_STATUS[job.status];
                const to = job.status === "open" ? `/app/jobs/${job.id}/offers` : job.status === "completed" ? `/app/jobs/${job.id}/review` : `/app/jobs/${job.id}`;
                return (
                  <Link key={job.id} to={to} className="flex items-center gap-3 rounded-3xl border border-line bg-surface p-3 transition active:scale-[0.99]">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sunken text-brand-700">
                      <CategoryIcon name={category?.icon} className="h-6 w-6" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold">{categoryName(category, lang)}</span>
                      <span className="block truncate text-sm text-soft">{job.description}</span>
                      <span className="block text-sm text-soft">
                        <span className="latin">{job.durationDays}</span> {t("دن", "din", job.durationDays === 1 ? "day" : "days")}
                      </span>
                    </span>
                    <Tag tone={status.tone}>{t(status.ur, status.roman, status.en)}</Tag>
                  </Link>
                );
              })}
            </div>
          )
        }
      </Async>
    </Screen>
  );
}

export function Offers() {
  const { id = "" } = useParams();
  const { t, lang, audioCues } = useSettings();
  const navigate = useNavigate();
  const job = useData(() => data.getJob(id), [id]);
  const offers = useData(() => data.listOffers(id), [id]);
  const categories = useCategories();
  const [price, setPrice] = useState<number | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const live = data.connection() === "live";

  useEffect(() => {
    if (job.data && price === null) setPrice(job.data.proposedPrice ?? job.data.floor);
  }, [job.data, price]);

  const stepPrice = async (direction: "up" | "down") => {
    if (!job.data || price === null) return;
    const previous = price;
    setPrice(price + (direction === "up" ? job.data.step : -job.data.step));
    setError(null);
    try {
      await data.adjustPrice(id, direction);
    } catch {
      setPrice(previous);
    }
  };

  const accept = async (offerId: string) => {
    setAccepting(offerId);
    setError(null);
    try {
      await data.acceptOffer(id, offerId);
      cue("success", audioCues);
      navigate(`/app/jobs/${id}`);
    } catch (err) {
      setError(errorCode(err) === "WORKER_NOT_AVAILABLE" ? t("یہ کاریگر اب فارغ نہیں رہا۔ کوئی اور چنیں۔", "Ye kaarigar ab farigh nahi raha. Koi aur chunein.", "This worker is no longer available. Please choose another.") : t("دوبارہ کوشش کریں", "Dobara koshish karein", "Please try again"));
      offers.reload();
    } finally {
      setAccepting(null);
    }
  };

  return (
    <Screen title={t("آپ کا کام", "Aapka kaam", "Your job")} back right={live ? <Tag>{t("لائیو", "Live", "Live")}</Tag> : undefined}>
      <Async query={job} skeleton={<ListSkeleton />}>
        {(value) =>
          !value ? (
            <NotFound />
          ) : (
            <div className="space-y-3">
              <JobSummary job={value} categories={categories.data ?? []} />
              {price !== null && <PriceCard label={t("آپ کی فی دن پیشکش", "Aapki fi din offer", "Your offer per day")} value={price} step={value.step} floor={value.floor} days={value.durationDays} onStep={(d) => void stepPrice(d)} />}

              <Async query={offers}>
                {(list) => {
                  const best = bestOfferId(list);
                  const sorted = [...list].sort((a, b) => (a.worker.distanceKm ?? 0) - (b.worker.distanceKm ?? 0));
                  return (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="text-lg">
                          <span className="latin">{list.length}</span> {t("آفرز آئیں", "offers aayi", "offers")}
                        </h2>
                        <span className="text-sm text-soft">{t("قریب پہلے", "qareeb pehle", "nearest first")}</span>
                      </div>
                      {error && <InlineError>{error}</InlineError>}
                      {sorted.length === 0 ? (
                        <EmptyState icon={Timer} title={t("ابھی کوئی آفر نہیں", "Abhi koi offer nahi", "No offers yet")} body={t("قریب کے کاریگروں کو بتا دیا گیا ہے", "Qareeb ke kaarigaron ko bata diya gaya hai", "Workers nearby have been told about your job")} />
                      ) : (
                        <div className="stagger space-y-3">
                          {sorted.map((offer) => {
                            const isBest = offer.id === best;
                            return (
                              <Card key={offer.id} className={cx("p-3", isBest && "border-2 border-brand-600")}>
                                <div className="flex items-center gap-3">
                                  <Link to={`/app/workers/${offer.worker.id}`} aria-label={offer.worker.name}>
                                    <Avatar name={offer.worker.name} url={offer.worker.photoUrl} size={48} />
                                  </Link>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-x-2 font-bold">
                                      <Auto text={firstName(offer.worker.name, lang)} />
                                      {isBest && <Tag>{t("بہترین", "best match", "best match")}</Tag>}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-2 text-sm text-soft">
                                      <Rating value={offer.worker.trust.rating} />
                                      {offer.worker.distanceKm !== undefined && (
                                        <span>
                                          <span className="latin">{offer.worker.distanceKm}</span> {t("کلومیٹر", "km", "km")}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="shrink-0 text-end">
                                    <div className="latin text-lg font-extrabold">{rupees(offer.price)}</div>
                                    <div className="text-sm text-soft">/ {t("دن", "din", "day")}</div>
                                  </div>
                                </div>
                                {value.durationDays > 1 && <PriceMath perDay={offer.price} days={value.durationDays} className="mt-1 text-sm" />}
                                <Button size="md" variant={isBest ? "primary" : "secondary"} className="mt-2 w-full" icon={accepting === offer.id ? undefined : Check} disabled={accepting !== null} onClick={() => void accept(offer.id)}>
                                  {accepting === offer.id ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden /> : t("قبول", "Qubool", "Accept")}
                                </Button>
                              </Card>
                            );
                          })}
                        </div>
                      )}
                    </>
                  );
                }}
              </Async>
            </div>
          )
        }
      </Async>
    </Screen>
  );
}

function CardRow({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-0.5">
      <Icon className="mt-1 h-5 w-5 shrink-0 text-brand-600" aria-hidden />
      <div className="min-w-0 flex-1 font-semibold">{children}</div>
    </div>
  );
}

export function JobChat() {
  const { id = "" } = useParams();
  const { t, lang, audioCues } = useSettings();
  const navigate = useNavigate();
  const session = useData(() => data.session(), []);
  const loaded = useData(() => data.getJob(id), [id]);
  const loadedMessages = useData(() => data.listMessages(id), [id]);
  const [job, setJob] = useState<Job | null>(null);
  const [extra, setExtra] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendingNote, setSendingNote] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const priceRequest = useRef(0);
  const recorder = useRecorder();
  const recording = recorder.status === "recording";

  useEffect(() => {
    if (loaded.data) setJob(loaded.data);
  }, [loaded.data]);

  const workerId = job?.workerIds[0];
  const worker = useData(() => (workerId ? data.getWorker(workerId) : Promise.resolve(null)), [workerId]);
  const crew = useData(() => (job?.crewId ? data.getCrew(job.crewId) : Promise.resolve(null)), [job?.crewId]);

  const isWorker = session.data?.role === "worker";
  const otherName = isWorker ? (job?.customerName ?? "") : (crew.data?.name ?? worker.data?.name ?? "");
  const shownName = otherName ? personName(otherName, lang) : t("بات چیت", "Baat cheet", "Chat");

  const stepPrice = async (direction: "up" | "down") => {
    if (!job) return;
    cue(direction, audioCues);
    const previous = job;
    const change = direction === "up" ? job.step : -job.step;
    const next = (job.proposedPrice ?? job.floor) + change;
    if (next < job.floor) return;
    setError(null);
    // Update at once. Only the newest reply may overwrite what the user sees.
    setJob({ ...job, proposedPrice: next, card: null, customerConfirmed: false, workerConfirmed: false, status: "negotiating" });
    const request = ++priceRequest.current;
    try {
      const updated = await data.adjustPrice(id, direction);
      if (request === priceRequest.current) setJob(updated);
    } catch (err) {
      if (request === priceRequest.current) setJob(previous);
      setError(errorCode(err) === "BELOW_FLOOR" ? t("اس سے کم نہیں ہو سکتا", "Is se kam nahi ho sakta", "It cannot go below the floor price") : t("قیمت نہیں بدلی جا سکی", "Qeemat nahi badli ja saki", "Could not change the price"));
    }
  };

  const run = async (action: () => Promise<Job>) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await action();
      setJob(updated);
      return updated;
    } catch (err) {
      setError(errorCode(err) === "WORKER_NOT_AVAILABLE" ? t("کاریگر اب فارغ نہیں رہا", "Kaarigar ab farigh nahi raha", "The worker is no longer available") : t("دوبارہ کوشش کریں", "Dobara koshish karein", "Please try again"));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    const updated = await run(() => data.confirmJob(id));
    if (updated) cue("success", audioCues);
  };

  const finishDay = async () => {
    if (!job) return;
    const nextDay = job.days.find((d) => d.status === "scheduled");
    const updated = await run(() => (job.durationDays > 1 && nextDay ? data.completeDay(id, nextDay.dayNumber) : data.completeJob(id)));
    if (updated) {
      cue("success", audioCues);
      if (updated.status === "completed") navigate(`/app/jobs/${id}/review`);
    }
  };

  const finishEarly = async () => {
    setFinishing(false);
    const updated = await run(() => data.completeJob(id));
    if (updated) navigate(`/app/jobs/${id}/review`);
  };

  const toggleNote = async () => {
    cue("tap", audioCues);
    if (!recording) {
      await recorder.start();
      return;
    }
    const audio = await recorder.stop();
    if (!audio) return;
    setSendingNote(true);
    try {
      const message = await data.sendVoiceNote(id, audio);
      setExtra((list) => [...list, message]);
    } catch {
      setError(t("پیغام نہیں گیا", "Paigham nahi gaya", "The voice note did not send"));
    } finally {
      setSendingNote(false);
    }
  };

  const thread = [...(loadedMessages.data ?? []), ...extra];
  const perDay = job ? (job.agreedPrice ?? job.proposedPrice ?? job.floor) : 0;
  const engaged = job?.status === "engaged";
  const negotiable = job && !engaged && job.status !== "completed" && job.status !== "cancelled";
  const multi = (job?.durationDays ?? 1) > 1;
  const doneDays = job?.days.filter((d) => d.status === "completed").length ?? 0;
  const iConfirmed = job ? (isWorker ? job.workerConfirmed : job.customerConfirmed) : false;
  const otherConfirmed = job ? (isWorker ? job.customerConfirmed : job.workerConfirmed) : false;
  const blocked = recorder.status === "denied" || recorder.status === "unsupported";

  return (
    <Screen
      title={shownName}
      back
      speak={job ? `${job.description}۔ ${job.durationDays} دن کا کام۔` : undefined}
      right={otherName ? <Avatar name={otherName} url={worker.data?.photoUrl ?? null} size={40} /> : undefined}
      footer={
        job &&
        (negotiable ? (
          <div>
            {recording ? (
              <div className="flex items-center gap-2">
                <LiveWave analyser={recorder.analyser} bars={26} className="min-w-0 flex-1 justify-center" />
                <span className="latin text-sm text-soft">{clock(recorder.seconds)}</span>
                <button type="button" onClick={() => void toggleNote()} aria-label={t("بھیجیں", "Bhejein", "Send")} className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-busy-500 text-white">
                  <Square className="h-6 w-6 fill-current" aria-hidden />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => void stepPrice("down")} disabled={perDay - job.step < job.floor} aria-label={t("قیمت کم کریں", "Qeemat kam karein", "Lower the price")} className="latin h-14 min-w-14 shrink-0 rounded-2xl bg-sunken px-2 font-bold transition active:scale-95 disabled:opacity-40">
                  −{job.step}
                </button>
                <button type="button" onClick={() => void stepPrice("up")} aria-label={t("قیمت بڑھائیں", "Qeemat barhayein", "Raise the price")} className="latin h-14 min-w-14 shrink-0 rounded-2xl bg-sunken px-2 font-bold transition active:scale-95">
                  +{job.step}
                </button>
                <span className="min-w-0 flex-1 truncate text-center text-soft">{sendingNote ? t("بھیج رہے ہیں…", "Bhej rahe hain…", "Sending…") : t("دبا کر بولیں", "Daba kar bolein", "Tap to speak")}</span>
                <button type="button" onClick={() => void toggleNote()} disabled={sendingNote} aria-label={t("آواز بھیجیں", "Awaz bhejein", "Record a voice note")} className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white shadow-card transition active:scale-95 disabled:opacity-50">
                  <Mic className="h-7 w-7" aria-hidden />
                </button>
              </div>
            )}
          </div>
        ) : engaged ? (
          isWorker || !multi ? (
            <Button size="xl" icon={CheckCheck} className="w-full" disabled={busy} onClick={() => void finishDay()}>
              {multi ? t("آج کا کام مکمل", "Aaj ka kaam mukammal", "Today's work is done") : t("کام مکمل ہو گیا", "Kaam mukammal ho gaya", "Job finished")}
            </Button>
          ) : (
            <Button size="xl" variant="secondary" icon={CircleCheck} className="w-full" disabled={busy} onClick={() => setFinishing(true)}>
              {t("جلدی ختم کریں", "Jaldi khatam karein", "Finish early")}
            </Button>
          )
        ) : job.status === "completed" ? (
          <LinkButton to={`/app/jobs/${id}/review`} size="xl" icon={Star} className="w-full">
            {t("جائزہ دیں", "Jaiza dein", "Leave a review")}
          </LinkButton>
        ) : undefined)
      }
    >
      <Async query={{ ...loaded, data: job ?? loaded.data }} skeleton={<ListSkeleton />}>
        {(value) =>
          !value ? (
            <NotFound />
          ) : (
            <div className="space-y-3">
              {engaged ? (
                <>
                  <div className="flex animate-rise items-center gap-2 rounded-2xl bg-brand-100 px-3 py-2 font-bold text-brand-700">
                    <CircleCheck className="h-6 w-6 shrink-0" aria-hidden />
                    {t("بکنگ پکی، کام ختم ہونے تک کاریگر مصروف ہے", "Booking pakki, kaam khatam hone tak kaarigar masroof hai", "Booked. The worker is busy until the job ends")}
                  </div>
                  {multi && <DayProgress days={value.days} />}
                </>
              ) : null}

              {negotiable && !value.card && (
                <Card className="p-3 text-center">
                  <p className="text-sm text-soft">{t("فی دن قیمت", "Fi din qeemat", "Price per day")}</p>
                  <p key={perDay} className="latin animate-pop text-3xl font-extrabold">
                    {rupees(perDay)}
                  </p>
                  {multi && <PriceMath perDay={perDay} days={value.durationDays} className="mt-1 text-sm" />}
                  <p className="mt-1 text-sm font-semibold text-amber-700">
                    {t("کم از کم", "Kam az kam", "Minimum")} <span className="latin">{rupees(value.floor)}</span>
                  </p>
                </Card>
              )}

              <Async query={loadedMessages} skeleton={<ListSkeleton rows={2} />}>
                {() =>
                  thread.length === 0 ? (
                    value.card ? null : <EmptyState icon={Mic} title={t("ابھی کوئی پیغام نہیں", "Abhi koi paigham nahi", "No messages yet")} body={t("مائیک دبا کر بات شروع کریں", "Mic daba kar baat shuru karein", "Tap the mic to start talking")} />
                  ) : (
                    <div className="stagger space-y-3">
                      {thread.map((message) => (
                        <VoiceNote key={message.id} src={message.audioUrl} transcript={message.transcript ?? message.text} mine={message.senderId === session.data?.id} />
                      ))}
                    </div>
                  )
                }
              </Async>

              {value.card ? (
                <Card className="animate-rise border-2 border-brand-600">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <h2 className="text-lg">{t("جاب کارڈ", "Job card", "Job card")}</h2>
                    {value.card.source === "gemini" && <AiTag label={t("AI نے بنایا", "AI ne banaya", "Made by AI")} />}
                  </div>
                  <CardRow icon={Wrench}>
                    <Auto text={value.card.task} />
                  </CardRow>
                  <CardRow icon={MapPin}>
                    <Auto text={value.card.addressArea} />
                  </CardRow>
                  <CardRow icon={Calendar}>
                    <span className="latin">{value.card.durationDays}</span> {t("دن", "din", value.card.durationDays === 1 ? "day" : "days")} · {rangeLabel(value.card.startDate, value.card.durationDays, lang)}
                  </CardRow>
                  <CardRow icon={Clock}>
                    <Auto text={value.card.time} />
                  </CardRow>
                  <CardRow icon={Wallet}>
                    {value.card.durationDays > 1 ? (
                      <PriceMath perDay={value.card.pricePerDay} days={value.card.durationDays} className="!justify-start" />
                    ) : (
                      <span className="latin text-lg font-extrabold">{rupees(value.card.pricePerDay)}</span>
                    )}
                  </CardRow>

                  {!engaged && value.status !== "completed" && (
                    <>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <div className={cx("flex min-h-12 items-center justify-center gap-1 rounded-2xl px-2 text-center font-semibold", otherConfirmed ? "bg-brand-100 text-brand-700" : "bg-sunken text-soft")}>
                          {otherConfirmed && <Check className="h-4 w-4 shrink-0" aria-hidden />}
                          <span className="truncate">{firstName(otherName || "—", lang)}</span>
                        </div>
                        <div className={cx("flex min-h-12 items-center justify-center gap-1 rounded-2xl px-2 font-semibold", iConfirmed ? "bg-brand-100 text-brand-700" : "bg-sunken text-soft")}>
                          {iConfirmed && <Check className="h-4 w-4 shrink-0" aria-hidden />}
                          {t("آپ؟", "Aap?", "You?")}
                        </div>
                      </div>
                      <div className="mt-2">
                        <BusyNotice />
                      </div>
                      <Button size="xl" icon={Calendar} className="mt-2 w-full" disabled={busy || iConfirmed} onClick={() => void confirm()}>
                        {t("پکا کریں", "Pakka karein", "Confirm booking")}
                      </Button>
                    </>
                  )}
                </Card>
              ) : (
                negotiable && (
                  <Button variant="secondary" size="lg" icon={busy ? undefined : ClipboardList} className="w-full" disabled={busy} onClick={() => void run(() => data.generateCard(id))}>
                    {busy ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden /> : t("جاب کارڈ بنائیں", "Job card banayein", "Make the job card")}
                  </Button>
                )
              )}

              {blocked && <InlineError>{t("مائیک نہیں مل سکا", "Mic nahi mil saka", "We could not use the microphone")}</InlineError>}
              {error && <InlineError>{error}</InlineError>}
            </div>
          )
        }
      </Async>

      {finishing && job && (
        <Sheet title={t("جلدی ختم کریں؟", "Jaldi khatam karein?", "Finish early?")} onClose={() => setFinishing(false)}>
          <div className="flex gap-2 rounded-2xl bg-sunken p-3">
            <Info className="mt-1 h-5 w-5 shrink-0 text-brand-600" aria-hidden />
            <p>{t("صرف مکمل دنوں کے پیسے لگیں گے۔ باقی دن منسوخ ہو جائیں گے اور کاریگر فارغ ہو جائے گا۔", "Sirf mukammal dinon ke paise lagenge. Baqi din mansookh ho jayenge aur kaarigar farigh ho jayega.", "Only completed days are charged. The remaining days are cancelled and the worker becomes free.")}</p>
          </div>
          <div className="mt-3">
            <PriceMath perDay={perDay} days={doneDays} className="text-lg" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="secondary" size="xl" onClick={() => setFinishing(false)}>
              {t("واپس", "Wapas", "Go back")}
            </Button>
            <Button size="xl" icon={CheckCheck} disabled={busy} onClick={() => void finishEarly()}>
              {t("ختم کریں", "Khatam karein", "Finish")}
            </Button>
          </div>
        </Sheet>
      )}
    </Screen>
  );
}

const FALLBACK_TAGS = ["waqt ka paband", "munasib qeemat", "saaf kaam", "khush akhlaq", "mehnati"];

function YesNo({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean) => void }) {
  const { t } = useSettings();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-1">
      <span className="text-lg font-bold">{label}</span>
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
  const session = useData(() => data.session(), []);
  const job = useData(() => data.getJob(id), [id]);
  const categories = useCategories();
  const workerId = job.data?.workerIds[0];
  const worker = useData(() => (workerId ? data.getWorker(workerId) : Promise.resolve(null)), [workerId]);
  const recorder = useRecorder();
  const recording = recorder.status === "recording";
  const asWorker = session.data?.role === "worker";

  const [rating, setRating] = useState(0);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [suggested, setSuggested] = useState<string[]>([]);
  const [aiSource, setAiSource] = useState<"gemini" | "jev_only" | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [paidOnTime, setPaidOnTime] = useState<boolean | null>(null);
  const [paidExtra, setPaidExtra] = useState<boolean | null>(null);
  const [behaviour, setBehaviour] = useState<"good" | "okay" | "bad" | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const onMic = async () => {
    cue("tap", audioCues);
    if (!recording) {
      await recorder.start();
      return;
    }
    const blob = await recorder.stop();
    if (!blob) return;
    setAudio(blob);
    setTranscribing(true);
    try {
      const draft = await data.transcribeReview(blob);
      setTranscript(draft.transcript);
      setSuggested(draft.tags);
      setTags(draft.tags);
      setAiSource(draft.source);
    } catch {
      setFailed(true);
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
  const tagOptions = [...new Set([...suggested, ...FALLBACK_TAGS])];
  const category = categories.data?.find((c) => c.id === job.data?.categoryId);
  const close = () => navigate(asWorker ? "/app/worker" : "/app/adda");

  const send = async () => {
    setSaving(true);
    setFailed(false);
    try {
      await data.submitReview(id, {
        rating: asWorker ? (behaviour === "good" ? 5 : behaviour === "okay" ? 3 : 1) : rating,
        tags,
        audio: audio ?? undefined,
        paidOnTime: paidOnTime ?? undefined,
        paidExtra: paidExtra ?? undefined,
        behaviour: behaviour ?? undefined,
      });
      cue("success", audioCues);
      close();
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const otherName = asWorker ? (job.data?.customerName ?? "") : (worker.data?.name ?? "");

  return (
    <Screen
      title=""
      right={
        <button type="button" onClick={close} aria-label={t("بند کریں", "Band karein", "Close")} className="flex h-12 w-12 items-center justify-center rounded-2xl text-soft hover:bg-sunken">
          <X className="h-6 w-6" aria-hidden />
        </button>
      }
      footer={
        <Button size="xl" className="w-full" disabled={!canSend || saving} onClick={() => void send()}>
          {t("بھیج دیں", "Bhej dein", "Send")}
        </Button>
      }
    >
      <Async query={job} skeleton={<ListSkeleton />}>
        {(value) =>
          !value ? (
            <NotFound />
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
              </div>

              {asWorker ? (
                <Card>
                  <YesNo label={t("پیسے وقت پر ملے؟", "Paise waqt par mile?", "Paid on time?")} value={paidOnTime} onChange={setPaidOnTime} />
                  <YesNo label={t("زیادہ دیے؟", "Zyada diye?", "Paid extra?")} value={paidExtra} onChange={setPaidExtra} />
                  <div className="mt-2 text-lg font-bold">{t("رویہ کیسا تھا؟", "Rawaiya kaisa tha?", "How was their behaviour?")}</div>
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
                  <div dir="ltr" className="flex justify-center gap-1" role="radiogroup" aria-label={t("ریٹنگ", "Rating", "Rating")}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n}`} onClick={() => { setRating(n); cue("tap", audioCues); }} className="flex h-14 w-14 items-center justify-center transition active:scale-90">
                        <Star className={cx("h-11 w-11 transition-colors", n <= rating ? "fill-amber-400 text-amber-400" : "text-line")} aria-hidden />
                      </button>
                    ))}
                  </div>

                  <Card className="p-3">
                    <div className="flex items-center gap-2">
                      <BigMic recording={recording} onClick={() => void onMic()} disabled={transcribing} size={56} label={recording ? t("ریکارڈنگ ختم کریں", "Recording khatam karein", "Stop recording") : t("بول کر جائزہ دیں", "Bol kar jaiza dein", "Speak your review")} />
                      {recording ? <LiveWave analyser={recorder.analyser} bars={24} className="min-w-0 flex-1" /> : <Waveform bars={24} tone={transcript ? "busy" : "brand"} className="min-w-0 flex-1 opacity-60" />}
                      {recording && <span className="latin text-sm text-soft">{clock(recorder.seconds)}</span>}
                    </div>
                    {transcribing && <p className="mt-2 text-center font-semibold text-soft">{t("سمجھ رہے ہیں…", "Samajh rahe hain…", "Understanding…")}</p>}
                    {transcript && !transcribing && (
                      <p className="mt-2 animate-rise rounded-2xl bg-sunken p-3">
                        "<Auto text={transcript} />"
                      </p>
                    )}
                  </Card>

                  <SectionTitle action={aiSource ? <AiTag label={aiSource === "gemini" ? "Gemini" : "Jev"} icon={Sparkles} /> : undefined}>{t("یہ ٹیگ صحیح ہیں؟", "Ye tags sahi hain?", "Are these tags right?")}</SectionTitle>
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
              {failed && <InlineError>{t("جائزہ نہیں بھیجا جا سکا", "Jaiza nahi bheja ja saka", "Could not send your review")}</InlineError>}
            </div>
          )
        }
      </Async>
    </Screen>
  );
}
