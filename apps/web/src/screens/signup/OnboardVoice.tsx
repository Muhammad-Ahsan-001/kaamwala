import { Award, Briefcase, Check, Clock, Keyboard, LoaderCircle, MapPin, Mic, Pencil, RotateCcw, Square, Undo2, User, Wallet, Wrench, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { data, type Category, type OnboardField } from "../../data";
import { errorCode, errorText } from "../../data/errors";
import { categoryName, phrase, rupees } from "../../data/labels";
import { cue, speakUrdu } from "../../lib/audio";
import { clock } from "../../lib/useRecorder";
import { useData } from "../../lib/useData";
import { useSession } from "../../lib/session";
import { useSettings } from "../../lib/settings";
import { digitsOnly } from "../../lib/validate";
import { Async } from "../../ui/async";
import { AiTag, Auto, Button, Card, IconButton, InlineError, LinkButton, Sheet, cx } from "../../ui/primitives";
import { Headline, Screen } from "../../ui/shell";
import { FIELD_VOICE } from "../../lib/question-voices";
import { Asked, QuestionVoice } from "../../ui/QuestionVoice";
import { BigMic, LiveWave, Typewriter } from "../../ui/voice";
import { AreaPicker, useAreas } from "./AreaPicker";
import { MAX_RECORDING_SECONDS, useSpeech, useVoiceCapture } from "./capture";
import { draftProblems, fieldPatch, hasAnyContent, mergeHeard, useDraft, type DraftProblem, type WorkerDraft } from "./draft";
import { AgentBanner, AgentFeeCard, HourPresets, ListenButton, MicBlocked, SelfSignupFree, SwitchRole, useLeaveSignup } from "./parts";
import { SkillsPicker, TradePicker } from "./TradePicker";

type Row = { field: OnboardField; problem?: DraftProblem; icon: LucideIcon; label: string; value: string; hint?: string; optional?: boolean };

type Editing = { field: OnboardField; label: string; message?: string };

/** The Urdu names used when the app speaks. */
const SPOKEN: Record<DraftProblem, string> = { name: "نام", trade: "کام", area: "علاقہ", years: "تجربہ", rate: "ریٹ" };

const TO_SAY: { icon: LucideIcon; ur: string; roman: string; en: string }[] = [
  { icon: User, ur: "نام", roman: "Naam", en: "Name" },
  { icon: Briefcase, ur: "کام", roman: "Kaam", en: "Trade" },
  { icon: Award, ur: "تجربہ", roman: "Tajurba", en: "Years" },
  { icon: MapPin, ur: "علاقہ", roman: "Ilaqa", en: "Area" },
  { icon: Wallet, ur: "ریٹ", roman: "Rate", en: "Rate" },
  { icon: Clock, ur: "اوقات", roman: "Auqat", en: "Hours" },
];

function lineFor(worker: WorkerDraft) {
  return data.readBackLine({
    name: worker.name || null,
    categoryIds: worker.categoryIds,
    years: worker.years ? Number(worker.years) : null,
    rate: worker.rate ? Number(worker.rate) : null,
    area: worker.area || null,
    workingHours: worker.workingHours || null,
  });
}

/** One screen for the whole conversation: speak, see what was understood, hear it back, fix one thing, confirm. */
export function OnboardVoice() {
  const { t, lang, audioCues } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useSession();
  const { worker, agentFor, patchWorker, resetWorker } = useDraft();
  const categories = useData(() => data.listCategories(), [], { reloadOn: ["categories.changed"] });
  const areas = useAreas();
  const fee = useData(() => data.getPublicSettings(), []);
  const capture = useVoiceCapture();
  const speech = useSpeech();
  const arrival = location.state as { typed?: boolean } | null;
  const leaveSignup = useLeaveSignup();
  const [notice, setNotice] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [target, setTarget] = useState<OnboardField | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [editValue, setEditValue] = useState("");
  const [undo, setUndo] = useState<WorkerDraft | null>(null);

  // Audio is handled long after the tap, and a redo may have emptied the draft since that render.
  const latest = useRef(worker);
  latest.current = worker;

  const list: Category[] = categories.data ?? [];
  const problems = draftProblems(worker, areas.data);
  const reviewing = hasAnyContent(worker);
  const recordingMain = capture.recording && target === null;
  const workingMain = capture.working && target === null;
  const trouble = Boolean(notice) || capture.blocked;

  const tradeNames = [...list.filter((c) => worker.categoryIds.includes(c.id)).map((c) => categoryName(c, lang)), worker.tradeText.trim()].filter(Boolean).join("، ");
  const skillNames = worker.skills.map((s) => phrase(s, lang)).join("، ");
  const floor = Math.max(0, ...list.filter((c) => worker.categoryIds.includes(c.id)).map((c) => c.floorPrice));

  const rows: Row[] = [
    { field: "name", problem: "name", icon: User, label: t("نام", "Naam", "Name"), value: worker.name },
    { field: "trade", problem: "trade", icon: Briefcase, label: t("کام", "Kaam", "Trade"), value: tradeNames || (categories.loading && worker.categoryIds.length > 0 ? "…" : "") },
    { field: "skills", icon: Wrench, label: t("ہنر", "Hunar", "Skills"), value: skillNames, optional: true },
    { field: "years", problem: "years", icon: Award, label: t("تجربہ", "Tajurba", "Experience"), value: worker.years ? `${worker.years} ${t("سال", "saal", "years")}` : "", optional: true },
    { field: "area", problem: "area", icon: MapPin, label: t("علاقہ", "Ilaqa", "Area"), value: worker.area },
    {
      field: "rate",
      problem: "rate",
      icon: Wallet,
      label: t("ریٹ", "Rate", "Rate"),
      value: worker.rate ? `${rupees(Number(worker.rate))} / ${t("دن", "din", "day")}` : "",
      optional: true,
      ...(floor > 0 ? { hint: t(`خالی رہا تو ${rupees(floor)} فی دن لگے گا`, `Khali raha to ${rupees(floor)} fi din lagega`, `If left empty, ${rupees(floor)} per day will be used`) } : {}),
    },
    { field: "workingHours", icon: Clock, label: t("اوقات", "Auqat", "Hours"), value: worker.workingHours, optional: true },
  ];

  const announce = useCallback(
    async (draft: WorkerDraft, missing: DraftProblem[]) => {
      if (!audioCues) return;
      try {
        const line = await lineFor(draft);
        speech.say(missing.length ? `${line} ابھی ${missing.map((m) => SPOKEN[m]).join("، ")} باقی ہے۔` : line);
      } catch {
        // The read-back is an extra. The card above already shows everything it would say.
      }
    },
    [audioCues, speech.say],
  );

  // Someone who typed everything hears it back at the same step as someone who spoke.
  const announcedArrival = useRef(false);
  useEffect(() => {
    if (!arrival?.typed || announcedArrival.current) return;
    announcedArrival.current = true;
    void announce(latest.current, []);
  }, [arrival?.typed, announce]);

  const openEditor = useCallback((field: OnboardField, label: string, value: string, message?: string) => {
    setEditValue(value);
    setEditing({ field, label, ...(message ? { message } : {}) });
  }, []);

  const startEdit = (row: Row) => {
    openEditor(row.field, row.label, row.field === "years" ? worker.years : row.field === "rate" ? worker.rate : row.value);
  };

  const onMainAudio = async (audio: Blob) => {
    try {
      const heard = await data.transcribeOnboarding(audio);
      const merged = mergeHeard(latest.current, heard);
      patchWorker(merged);
      setShowErrors(true);
      cue("success", audioCues);
      await announce(merged, draftProblems(merged, areas.data));
    } catch (err) {
      // With no voice service at all there is nothing to retry, so typing is the next step.
      if (errorCode(err) === "AI_UNAVAILABLE") navigate("/app/onboard/type?voice=off");
      else setNotice(errorText(err, t));
    }
  };

  const toggleMain = async () => {
    setNotice(null);
    cue("tap", audioCues);
    if (capture.recording) await capture.stop();
    else await capture.start(onMainAudio);
  };

  const redo = () => {
    setUndo(latest.current);
    resetWorker();
    setShowErrors(false);
    setNotice(null);
  };

  const toggleField = async (row: Row) => {
    setNotice(null);
    cue("tap", audioCues);
    if (capture.recording) {
      await capture.stop();
      setTarget(null);
      return;
    }
    setTarget(row.field);
    const started = await capture.start(async (audio) => {
      try {
        const heard = await data.transcribeOnboarding(audio, row.field);
        const patch = fieldPatch(row.field, heard, latest.current);
        if (!patch) {
          openEditor(row.field, row.label, "", t("یہ بات سمجھ نہیں آئی۔ یہاں لکھ یا چن لیں۔", "Ye baat samajh nahi aayi. Yahan likh ya chun lein.", "We could not catch that. Please type or choose it here."));
          return;
        }
        patchWorker(patch);
        cue("success", audioCues);
        void announce({ ...latest.current, ...patch }, []);
      } catch (err) {
        openEditor(row.field, row.label, "", errorCode(err) === "AI_UNAVAILABLE" ? t("آواز کی سہولت ابھی دستیاب نہیں۔ یہاں لکھ یا چن لیں۔", "Awaz ki sahulat abhi dastyab nahi. Yahan likh ya chun lein.", "Voice is not available right now. Please type or choose it here.") : errorText(err, t));
      } finally {
        setTarget(null);
      }
    });
    if (!started) setTarget(null);
  };

  const saveEdit = () => {
    if (!editing) return;
    const value = editValue.trim();
    if (editing.field === "name") patchWorker({ name: value });
    if (editing.field === "years") patchWorker({ years: digitsOnly(value) });
    if (editing.field === "rate") patchWorker({ rate: digitsOnly(value) });
    if (editing.field === "workingHours") patchWorker({ workingHours: value });
    setShowErrors(true);
    setEditing(null);
  };

  const accept = () => {
    if (problems.length > 0) {
      setShowErrors(true);
      speakUrdu(`${problems.map((p) => SPOKEN[p]).join("، ")} ٹھیک کریں۔`, audioCues);
      document.getElementById("profile-card")?.scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }
    cue("success", audioCues);
    navigate("/app/onboard/photos");
  };

  const listen = async () => {
    try {
      speech.say(await lineFor(worker));
    } catch (err) {
      setNotice(errorText(err, t));
    }
  };

  if (user?.role === "agent" && !agentFor) return <Navigate to="/app/agent/new" replace />;

  const micLabel = recordingMain ? t("ریکارڈنگ ختم کریں", "Recording khatam karein", "Stop recording") : t("بولنا شروع کریں", "Bolna shuru karein", "Start speaking");
  const missingCore = reviewing && (problems.includes("name") || problems.includes("trade") || problems.includes("area"));
  const showMainMic = !reviewing || recordingMain || workingMain || missingCore;
  const timeLeft = MAX_RECORDING_SECONDS - capture.seconds;

  return (
    <Screen
      back={agentFor ? "/app/agent/new" : arrival?.typed ? "/app/onboard/type" : leaveSignup}
      steps={{ total: 3, current: 2 }}
      speak={reviewing ? "کیا یہ ٹھیک ہے؟ اگر ہے تو نیچے کا بڑا بٹن دبائیں۔ کوئی بات بدلنی ہو تو اس کے ساتھ والا مائیک یا قلم دبائیں۔" : "اپنے بارے میں بتائیں۔ اپنا نام، کام، تجربہ، علاقہ، ریٹ اور کام کے اوقات بولیں۔"}
      footer={
        reviewing ? (
          <Button size="xl" icon={Check} className="w-full text-xl" onClick={accept} disabled={capture.busy || (Boolean(agentFor) && !fee.data)}>
            {t("ٹھیک ہے", "Theek hai", "Looks right")}
          </Button>
        ) : (
          <LinkButton to="/app/onboard/type" variant={trouble ? "primary" : "secondary"} size="xl" icon={Keyboard} className="w-full">
            {t("لکھ کر بھریں", "Likh kar bharein", "Type instead")}
          </LinkButton>
        )
      }
    >
      <AgentBanner />

      {reviewing ? (
        <Asked voice="onboard-confirm">
          <Headline ur="کیا یہ ٹھیک ہے؟" roman="Kya ye theek hai?" en="Is this right?" />
        </Asked>
      ) : (
        <>
          <Asked voice="onboard-intro">
            <Headline ur="اپنے بارے میں بتائیں" roman="Naam, kaam, ilaqa, rate — bas bolein" en="Tell us about yourself" />
          </Asked>
          <div className="mt-1">
            <SelfSignupFree />
          </div>
          <ul className="m-0 mt-3 grid list-none grid-cols-3 gap-2 p-0">
            {TO_SAY.map(({ icon: Icon, ur, roman, en }) => (
              <li key={en} className="flex items-center justify-center gap-1.5 rounded-2xl bg-sunken px-2 py-1 text-sm font-semibold">
                <Icon className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
                {t(ur, roman, en)}
              </li>
            ))}
          </ul>
        </>
      )}

      {worker.transcript && !recordingMain && !workingMain && (
        <div className="mt-3 rounded-3xl bg-sunken p-4">
          <p className="mb-1 text-sm font-bold text-soft">{t("آپ نے کہا", "Aap ne kaha", "You said")}</p>
          <div className="text-lg">
            <Typewriter text={worker.transcript} />
          </div>
        </div>
      )}

      {reviewing && (
        <>
          <Card className="mt-3 p-3">
            <div id="profile-card" className="mb-1 flex scroll-mt-20 items-center justify-between gap-2 px-1">
              <h2 className="text-base">{t("آپ کی پروفائل", "Aapki profile", "Your profile")}</h2>
              {worker.aiSource && <AiTag label={worker.aiSource === "gemini" ? t("اے آئی نے سنا", "AI ne suna", "Heard by AI") : "Jev"} />}
            </div>
            {rows.map((row) => {
              const invalid = Boolean(showErrors && row.problem && problems.includes(row.problem));
              const listeningHere = capture.recording && target === row.field;
              const workingHere = capture.working && target === row.field;
              return (
                <div key={row.field} className={cx("flex items-center gap-1 rounded-2xl px-1", (invalid || listeningHere) && "bg-busy-50")}>
                  <row.icon className={cx("h-5 w-5 shrink-0", invalid ? "text-busy-600" : "text-brand-600")} aria-hidden />
                  <div className="min-w-0 flex-1 px-1 py-0.5">
                    <div className={cx("text-sm leading-6", invalid ? "font-bold text-busy-700" : "text-soft")}>
                      {row.label}
                      {row.optional && !row.value && <span className="text-faint"> · {t("اختیاری", "ikhtiyari", "optional")}</span>}
                    </div>
                    <div className="font-semibold leading-8">
                      {listeningHere ? (
                        <span className="text-busy-700">
                          {t("سن رہے ہیں…", "Sun rahe hain…", "Listening…")} <bdi className="latin">{clock(capture.seconds)}</bdi>
                        </span>
                      ) : workingHere ? (
                        <span className="text-soft">{t("سمجھ رہے ہیں…", "Samajh rahe hain…", "Understanding…")}</span>
                      ) : row.value ? (
                        <Auto text={row.value} className="break-words" />
                      ) : invalid ? (
                        <span className="font-bold text-busy-700">{t("ضروری ہے", "Zaroori hai", "Needed")}</span>
                      ) : (
                        <span className="text-sm font-normal text-faint">{row.hint ?? "—"}</span>
                      )}
                    </div>
                    {invalid && row.field === "area" && worker.area && <p className="text-sm font-bold text-busy-700">{t("یہ جگہ نقشے پر نہیں ملی۔ سیکٹر بتائیں یا اپنی موجودہ جگہ دیں۔", "Ye jagah naqshe par nahi mili. Sector batayein ya apni maujooda jagah dein.", "We could not find this on the map. Say your sector or share your current location.")}</p>}
                  </div>
                  <IconButton
                    icon={listeningHere ? Square : Mic}
                    label={t(`${row.label} دوبارہ بولیں`, `${row.label} dobara bolein`, `Say ${row.label} again`)}
                    onClick={() => void toggleField(row)}
                    disabled={(capture.busy && !listeningHere) || (workingHere && !listeningHere)}
                    className={listeningHere ? "!text-busy-600" : undefined}
                  />
                  <IconButton icon={Pencil} label={t(`${row.label} لکھ کر بدلیں`, `${row.label} likh kar badlein`, `Type ${row.label}`)} disabled={capture.busy} onClick={() => startEdit(row)} />
                </div>
              );
            })}
          </Card>

          <div className="mt-2">
            <ListenButton speaking={speech.speaking} noVoice={speech.noVoice} onListen={() => void listen()} />
          </div>

          {!missingCore && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button variant="ghost" size="md" icon={RotateCcw} onClick={redo} disabled={capture.busy}>
                {t("سب دوبارہ", "Sab dobara", "Redo all")}
              </Button>
              <LinkButton to="/app/onboard/type" variant="ghost" size="md" icon={Keyboard}>
                {t("لکھ کر بدلیں", "Likh kar badlein", "Edit by typing")}
              </LinkButton>
            </div>
          )}
        </>
      )}

      {showMainMic && (
        <div className="mt-2 flex flex-col items-center">
          {workingMain ? (
            <div className="flex h-36 flex-col items-center justify-center text-soft" role="status">
              <LoaderCircle className="h-12 w-12 animate-spin text-brand-600" aria-hidden />
              <p className="font-semibold">{t("سمجھ رہے ہیں…", "Samajh rahe hain…", "Understanding…")}</p>
            </div>
          ) : (
            <>
              <BigMic recording={recordingMain} onClick={() => void toggleMain()} disabled={target !== null} size={reviewing ? 88 : 120} label={micLabel} />
              {recordingMain ? (
                <>
                  <LiveWave analyser={capture.analyser} />
                  <p className="text-sm text-soft">
                    {t("سن رہے ہیں…", "Sun rahe hain…", "Listening…")} <bdi className="latin">{clock(capture.seconds)}</bdi>
                    {timeLeft <= 15 && <span className="font-bold text-busy-700"> · {t("وقت ختم ہونے والا ہے", "Waqt khatam hone wala hai", "Almost out of time")}</span>}
                  </p>
                  <p className="font-semibold text-soft">{t("بات پوری ہو تو دوبارہ دبائیں", "Baat poori ho to dobara dabayein", "Tap again when you finish")}</p>
                </>
              ) : (
                <p className="font-semibold text-soft">{reviewing ? t("باقی باتیں بولیں", "Baqi baatein bolein", "Say what is missing") : t("مائیک دبا کر بولیں", "Mic daba kar bolein", "Tap the mic and speak")}</p>
              )}
            </>
          )}
          {missingCore && !capture.busy && (
            <LinkButton to="/app/onboard/type" variant="ghost" size="md" icon={Keyboard} className="mt-1 w-full">
              {t("لکھ کر بھریں", "Likh kar bharein", "Type instead")}
            </LinkButton>
          )}
        </div>
      )}

      {capture.blocked && (
        <div className="mt-2">
          <MicBlocked />
        </div>
      )}
      {capture.tooShort && (
        <div className="mt-2">
          <InlineError>{t("ریکارڈنگ بہت چھوٹی تھی۔ تھوڑا لمبا بولیں۔", "Recording bohat chhoti thi. Thora lamba bolein.", "That recording was too short. Please speak a little longer.")}</InlineError>
        </div>
      )}
      {capture.interrupted && (
        <div className="mt-2">
          <InlineError>{t("ریکارڈنگ بیچ میں رک گئی۔ دوبارہ بولیں یا لکھ کر بھریں۔", "Recording beech mein ruk gayi. Dobara bolein ya likh kar bharein.", "The recording stopped by itself. Please say it again or type instead.")}</InlineError>
        </div>
      )}
      {notice && (
        <div className="mt-2">
          <InlineError>{notice}</InlineError>
        </div>
      )}
      {showErrors && problems.length > 0 && (
        <div className="mt-2">
          <InlineError>{t("سرخ خانے مکمل کریں", "Laal khane mukammal karein", "Please complete the fields marked in red")}</InlineError>
        </div>
      )}

      {agentFor && reviewing && <div className="mt-3">{fee.data ? <AgentFeeCard settings={fee.data} /> : <Async query={fee}>{() => null}</Async>}</div>}

      {!reviewing && undo && !capture.busy && (
        <Button
          variant="ghost"
          size="md"
          icon={Undo2}
          className="mt-1 w-full"
          onClick={() => {
            patchWorker(undo);
            setUndo(null);
            setShowErrors(true);
          }}
        >
          {t("پچھلی تفصیل واپس لائیں", "Pichli tafseel wapas layein", "Bring back my details")}
        </Button>
      )}
      {!reviewing && !agentFor && !capture.busy && !undo && <SwitchRole />}

      {editing && (
        <Sheet title={editing.label} onClose={() => setEditing(null)}>
          <div className="mb-2 flex justify-end">
            <QuestionVoice id={FIELD_VOICE[editing.field]} />
          </div>
          {editing.message && (
            <div className="mb-3">
              <InlineError>{editing.message}</InlineError>
            </div>
          )}
          {editing.field === "trade" || editing.field === "skills" ? (
            <Async query={categories}>
              {(all) => (
                <div className="space-y-4">
                  {editing.field === "trade" && (
                    <TradePicker
                      categories={all}
                      selected={worker.categoryIds}
                      tradeText={worker.tradeText}
                      onSelected={(categoryIds) => patchWorker({ categoryIds })}
                      onTradeText={(tradeText) => patchWorker({ tradeText })}
                    />
                  )}
                  <SkillsPicker categories={all} categoryIds={worker.categoryIds} skills={worker.skills} onChange={(skills) => patchWorker({ skills })} />
                </div>
              )}
            </Async>
          ) : editing.field === "area" ? (
            <AreaPicker id="sheet-area" value={worker.area} location={worker.location} onChange={patchWorker} />
          ) : (
            <>
              {editing.field === "workingHours" && <HourPresets value={editValue} onPick={setEditValue} />}
              <input
                dir="auto"
                autoFocus
                aria-label={editing.label}
                className="field"
                value={editValue}
                inputMode={editing.field === "years" || editing.field === "rate" ? "numeric" : undefined}
                onChange={(e) => setEditValue(e.target.value)}
              />
            </>
          )}
          <Button className="mt-3 w-full" icon={Check} onClick={saveEdit}>
            {t("محفوظ کریں", "Mehfooz karein", "Save")}
          </Button>
        </Sheet>
      )}
    </Screen>
  );
}
