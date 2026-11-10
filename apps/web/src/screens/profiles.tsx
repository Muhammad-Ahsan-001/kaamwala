import { BadgeCheck, MapPin, PhoneCall, ScanSearch, Send, Settings as SettingsIcon, UserX } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { data, type Category, type ReviewView, type WorkerCard } from "../data";
import { DEFAULT_CENTER } from "../data/defaults";
import { errorCode } from "../data/errors";
import { areaName, categoryName, firstName, onTimePercent, personName, phrase, rupees } from "../data/labels";
import { useData } from "../lib/useData";
import { useSettings } from "../lib/settings";
import { today } from "../lib/dates";
import { Async } from "../ui/async";
import { CategoryIcon } from "../ui/CategoryIcon";
import { BusyNotice, DurationPicker, defaultSchedule, type Schedule } from "../ui/hire";
import { Avatar, StatusPill } from "../ui/people";
import { PriceCard } from "../ui/PriceCard";
import { AiTag, Auto, Button, Card, EmptyState, InlineError, ListSkeleton, SectionTitle, Sheet, Tag } from "../ui/primitives";
import { Screen } from "../ui/shell";
import { VoiceNote } from "../ui/voice";

function Stats({ items }: { items: { value: string; label: string }[] }) {
  return (
    <Card className="grid grid-cols-4 p-2">
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
        <div key={review.id}>
          <VoiceNote src={review.audioUrl} transcript={review.transcript} />
          <p className="mt-1 text-sm text-soft">
            <Auto text={personName(review.authorName, lang)} />
          </p>
        </div>
      ))}
    </div>
  );
}

function HireSheet({ worker, category, initial, onClose }: { worker: WorkerCard; category: Category | undefined; initial: Schedule; onClose: () => void }) {
  const { t, lang } = useSettings();
  const navigate = useNavigate();
  const hirer = useData(() => data.getHirer("me"), []);
  const [schedule, setSchedule] = useState(initial);
  const floor = category?.floorPrice ?? 0;
  const step = category?.step ?? 50;
  const [price, setPrice] = useState(Math.max(floor, worker.rate));
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!category) return;
    setSending(true);
    setError(null);
    try {
      const job = await data.createJob({
        mode: "direct",
        categoryId: category.id,
        description: note.trim() || categoryName(category, lang),
        area: hirer.data?.area ?? "",
        location: DEFAULT_CENTER,
        urgency: "normal",
        durationDays: schedule.durationDays,
        startDate: schedule.startDate,
        workerId: worker.id,
        proposedPrice: price,
      });
      navigate(`/app/jobs/${job.id}`);
    } catch (err) {
      setError(
        errorCode(err) === "WORKER_NOT_AVAILABLE"
          ? t("یہ کاریگر اب فارغ نہیں رہا۔", "Ye kaarigar ab farigh nahi raha.", "This worker is no longer available.")
          : t("درخواست نہیں بھیجی جا سکی۔", "Darkhwast nahi bheji ja saki.", "Could not send the request."),
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet title={t("کاریگر بلائیں", "Kaarigar bulayein", "Hire this worker")} onClose={onClose}>
      <div className="space-y-3">
        <input dir="auto" className="field" value={note} onChange={(e) => setNote(e.target.value)} aria-label={t("کام بتائیں", "Kaam batayein", "Describe the job")} placeholder={t("کیا کام ہے؟ (اختیاری)", "Kya kaam hai? (ikhtiyari)", "What's the job? (optional)")} />
        <DurationPicker value={schedule} onChange={setSchedule} />
        <PriceCard label={t("فی دن قیمت", "Fi din qeemat", "Price per day")} value={price} step={step} floor={floor} days={schedule.durationDays} onStep={(direction) => setPrice((p) => Math.max(floor, p + (direction === "up" ? step : -step)))} />
        <BusyNotice />
        {error && <InlineError>{error}</InlineError>}
        <Button className="w-full" size="xl" icon={Send} disabled={sending || !category} onClick={() => void send()}>
          {t("درخواست بھیجیں", "Darkhwast bhejein", "Send request")}
        </Button>
      </div>
    </Sheet>
  );
}

export function WorkerProfile() {
  const { id = "" } = useParams();
  const { t, lang } = useSettings();
  const [params] = useSearchParams();
  const own = id === "me";
  const worker = useData(() => data.getWorker(id), [id]);
  const reviews = useData(() => data.getWorkerReviews(id), [id]);
  const extras = useData(() => data.getWorkerExtras(id), [id]);
  const categories = useData(() => data.listCategories(), []);
  const [hiring, setHiring] = useState(false);

  const person = worker.data;
  const trade = categories.data?.find((c) => person?.categoryIds.includes(c.id));
  const onTime = person ? onTimePercent(person) : null;
  const initial: Schedule = { durationDays: Number(params.get("days")) || defaultSchedule().durationDays, startDate: params.get("start") || today() };
  const canHire = person?.status === "available";

  return (
    <Screen
      title={t("پروفائل", "Profile", "Profile")}
      back={!own}
      nav={own ? "worker" : undefined}
      right={
        own ? (
          <Link to="/app/settings" aria-label={t("ترتیبات", "Settings", "Settings")} className="flex h-12 w-12 items-center justify-center rounded-2xl text-soft hover:bg-sunken">
            <SettingsIcon className="h-6 w-6" aria-hidden />
          </Link>
        ) : undefined
      }
      footer={
        person && !own ? (
          <Button size="xl" className="w-full" icon={PhoneCall} disabled={!canHire} onClick={() => setHiring(true)}>
            {canHire ? t(`${firstName(person.name, lang)} کو بلائیں`, `${firstName(person.name, lang)} ko bulao`, `Hire ${firstName(person.name, lang)}`) : t("ابھی فارغ نہیں", "Abhi farigh nahi", "Not available right now")}
          </Button>
        ) : undefined
      }
    >
      <Async
        query={worker}
        skeleton={<ListSkeleton />}
      >
        {(value) =>
          !value ? (
            <EmptyState icon={UserX} title={t("پروفائل نہیں ملی", "Profile nahi mili", "Profile not found")} />
          ) : (
            <div className="animate-rise">
              <div className="flex items-center gap-4">
                <Avatar name={value.name} url={value.photoUrl} size={88} ringed status={value.status} />
                <div className="min-w-0 flex-1">
                  <h2 className="text-2xl">
                    <Auto text={personName(value.name, lang)} />
                  </h2>
                  <p className="flex flex-wrap items-center gap-x-1 text-sm text-soft">
                    {categoryName(trade, lang)} · <Auto text={areaName(value.area, lang)} /> · <span className="latin">{value.years}</span> {t("سال", "saal", "years")}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <StatusPill status={value.status} />
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

              <div className="mt-3">
                <Stats
                  items={[
                    { value: String(value.trust.jobCount), label: t("کام", "kaam", "jobs") },
                    { value: `${value.trust.rating.toFixed(1)}★`, label: t("ریٹنگ", "rating", "rating") },
                    { value: onTime === null ? "–" : `${onTime}%`, label: t("وقت پر", "waqt par", "on time") },
                    { value: `${Math.round(value.trust.responseRate * 100)}%`, label: t("جواب", "jawab", "replies") },
                  ]}
                />
              </div>

              {value.trust.tags.length > 0 && (
                <>
                  <SectionTitle action={<AiTag label={t(`${value.trust.ratingCount} جائزوں سے`, `${value.trust.ratingCount} voice reviews se`, `from ${value.trust.ratingCount} voice reviews`)} />}>{t("لوگ کیا کہتے ہیں", "Log kya kehte hain", "What people say")}</SectionTitle>
                  <TrustTags tags={value.trust.tags} />
                </>
              )}

              <SectionTitle>{t("ہنر", "Hunar", "Skills")}</SectionTitle>
              <div className="flex flex-wrap gap-2">
                {value.skills.map((skill) => (
                  <Tag key={skill} tone="plain">
                    {phrase(skill, lang)}
                  </Tag>
                ))}
              </div>

              {extras.data && extras.data.pastWork.length > 0 && (
                <>
                  <SectionTitle action={<AiTag label={t("تصویروں سے ہنر", "tasveeron se hunar", "skills from photos")} />}>{t("پچھلا کام", "Pichla kaam", "Past work")}</SectionTitle>
                  <div className="grid grid-cols-3 gap-2">
                    {extras.data.pastWork.map((item, index) => (
                      <div key={item.id} className="relative aspect-square overflow-hidden rounded-2xl" style={{ background: ["linear-gradient(135deg,#E9DFCB,#CFC1A5)", "linear-gradient(135deg,#D5E3D6,#B4C9B6)", "linear-gradient(135deg,#E6D3C8,#CDB3A5)"][index % 3] }}>
                        {item.url && <img src={item.url} alt="" className="h-full w-full object-cover" loading="lazy" />}
                        <span className="absolute bottom-1.5 start-1.5 max-w-[90%] truncate rounded-full bg-surface px-2 text-xs font-semibold">{phrase(item.skill, lang)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <SectionTitle>{t("آواز کے جائزے", "Awaz ke jaize", "Voice reviews")}</SectionTitle>
              <Async query={reviews}>{(list) => <ReviewList reviews={list} />}</Async>

              {categories.data && (
                <>
                  <SectionTitle>{t("کام کی قسمیں", "Kaam ki qismein", "Job types")}</SectionTitle>
                  <JobTypes types={value.trust.jobTypes} categories={categories.data} />
                </>
              )}

              {!own && (
                <p className="mt-4 flex items-center gap-1 text-sm text-soft">
                  <MapPin className="h-4 w-4" aria-hidden />
                  <span className="latin">{rupees(value.rate)}</span> / {t("دن", "din", "day")}
                </p>
              )}
            </div>
          )
        }
      </Async>

      {hiring && person && <HireSheet worker={person} category={trade} initial={initial} onClose={() => setHiring(false)} />}
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
          <Link to="/app/settings" aria-label={t("ترتیبات", "Settings", "Settings")} className="flex h-12 w-12 items-center justify-center rounded-2xl text-soft hover:bg-sunken">
            <SettingsIcon className="h-6 w-6" aria-hidden />
          </Link>
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
                    <MapPin className="h-4 w-4" aria-hidden />
                    <Auto text={areaName(value.area, lang)} />
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <Stats
                  items={[
                    { value: String(value.jobsPosted), label: t("کام دیے", "kaam diye", "jobs") },
                    { value: `${value.rating.toFixed(1)}★`, label: t("ریٹنگ", "rating", "rating") },
                    { value: `${value.paidOnTimePct}%`, label: t("وقت پر", "waqt par", "paid on time") },
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
              <SectionTitle>{t("آواز کے جائزے", "Awaz ke jaize", "Voice reviews")}</SectionTitle>
              <ReviewList reviews={value.reviews} />
            </div>
          )
        }
      </Async>
    </Screen>
  );
}
