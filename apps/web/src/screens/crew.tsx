import { Check, Crown, LoaderCircle, Lock, LogOut, Mic, Plus, Send, Square, UserPlus, Users, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { data, type Category, type Crew, type CrewInvite } from "../data";
import { errorText } from "../data/errors";
import { areaName, categoryName, personName, rupees } from "../data/labels";
import { cue } from "../lib/audio";
import { useSession } from "../lib/session";
import { useRecorder } from "../lib/useRecorder";
import { useData } from "../lib/useData";
import { useSettings } from "../lib/settings";
import { isValidName, isValidPhone, toLatinDigits } from "../lib/validate";
import { Async } from "../ui/async";
import { CategoryIcon } from "../ui/CategoryIcon";
import { BusyNotice, DurationPicker, JobPlaceRow, defaultSchedule, useJobPlace, type Schedule } from "../ui/hire";
import { Avatar, StatusPill } from "../ui/people";
import { PriceCard } from "../ui/PriceCard";
import { Auto, Button, Card, Chip, EmptyState, Field, InlineError, LinkButton, ListSkeleton, OneLine, Rating, SectionTitle, Sheet, Tag, cx } from "../ui/primitives";
import { Screen } from "../ui/shell";

const Spinner = () => <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden />;

function AvatarStack({ crew, size = 44 }: { crew: Crew; size?: number }) {
  const shown = crew.members.slice(0, 3);
  const more = crew.members.length - shown.length;
  return (
    <div className="flex shrink-0 -space-x-2 rtl:space-x-reverse">
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

/** Across every rating the members really have. Null when nobody has been rated yet. */
function crewRating(crew: Crew): { value: number; count: number } | null {
  const count = crew.members.reduce((sum, m) => sum + m.trust.ratingCount, 0);
  if (count === 0) return null;
  return { value: crew.members.reduce((sum, m) => sum + m.trust.rating * m.trust.ratingCount, 0) / count, count };
}

/** Accepted members are counted. People only invited are named as that, never as part of the crew. */
function CrewHeadcount({ crew }: { crew: Crew }) {
  const { t } = useSettings();
  return (
    <>
      <span className="latin">{crew.members.length}</span> {t(crew.members.length === 1 ? "فرد" : "لوگ", crew.members.length === 1 ? "fard" : "log", crew.members.length === 1 ? "person" : "people")}
      {crew.pendingCount > 0 && (
        <>
          {" · "}
          <span className="latin">{crew.pendingCount}</span> {t("کو دعوت، ابھی شامل نہیں", "ko dawat, abhi shamil nahi", "invited, not joined yet")}
        </>
      )}
    </>
  );
}

function InviteAnswer({ invite, onDone }: { invite: CrewInvite; onDone: () => void }) {
  const { t, lang, audioCues } = useSettings();
  const [working, setWorking] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const answer = async (choice: "accept" | "decline") => {
    setWorking(choice);
    setError(null);
    try {
      if (choice === "accept") await data.acceptCrewInvite(invite.crewId);
      else await data.declineCrewInvite(invite.crewId);
      cue(choice === "accept" ? "success" : "tap", audioCues);
      onDone();
    } catch (err) {
      setError(errorText(err, t));
      setWorking(null);
    }
  };

  return (
    <Card className="border-2 border-amber-400">
      <p className="font-bold">
        <Auto text={personName(invite.crewName, lang)} />
      </p>
      <p className="text-sm text-soft">
        {t("لیڈر", "Leader", "Leader")}: <Auto text={personName(invite.leaderName, lang)} /> · <span className="latin">{rupees(invite.rate)}</span> / {t("دن", "din", "day")}
      </p>
      <p className="mt-1 text-sm">{t("قبول کرنے پر آپ ٹیم میں شامل ہوں گے اور ٹیم کی بکنگ پر سب کے ساتھ مصروف ہوں گے۔", "Qubool karne par aap crew mein shamil honge aur crew ki booking par sab ke saath masroof honge.", "If you accept you join the crew, and turn busy together with everyone when it is booked.")}</p>
      {error && (
        <div className="mt-2">
          <InlineError>{error}</InlineError>
        </div>
      )}
      <div className="mt-2 grid grid-cols-[auto_1fr] gap-2">
        <Button variant="secondary" size="lg" icon={working === "decline" ? undefined : X} disabled={working !== null} onClick={() => void answer("decline")}>
          {working === "decline" ? <Spinner /> : t("نہیں", "Nahi", "Decline")}
        </Button>
        <Button size="lg" icon={working === "accept" ? undefined : Check} disabled={working !== null} onClick={() => void answer("accept")}>
          {working === "accept" ? <Spinner /> : t("شامل ہوں", "Shamil hon", "Join the crew")}
        </Button>
      </div>
    </Card>
  );
}

function InviteByPhone({ crewId, onDone }: { crewId: string; onDone: () => void }) {
  const { t } = useSettings();
  const [phone, setPhone] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!isValidPhone(phone)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setSending(true);
    setSent(false);
    setError(null);
    try {
      await data.inviteToCrew(crewId, { phone: toLatinDigits(phone).replace(/[\s-]/g, "") });
      setSent(true);
      setPhone("");
      onDone();
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <Field label={t("فون نمبر سے بلائیں", "Phone number se bulayein", "Invite by phone number")} htmlFor="crew-invite" error={invalid ? t("صحیح فون نمبر لکھیں", "Sahi phone number likhein", "Enter a valid phone number") : undefined}>
        <input id="crew-invite" dir="ltr" inputMode="tel" className="field latin" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03XX XXXXXXX" />
      </Field>
      <Button size="lg" variant="secondary" className="mt-2 w-full" icon={sending ? undefined : UserPlus} disabled={sending || phone.trim() === ""} onClick={() => void send()}>
        {sending ? <Spinner /> : t("دعوت بھیجیں", "Dawat bhejein", "Send invitation")}
      </Button>
      {sent && <p className="mt-2 text-sm font-semibold text-brand-700">{t("اس نمبر پر کاریگر ہوا تو اسے دعوت مل جائے گی۔ وہ قبول کرے گا تو ٹیم میں آئے گا۔", "Is number par kaarigar hua to usay dawat mil jayegi. Wo qubool karega to crew mein aayega.", "If a worker has this number, they get the invitation. They join only if they accept.")}</p>}
      {error && (
        <div className="mt-2">
          <InlineError>{error}</InlineError>
        </div>
      )}
    </Card>
  );
}

export function CrewProfile() {
  const { id = "" } = useParams();
  const { t, lang } = useSettings();
  const navigate = useNavigate();
  const { user } = useSession();
  const memberIds = useRef<string[]>([]);
  const crew = useData(() => data.getCrew(id), [id], { reloadOn: ["worker.status"], when: (e) => e.type === "worker.status" && memberIds.current.includes(e.workerId) });
  const categories = useData(() => data.listCategories(), []);
  const invites = useData(() => (user?.role === "worker" ? data.listCrewInvites() : Promise.resolve<CrewInvite[]>([])), [user?.role], { reloadOn: ["crew.invited"] });
  const [leaving, setLeaving] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  memberIds.current = crew.data?.members.map((member) => member.id) ?? [];

  const isCustomer = user?.role === "customer";
  const invite = invites.data?.find((entry) => entry.crewId === id);
  const isLeader = crew.data !== null && crew.data.leaderId === user?.workerId;
  const isMember = crew.data !== null && crew.data.members.some((member) => member.id === user?.workerId);

  const leave = async () => {
    setWorking(true);
    setError(null);
    try {
      await data.leaveCrew(id);
      navigate("/app/crews", { replace: true });
    } catch (err) {
      setError(errorText(err, t));
      setWorking(false);
      setLeaving(false);
    }
  };

  return (
    <Screen
      title={t("ٹیم", "Crew", "Crew")}
      back={isCustomer ? "/app/crew-job" : "/app/crews"}
      footer={
        crew.data && isCustomer ? (
          <LinkButton to={`/app/crew-job?crew=${crew.data.id}`} size="xl" icon={Users} className={cx("w-full", !crew.data.available && "pointer-events-none opacity-45")} aria-disabled={!crew.data.available}>
            {crew.data.available ? t("پوری ٹیم بلائیں", "Poori crew bulao", "Hire the whole crew") : t("ٹیم ابھی مصروف ہے", "Crew abhi masroof hai", "This crew is busy right now")}
          </LinkButton>
        ) : undefined
      }
    >
      <Async query={crew} skeleton={<ListSkeleton />}>
        {(value) =>
          !value ? (
            <EmptyState icon={UsersRound} title={t("ٹیم نہیں ملی", "Crew nahi mili", "Crew not found")} />
          ) : (
            <div className="animate-rise space-y-3">
              {invite && <InviteAnswer invite={invite} onDone={() => { invites.reload(); crew.reload(); }} />}
              <Card className="bg-gradient-to-br from-amber-50 to-surface">
                <AvatarStack crew={value} />
                <h2 className="mt-2 text-2xl">
                  <Auto text={personName(value.name, lang)} />
                </h2>
                <p className="text-sm text-soft">
                  <CrewHeadcount crew={value} />
                  {value.members[0] && (
                    <>
                      {" · "}
                      <Auto text={areaName(value.members[0].area, lang)} />
                    </>
                  )}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Tag tone={value.available ? "brand" : "plain"}>{value.available ? t("سب فارغ", "Sab farigh", "All available") : t("ٹیم مصروف ہے", "Crew masroof hai", "Crew is busy")}</Tag>
                  {(() => {
                    const rating = crewRating(value);
                    return rating ? <Rating value={rating.value} count={rating.count} /> : <span className="text-sm text-soft">{t("ابھی کوئی ریٹنگ نہیں", "Abhi koi rating nahi", "No ratings yet")}</span>;
                  })()}
                </div>
              </Card>

              <Card className="divide-y divide-line p-0">
                {value.members.map((member) => {
                  const category = categories.data?.find((c) => value.categoryIds.includes(c.id) && member.categoryIds.includes(c.id)) ?? categories.data?.find((c) => member.categoryIds.includes(c.id));
                  return (
                    <Link key={member.id} to={`/app/workers/${member.id}`} className="flex min-h-16 items-center gap-3 p-3">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sunken text-brand-700">
                        <CategoryIcon name={category?.icon} className="h-6 w-6" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1 font-bold">
                          <OneLine text={personName(member.name, lang)} className="min-w-0" />
                          {member.id === value.leaderId && <Crown className="h-4 w-4 shrink-0 text-amber-500" aria-label={t("لیڈر", "Leader", "Leader")} />}
                        </span>
                        <span className="block truncate text-sm text-soft">{categoryName(category, lang)}</span>
                      </span>
                      <StatusPill status={member.status} />
                    </Link>
                  );
                })}
              </Card>
              {value.pendingCount > 0 && (
                <p className="rounded-2xl bg-sunken px-3 py-2 text-sm text-soft">
                  <span className="latin">{value.pendingCount}</span> {t("کو دعوت دی گئی ہے۔ قبول کرنے تک وہ ٹیم میں نہیں اور بکنگ میں شامل نہیں ہوں گے۔", "ko dawat di gayi hai. Qubool karne tak wo crew mein nahi aur booking mein shamil nahi honge.", value.pendingCount === 1 ? "person has been invited. Until they accept they are not in the crew or any booking." : "people have been invited. Until they accept they are not in the crew or any booking.")}
                </p>
              )}

              <Card className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-bold">{t("پوری ٹیم کی ایک قیمت", "Ek qeemat poori crew ke liye", "One price for the whole crew")}</p>
                  <p className="text-sm text-soft">/ {t("دن", "din", "day")}</p>
                </div>
                <span className="latin shrink-0 text-2xl font-extrabold">{rupees(value.rate)}</span>
              </Card>

              <p className="flex items-center gap-2 rounded-2xl bg-brand-100 px-4 py-2 text-sm font-semibold text-brand-700">
                <Lock className="h-4 w-4 shrink-0" aria-hidden />
                {t("بکنگ پر قبول شدہ سب لوگ ایک ساتھ مصروف ہو جاتے ہیں", 'Booking par shamil sab log ek saath "busy" ho jate hain', "Everyone who has joined turns busy together on booking")}
              </p>

              {isLeader && <InviteByPhone crewId={id} onDone={crew.reload} />}
              {error && <InlineError>{error}</InlineError>}
              {isMember && !isLeader && (
                <Button variant="ghost" size="md" icon={LogOut} className="w-full !text-busy-700 hover:!bg-busy-50" onClick={() => setLeaving(true)}>
                  {t("ٹیم چھوڑیں", "Crew chhorein", "Leave this crew")}
                </Button>
              )}
            </div>
          )
        }
      </Async>
      {leaving && (
        <Sheet title={t("ٹیم چھوڑیں؟", "Crew chhorein?", "Leave this crew?")} onClose={() => setLeaving(false)}>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="xl" onClick={() => setLeaving(false)}>
              {t("واپس", "Wapas", "Go back")}
            </Button>
            <Button size="xl" disabled={working} className="!bg-busy-600 hover:!bg-busy-700" onClick={() => void leave()}>
              {working ? <Spinner /> : t("چھوڑیں", "Chhorein", "Leave")}
            </Button>
          </div>
        </Sheet>
      )}
    </Screen>
  );
}

function CreateCrewSheet({ categories, onClose }: { categories: Category[]; onClose: () => void }) {
  const { t, lang, audioCues } = useSettings();
  const navigate = useNavigate();
  const allowed = useMemo(() => categories.filter((c) => c.crewAllowed), [categories]);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [rate, setRate] = useState<number | null>(null);
  const [nameError, setNameError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = allowed.find((c) => c.id === picked[0]);

  useEffect(() => {
    if (first) setRate((current) => Math.max(first.floorPrice, current ?? first.floorPrice));
  }, [first]);

  const toggle = (id: string) => setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : list.length >= 5 ? list : [...list, id]));

  const create = async () => {
    if (!isValidName(name)) {
      setNameError(true);
      return;
    }
    if (!rate || picked.length === 0) return;
    setNameError(false);
    setSaving(true);
    setError(null);
    try {
      const crew = await data.createCrew({ name: name.trim(), categoryIds: picked, rate });
      cue("success", audioCues);
      navigate(`/app/crews/${crew.id}`, { replace: true });
    } catch (err) {
      setError(errorText(err, t));
      setSaving(false);
    }
  };

  return (
    <Sheet title={t("نئی ٹیم بنائیں", "Nayi crew banayein", "Create a crew")} onClose={onClose}>
      <div className="space-y-3">
        <Field label={t("ٹیم کا نام", "Crew ka naam", "Crew name")} htmlFor="crew-name" error={nameError ? t("نام لکھیں", "Naam likhein", "Please write a name") : undefined}>
          <input id="crew-name" dir="auto" maxLength={80} className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div>
          <p className="mb-1 font-bold">{t("کون سا کام؟", "Kaun sa kaam?", "Which trades?")}</p>
          <div className="flex flex-wrap gap-2">
            {allowed.map((category) => (
              <Chip key={category.id} active={picked.includes(category.id)} onClick={() => toggle(category.id)}>
                <CategoryIcon name={category.icon} className="h-5 w-5" />
                {categoryName(category, lang)}
              </Chip>
            ))}
          </div>
        </div>
        {first && rate !== null && <PriceCard label={t("پوری ٹیم، فی دن", "Poori crew, fi din", "Whole crew, per day")} value={rate} step={first.step} floor={first.floorPrice} days={1} onStep={(direction) => setRate((r) => Math.max(first.floorPrice, (r ?? first.floorPrice) + (direction === "up" ? first.step : -first.step)))} />}
        {error && <InlineError>{error}</InlineError>}
        <Button size="xl" icon={saving ? undefined : Check} className="w-full" disabled={saving || picked.length === 0 || name.trim() === ""} onClick={() => void create()}>
          {saving ? <Spinner /> : t("ٹیم بنائیں", "Crew banayein", "Create crew")}
        </Button>
      </div>
    </Sheet>
  );
}

/** A worker's crews and the invitations waiting for them. */
export function MyCrews() {
  const { t, lang } = useSettings();
  const { user } = useSession();
  const crews = useData(() => data.listMyCrews(), [], { reloadOn: ["crew.invited"] });
  const invites = useData(() => data.listCrewInvites(), [], { reloadOn: ["crew.invited"] });
  const categories = useData(() => data.listCategories(), []);
  const [creating, setCreating] = useState(false);

  const answered = () => {
    invites.reload();
    crews.reload();
  };

  return (
    <Screen
      title={t("میری ٹیم", "Meri crew", "My crew")}
      back="/app/jobs"
      footer={
        <Button size="xl" icon={Plus} className="w-full" disabled={!categories.data} onClick={() => setCreating(true)}>
          {t("نئی ٹیم بنائیں", "Nayi crew banayein", "Create a crew")}
        </Button>
      }
    >
      {invites.data && invites.data.length > 0 && (
        <div className="mb-4 space-y-3">
          <h2 className="text-lg">{t("دعوتیں", "Dawatein", "Invitations")}</h2>
          {invites.data.map((invite) => (
            <InviteAnswer key={invite.crewId} invite={invite} onDone={answered} />
          ))}
        </div>
      )}
      <Async query={crews} skeleton={<ListSkeleton />}>
        {(list) =>
          list.length === 0 ? (
            <EmptyState icon={UsersRound} title={t("ابھی کوئی ٹیم نہیں", "Abhi koi crew nahi", "No crew yet")} body={t("ٹیم بنائیں اور ساتھیوں کو بلائیں", "Crew banayein aur saathiyon ko bulayein", "Create a crew and invite the people you work with")} />
          ) : (
            <div className="stagger space-y-3">
              {list.map((crew) => (
                <Link key={crew.id} to={`/app/crews/${crew.id}`} className="flex items-center gap-3 rounded-3xl border border-line bg-surface p-3 transition active:scale-[0.99]">
                  <AvatarStack crew={crew} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 font-bold">
                      <OneLine text={personName(crew.name, lang)} className="min-w-0" />
                      {crew.leaderId === user?.workerId && <Crown className="h-4 w-4 shrink-0 text-amber-500" aria-label={t("لیڈر", "Leader", "Leader")} />}
                    </span>
                    <span className="block text-sm text-soft">
                      <CrewHeadcount crew={crew} />
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          )
        }
      </Async>
      {creating && categories.data && <CreateCrewSheet categories={categories.data} onClose={() => setCreating(false)} />}
    </Screen>
  );
}

export function CrewJob() {
  const { t, lang, audioCues } = useSettings();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const categories = useData(() => data.listCategories(), []);
  const crews = useData(() => data.listCrews(), [], { reloadOn: ["worker.status"] });
  const jobPlace = useJobPlace();
  const place = jobPlace.place;
  const recorder = useRecorder();
  const [crewId, setCrewId] = useState<string | null>(params.get("crew"));
  const [openPost, setOpenPost] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [schedule, setSchedule] = useState<Schedule>(defaultSchedule(2));
  const [price, setPrice] = useState<number | null>(null);
  const [descriptionError, setDescriptionError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const recording = recorder.status === "recording";

  const trades = useMemo(() => (categories.data ?? []).filter((c) => c.crewAllowed), [categories.data]);
  const category = trades.find((c) => c.id === categoryId);
  const shown = useMemo(() => (crews.data ?? []).filter((crew) => !categoryId || crew.categoryIds.includes(categoryId)), [crews.data, categoryId]);
  const chosen = openPost ? null : (shown.find((crew) => crew.id === crewId && crew.available) ?? null);
  const chosenAny = crews.data?.find((crew) => crew.id === crewId);

  // A crew picked first decides the trade.
  useEffect(() => {
    if (openPost || categoryId || !chosenAny) return;
    const trade = trades.find((c) => chosenAny.categoryIds.includes(c.id));
    if (trade) setCategoryId(trade.id);
  }, [openPost, categoryId, chosenAny, trades]);

  useEffect(() => {
    setPrice(chosen && category ? Math.max(category.floorPrice, chosen.rate) : null);
    // Reset the price only when a different crew or trade is chosen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen?.id, category?.id]);

  const dictate = async () => {
    cue("tap", audioCues);
    if (!recording) {
      setVoiceError(null);
      await recorder.start();
      return;
    }
    const audio = await recorder.stop();
    if (!audio) return;
    setListening(true);
    try {
      const analysis = await data.analyzeProblem({ audio });
      const said = (analysis.transcript ?? analysis.summary ?? "").trim();
      if (said) setDescription(said);
      if (analysis.categoryId && trades.some((c) => c.id === analysis.categoryId)) setCategoryId(analysis.categoryId);
      if (analysis.durationDays) setSchedule((s) => ({ ...s, durationDays: analysis.durationDays ?? s.durationDays }));
    } catch (err) {
      setVoiceError(errorText(err, t));
    } finally {
      setListening(false);
    }
  };

  /** Fills in the trade from what was typed. Runs on the local matcher, with no AI call. */
  const guessTrade = () => {
    const text = description.trim();
    if (!text || categoryId) return;
    data.matchTrade(text).then(
      (match) => {
        if (match?.crewAllowed) setCategoryId(match.id);
      },
      () => undefined,
    );
  };

  const book = async () => {
    if (!category || (!openPost && (!chosen || price === null)) || !place) return;
    if (!description.trim()) {
      setDescriptionError(true);
      return;
    }
    setDescriptionError(false);
    setSaving(true);
    setError(null);
    try {
      const job = await data.createJob({
        mode: "crew",
        crewId: chosen?.id,
        categoryId: category.id,
        description: description.trim(),
        area: place.area,
        location: place.location,
        urgency: "normal",
        durationDays: schedule.durationDays,
        startDate: schedule.startDate,
        proposedPrice: chosen ? (price ?? undefined) : undefined,
      });
      cue("success", audioCues);
      navigate(openPost ? `/app/jobs/${job.id}/offers` : `/app/jobs/${job.id}`, { replace: true });
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setSaving(false);
    }
  };

  const ready = Boolean(category && place && (openPost || chosen));
  const blocked = recorder.status === "denied" || recorder.status === "unsupported";

  return (
    <Screen
      title={t("ٹیم کا کام", "Crew ka kaam", "Crew job")}
      back
      footer={
        <Button size="xl" className="w-full" icon={saving ? undefined : openPost ? Send : Users} disabled={!ready || saving} onClick={() => void book()}>
          {saving ? <Spinner /> : openPost ? t("ٹیموں سے آفر مانگیں", "Crews se offer mangein", "Ask crews for offers") : t("پوری ٹیم بلائیں", "Poori crew bulao", "Hire the whole crew")}
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
                <textarea id="crew-desc" dir="auto" rows={2} className={cx("field resize-none rtl:pl-16 ltr:pr-16", descriptionError && "border-busy-500")} value={description} onChange={(e) => setDescription(e.target.value)} onBlur={guessTrade} placeholder={t("لکھیں یا بول کر بتائیں", "Likhein ya bol kar batayein", "Type it or say it")} />
                <button type="button" onClick={() => void dictate()} disabled={listening} aria-label={recording ? t("ریکارڈنگ ختم کریں", "Recording khatam karein", "Stop recording") : t("بول کر بتائیں", "Bol kar batayein", "Speak")} className={cx("absolute end-1 top-1 flex h-12 w-12 items-center justify-center rounded-xl transition active:scale-95 disabled:opacity-50", recording ? "bg-busy-500 text-white" : "bg-brand-100 text-brand-700")}>
                  {listening ? <Spinner /> : recording ? <Square className="h-5 w-5 fill-current" aria-hidden /> : <Mic className="h-6 w-6" aria-hidden />}
                </button>
              </div>
              {descriptionError && <p className="mt-1 text-sm font-bold text-busy-700">{t("کام بتائیں", "Kaam batayein", "Please describe the job")}</p>}
              {voiceError && (
                <div className="mt-2">
                  <InlineError>{voiceError}</InlineError>
                </div>
              )}
              {blocked && <p className="mt-1 text-sm font-semibold text-busy-700">{t("مائیک نہیں مل سکا، لکھ کر بتائیں", "Mic nahi mil saka, likh kar batayein", "Could not use the microphone. Please type instead.")}</p>}
            </div>

            <div>
              <p className="mb-1 font-bold">{t("کون سا کام؟", "Kaun sa kaam?", "Which trade?")}</p>
              <div className="scroll-x -mx-4 flex gap-2 overflow-x-auto px-4">
                {trades.map((trade) => (
                  <Chip key={trade.id} active={categoryId === trade.id} onClick={() => setCategoryId(trade.id)}>
                    <CategoryIcon name={trade.icon} className="h-5 w-5" />
                    {categoryName(trade, lang)}
                  </Chip>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1 font-bold">{t("کہاں؟", "Kahan?", "Where?")}</p>
              <JobPlaceRow jobPlace={jobPlace} />
            </div>

            <Card>
              <DurationPicker value={schedule} onChange={setSchedule} />
            </Card>

            <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("طریقہ", "Tareeqa", "How to hire")}>
              <Chip active={!openPost} className="justify-center" onClick={() => setOpenPost(false)}>
                {t("ٹیم چنیں", "Crew chunein", "Pick a crew")}
              </Chip>
              <Chip active={openPost} className="justify-center" onClick={() => setOpenPost(true)}>
                {t("آفرز لیں", "Offers lein", "Get offers")}
              </Chip>
            </div>

            {openPost ? (
              <p className="rounded-2xl bg-sunken p-3 text-sm">{t("قریب کی ٹیموں کے لیڈر اپنی فی دن قیمت بھیجیں گے، آپ ایک چن لیں گے۔", "Qareeb ki crews ke leader apni fi din qeemat bhejenge, aap ek chun lenge.", "Leaders of nearby crews send their price per day, and you pick one.")}</p>
            ) : (
              <div>
                <SectionTitle>{t("ٹیمیں", "Crews", "Crews")}</SectionTitle>
                {shown.length === 0 ? (
                  <EmptyState icon={UsersRound} title={t("اس کام کی کوئی ٹیم نہیں", "Is kaam ki koi crew nahi", "No crew does this work yet")} body={t("آفرز لیں پر دبا کر کام سب کو دکھائیں", "Offers lein par daba kar kaam sab ko dikhayein", "Tap Get offers to show the job to everyone")} />
                ) : (
                  <div className="stagger space-y-3">
                    {shown.map((crew) => (
                      <div key={crew.id} className={cx("rounded-3xl border-2 bg-surface transition", crew.id === crewId && crew.available ? "border-brand-600" : "border-line", !crew.available && "opacity-60")}>
                        <button type="button" aria-pressed={crew.id === crewId} disabled={!crew.available} onClick={() => setCrewId(crew.id)} className="flex w-full items-center gap-3 p-3 text-start transition active:scale-[0.99]">
                          <AvatarStack crew={crew} size={40} />
                          <span className="min-w-0 flex-1">
                            <OneLine text={personName(crew.name, lang)} className="font-bold" />
                            <span className="block text-sm text-soft">
                              <CrewHeadcount crew={crew} />
                            </span>
                          </span>
                          {crew.available ? <span className="latin shrink-0 font-bold">{rupees(crew.rate)}</span> : <Tag tone="plain">{t("مصروف", "Masroof", "Busy")}</Tag>}
                        </button>
                        <Link to={`/app/crews/${crew.id}`} className="flex min-h-12 items-center justify-center border-t border-line text-sm font-semibold text-brand-700">
                          {t("ٹیم دیکھیں", "Crew dekhein", "See this crew")}
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {chosen && category && price !== null && (
              <>
                <PriceCard label={t("پوری ٹیم، فی دن", "Poori crew, fi din", "Whole crew, per day")} value={price} step={category.step} floor={category.floorPrice} days={schedule.durationDays} onStep={(direction) => setPrice((p) => Math.max(category.floorPrice, (p ?? category.floorPrice) + (direction === "up" ? category.step : -category.step)))} />
                <BusyNotice />
              </>
            )}
            {error && <InlineError>{error}</InlineError>}
          </div>
        )}
      </Async>
    </Screen>
  );
}
