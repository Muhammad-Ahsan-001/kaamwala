import { Camera, CircleCheck, FileText, IdCard, Image as ImageIcon, Keyboard, LoaderCircle, Plus, RefreshCw, RotateCcw, ShieldAlert, ShieldCheck, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { data, type OnBehalf } from "../../data";
import { errorCode, errorText } from "../../data/errors";
import { phrase } from "../../data/labels";
import { cue } from "../../lib/audio";
import { prepareDocument, prepareImage } from "../../lib/images";
import { useData } from "../../lib/useData";
import { useSession } from "../../lib/session";
import { useSettings } from "../../lib/settings";
import { digitsOnly } from "../../lib/validate";
import { AiTag, Button, Card, Field, IconButton, InlineError, cx } from "../../ui/primitives";
import { Headline, Screen } from "../../ui/shell";
import { Asked } from "../../ui/QuestionVoice";
import { draftProblems, useDraft } from "./draft";
import { AgentBanner, AgentFeeCard } from "./parts";

const MAX_WORK_PHOTOS = 6;

type Phase = { kind: "creating" } | { kind: "failed"; message: string; canRetry: boolean } | { kind: "ready" } | { kind: "blocked" };

type Upload = "idle" | "uploading" | "done" | "failed";

type Shot = { id: number; file: File; preview: string; status: "queued" | "uploading" | "done" | "failed"; tags: string[]; ai: boolean | null; error?: string };

type Cnic = { kind: "idle" } | { kind: "working" } | { kind: "done" } | { kind: "failed"; message: string };

function formatCnic(digits: string) {
  return [digits.slice(0, 5), digits.slice(5, 12), digits.slice(12, 13)].filter(Boolean).join("-");
}

function PickButton({ icon: Icon, label, disabled, accept = "image/*", camera, onPick }: { icon: LucideIcon; label: string; disabled?: boolean; accept?: string; camera?: boolean; onPick: (files: File[]) => void }) {
  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    onPick(Array.from(event.target.files ?? []));
    event.target.value = "";
  };
  return (
    <label className={cx("flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-3 font-bold text-ink", disabled && "pointer-events-none opacity-45")}>
      <Icon className="h-5 w-5 shrink-0 text-brand-600" aria-hidden />
      {label}
      <input type="file" accept={accept} capture={camera ? "environment" : undefined} className="sr-only" disabled={disabled} onChange={pick} />
    </label>
  );
}

/** Confirming creates the profile here, once. Photos then upload one by one, each with its own real result. */
export function OnboardPhotos() {
  const { t, lang, audioCues } = useSettings();
  const navigate = useNavigate();
  const { user, home, refresh } = useSession();
  const { worker, agentFor, setAgentFor, resetWorker } = useDraft();
  const settings = useData(() => data.getPublicSettings(), []);
  const isAgent = user?.role === "agent";
  const existingId = isAgent ? (agentFor?.created?.workerId ?? null) : (user?.workerId ?? null);
  // A worker who already finished sign-up and came from their profile to add documents.
  const [returning] = useState(() => !isAgent && existingId !== null);
  const [phase, setPhase] = useState<Phase>(existingId ? { kind: "ready" } : { kind: "creating" });
  const [workerId, setWorkerId] = useState<string | null>(existingId);
  const [approved, setApproved] = useState<boolean | null>(isAgent ? (agentFor?.created?.approved ?? null) : null);

  const [profile, setProfile] = useState<{ preview: string; status: Upload; error?: string; file: File } | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [cnic, setCnic] = useState<Cnic>({ kind: "idle" });
  const [typingCnic, setTypingCnic] = useState(false);
  const [cnicDigits, setCnicDigits] = useState("");
  const nextShot = useRef(1);
  const started = useRef(false);
  const leaving = useRef(false);
  const previews = useRef<string[]>([]);

  useEffect(
    () => () => {
      previews.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );

  const onBehalf: OnBehalf | undefined = isAgent && workerId ? { forWorkerId: workerId } : undefined;

  const create = async () => {
    setPhase({ kind: "creating" });
    try {
      const card = await data.createWorker({
        name: worker.name.trim(),
        categoryIds: worker.categoryIds,
        trade: worker.tradeText.trim() || undefined,
        skills: worker.skills,
        years: worker.years ? Number(worker.years) : null,
        rate: worker.rate ? Number(worker.rate) : null,
        area: worker.area.trim(),
        workingHours: worker.workingHours.trim() || null,
        ...(worker.location ? { location: worker.location } : {}),
        forPhone: agentFor?.phone,
      });
      if (agentFor) setAgentFor({ ...agentFor, created: { workerId: card.id, name: card.name, approved: card.approved } });
      setWorkerId(card.id);
      setApproved(card.approved);
      setPhase({ kind: "ready" });
      cue("success", audioCues);
    } catch (err) {
      const code = errorCode(err);
      if (code === "TRADE_NOT_RECOGNISED") {
        navigate("/app/onboard/type?problem=trade", { replace: true });
        return;
      }
      if (code === "LOCATION_REQUIRED") {
        navigate("/app/onboard/type?problem=area", { replace: true });
        return;
      }
      // Two taps or a lost reply: this phone's profile is already there, so carry on with it.
      if (code === "ALREADY_REGISTERED" && !isAgent) {
        const me = await refresh();
        if (me?.workerId) {
          setWorkerId(me.workerId);
          setPhase({ kind: "ready" });
          return;
        }
      }
      setPhase({ kind: "failed", message: errorText(err, t), canRetry: code !== "ALREADY_REGISTERED" && code !== "PHONE_IN_USE" });
    }
  };

  useEffect(() => {
    if (started.current || existingId || draftProblems(worker).length > 0) return;
    started.current = true;
    void create();
    // Only ever once, on arrival. Retrying is the person's own decision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isAgent && !agentFor && !leaving.current) return <Navigate to="/app/agent/new" replace />;
  if (!existingId && !workerId && phase.kind === "creating" && draftProblems(worker).length > 0) return <Navigate to="/app/onboard" replace />;

  const finish = () => {
    leaving.current = true;
    cue("success", audioCues);
    resetWorker();
    if (isAgent) {
      const saved = agentFor?.created;
      setAgentFor(null);
      navigate("/app/agent/new", { replace: true, state: saved ? { saved: { name: saved.name, approved: saved.approved } } : null });
    } else {
      navigate(home, { replace: true });
    }
  };

  const uploadProfile = async (file: File) => {
    const preview = URL.createObjectURL(file);
    previews.current.push(preview);
    setProfile({ preview, file, status: "uploading" });
    try {
      await data.uploadPhoto("profile", await prepareImage(file), onBehalf);
      setProfile({ preview, file, status: "done" });
    } catch (err) {
      setProfile({ preview, file, status: "failed", error: errorText(err, t) });
    }
  };

  const updateShot = (id: number, patch: Partial<Shot>) => setShots((all) => all.map((shot) => (shot.id === id ? { ...shot, ...patch } : shot)));

  const uploadShot = async (shot: Shot) => {
    updateShot(shot.id, { status: "uploading", error: undefined });
    try {
      const result = await data.uploadPhoto("work", await prepareImage(shot.file), onBehalf);
      updateShot(shot.id, { status: "done", tags: result.skillTags, ai: result.aiAvailable });
    } catch (err) {
      updateShot(shot.id, { status: "failed", error: errorText(err, t) });
    }
  };

  const addShots = async (files: File[]) => {
    const room = MAX_WORK_PHOTOS - shots.length;
    const fresh: Shot[] = files.slice(0, room).map((file) => {
      const preview = URL.createObjectURL(file);
      previews.current.push(preview);
      return { id: nextShot.current++, file, preview, status: "queued", tags: [], ai: null };
    });
    setShots((all) => [...all, ...fresh]);
    // One at a time, because each one is a real AI request.
    for (const shot of fresh) await uploadShot(shot);
  };

  const handleCnicFailure = async (err: unknown) => {
    const code = errorCode(err);
    if (code === "CNIC_DUPLICATE") {
      setPhase({ kind: "blocked" });
      await refresh();
      return;
    }
    if (code === "AI_UNAVAILABLE") {
      setTypingCnic(true);
      setCnic({ kind: "failed", message: t("تصویر پڑھنے کی سہولت ابھی دستیاب نہیں۔ نمبر لکھ دیں۔", "Tasveer parhne ki sahulat abhi dastyab nahi. Number likh dein.", "The photo could not be read right now. Please type the number.") });
      return;
    }
    if (code === "CNIC_UNREADABLE") {
      setTypingCnic(true);
      setCnic({ kind: "failed", message: t("نمبر پڑھا نہیں جا سکا۔ صاف تصویر لیں یا نمبر لکھ دیں۔", "Number parha nahi ja saka. Saaf tasveer lein ya number likh dein.", "We could not read the number. Take a clearer photo or type it.") });
      return;
    }
    setCnic({ kind: "failed", message: errorText(err, t) });
  };

  const sendCnicPhoto = async (file: File) => {
    setCnic({ kind: "working" });
    try {
      await data.uploadCnic(await prepareDocument(file), onBehalf);
      setCnic({ kind: "done" });
      cue("success", audioCues);
    } catch (err) {
      await handleCnicFailure(err);
    }
  };

  const sendCnicNumber = async () => {
    if (cnicDigits.length !== 13) {
      setCnic({ kind: "failed", message: t("شناختی کارڈ کے 13 ہندسے لکھیں", "CNIC ke 13 hindsay likhein", "Please enter all 13 digits of the CNIC") });
      return;
    }
    setCnic({ kind: "working" });
    try {
      await data.uploadCnic({ cnic: cnicDigits }, onBehalf);
      setCnic({ kind: "done" });
      cue("success", audioCues);
    } catch (err) {
      await handleCnicFailure(err);
    }
  };

  if (phase.kind === "creating") {
    return (
      <Screen steps={{ total: 3, current: 3 }}>
        <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-2 text-center text-soft" role="status">
          <LoaderCircle className="h-14 w-14 animate-spin text-brand-600" aria-hidden />
          <p className="text-xl font-bold text-ink">{t("پروفائل بن رہی ہے…", "Profile ban rahi hai…", "Creating the profile…")}</p>
        </div>
      </Screen>
    );
  }

  if (phase.kind === "failed") {
    return (
      <Screen
        back={agentFor ? "/app/agent/new" : "/app/onboard"}
        steps={{ total: 3, current: 3 }}
        footer={
          phase.canRetry ? (
            <Button className="w-full" size="xl" icon={RefreshCw} onClick={() => void create()}>
              {t("دوبارہ کوشش کریں", "Dobara koshish karein", "Try again")}
            </Button>
          ) : undefined
        }
      >
        <AgentBanner />
        <Headline ur="پروفائل نہیں بن سکی" roman="Profile nahi ban saki" en="The profile was not created" />
        <div className="mt-3">
          <InlineError>{phase.message}</InlineError>
        </div>
      </Screen>
    );
  }

  if (phase.kind === "blocked") {
    return (
      <Screen
        steps={{ total: 3, current: 3 }}
        footer={
          <Button className="w-full" size="xl" onClick={finish}>
            {t("واپس جائیں", "Wapas jayein", "Go back")}
          </Button>
        }
      >
        <Card className="mt-4 flex items-start gap-3">
          <ShieldAlert className="mt-1 h-8 w-8 shrink-0 text-busy-600" aria-hidden />
          <div className="min-w-0">
            <h2 className="text-xl">{t("یہ شناختی کارڈ پہلے سے کسی اور اکاؤنٹ پر ہے", "Ye CNIC pehle se kisi aur account par hai", "This CNIC is already on another account")}</h2>
            <p className="mt-1 text-soft">{t("ایک شناختی کارڈ پر ایک ہی کاریگر اکاؤنٹ بن سکتا ہے، اس لیے یہ رجسٹریشن روک دی گئی۔", "Aik CNIC par aik hi kaarigar account ban sakta hai, is liye ye registration rok di gayi.", "One CNIC can hold only one worker account, so this sign-up was stopped.")}</p>
            {isAgent && <p className="mt-1 text-soft">{t("اس پر کوئی فیس نہیں لکھی گئی۔", "Is par koi fee nahi likhi gayi.", "No fee was recorded for it.")}</p>}
          </div>
        </Card>
      </Screen>
    );
  }

  const busy = profile?.status === "uploading" || shots.some((shot) => shot.status === "queued" || shot.status === "uploading") || cnic.kind === "working";
  const addedSomething = profile?.status === "done" || shots.some((shot) => shot.status === "done") || cnic.kind === "done";
  const aiDown = shots.some((shot) => shot.ai === false);

  return (
    <Screen
      back={returning ? "/app/workers/me" : undefined}
      {...(returning ? { title: t("تصویریں اور کاغذات", "Tasveerein aur kaghzat", "Photos and documents") } : { steps: { total: 3, current: 3 } })}
      speak={`${returning ? "" : "پروفائل بن گئی۔ "}تصویریں لگانا اختیاری ہے۔ شناختی کارڈ کا صرف خفیہ کوڈ رکھا جاتا ہے، اور یہ سرکاری تصدیق نہیں ہے۔`}
      footer={
        <Button className="w-full" size="xl" icon={CircleCheck} disabled={busy} onClick={finish}>
          {busy ? t("تصویر جا رہی ہے…", "Tasveer ja rahi hai…", "Uploading…") : addedSomething ? t("مکمل", "Mukammal", "Done") : t("ابھی نہیں، آگے بڑھیں", "Abhi nahi, aage barhein", "Skip for now")}
        </Button>
      }
    >
      <AgentBanner />

      <div className={cx("mb-3 flex items-start gap-2 rounded-2xl bg-brand-100 px-3 py-2 text-brand-800", returning && "hidden")} role="status">
        <CircleCheck className="mt-1 h-6 w-6 shrink-0" aria-hidden />
        <div className="min-w-0">
          <p className="font-bold">{t("پروفائل بن گئی", "Profile ban gayi", "The profile is created")}</p>
          {approved === false && <p className="text-sm">{t("ایڈمن کی منظوری کے بعد گاہکوں کو نظر آئے گی۔", "Admin ki manzoori ke baad gahakon ko nazar aayegi.", "Customers will see it after an admin approves it.")}</p>}
          {approved === true && <p className="text-sm">{t("اب گاہک اسے ڈھونڈ سکتے ہیں۔", "Ab gahak ise dhoond sakte hain.", "Customers can now find it.")}</p>}
        </div>
      </div>

      <Asked voice="photos-intro">
        <Headline ur="تصویریں لگائیں" roman="Tasveerein lagayein" en="Add photos" />
      </Asked>
      <p className="text-soft">{t("یہ سب اختیاری ہے", "Ye sab ikhtiyari hai", "All of this is optional")}</p>

      <section className="mt-3">
        <Asked voice="photo-profile" className="mb-1">
          <h2 className="text-lg">{t("آپ کی تصویر", "Aapki tasveer", "Profile photo")}</h2>
        </Asked>
        <div className="flex items-center gap-3">
          <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sunken">
            {profile ? <img src={profile.preview} alt="" className="h-full w-full object-cover" /> : <Camera className="h-8 w-8 text-brand-600" aria-hidden />}
            {profile?.status === "uploading" && (
              <span className="absolute inset-0 flex items-center justify-center bg-ink/40">
                <LoaderCircle className="h-8 w-8 animate-spin text-white" aria-hidden />
              </span>
            )}
            {profile?.status === "done" && (
              <span className="absolute bottom-1 end-1 rounded-full bg-brand-600 text-white">
                <CircleCheck className="h-6 w-6" aria-hidden />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <PickButton icon={Camera} camera label={t("کیمرے سے لیں", "Camera se lein", "Use camera")} disabled={profile?.status === "uploading"} onPick={([file]) => file && void uploadProfile(file)} />
            <PickButton icon={ImageIcon} label={profile ? t("بدلیں", "Badlein", "Change") : t("گیلری سے لیں", "Gallery se lein", "From gallery")} disabled={profile?.status === "uploading"} onPick={([file]) => file && void uploadProfile(file)} />
            {profile?.status === "failed" && (
              <>
                <InlineError>{profile.error}</InlineError>
                <Button variant="ghost" size="md" icon={RotateCcw} className="w-full" onClick={() => void uploadProfile(profile.file)}>
                  {t("دوبارہ بھیجیں", "Dobara bhejein", "Send again")}
                </Button>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="mt-4">
        <Asked voice="photo-work">
          <h2 className="text-lg">{t("پرانا کام", "Pichla kaam", "Past work")}</h2>
        </Asked>
        <p className="mb-2 text-sm text-soft">{t("اے آئی تصویر دیکھ کر ہنر کے ٹیگ بناتا ہے۔", "AI tasveer dekh kar hunar ke tag banata hai.", "AI looks at each photo and adds skill tags.")}</p>
        <div className="grid grid-cols-3 gap-2">
          {shots.map((shot) => (
            <figure key={shot.id} className="m-0 min-w-0">
              <div className="relative h-24 overflow-hidden rounded-2xl bg-sunken">
                <img src={shot.preview} alt="" className="h-full w-full object-cover" />
                {(shot.status === "queued" || shot.status === "uploading") && (
                  <span className="absolute inset-0 flex items-center justify-center bg-ink/40">
                    <LoaderCircle className="h-7 w-7 animate-spin text-white" aria-hidden />
                  </span>
                )}
                {shot.status === "failed" && (
                  <span className="absolute inset-0 flex items-center justify-center bg-ink/50">
                    <IconButton icon={RotateCcw} label={t("دوبارہ بھیجیں", "Dobara bhejein", "Send again")} className="bg-white text-ink" onClick={() => void uploadShot(shot)} />
                  </span>
                )}
                {shot.status === "done" && (
                  <span className="absolute bottom-1 end-1 rounded-full bg-brand-600 text-white">
                    <CircleCheck className="h-5 w-5" aria-hidden />
                  </span>
                )}
              </div>
              <figcaption className="mt-1 space-y-1 text-center">
                {shot.tags.map((tag) => (
                  <div key={tag}>
                    <AiTag label={phrase(tag, lang)} />
                  </div>
                ))}
                {shot.status === "done" && shot.ai === true && shot.tags.length === 0 && <p className="text-xs text-soft">{t("کوئی ہنر نظر نہیں آیا", "Koi hunar nazar nahi aaya", "No skill seen")}</p>}
                {shot.status === "failed" && <p className="text-xs font-bold text-busy-700">{shot.error}</p>}
              </figcaption>
            </figure>
          ))}
          {shots.length < MAX_WORK_PHOTOS && (
            <label className="flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-faint bg-surface text-sm font-semibold text-soft">
              {shots.length === 0 ? <ImageIcon className="h-7 w-7 text-brand-600" aria-hidden /> : <Plus className="h-7 w-7 text-brand-600" aria-hidden />}
              {t("تصویر", "Tasveer", "Photo")}
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                aria-label={t("پرانے کام کی تصویر لگائیں", "Pichle kaam ki tasveer lagayein", "Add a photo of past work")}
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = "";
                  void addShots(files);
                }}
              />
            </label>
          )}
        </div>
        {aiDown && <p className="mt-2 rounded-2xl bg-sunken px-3 py-2 text-sm text-soft">{t("تصویریں لگ گئیں، مگر اے آئی ابھی نہیں چل سکا اس لیے ہنر کے ٹیگ نہیں بنے۔", "Tasveerein lag gayin, magar AI abhi nahi chal saka is liye hunar ke tag nahi banay.", "Your photos were saved, but AI could not run right now, so no skill tags were added.")}</p>}
      </section>

      <section className="mt-5">
        <Asked voice="photo-cnic" className="mb-1">
          <h2 className="flex items-center gap-2 text-lg">
            <IdCard className="h-6 w-6 shrink-0 text-brand-600" aria-hidden />
            {t("شناختی کارڈ", "CNIC", "CNIC")}
          </h2>
        </Asked>
        <Card className="flex gap-2 bg-sunken">
          <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-brand-600" aria-hidden />
          <ul className="m-0 list-none space-y-1 p-0 text-sm text-soft">
            <li>{t("ہم صرف نمبر کا نمک لگا خفیہ ہیش رکھتے ہیں۔ نہ نمبر رکھا جاتا ہے، نہ تصویر یا فائل۔", "Hum sirf number ka namak laga khufia hash rakhte hain. Na number rakha jata hai, na tasveer ya file.", "We keep only a salted hash of the number. Neither the number nor the photo or file is stored.")}</li>
            <li>{t("نمبر پڑھنے کے لیے تصویر یا PDF اے آئی کو بھیجی جاتی ہے۔", "Number parhne ke liye tasveer ya PDF AI ko bheji jati hai.", "To read the number, the photo or PDF is sent to AI.")}</li>
            <li>{t("ایک شناختی کارڈ پر دوسرا اکاؤنٹ نہیں بن سکتا۔", "Aik CNIC par doosra account nahi ban sakta.", "A second account on the same CNIC is blocked.")}</li>
            <li className="font-bold">{t("یہ سرکاری تصدیق نہیں ہے۔", "Ye sarkari tasdeeq nahi hai.", "This is not government verification.")}</li>
          </ul>
        </Card>

        {cnic.kind === "done" ? (
          <p className="mt-2 flex items-start gap-2 rounded-2xl bg-brand-100 px-3 py-2 font-bold text-brand-800" role="status">
            <CircleCheck className="mt-1 h-5 w-5 shrink-0" aria-hidden />
            {t("دوسرے اکاؤنٹ سے جانچ ہو گئی۔ یہ سرکاری تصدیق نہیں۔", "Doosre account se janch ho gayi. Ye sarkari tasdeeq nahi.", "Checked against other accounts. This is not government verification.")}
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <PickButton icon={Camera} camera label={t("تصویر لیں", "Tasveer lein", "Take a photo")} disabled={cnic.kind === "working"} onPick={([file]) => file && void sendCnicPhoto(file)} />
              <PickButton icon={FileText} accept="image/*,application/pdf" label={t("گیلری یا PDF", "Gallery ya PDF", "Gallery or PDF")} disabled={cnic.kind === "working"} onPick={([file]) => file && void sendCnicPhoto(file)} />
            </div>
            <Button variant="secondary" size="md" icon={Keyboard} className="w-full" disabled={cnic.kind === "working"} onClick={() => setTypingCnic(true)}>
              {t("نمبر لکھیں", "Number likhein", "Type number")}
            </Button>
            {cnic.kind === "working" && (
              <p className="flex items-center justify-center gap-2 text-soft" role="status">
                <LoaderCircle className="h-5 w-5 animate-spin text-brand-600" aria-hidden />
                {t("دیکھ رہے ہیں…", "Dekh rahe hain…", "Checking…")}
              </p>
            )}
            {cnic.kind === "failed" && <InlineError>{cnic.message}</InlineError>}
            {typingCnic && (
              <>
                <Field label={t("شناختی کارڈ نمبر", "CNIC number", "CNIC number")} htmlFor="cnic-number">
                  <input
                    id="cnic-number"
                    dir="ltr"
                    inputMode="numeric"
                    autoComplete="off"
                    className="field latin text-center text-xl"
                    placeholder="12345-1234567-1"
                    value={formatCnic(cnicDigits)}
                    onChange={(event) => setCnicDigits(digitsOnly(event.target.value).slice(0, 13))}
                  />
                </Field>
                <Button className="w-full" size="lg" disabled={cnic.kind === "working"} onClick={() => void sendCnicNumber()}>
                  {t("جانچ کریں", "Janch karein", "Check it")}
                </Button>
              </>
            )}
          </div>
        )}
      </section>

      {agentFor && settings.data && (
        <div className="mt-5">
          <AgentFeeCard settings={settings.data} recorded />
        </div>
      )}
    </Screen>
  );
}
