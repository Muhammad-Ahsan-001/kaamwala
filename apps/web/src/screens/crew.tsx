import { Lock, Mic, Square, Users, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { data, type Category, type Crew } from "../data";
import { DEFAULT_CENTER } from "../data/defaults";
import { areaName, categoryName, personName, rupees } from "../data/labels";
import { cue } from "../lib/audio";
import { useRecorder } from "../lib/useRecorder";
import { useData } from "../lib/useData";
import { useSettings } from "../lib/settings";
import { Async } from "../ui/async";
import { CategoryIcon } from "../ui/CategoryIcon";
import { BusyNotice, DurationPicker, defaultSchedule, type Schedule } from "../ui/hire";
import { Avatar } from "../ui/people";
import { PriceCard } from "../ui/PriceCard";
import { Auto, Button, Card, EmptyState, InlineError, LinkButton, ListSkeleton, Rating, SectionTitle, Tag, cx } from "../ui/primitives";
import { Screen } from "../ui/shell";

function AvatarStack({ crew, size = 44 }: { crew: Crew; size?: number }) {
  const shown = crew.members.slice(0, 3);
  const more = crew.members.length - shown.length;
  return (
    <div className="flex -space-x-2 rtl:space-x-reverse">
      {shown.map((member) => (
        <span key={member.id} className="rounded-full ring-2 ring-surface">
          <Avatar name={member.name} url={member.photoUrl} size={size} />
        </span>
      ))}
      {more > 0 && (
        <span className="latin flex items-center justify-center rounded-full bg-sunken font-bold text-soft ring-2 ring-surface" style={{ width: size, height: size }}>
          +{more}
        </span>
      )}
    </div>
  );
}

const averageRating = (crew: Crew) => crew.members.reduce((sum, m) => sum + m.trust.rating, 0) / Math.max(1, crew.members.length);

export function CrewProfile() {
  const { id = "" } = useParams();
  const { t, lang } = useSettings();
  const crew = useData(() => data.getCrew(id), [id]);
  const categories = useData(() => data.listCategories(), []);

  return (
    <Screen
      title={t("ٹیم", "Crew", "Crew")}
      back
      footer={
        crew.data && (
          <LinkButton to={`/app/crew-job?crew=${crew.data.id}`} size="xl" icon={Users} className={cx("w-full", !crew.data.available && "pointer-events-none opacity-45")} aria-disabled={!crew.data.available}>
            {t("پوری ٹیم بلائیں", "Poori crew bulao", "Hire the whole crew")}
          </LinkButton>
        )
      }
    >
      <Async query={crew} skeleton={<ListSkeleton />}>
        {(value) =>
          !value ? (
            <EmptyState icon={UsersRound} title={t("ٹیم نہیں ملی", "Crew nahi mili", "Crew not found")} />
          ) : (
            <div className="animate-rise space-y-3">
              <Card className="bg-gradient-to-br from-amber-50 to-surface">
                <AvatarStack crew={value} />
                <h2 className="mt-2 text-2xl">
                  <Auto text={personName(value.name, lang)} />
                </h2>
                <p className="text-sm text-soft">
                  <span className="latin">{value.members.length}</span> {t("لوگ", "log", "people")}
                  {value.members[0] && (
                    <>
                      {" · "}
                      <Auto text={areaName(value.members[0].area, lang)} />
                    </>
                  )}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Tag tone={value.available ? "brand" : "plain"}>{value.available ? t("سب فارغ", "Sab farigh", "All available") : t("ٹیم مصروف ہے", "Crew masroof hai", "Crew is busy")}</Tag>
                  <Rating value={averageRating(value)} />
                </div>
              </Card>

              <Card className="divide-y divide-line p-0">
                {value.members.map((member) => {
                  const category = categories.data?.find((c) => member.categoryIds.includes(c.id));
                  return (
                    <Link key={member.id} to={`/app/workers/${member.id}`} className="flex items-center gap-3 p-3">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sunken text-brand-700">
                        <CategoryIcon name={category?.icon} className="h-6 w-6" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold">{categoryName(category, lang)}</span>
                        <span className="block truncate text-sm text-soft">
                          <Auto text={personName(member.name, lang)} />
                        </span>
                      </span>
                      <span className={cx("h-3 w-3 shrink-0 rounded-full", member.status === "available" ? "bg-brand-500" : "bg-busy-500")} aria-label={member.status} />
                    </Link>
                  );
                })}
              </Card>

              <Card className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-bold">{t("پوری ٹیم کی ایک قیمت", "Ek qeemat poori crew ke liye", "One price for the whole crew")}</p>
                  <p className="text-sm text-soft">/ {t("دن", "din", "day")}</p>
                </div>
                <span className="latin text-2xl font-extrabold">{rupees(value.rate)}</span>
              </Card>

              <p className="flex items-center gap-2 rounded-full bg-brand-100 px-4 py-2 text-sm font-semibold text-brand-700">
                <Lock className="h-4 w-4 shrink-0" aria-hidden />
                {t("بکنگ پر سب ایک ساتھ مصروف ہو جاتے ہیں", 'Booking par sab ek saath "busy" ho jate hain', "Everyone turns busy together on booking")}
              </p>
            </div>
          )
        }
      </Async>
    </Screen>
  );
}

function crewTerms(crew: Crew, categories: Category[]) {
  const own = categories.filter((c) => crew.categoryIds.includes(c.id));
  return { floor: Math.max(0, ...own.map((c) => c.floorPrice)), step: Math.max(50, ...own.map((c) => c.step)), categoryId: own[0]?.id };
}

export function CrewJob() {
  const { t, lang, audioCues } = useSettings();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const categories = useData(() => data.listCategories(), []);
  const crews = useData(() => data.listCrews(), []);
  const hirer = useData(() => data.getHirer("me"), []);
  const recorder = useRecorder();
  const [crewId, setCrewId] = useState<string | null>(params.get("crew"));
  const [description, setDescription] = useState("");
  const [schedule, setSchedule] = useState<Schedule>(defaultSchedule(2));
  const [price, setPrice] = useState<number | null>(null);
  const [descriptionError, setDescriptionError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [listening, setListening] = useState(false);
  const recording = recorder.status === "recording";

  const available = useMemo(() => (crews.data ?? []).filter((crew) => crew.available), [crews.data]);
  const chosen = available.find((crew) => crew.id === crewId) ?? null;
  const terms = chosen && categories.data ? crewTerms(chosen, categories.data) : null;

  useEffect(() => {
    if (chosen && terms) setPrice(Math.max(terms.floor, chosen.rate));
    // Reset the price only when a different crew is chosen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen?.id, terms?.floor]);

  const dictate = async () => {
    cue("tap", audioCues);
    if (!recording) {
      await recorder.start();
      return;
    }
    const audio = await recorder.stop();
    if (!audio) return;
    setListening(true);
    try {
      const analysis = await data.analyzeProblem({ audio });
      setDescription(analysis.transcript ?? analysis.summary);
      if (analysis.durationDays) setSchedule((s) => ({ ...s, durationDays: analysis.durationDays ?? s.durationDays }));
    } finally {
      setListening(false);
    }
  };

  const book = async () => {
    if (!chosen || !terms?.categoryId || price === null) return;
    if (!description.trim()) {
      setDescriptionError(true);
      return;
    }
    setDescriptionError(false);
    setSaving(true);
    setFailed(false);
    try {
      const job = await data.createJob({
        mode: "crew",
        crewId: chosen.id,
        categoryId: terms.categoryId,
        description: description.trim(),
        area: hirer.data?.area ?? "",
        location: DEFAULT_CENTER,
        urgency: "normal",
        durationDays: schedule.durationDays,
        startDate: schedule.startDate,
        proposedPrice: price,
      });
      cue("success", audioCues);
      navigate(`/app/jobs/${job.id}`);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      title={t("ٹیم کا کام", "Crew ka kaam", "Crew job")}
      back
      footer={
        <Button size="xl" className="w-full" icon={Users} disabled={!chosen || saving} onClick={() => void book()}>
          {t("پوری ٹیم بلائیں", "Poori crew bulao", "Hire the whole crew")}
        </Button>
      }
    >
      <Async query={crews} skeleton={<ListSkeleton />}>
        {() => (
          <div className="space-y-4">
            <div>
              <label htmlFor="crew-desc" className="mb-1 block font-bold">
                {t("کیا کام ہے؟", "Kya kaam hai?", "What's the job?")}
              </label>
              <div className="relative">
                <textarea id="crew-desc" dir="auto" rows={2} className={cx("field resize-none rtl:pl-16 ltr:pr-16", descriptionError && "border-busy-500")} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("لکھیں یا بول کر بتائیں", "Likhein ya bol kar batayein", "Type it or say it")} />
                <button type="button" onClick={() => void dictate()} disabled={listening} aria-label={recording ? t("ریکارڈنگ ختم کریں", "Recording khatam karein", "Stop recording") : t("بول کر بتائیں", "Bol kar batayein", "Speak")} className={cx("absolute end-1 top-1 flex h-12 w-12 items-center justify-center rounded-xl transition active:scale-95", recording ? "bg-busy-500 text-white" : "bg-brand-100 text-brand-700")}>
                  {recording ? <Square className="h-5 w-5 fill-current" aria-hidden /> : <Mic className="h-6 w-6" aria-hidden />}
                </button>
              </div>
              {descriptionError && <p className="mt-1 text-sm font-bold text-busy-700">{t("کام بتائیں", "Kaam batayein", "Please describe the job")}</p>}
            </div>

            <Card>
              <DurationPicker value={schedule} onChange={setSchedule} />
            </Card>

            <div>
              <SectionTitle>{t("فارغ ٹیمیں", "Farigh crews", "Available crews")}</SectionTitle>
              {available.length === 0 ? (
                <EmptyState icon={UsersRound} title={t("ابھی کوئی ٹیم فارغ نہیں", "Abhi koi crew farigh nahi", "No crews are available right now")} />
              ) : (
                <div className="stagger space-y-3">
                  {available.map((crew) => (
                    <button key={crew.id} type="button" aria-pressed={crew.id === crewId} onClick={() => setCrewId(crew.id)} className={cx("flex w-full items-center gap-3 rounded-3xl border-2 bg-surface p-3 text-start transition active:scale-[0.99]", crew.id === crewId ? "border-brand-600" : "border-line")}>
                      <AvatarStack crew={crew} size={40} />
                      <span className="min-w-0 flex-1 truncate font-bold">
                        <Auto text={personName(crew.name, lang)} />
                      </span>
                      <span className="latin shrink-0 font-bold">{rupees(crew.rate)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {chosen && terms && price !== null && (
              <>
                <PriceCard
                  label={t("پوری ٹیم، فی دن", "Poori crew, fi din", "Whole crew, per day")}
                  value={price}
                  step={terms.step}
                  floor={terms.floor}
                  days={schedule.durationDays}
                  onStep={(direction) => setPrice((p) => Math.max(terms.floor, (p ?? terms.floor) + (direction === "up" ? terms.step : -terms.step)))}
                />
                <BusyNotice />
              </>
            )}
            {failed && <InlineError>{t("ٹیم نہیں بلائی جا سکی۔ دوبارہ کوشش کریں۔", "Crew nahi bulai ja saki. Dobara koshish karein.", "Could not book the crew. Please try again.")}</InlineError>}
          </div>
        )}
      </Async>
    </Screen>
  );
}
