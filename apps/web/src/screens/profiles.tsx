import { BadgeCheck, Clock3, FileUp, LoaderCircle, MapPin, PhoneCall, ScanSearch, Send, Settings as SettingsIcon, UserX } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { data, type Category, type ReviewView, type WorkerCard, type WorkerStatus } from "../data";
import { errorText } from "../data/errors";
import { areaName, categoryName, firstName, personName, phrase, rupees } from "../data/labels";
import { useData } from "../lib/useData";
import { useSession } from "../lib/session";
import { useSettings } from "../lib/settings";
import { dateLabel } from "../lib/dates";
import { Async } from "../ui/async";
import { CategoryIcon } from "../ui/CategoryIcon";
import { BusyNotice, DurationPicker, JobPlaceRow, forgetProblem, problemDescription, recallProblem, scheduleFromLink, useJobPlace, type Schedule } from "../ui/hire";
import { Avatar, StatusPill } from "../ui/people";
import { PriceCard } from "../ui/PriceCard";
import { AiTag, Auto, Button, Card, Chip, EmptyState, InlineError, ListSkeleton, Rating, SectionTitle, Sheet, Tag, cx } from "../ui/primitives";
import { LogoutButton } from "../ui/LogoutButton";
import { Screen } from "../ui/shell";
import { VoiceNote } from "../ui/voice";

const DASH = "–";

function Stats({ items }: { items: { value: string; label: string }[] }) {
  return (
    <Card className={cx("grid p-2", items.length === 3 ? "grid-cols-3" : "grid-cols-4")}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0 text-center">
          <div className="latin text-lg font-extrabold">{item.value}</div>
          <div className="truncate text-sm text-soft">{item.label}</div>
        </div>
      ))}
    </Card>
  );
}

function JobTypes({ types, categories }: { types: { categoryId: string; count: number }[]; categories: Category[] }) {
  const { lang } = useSettings();
  return (
    <div className="flex flex-wrap gap-2">
      {types.map(({ categoryId, count }) => {
        const category = categories.find((c) => c.id === categoryId);
        return (
          <Tag key={categoryId} tone="plain">
            <CategoryIcon name={category?.icon} className="h-4 w-4" />
            {categoryName(category, lang)} <span className="latin">{count}</span>
          </Tag>
        );
      })}
    </div>
  );
}

function TrustTags({ tags }: { tags: { tag: string; count: number }[] }) {
  const { lang } = useSettings();
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map(({ tag, count }) => (
        <Tag key={tag}>
          {phrase(tag, lang)} · <span className="latin">{count}</span>
        </Tag>
      ))}
    </div>
  );
}

function ReviewList({ reviews }: { reviews: ReviewView[] }) {
  const { lang, t } = useSettings();
  if (reviews.length === 0) return <p className="text-soft">{t("ابھی کوئی جائزہ نہیں", "Abhi koi jaiza nahi", "No reviews yet")}</p>;
  return (
    <div className="space-y-3">
      {reviews.map((review) => (
        <Card key={review.id} className="p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate font-bold">
              <Auto text={personName(review.authorName, lang)} />
              {review.authorArea && (
                <span className="font-normal text-soft">
                  {" · "}
                  <Auto text={areaName(review.authorArea, lang)} />
                </span>
              )}
            </p>
            <Rating value={review.rating} />
          </div>
          {review.audioUrl ? (
            <div className="mt-2">
              <VoiceNote src={review.audioUrl} transcript={review.transcript} />
            </div>
          ) : (
            review.transcript && (
              <p className="mt-1">
                <Auto text={review.transcript} />
              </p>
            )
          )}
          {review.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {review.tags.map((tag) => (
                <Tag key={tag} tone="plain">
                  {phrase(tag, lang)}
                </Tag>
              ))}
            </div>
          )}
          <p className="mt-1 text-xs text-faint">{dateLabel(review.createdAt, lang)}</p>
        </Card>
      ))}
    </div>
  );
}

function HireSheet({ worker, trades, firstTrade, initial, available, onClose }: { worker: WorkerCard; trades: Category[]; firstTrade: Category; initial: Schedule; available: boolean; onClose: () => void }) {
  const { t, lang } = useSettings();
  const navigate = useNavigate();
  const jobPlace = useJobPlace();
  const [problem] = useState(recallProblem);
  const problemTrade = problem ? (problem.chosenCategory ?? problem.analysis.categoryId) : null;
  const [category, setCategory] = useState(firstTrade);
  const sameProblem = problem && problemTrade === category.id ? problem : null;
  const [schedule, setSchedule] = useState(initial);
  const [price, setPrice] = useState(Math.max(firstTrade.floorPrice, worker.rate));
  const [note, setNote] = useState(sameProblem ? problemDescription(sameProblem) : "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const chooseTrade = (next: Category) => {
    setCategory(next);
    setPrice((current) => Math.max(next.floorPrice, current));
  };

  const send = async () => {
    if (!jobPlace.place) return;
    setSending(true);
    setError(null);
    try {
      const photoUrls = sameProblem?.photo ? [await data.uploadImage(sameProblem.photo)] : undefined;
      const job = await data.createJob({
        mode: "direct",
        categoryId: category.id,
        description: note.trim() || categoryName(category, lang),
        area: jobPlace.place.area,
        location: jobPlace.place.location,
        urgency: sameProblem?.analysis.urgency ?? "normal",
        durationDays: schedule.durationDays,
        startDate: schedule.startDate,
        workerId: worker.id,
        proposedPrice: price,
        photoUrls,
      });
      forgetProblem();
      navigate(`/app/jobs/${job.id}`);
    } catch (err) {
      setError(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet title={t("کاریگر بلائیں", "Kaarigar bulayein", "Hire this worker")} onClose={onClose}>
      <div className="space-y-3">
        {trades.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label={t("کون سا کام؟", "Kaun sa kaam?", "Which trade?")}>
            {trades.map((trade) => (
              <Chip key={trade.id} active={trade.id === category.id} onClick={() => chooseTrade(trade)}>
                <CategoryIcon name={trade.icon} className="h-5 w-5" />
                {categoryName(trade, lang)}
              </Chip>
            ))}
          </div>
        )}
        <textarea dir="auto" rows={2} className="field resize-none" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} aria-label={t("کام بتائیں", "Kaam batayein", "Describe the job")} placeholder={t("کیا کام ہے؟ (اختیاری)", "Kya kaam hai? (ikhtiyari)", "What's the job? (optional)")} />
        <JobPlaceRow jobPlace={jobPlace} />
        <DurationPicker value={schedule} onChange={setSchedule} />
        <PriceCard label={t("فی دن قیمت", "Fi din qeemat", "Price per day")} value={price} step={category.step} floor={category.floorPrice} days={schedule.durationDays} onStep={(direction) => setPrice((p) => Math.max(category.floorPrice, p + (direction === "up" ? category.step : -category.step)))} />
        <BusyNotice />
        {!available && <InlineError>{t("یہ کاریگر اب فارغ نہیں رہا۔", "Ye kaarigar ab farigh nahi raha.", "This worker is no longer available.")}</InlineError>}
        {error !== null && available && <InlineError>{errorText(error, t)}</InlineError>}
        {!jobPlace.place && !jobPlace.loading && <p className="text-center text-sm text-soft">{t("درخواست سے پہلے علاقہ چنیں", "Darkhwast se pehle ilaqa chunein", "Choose your area before sending")}</p>}
        <div className="sticky -bottom-8 -mx-5 bg-surface px-5 pb-5 pt-2">
          <Button className="w-full" size="xl" icon={sending ? LoaderCircle : Send} disabled={sending || !available || !jobPlace.place} onClick={() => void send()}>
            {t("درخواست بھیجیں", "Darkhwast bhejein", "Send request")}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

export function WorkerProfile() {
  const { id = "" } = useParams();
  const { t, lang } = useSettings();
  const { user } = useSession();
  const [params] = useSearchParams();
  const own = id === "me";
  // Status is taken straight from events. Reloading is only for catching up after a dropped connection.
  const worker = useData(() => data.getWorker(id), [id], { reloadOn: ["worker.status"], when: () => false });
  const reviews = useData(() => data.getWorkerReviews(id), [id]);
  const extras = useData(() => data.getWorkerExtras(id), [id]);
  const categories = useData(() => data.listCategories(), []);
  const [hiring, setHiring] = useState(false);
  const [liveStatus, setLiveStatus] = useState<WorkerStatus | null>(null);

  const person = worker.data;
  const personId = person?.id;
  useEffect(() => setLiveStatus(null), [person]);
  useEffect(
    () =>
      data.onEvent((event) => {
        if (event.type === "worker.status" && event.workerId === personId) setLiveStatus(event.status);
      }),
    [personId],
  );

  const status = liveStatus ?? person?.status;
  const trades = categories.data?.filter((c) => person?.categoryIds.includes(c.id)) ?? [];
  const firstTrade = trades.find((c) => c.id === params.get("cat")) ?? trades[0];
  const canHire = status === "available" && firstTrade !== undefined;
  const isCustomer = user?.role === "customer" && user.id !== person?.userId;

  return (
    <Screen
      title={t("پروفائل", "Profile", "Profile")}
      back={!own}
      nav={own ? "worker" : undefined}
      right={
        own ? (
          <span className="flex items-center">
            <Link to="/app/settings" aria-label={t("ترتیبات", "Settings", "Settings")} className="flex h-12 w-12 items-center justify-center rounded-2xl text-soft hover:bg-sunken">
              <SettingsIcon className="h-6 w-6" aria-hidden />
            </Link>
            <LogoutButton />
          </span>
        ) : undefined
      }
      footer={
        person && !own && isCustomer ? (
          <Button size="xl" className="w-full" icon={PhoneCall} disabled={!canHire} onClick={() => setHiring(true)}>
            {canHire ? t(`${firstName(person.name, lang)} کو بلائیں`, `${firstName(person.name, lang)} ko bulao`, `Hire ${firstName(person.name, lang)}`) : t("ابھی فارغ نہیں", "Abhi farigh nahi", "Not available right now")}
          </Button>
        ) : undefined
      }
    >
      <Async query={worker} skeleton={<ListSkeleton />}>
        {(value) => {
          if (!value) return <EmptyState icon={UserX} title={t("پروفائل نہیں ملی", "Profile nahi mili", "Profile not found")} />;
          const { trust } = value;
          const rated = trust.ratingCount > 0;
          // The API counts a worker nobody has asked yet as 100%. That is not a track record.
          const neverAsked = trust.responseRate === 1 && trust.avgResponseMinutes === null;
          const labelled = extras.data?.pastWork.some((item) => item.skill) ?? false;
          return (
            <div className="animate-rise">
              <div className="flex items-center gap-4">
                <Avatar name={value.name} url={value.photoUrl} size={88} ringed status={status ?? value.status} />
                <div className="min-w-0 flex-1">
                  <h2 className="text-2xl">
                    <Auto text={personName(value.name, lang)} />
                  </h2>
                  <p className="text-sm text-soft">
                    {trades.map((c) => categoryName(c, lang)).join("، ")}
                    {trades.length > 0 && " · "}
                    <Auto text={areaName(value.area, lang)} /> · <span className="latin">{value.years}</span> {t("سال", "saal", "years")}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <StatusPill status={status ?? value.status} />
                    {value.approved && (
                      <Tag>
                        <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                        {t("ایڈمن منظور", "Admin manzoor", "Admin approved")}
                      </Tag>
                    )}
                    {extras.data?.cnicDuplicateChecked && (
                      <Tag tone="plain">
                        <ScanSearch className="h-3.5 w-3.5" aria-hidden />
                        {t("ڈپلیکیٹ چیک", "Duplicate check", "Duplicate checked")}
                      </Tag>
                    )}
                  </div>
                </div>
              </div>

              {own && (
                <Link to="/app/onboard/photos" className="mt-3 flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-3 font-bold text-ink">
                  <FileUp className="h-5 w-5 shrink-0 text-brand-600" aria-hidden />
                  {t("تصویریں اور شناختی کارڈ لگائیں", "Tasveerein aur CNIC lagayein", "Add photos and CNIC")}
                </Link>
              )}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl bg-sunken px-4 py-2">
                <p className="font-bold">
                  <span className="latin">{rupees(value.rate)}</span> / {t("دن", "din", "day")}
                </p>
                {value.workingHours && (
                  <p className="flex min-w-0 items-center gap-1 text-sm text-soft">
                    <Clock3 className="h-4 w-4 shrink-0" aria-hidden />
                    <Auto text={value.workingHours} />
                  </p>
                )}
              </div>

              <div className="mt-3">
                <Stats
                  items={[
                    { value: String(trust.jobCount), label: t("کام", "kaam", "jobs") },
                    { value: rated ? `${trust.rating.toFixed(1)}★` : DASH, label: t("ریٹنگ", "rating", "rating") },
                    ...(trust.jobCount > 0 ? [{ value: `${Math.round(trust.onTimeRate * 100)}%`, label: t("وقت پر", "waqt par", "on time") }] : []),
                    { value: neverAsked ? DASH : `${Math.round(trust.responseRate * 100)}%`, label: t("جواب", "jawab", "replies") },
                  ]}
                />
                {trust.avgResponseMinutes !== null && (
                  <p className="mt-1 text-center text-sm text-soft">
                    {t("اوسط جواب", "Ausat jawab", "Usually replies in")} <span className="latin">{Math.max(1, Math.round(trust.avgResponseMinutes))}</span> {t("منٹ میں", "minute mein", "minutes")}
                  </p>
                )}
              </div>

              {trust.tags.length > 0 && (
                <>
                  <SectionTitle action={<span className="text-sm text-soft">{trust.ratingCount === 1 ? t("1 جائزے سے", "1 jaize se", "from 1 review") : t(`${trust.ratingCount} جائزوں سے`, `${trust.ratingCount} jaizon se`, `from ${trust.ratingCount} reviews`)}</span>}>{t("لوگ کیا کہتے ہیں", "Log kya kehte hain", "What people say")}</SectionTitle>
                  <TrustTags tags={trust.tags} />
                </>
              )}

              {value.skills.length > 0 && (
                <>
                  <SectionTitle>{t("ہنر", "Hunar", "Skills")}</SectionTitle>
                  <div className="flex flex-wrap gap-2">
                    {value.skills.map((skill) => (
                      <Tag key={skill} tone="plain">
                        {phrase(skill, lang)}
                      </Tag>
                    ))}
                  </div>
                </>
              )}

              {extras.data && extras.data.pastWork.length > 0 && (
                <>
                  <SectionTitle action={labelled ? <AiTag label={t("تصویروں سے ہنر", "tasveeron se hunar", "skills from photos")} /> : undefined}>{t("پچھلا کام", "Pichla kaam", "Past work")}</SectionTitle>
                  <div className="grid grid-cols-3 gap-2">
                    {extras.data.pastWork.map((item) => (
                      <div key={item.id} className="relative aspect-square overflow-hidden rounded-2xl bg-sunken">
                        <img src={item.url} alt={item.skill ? phrase(item.skill, lang) : t("پچھلے کام کی تصویر", "Pichle kaam ki tasveer", "Past work photo")} className="h-full w-full object-cover" loading="lazy" />
                        {item.skill && <span className="absolute bottom-1.5 start-1.5 max-w-[90%] truncate rounded-full bg-surface px-2 text-xs font-semibold">{phrase(item.skill, lang)}</span>}
                      </div>
                    ))}
                  </div>
                </>
              )}

              <SectionTitle>{t("جائزے", "Jaize", "Reviews")}</SectionTitle>
              <Async query={reviews}>{(list) => <ReviewList reviews={list} />}</Async>

              {categories.data && trust.jobTypes.length > 0 && (
                <>
                  <SectionTitle>{t("کام کی قسمیں", "Kaam ki qismein", "Job types")}</SectionTitle>
                  <JobTypes types={trust.jobTypes} categories={categories.data} />
                </>
              )}
            </div>
          );
        }}
      </Async>

      {hiring && person && firstTrade && <HireSheet worker={person} trades={trades} firstTrade={firstTrade} initial={scheduleFromLink(params)} available={status === "available"} onClose={() => setHiring(false)} />}
    </Screen>
  );
}

export function HirerProfile() {
  const { id = "" } = useParams();
  const { t, lang } = useSettings();
  const own = id === "me";
  const hirer = useData(() => data.getHirer(id), [id]);
  const categories = useData(() => data.listCategories(), []);

  return (
    <Screen
      title={t("گاہک کی پروفائل", "Customer profile", "Customer profile")}
      back={!own}
      nav={own ? "customer" : undefined}
      right={
        own ? (
          <span className="flex items-center">
            <Link to="/app/settings" aria-label={t("ترتیبات", "Settings", "Settings")} className="flex h-12 w-12 items-center justify-center rounded-2xl text-soft hover:bg-sunken">
              <SettingsIcon className="h-6 w-6" aria-hidden />
            </Link>
            <LogoutButton labeled />
          </span>
        ) : undefined
      }
    >
      <Async query={hirer} skeleton={<ListSkeleton />}>
        {(value) =>
          !value ? (
            <EmptyState icon={UserX} title={t("پروفائل نہیں ملی", "Profile nahi mili", "Profile not found")} />
          ) : (
            <div className="animate-rise">
              <div className="flex items-center gap-4">
                <Avatar name={value.name} url={value.photoUrl} size={88} ringed />
                <div className="min-w-0 flex-1">
                  <h2 className="text-2xl">
                    <Auto text={personName(value.name, lang)} />
                  </h2>
                  <p className="flex items-center gap-1 text-sm text-soft">
                    <MapPin className="h-4 w-4 shrink-0" aria-hidden />
                    {value.area ? <Auto text={areaName(value.area, lang)} /> : DASH}
                  </p>
                  {value.address && (
                    <p className="text-sm text-soft">
                      <Auto text={value.address} />
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-3">
                <Stats
                  items={[
                    { value: String(value.jobCount), label: t("کام دیے", "kaam diye", "jobs") },
                    { value: value.ratingCount > 0 ? `${value.rating.toFixed(1)}★` : DASH, label: t("ریٹنگ", "rating", "rating") },
                    { value: value.paidOnTimePct === null ? DASH : `${value.paidOnTimePct}%`, label: t("وقت پر", "waqt par", "paid on time") },
                    { value: String(value.paidExtraCount), label: t("زیادہ دیا", "zyada diya", "paid extra") },
                  ]}
                />
              </div>
              {value.tags.length > 0 && (
                <>
                  <SectionTitle>{t("کاریگر کیا کہتے ہیں", "Kaarigar kya kehte hain", "What workers say")}</SectionTitle>
                  <TrustTags tags={value.tags} />
                </>
              )}
              {categories.data && value.jobTypes.length > 0 && (
                <>
                  <SectionTitle>{t("کام کی قسمیں", "Kaam ki qismein", "Job types")}</SectionTitle>
                  <JobTypes types={value.jobTypes} categories={categories.data} />
                </>
              )}
              <SectionTitle>{t("جائزے", "Jaize", "Reviews")}</SectionTitle>
              <ReviewList reviews={value.reviews} />
            </div>
          )
        }
      </Async>
    </Screen>
  );
}
