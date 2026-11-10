import { Award, Briefcase, Check, Clock, Keyboard, LoaderCircle, MapPin, Mic, Pencil, RotateCcw, Square, User, Wallet, type LucideIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { data, type Category, type OnboardField } from "../../data";
import { categoryName, phrase, rupees } from "../../data/labels";
import { errorCode } from "../../data/errors";
import { cue, speakUrdu } from "../../lib/audio";
import { clock, useRecorder } from "../../lib/useRecorder";
import { useData } from "../../lib/useData";
import { useSettings } from "../../lib/settings";
import { digitsOnly } from "../../lib/validate";
import { AiTag, Auto, Button, Card, IconButton, InlineError, LinkButton, Sheet, cx } from "../../ui/primitives";
import { Headline, Screen } from "../../ui/shell";
import { BigMic, LiveWave, Typewriter } from "../../ui/voice";
import { draftProblems, hasAnyContent, useDraft, type DraftProblem } from "./draft";
import { AgentBanner, MicBlocked, SelfSignupFree } from "./parts";
import { SkillsPicker, TradePicker } from "./TradePicker";

type Row = { field: OnboardField; problem?: DraftProblem; icon: LucideIcon; label: string; value: string };

export function OnboardVoice() {
  const { t, lang, audioCues } = useSettings();
  const navigate = useNavigate();
  const { worker, patchWorker, mergeVoiceDraft, resetWorker } = useDraft();
  const { data: categories } = useData(() => data.listCategories(), []);
  const recorder = useRecorder();
  const [processing, setProcessing] = useState(false);
  const [problem, setProblem] = useState<"ai" | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [fieldRecording, setFieldRecording] = useState<OnboardField | null>(null);
  const [fieldWorking, setFieldWorking] = useState<OnboardField | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [editValue, setEditValue] = useState("");

  const recording = recorder.status === "recording" && fieldRecording === null;
  const list: Category[] = categories ?? [];

  const tradeNames = [...list.filter((c) => worker.categoryIds.includes(c.id)).map((c) => categoryName(c, lang)), worker.tradeText.trim()].filter(Boolean).join("، ");
  const skillNames = worker.skills.map((s) => phrase(s, lang)).join("، ");

  const rows: Row[] = [
    { field: "name", problem: "name", icon: User, label: t("نام", "Naam", "Name"), value: worker.name },
    { field: "trade", problem: "trade", icon: Briefcase, label: t("کام", "Kaam", "Trade"), value: [tradeNames, skillNames].filter(Boolean).join(" · ") },
    { field: "years", problem: "years", icon: Award, label: t("تجربہ", "Tajurba", "Experience"), value: worker.years ? `${worker.years} ${t("سال", "saal", "years")}` : "" },
    { field: "area", problem: "area", icon: MapPin, label: t("علاقہ", "Ilaqa", "Area"), value: worker.area },
    { field: "rate", problem: "rate", icon: Wallet, label: t("ریٹ", "Rate", "Rate"), value: worker.rate ? `${rupees(Number(worker.rate))} / ${t("دن", "din", "day")}` : "" },
    { field: "workingHours", icon: Clock, label: t("اوقات", "Auqat", "Hours"), value: worker.workingHours },
  ];

  const problems = draftProblems(worker);

  const readBack = useCallback(
    (text: string) => {
      speakUrdu(text, audioCues);
    },
    [audioCues],
  );

  const toggleMain = async () => {
    setProblem(null);
    cue("tap", audioCues);
    if (!recording) {
      await recorder.start();
      return;
    }
    const audio = await recorder.stop();
    if (!audio) return;
    setProcessing(true);
    try {
      const heard = await data.transcribeOnboarding(audio);
      mergeVoiceDraft(heard);
      cue("success", audioCues);
      readBack(`کیا یہ ٹھیک ہے؟ ${heard.transcript}`);
    } catch (error) {
      if (errorCode(error) === "AI_UNAVAILABLE" || errorCode(error) === "UNKNOWN") setProblem("ai");
    } finally {
      setProcessing(false);
    }
  };

  const again = async () => {
    resetWorker();
    setShowErrors(false);
    setProblem(null);
    await recorder.start();
  };

  const toggleField = async (field: OnboardField) => {
    cue("tap", audioCues);
    if (fieldRecording !== field) {
      setFieldRecording(field);
      const started = await recorder.start();
      if (!started) setFieldRecording(null);
      return;
    }
    const audio = await recorder.stop();
    setFieldRecording(null);
    if (!audio) return;
    setFieldWorking(field);
    try {
      applyField(field, await data.transcribeField(field, audio));
    } catch {
      setProblem("ai");
    } finally {
      setFieldWorking(null);
    }
  };

  const applyField = (field: OnboardField, value: string) => {
    if (field === "name") patchWorker({ name: value });
    if (field === "years") patchWorker({ years: digitsOnly(value) });
    if (field === "rate") patchWorker({ rate: digitsOnly(value) });
    if (field === "area") patchWorker({ area: value });
    if (field === "workingHours") patchWorker({ workingHours: value });
    if (field === "trade") patchWorker({ tradeText: value });
  };

  const startEdit = (row: Row) => {
    setEditing(row);
    if (row.field === "years") setEditValue(worker.years);
    else if (row.field === "rate") setEditValue(worker.rate);
    else setEditValue(row.value);
  };

  const accept = () => {
    if (problems.length > 0) {
      setShowErrors(true);
      return;
    }
    cue("success", audioCues);
    navigate("/app/onboard/photos");
  };

  const hasDraft = hasAnyContent(worker);
  const blocked = recorder.status === "denied" || recorder.status === "unsupported";
  const aiLabel = worker.aiSource === "gemini" ? "Gemini + Jev" : worker.aiSource === "jev_only" ? "Jev" : null;

  return (
    <Screen
      back="/app"
      steps={{ total: 3, current: 2 }}
      speak="اپنے بارے میں بتائیں۔ اپنا نام، کام، علاقہ اور ریٹ بولیں۔"
      footer={
        <div className="space-y-2">
          <LinkButton to="/app/onboard/type" variant="ghost" size="md" icon={Keyboard} className="w-full">
            {t("لکھ کر بھریں", "Likh kar bharein", "Type instead")}
          </LinkButton>
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <Button variant="secondary" size="xl" icon={RotateCcw} onClick={() => void again()} disabled={processing || recording}>
              {t("دوبارہ", "Dobara", "Redo")}
            </Button>
            <Button size="xl" icon={Check} onClick={accept} disabled={!hasDraft || processing || recording}>
              {t("ٹھیک ہے", "Theek hai", "Looks right")}
            </Button>
          </div>
        </div>
      }
    >
      <AgentBanner />
      <Headline ur="اپنے بارے میں بتائیں" roman="Naam, kaam, ilaqa, rate — bas bolein" en="Tell us about yourself" />
      <div className="mt-1">
        <SelfSignupFree />
      </div>

      {worker.transcript && !recording && (
        <div className="mt-3 rounded-3xl bg-sunken p-4 text-lg">
          <Typewriter text={worker.transcript} />
        </div>
      )}

      {(hasDraft || processing) && (
        <Card className="mt-3 p-3">
          <div className="mb-1 flex items-center justify-between gap-2 px-1">
            <h2 className="text-base">{t("آپ کی پروفائل", "Aapki profile", "Your profile")}</h2>
            {aiLabel && <AiTag label={aiLabel} />}
          </div>
          {rows.map((row) => {
            const invalid = showErrors && row.problem && problems.includes(row.problem);
            const listeningHere = fieldRecording === row.field;
            const workingHere = fieldWorking === row.field;
            return (
              <div key={row.field} className={cx("flex items-center gap-1 rounded-2xl px-1", invalid && "bg-busy-50", listeningHere && "bg-busy-50")}>
                <row.icon className={cx("h-5 w-5 shrink-0", invalid ? "text-busy-600" : "text-brand-600")} aria-hidden />
                <div className="min-w-0 flex-1 px-1 font-semibold">
                  {listeningHere ? (
                    <span className="text-busy-700">{t("سن رہے ہیں…", "Sun rahe hain…", "Listening…")}</span>
                  ) : workingHere ? (
                    <span className="text-soft">{t("سمجھ رہے ہیں…", "Samajh rahe hain…", "Understanding…")}</span>
                  ) : row.value ? (
                    <Auto text={row.value} className="break-words" />
                  ) : (
                    <span className={cx("font-normal", invalid ? "font-bold text-busy-700" : "text-faint")}>
                      {row.label} {invalid ? t("ضروری ہے", "zaroori hai", "is needed") : ""}
                    </span>
                  )}
                </div>
                <IconButton
                  icon={listeningHere ? Square : Mic}
                  label={t(`${row.label} دوبارہ بولیں`, `${row.label} dobara bolein`, `Say ${row.label} again`)}
                  onClick={() => void toggleField(row.field)}
                  disabled={processing || recording || (fieldRecording !== null && !listeningHere) || workingHere}
                  className={listeningHere ? "!text-busy-600" : undefined}
                />
                <IconButton icon={Pencil} label={t(`${row.label} لکھ کر بدلیں`, `${row.label} likh kar badlein`, `Type ${row.label}`)} onClick={() => startEdit(row)} />
              </div>
            );
          })}
        </Card>
      )}

      <div className="mt-2 flex flex-col items-center">
        {processing ? (
          <div className="flex h-36 flex-col items-center justify-center text-soft">
            <LoaderCircle className="h-12 w-12 animate-spin text-brand-600" aria-hidden />
            <p className="font-semibold">{t("سمجھ رہے ہیں…", "Samajh rahe hain…", "Understanding…")}</p>
          </div>
        ) : (
          <>
            <BigMic
              recording={recording}
              onClick={() => void toggleMain()}
              disabled={fieldRecording !== null}
              size={hasDraft ? 88 : 128}
              label={recording ? t("ریکارڈنگ ختم کریں", "Recording khatam karein", "Stop recording") : t("بولنا شروع کریں", "Bolna shuru karein", "Start speaking")}
            />
            {recording ? (
              <>
                <LiveWave analyser={recorder.analyser} />
                <p className="text-sm text-soft">
                  {t("سن رہے ہیں…", "Sun raha hoon…", "Listening…")} <span className="latin">{clock(recorder.seconds)}</span>
                </p>
              </>
            ) : (
              <p className="font-semibold text-soft">{t("مائیک دبا کر بولیں", "Mic daba kar bolein", "Tap the mic and speak")}</p>
            )}
          </>
        )}
      </div>

      {blocked && (
        <div className="mt-2">
          <MicBlocked />
        </div>
      )}
      {problem === "ai" && (
        <div className="mt-2">
          <InlineError>{t("آواز سمجھ نہیں آئی۔ دوبارہ بولیں یا لکھ کر بھریں۔", "Awaz samajh nahi aayi. Dobara bolein ya likh kar bharein.", "We could not understand that. Try again or type instead.")}</InlineError>
        </div>
      )}
      {showErrors && problems.length > 0 && (
        <div className="mt-2">
          <InlineError>{t("سرخ خانے مکمل کریں", "Laal khane mukammal karein", "Please complete the fields marked in red")}</InlineError>
        </div>
      )}

      {editing && (
        <Sheet title={editing.label} onClose={() => setEditing(null)}>
          {editing.field === "trade" ? (
            <div className="space-y-4">
              <TradePicker categories={list} selected={worker.categoryIds} tradeText={worker.tradeText} onSelected={(categoryIds) => patchWorker({ categoryIds })} onTradeText={(tradeText) => patchWorker({ tradeText })} />
              <SkillsPicker categories={list} categoryIds={worker.categoryIds} skills={worker.skills} onChange={(skills) => patchWorker({ skills })} />
            </div>
          ) : (
            <input dir="auto" autoFocus aria-label={editing.label} className="field" value={editValue} inputMode={editing.field === "years" || editing.field === "rate" ? "numeric" : undefined} onChange={(e) => setEditValue(e.target.value)} />
          )}
          <Button
            className="mt-3 w-full"
            icon={Check}
            onClick={() => {
              if (editing.field !== "trade") applyField(editing.field, editValue);
              setEditing(null);
            }}
          >
            {t("محفوظ کریں", "Mehfooz karein", "Save")}
          </Button>
        </Sheet>
      )}
    </Screen>
  );
}
