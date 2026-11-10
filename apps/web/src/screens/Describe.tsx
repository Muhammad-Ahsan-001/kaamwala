import { Camera, Keyboard, LoaderCircle, MapPin, Megaphone, Mic, Pencil, RefreshCw, RotateCcw, Send, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { data, type ProblemAnalysis, type ProblemInput } from "../data";
import { errorCode, errorText } from "../data/errors";
import { categoryName, rupees } from "../data/labels";
import { cue } from "../lib/audio";
import { compressImage } from "../lib/images";
import { clock, useRecorder } from "../lib/useRecorder";
import { useData } from "../lib/useData";
import { useSettings } from "../lib/settings";
import { Async } from "../ui/async";
import { CategoryIcon } from "../ui/CategoryIcon";
import { DurationPicker, JobPlaceRow, defaultSchedule, forgetProblem, problemDescription, recallProblem, rememberProblem, useJobPlace, type DescribeMode, type Schedule } from "../ui/hire";
import { AiTag, Auto, Button, Card, Chip, IconButton, InlineError, cx } from "../ui/primitives";
import { Screen } from "../ui/shell";
import { Asked } from "../ui/QuestionVoice";
import { BigMic, LiveWave } from "../ui/voice";

type Failure = { kind: "ai-voice" | "ai-photo" | "silent" } | { kind: "other"; error: unknown };

/** Below this the matcher is unsure, so the customer is asked to check the trade. */
const UNSURE_BELOW = 0.5;

function ModeTile({ icon: Icon, label, active, onClick }: { icon: LucideIcon; label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={cx("flex min-h-20 flex-col items-center justify-center rounded-3xl border font-semibold transition active:scale-95", active ? "border-brand-600 bg-brand-100 text-brand-800" : "border-line bg-surface text-soft")}>
      <Icon className="h-7 w-7 text-brand-600" aria-hidden />
      {label}
    </button>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="shrink-0 text-soft">{label}</dt>
      <dd className="m-0 flex min-w-0 items-center gap-1 text-end font-bold">{children}</dd>
    </div>
  );
}

export function Describe() {
  const { t, lang, audioCues } = useSettings();
  const navigate = useNavigate();
  const categories = useData(() => data.listCategories(), [], { reloadOn: ["categories.changed"] });
  const jobPlace = useJobPlace();
  const recorder = useRecorder();
  const [kept] = useState(recallProblem);
  const [mode, setMode] = useState<DescribeMode>(kept?.mode ?? "voice");
  const [text, setText] = useState(kept?.text ?? "");
  const [photo, setPhoto] = useState<Blob | null>(kept?.photo ?? null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [result, setResult] = useState<ProblemAnalysis | null>(kept?.analysis ?? null);
  const [chosenCategory, setChosenCategory] = useState<string | null>(kept?.chosenCategory ?? null);
  const [changingTrade, setChangingTrade] = useState(false);
  const [schedule, setSchedule] = useState<Schedule>(kept?.schedule ?? defaultSchedule());
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<unknown>(null);
  const recording = recorder.status === "recording";
  const lastInput = useRef<ProblemInput | null>(null);
  const resultCard = useRef<HTMLDivElement>(null);
  const showResult = useRef(false);
  const uploaded = useRef<{ photo: Blob; url: string } | null>(null);

  useEffect(() => {
    if (!photo) {
      setPhotoUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useEffect(() => {
    if (result) rememberProblem({ analysis: result, chosenCategory, schedule, text, photo, mode });
  }, [result, chosenCategory, schedule, text, photo, mode]);

  useEffect(() => {
    if (!showResult.current || !result || busy) return;
    showResult.current = false;
    resultCard.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result, busy]);

  const analyze = async (input: ProblemInput) => {
    lastInput.current = input;
    setBusy(true);
    setFailure(null);
    setPostError(null);
    setResult(null);
    setChangingTrade(false);
    forgetProblem();
    try {
      const analysis = await data.analyzeProblem(input);
      // An empty transcript means nothing was heard. Anything said about it would be invented.
      if (input.audio && !input.text && !analysis.transcript?.trim()) {
        cue("down", audioCues);
        setFailure({ kind: "silent" });
        return;
      }
      setResult(analysis);
      setChosenCategory(null);
      setSchedule((current) => ({ ...current, durationDays: analysis.durationDays ?? 1 }));
      showResult.current = true;
      cue("success", audioCues);
    } catch (err) {
      cue("down", audioCues);
      if (errorCode(err) === "AI_UNAVAILABLE") {
        setFailure({ kind: input.audio ? "ai-voice" : "ai-photo" });
        setMode("text");
      } else {
        setFailure({ kind: "other", error: err });
      }
    } finally {
      setBusy(false);
    }
  };

  const onMic = async () => {
    cue("tap", audioCues);
    if (!recording) {
      setResult(null);
      setFailure(null);
      await recorder.start();
      return;
    }
    const audio = await recorder.stop();
    if (audio) await analyze({ audio });
  };

  const pickPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const image = await compressImage(file);
    setPhoto(image);
    await analyze({ image, text: text.trim() || undefined });
  };

  const chooseMode = (next: DescribeMode) => {
    setMode(next);
    setFailure(null);
  };

  const removePhoto = () => {
    setPhoto(null);
    setFailure(null);
    if (mode === "photo") setResult(null);
  };

  const startOver = () => {
    forgetProblem();
    setResult(null);
    setChosenCategory(null);
    setChangingTrade(false);
    setText("");
    setPhoto(null);
    setFailure(null);
    setPostError(null);
    setSchedule(defaultSchedule());
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const categoryId = chosenCategory ?? result?.categoryId ?? null;
  const category = categories.data?.find((c) => c.id === categoryId);
  const corrected = chosenCategory !== null && chosenCategory !== result?.categoryId;
  const unsure = !corrected && result !== null && result.confidence < UNSURE_BELOW;
  // A range was worked out for the detected trade, so it says nothing once the trade is corrected.
  const priceMin = corrected ? null : (result?.priceMin ?? null);
  const priceMax = corrected ? null : (result?.priceMax ?? null);
  const heard = result?.transcript?.trim() || null;
  const quoted = heard ?? (text.trim() || result?.summary?.trim() || null);
  const photoUnread = result?.source === "jev_only" && photo !== null;

  const seeNearby = () => {
    const query = new URLSearchParams({ days: String(schedule.durationDays), start: schedule.startDate, ...(categoryId ? { cat: categoryId } : {}) });
    navigate(`/app/adda?${query.toString()}`);
  };

  const uploadPhoto = async (image: Blob) => {
    if (uploaded.current?.photo !== image) uploaded.current = { photo: image, url: await data.uploadImage(image) };
    return uploaded.current.url;
  };

  const postJob = async () => {
    if (!categoryId || !result || !jobPlace.place) return;
    setPosting(true);
    setPostError(null);
    try {
      const photoUrls = photo ? [await uploadPhoto(photo)] : undefined;
      const job = await data.createJob({
        mode: "open",
        categoryId,
        description: problemDescription({ analysis: result, text }) || categoryName(category, lang),
        area: jobPlace.place.area,
        location: jobPlace.place.location,
        urgency: result.urgency,
        durationDays: schedule.durationDays,
        startDate: schedule.startDate,
        priceMin,
        priceMax,
        photoUrls,
      });
      forgetProblem();
      navigate(`/app/jobs/${job.id}/offers`);
    } catch (err) {
      setPostError(err);
    } finally {
      setPosting(false);
    }
  };

  const blocked = recorder.status === "denied" || recorder.status === "unsupported";
  const failureText = (() => {
    if (!failure) return null;
    switch (failure.kind) {
      case "ai-voice":
        return t("AI ابھی نہیں چل رہا، اس لیے آواز نہیں سمجھی جا سکی۔ نیچے لکھ کر بتائیں۔", "AI abhi nahi chal raha, is liye awaz nahi samjhi ja saki. Neeche likh kar batayein.", "AI is not running right now, so your voice could not be understood. Please type it below.");
      case "ai-photo":
        return t("AI ابھی نہیں چل رہا، اس لیے تصویر نہیں پڑھی جا سکی۔ نیچے لکھ کر بتائیں۔", "AI abhi nahi chal raha, is liye tasveer nahi parhi ja saki. Neeche likh kar batayein.", "AI is not running right now, so the photo could not be read. Please type it below.");
      case "silent":
        return t("آواز سنائی نہیں دی۔ دوبارہ بولیں یا لکھ کر بتائیں۔", "Awaz sunai nahi di. Dobara bolein ya likh kar batayein.", "We heard nothing in that recording. Try again or type it.");
      case "other":
        return errorText(failure.error, t);
    }
  })();

  return (
    <Screen title={t("کیا مسئلہ ہے؟", "Kya masla hai?", "What's the problem?")} nav="customer" speak="کیا مسئلہ ہے؟ بول کر بتائیں، تصویر لگائیں یا لکھیں۔">
      <Asked voice="describe-problem" className="mb-2">
        <p className="font-semibold text-soft">{t("بول کر بتائیں، تصویر لگائیں یا لکھیں", "Bol kar batayein, tasveer lagayein ya likhein", "Say it, add a photo, or type it")}</p>
      </Asked>
      <div className="grid grid-cols-3 gap-2">
        <ModeTile icon={Mic} label={t("بول کر", "Bol kar", "Speak")} active={mode === "voice"} onClick={() => chooseMode("voice")} />
        <ModeTile icon={Camera} label={t("تصویر", "Tasveer", "Photo")} active={mode === "photo"} onClick={() => chooseMode("photo")} />
        <ModeTile icon={Keyboard} label={t("لکھ کر", "Likh kar", "Type")} active={mode === "text"} onClick={() => chooseMode("text")} />
      </div>

      <div className="mt-3">
        {mode === "voice" && (
          <div className="flex flex-col items-center">
            <BigMic recording={recording} onClick={() => void onMic()} disabled={busy} size={104} label={recording ? t("ریکارڈنگ ختم کریں", "Recording khatam karein", "Stop recording") : t("بول کر بتائیں", "Bol kar batayein", "Speak")} />
            {recording ? (
              <>
                <LiveWave analyser={recorder.analyser} />
                <p className="latin text-sm text-soft">{clock(recorder.seconds)}</p>
                <p className="font-semibold text-soft">{t("بول چکیں تو دوبارہ دبائیں", "Bol chukein to dobara dabayein", "Tap again when you finish")}</p>
              </>
            ) : (
              <p className="font-semibold text-soft">{t("مائیک دبا کر بتائیں", "Mic daba kar batayein", "Tap the mic and speak")}</p>
            )}
            {blocked && (
              <div className="mt-2 w-full space-y-2">
                <InlineError>{t("مائیک نہیں مل سکا۔ لکھ کر بتائیں۔", "Mic nahi mil saka. Likh kar batayein.", "We could not use the microphone. Please type instead.")}</InlineError>
                <Button variant="secondary" size="md" className="w-full" icon={Keyboard} onClick={() => chooseMode("text")}>
                  {t("لکھ کر بتائیں", "Likh kar batayein", "Type instead")}
                </Button>
              </div>
            )}
          </div>
        )}

        {mode === "photo" && (
          <div className="relative">
            {photoUrl ? (
              <div className="relative overflow-hidden rounded-3xl">
                <img src={photoUrl} alt={t("آپ کی تصویر", "Aap ki tasveer", "Your photo")} className="h-48 w-full object-cover" />
                {result?.source === "gemini" && !busy && (
                  <span className="absolute start-2 top-2">
                    <AiTag label={t("AI نے تصویر دیکھی", "AI ne tasveer dekhi", "AI read this photo")} />
                  </span>
                )}
                <IconButton icon={X} label={t("تصویر ہٹائیں", "Tasveer hatayein", "Remove photo")} className="absolute end-2 top-2 rounded-full bg-surface" onClick={removePhoto} />
              </div>
            ) : (
              <label className="flex h-48 cursor-pointer flex-col items-center justify-center gap-1 rounded-3xl border border-dashed border-faint bg-surface font-semibold text-soft focus-within:ring-2 focus-within:ring-brand-500">
                <Camera className="h-10 w-10 text-brand-600" aria-hidden />
                {t("تصویر لیں یا چنیں", "Tasveer lein ya chunein", "Take or choose a photo")}
                <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={(event) => void pickPhoto(event)} />
              </label>
            )}
          </div>
        )}

        {mode === "text" && (
          <div className="space-y-2">
            {photoUrl && (
              <div className="flex items-center gap-2 rounded-2xl bg-sunken p-2">
                <img src={photoUrl} alt="" className="h-12 w-12 rounded-xl object-cover" />
                <span className="min-w-0 flex-1 text-sm font-semibold text-soft">{t("یہ تصویر کام کے ساتھ جائے گی", "Ye tasveer kaam ke saath jayegi", "This photo goes with the job")}</span>
                <IconButton icon={X} label={t("تصویر ہٹائیں", "Tasveer hatayein", "Remove photo")} onClick={removePhoto} />
              </div>
            )}
            <textarea
              dir="auto"
              rows={3}
              maxLength={2000}
              value={text}
              onChange={(event) => setText(event.target.value)}
              aria-label={t("مسئلہ لکھیں", "Masla likhein", "Describe the problem")}
              placeholder={t("جیسے: میرے گھر کا پنکھا نہیں چل رہا", "Jaise: mere ghar ka pankha nahi chal raha", "e.g. mere ghar ka pankha nahi chal raha")}
              className="field resize-none"
            />
            <Button className="w-full" icon={busy ? LoaderCircle : Send} disabled={!text.trim() || busy} onClick={() => void analyze({ text: text.trim(), image: photo ?? undefined })}>
              {t("سمجھائیں", "Samjhayein", "Understand this")}
            </Button>
          </div>
        )}
      </div>

      {busy && (
        <div className="mt-4 flex items-center justify-center gap-2 font-semibold text-soft" role="status">
          <LoaderCircle className="h-6 w-6 animate-spin text-brand-600" aria-hidden />
          {t("سمجھ رہے ہیں…", "Samajh rahe hain…", "Understanding…")}
        </div>
      )}

      {failureText && (
        <div className="mt-3 space-y-2">
          <InlineError>{failureText}</InlineError>
          {failure?.kind === "silent" || failure?.kind === "other" ? (
            <div className="flex gap-2">
              {failure.kind === "other" && lastInput.current && (
                <Button variant="secondary" size="md" className="flex-1" icon={RefreshCw} onClick={() => lastInput.current && void analyze(lastInput.current)}>
                  {t("دوبارہ", "Dobara", "Try again")}
                </Button>
              )}
              {mode !== "text" && (
                <Button variant="secondary" size="md" className="flex-1" icon={Keyboard} onClick={() => chooseMode("text")}>
                  {t("لکھ کر بتائیں", "Likh kar batayein", "Type instead")}
                </Button>
              )}
            </div>
          ) : null}
        </div>
      )}

      {result && !busy && (
        <div ref={resultCard} className="mt-4 scroll-mt-20 animate-rise space-y-3">
          {quoted && (
            <div className="rounded-3xl bg-sunken p-3">
              <p className="text-sm text-soft">{heard ? t("آپ نے کہا", "Aap ne kaha", "You said") : text.trim() ? t("آپ کا مسئلہ", "Aap ka masla", "Your problem") : t("AI نے یہ سمجھا", "AI ne ye samjha", "What AI understood")}</p>
              <p>
                <Auto text={quoted} />
              </p>
            </div>
          )}

          <Card className="border-2 border-amber-400">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg">{t("ہمیں سمجھ آیا", "Humein samajh aaya", "We understood")}</h2>
              <AiTag label={result.source === "gemini" ? "AI + Jev" : t("صرف Jev", "Sirf Jev", "Jev only")} />
            </div>

            {result.source === "jev_only" && (
              <p className="mt-1 text-sm font-semibold text-amber-700">
                {t("AI نہیں چلا۔ کام آپ کے لفظوں سے Jev نے پہچانا، قیمت کاریگروں کے اصل ریٹ سے ہے۔", "AI nahi chala. Kaam aap ke lafzon se Jev ne pehchana, qeemat kaarigaron ke asal rate se hai.", "AI did not run. Jev matched the trade from your words, and the price comes from real worker rates.")}
                {photoUnread && ` ${t("تصویر نہیں پڑھی گئی۔", "Tasveer nahi parhi gayi.", "The photo was not read.")}`}
              </p>
            )}

            <dl className="m-0 mt-2 space-y-1">
              <Row label={t("کام", "Kaam", "Trade")}>
                {category ? (
                  <>
                    <CategoryIcon name={category.icon} className="h-5 w-5 shrink-0 text-brand-600" />
                    <span className="truncate">{categoryName(category, lang)}</span>
                  </>
                ) : (
                  <span className="text-amber-700">{t("پہچانا نہیں گیا", "Pehchana nahi gaya", "Not recognised")}</span>
                )}
              </Row>
              <Row label={t("جلدی", "Jaldi", "Urgency")}>
                <span className={cx(result.urgency === "urgent" && "text-amber-700")}>{result.urgency === "urgent" ? t("آج ہی", "Aaj hi", "Today") : result.urgency === "low" ? t("کوئی جلدی نہیں", "Koi jaldi nahi", "No hurry") : t("عام", "Aam", "Normal")}</span>
              </Row>
              <Row label={corrected ? t("کم از کم فی دن", "Kam az kam fi din", "Minimum per day") : t("اندازہ فی دن", "Andaza fi din", "Estimate per day")}>
                {corrected && category ? (
                  <span className="latin">{rupees(category.floorPrice)}</span>
                ) : priceMin !== null && priceMax !== null ? (
                  <span className="latin" dir="ltr">
                    {rupees(priceMin)} – {priceMax.toLocaleString("en-PK")}
                  </span>
                ) : priceMin !== null ? (
                  <span>
                    <span className="latin">{rupees(priceMin)}</span> {t("سے", "se", "and up")}
                  </span>
                ) : (
                  <span className="text-soft">{t("اندازہ نہیں", "Andaza nahi", "No estimate")}</span>
                )}
              </Row>
              <Row label={t("کتنے دن", "Kitne din", "Duration")}>
                {result.durationDays ? (
                  <span>
                    <span className="latin">{result.durationDays}</span> {t("دن", "din", result.durationDays === 1 ? "day" : "days")}
                  </span>
                ) : (
                  <span className="text-soft">{t("آپ نے نہیں بتایا", "Aap ne nahi bataya", "You did not say")}</span>
                )}
              </Row>
            </dl>

            {corrected && <p className="mt-1 text-sm text-soft">{t("کام آپ نے خود چنا", "Kaam aap ne khud chuna", "You chose this trade yourself")}</p>}
            {unsure && category && !changingTrade && <p className="mt-1 text-sm font-semibold text-amber-700">{t("ہمیں پکا یقین نہیں، کام دیکھ لیں", "Humein pakka yaqeen nahi, kaam dekh lein", "We are not sure, please check the trade")}</p>}

            {category && !changingTrade ? (
              <Button variant="ghost" size="md" className="mt-1 w-full" icon={Pencil} onClick={() => setChangingTrade(true)}>
                {t("کام بدلیں", "Kaam badlein", "Change the trade")}
              </Button>
            ) : (
              <div className="mt-3">
                <Asked voice="job-trade" className="mb-2">
                  <p className="font-semibold text-soft">{t("کام خود چنیں", "Kaam khud chunein", "Please choose the trade")}</p>
                </Asked>
                <Async query={categories}>
                  {(list) => (
                    <div className="flex flex-wrap gap-2">
                      {list.map((c) => (
                        <Chip
                          key={c.id}
                          active={categoryId === c.id}
                          onClick={() => {
                            setChosenCategory(c.id);
                            setChangingTrade(false);
                          }}
                        >
                          <CategoryIcon name={c.icon} className="h-5 w-5" />
                          {categoryName(c, lang)}
                        </Chip>
                      ))}
                    </div>
                  )}
                </Async>
              </div>
            )}
          </Card>

          <Card>
            <DurationPicker value={schedule} onChange={setSchedule} />
          </Card>

          <Card>
            <Asked voice="job-place" className="mb-2">
              <h3 className="text-lg">{t("کام کہاں ہے؟", "Kaam kahan hai?", "Where is the job?")}</h3>
            </Asked>
            <JobPlaceRow jobPlace={jobPlace} />
          </Card>

          <Button className="w-full" size="xl" icon={MapPin} onClick={seeNearby}>
            {t("قریبی کاریگر دیکھیں", "Qareebi kaarigar dekhein", "See workers nearby")}
          </Button>
          <Button variant="secondary" size="xl" className="w-full" icon={posting ? LoaderCircle : Megaphone} disabled={!categoryId || !jobPlace.place || posting} onClick={() => void postJob()}>
            {t("کام پوسٹ کریں، آفرز لیں", "Kaam post karein, offers lein", "Post the job, get offers")}
          </Button>
          {!categoryId && <p className="text-center text-sm text-soft">{t("پوسٹ کرنے کے لیے پہلے کام چنیں", "Post karne ke liye pehle kaam chunein", "Choose the trade before posting")}</p>}
          {categoryId && !jobPlace.place && !jobPlace.loading && <p className="text-center text-sm text-soft">{t("پوسٹ کرنے کے لیے پہلے علاقہ چنیں", "Post karne ke liye pehle ilaqa chunein", "Choose your area before posting")}</p>}
          {postError !== null && <InlineError>{errorText(postError, t)}</InlineError>}
          <Button variant="ghost" size="md" className="w-full" icon={RotateCcw} onClick={startOver}>
            {t("نیا مسئلہ بتائیں", "Naya masla batayein", "Describe a new problem")}
          </Button>
        </div>
      )}
    </Screen>
  );
}
