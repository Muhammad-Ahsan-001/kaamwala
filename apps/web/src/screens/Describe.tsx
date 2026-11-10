import { Camera, Keyboard, LoaderCircle, MapPin, Megaphone, Mic, Send, X, type LucideIcon } from "lucide-react";
import { useEffect, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { data, type ProblemAnalysis } from "../data";
import { DEFAULT_CENTER } from "../data/defaults";
import { categoryName, rupees } from "../data/labels";
import { cue } from "../lib/audio";
import { compressImage } from "../lib/images";
import { clock, useRecorder } from "../lib/useRecorder";
import { useData } from "../lib/useData";
import { useSettings } from "../lib/settings";
import { Async } from "../ui/async";
import { CategoryIcon } from "../ui/CategoryIcon";
import { DurationPicker, defaultSchedule, type Schedule } from "../ui/hire";
import { AiTag, Auto, Button, Card, Chip, IconButton, InlineError, cx } from "../ui/primitives";
import { Screen } from "../ui/shell";
import { BigMic, LiveWave } from "../ui/voice";

type Mode = "voice" | "photo" | "text";

function ModeTile({ icon: Icon, label, active, onClick }: { icon: LucideIcon; label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={cx("flex min-h-20 flex-col items-center justify-center rounded-3xl border font-semibold transition active:scale-95", active ? "border-brand-600 bg-brand-100 text-brand-800" : "border-line bg-surface text-soft")}>
      <Icon className="h-7 w-7 text-brand-600" aria-hidden />
      {label}
    </button>
  );
}

export function Describe() {
  const { t, lang, audioCues } = useSettings();
  const navigate = useNavigate();
  const categories = useData(() => data.listCategories(), []);
  const hirer = useData(() => data.getHirer("me"), []);
  const recorder = useRecorder();
  const [mode, setMode] = useState<Mode>("voice");
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [result, setResult] = useState<ProblemAnalysis | null>(null);
  const [chosenCategory, setChosenCategory] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<Schedule>(defaultSchedule());
  const [posting, setPosting] = useState(false);
  const recording = recorder.status === "recording";

  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo);
    },
    [photo],
  );

  const analyze = async (input: { text?: string; audio?: Blob; image?: Blob }) => {
    setBusy(true);
    setFailed(false);
    try {
      const analysis = await data.analyzeProblem(input);
      setResult(analysis);
      setChosenCategory(analysis.categoryId);
      if (analysis.durationDays) setSchedule((s) => ({ ...s, durationDays: analysis.durationDays ?? s.durationDays }));
      cue("success", audioCues);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const onMic = async () => {
    cue("tap", audioCues);
    if (!recording) {
      setResult(null);
      await recorder.start();
      return;
    }
    const audio = await recorder.stop();
    if (audio) await analyze({ audio });
  };

  const pickPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPhoto(URL.createObjectURL(file));
    await analyze({ image: await compressImage(file), text: text || undefined });
  };

  const categoryId = chosenCategory ?? result?.categoryId ?? null;
  const category = categories.data?.find((c) => c.id === categoryId);
  const summary = result?.transcript ?? result?.summary ?? text;

  const seeNearby = () => {
    const query = new URLSearchParams({ days: String(schedule.durationDays), start: schedule.startDate, ...(categoryId ? { cat: categoryId } : {}) });
    navigate(`/app/adda?${query.toString()}`);
  };

  const postJob = async () => {
    if (!categoryId) return;
    setPosting(true);
    setFailed(false);
    try {
      const job = await data.createJob({
        mode: "open",
        categoryId,
        description: summary || categoryName(category, lang),
        area: hirer.data?.area ?? "",
        location: DEFAULT_CENTER,
        urgency: result?.urgency ?? "normal",
        durationDays: schedule.durationDays,
        startDate: schedule.startDate,
      });
      navigate(`/app/jobs/${job.id}/offers`);
    } catch {
      setFailed(true);
    } finally {
      setPosting(false);
    }
  };

  const blocked = recorder.status === "denied" || recorder.status === "unsupported";
  const aiLabel = result?.source === "gemini" ? "Gemini + Jev" : "Jev";

  return (
    <Screen title={t("کیا مسئلہ ہے؟", "Kya masla hai?", "What's the problem?")} nav="customer" speak="کیا مسئلہ ہے؟ بول کر بتائیں، تصویر لگائیں یا لکھیں۔">
      <div className="grid grid-cols-3 gap-2">
        <ModeTile icon={Mic} label={t("بول کر", "Bol kar", "Speak")} active={mode === "voice"} onClick={() => setMode("voice")} />
        <ModeTile icon={Camera} label={t("تصویر", "Tasveer", "Photo")} active={mode === "photo"} onClick={() => setMode("photo")} />
        <ModeTile icon={Keyboard} label={t("لکھ کر", "Likh kar", "Type")} active={mode === "text"} onClick={() => setMode("text")} />
      </div>

      <div className="mt-3">
        {mode === "voice" && (
          <div className="flex flex-col items-center">
            <BigMic recording={recording} onClick={() => void onMic()} disabled={busy} size={104} label={recording ? t("ریکارڈنگ ختم کریں", "Recording khatam karein", "Stop recording") : t("بول کر بتائیں", "Bol kar batayein", "Speak")} />
            {recording ? (
              <>
                <LiveWave analyser={recorder.analyser} />
                <p className="latin text-sm text-soft">{clock(recorder.seconds)}</p>
              </>
            ) : (
              <p className="font-semibold text-soft">{t("مائیک دبا کر بتائیں", "Mic daba kar batayein", "Tap the mic and speak")}</p>
            )}
            {blocked && (
              <div className="mt-2 w-full">
                <InlineError>{t("مائیک نہیں مل سکا۔ لکھ کر بتائیں۔", "Mic nahi mil saka. Likh kar batayein.", "We could not use the microphone. Please type instead.")}</InlineError>
              </div>
            )}
          </div>
        )}

        {mode === "photo" && (
          <div className="relative">
            {photo ? (
              <div className="relative overflow-hidden rounded-3xl">
                <img src={photo} alt="" className="h-48 w-full object-cover" />
                {result && !busy && (
                  <span className="absolute start-2 top-2">
                    <AiTag label="Gemini Vision" />
                  </span>
                )}
                <IconButton icon={X} label={t("تصویر ہٹائیں", "Tasveer hatayein", "Remove photo")} className="absolute end-2 top-2 rounded-full bg-surface" onClick={() => { setPhoto(null); setResult(null); }} />
              </div>
            ) : (
              <label className="flex h-48 cursor-pointer flex-col items-center justify-center gap-1 rounded-3xl border border-dashed border-faint bg-surface font-semibold text-soft">
                <Camera className="h-10 w-10 text-brand-600" aria-hidden />
                {t("تصویر لیں یا چنیں", "Tasveer lein ya chunein", "Take or choose a photo")}
                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => void pickPhoto(event)} />
              </label>
            )}
          </div>
        )}

        {mode === "text" && (
          <div className="relative">
            <textarea
              dir="auto"
              rows={3}
              autoFocus
              value={text}
              onChange={(event) => setText(event.target.value)}
              aria-label={t("مسئلہ لکھیں", "Masla likhein", "Describe the problem")}
              placeholder={t("جیسے: mere ghar ka pankha nahi chal raha", "Jaise: mere ghar ka pankha nahi chal raha", "e.g. mere ghar ka pankha nahi chal raha")}
              className="field resize-none rtl:pl-14 ltr:pr-14"
            />
            <button type="button" disabled={!text.trim() || busy} onClick={() => void analyze({ text })} aria-label={t("بھیجیں", "Bhejein", "Send")} className="absolute bottom-1.5 end-1.5 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white transition active:scale-95 disabled:opacity-40">
              <Send className="h-6 w-6 rtl:-scale-x-100" aria-hidden />
            </button>
          </div>
        )}
      </div>

      {busy && (
        <div className="mt-4 flex items-center justify-center gap-2 font-semibold text-soft">
          <LoaderCircle className="h-6 w-6 animate-spin text-brand-600" aria-hidden />
          {t("سمجھ رہے ہیں…", "Samajh rahe hain…", "Understanding…")}
        </div>
      )}

      {failed && (
        <div className="mt-3">
          <InlineError>{t("سمجھ نہیں آیا۔ دوبارہ کوشش کریں یا لکھ کر بتائیں۔", "Samajh nahi aaya. Dobara koshish karein ya likh kar batayein.", "We could not understand that. Try again or type it.")}</InlineError>
        </div>
      )}

      {result && !busy && (
        <div className="mt-4 animate-rise space-y-3">
          {summary && (
            <div className="rounded-3xl bg-sunken p-3">
              "<Auto text={summary} />"
            </div>
          )}

          <Card className="border-2 border-amber-400">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg">{t("ہمیں سمجھ آیا", "Humein samajh aaya", "We understood")}</h2>
              <AiTag label={aiLabel} />
            </div>
            {category ? (
              <dl className="m-0 mt-2 space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-soft">{t("کام", "Kaam", "Trade")}</dt>
                  <dd className="m-0 flex items-center gap-1 font-bold">
                    <CategoryIcon name={category.icon} className="h-5 w-5 text-brand-600" />
                    {categoryName(category, lang)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-soft">{t("جلدی", "Jaldi", "Urgency")}</dt>
                  <dd className={cx("m-0 font-bold", result.urgency === "urgent" && "text-amber-700")}>{result.urgency === "urgent" ? t("آج ہی", "Aaj hi", "Today") : t("عام", "Aam", "Normal")}</dd>
                </div>
                {result.priceMin !== null && result.priceMax !== null && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-soft">{t("اندازہ فی دن", "Andaza fi din", "Estimate per day")}</dt>
                    <dd className="latin m-0 font-bold">
                      {rupees(result.priceMin)} – {result.priceMax.toLocaleString("en-PK")}
                    </dd>
                  </div>
                )}
              </dl>
            ) : (
              <div className="mt-2">
                <p className="mb-2 text-soft">{t("کام خود چنیں", "Kaam khud chunein", "Please choose the trade")}</p>
                <Async query={categories}>
                  {(list) => (
                    <div className="flex flex-wrap gap-2">
                      {list.map((c) => (
                        <Chip key={c.id} active={chosenCategory === c.id} onClick={() => setChosenCategory(c.id)}>
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

          <Button className="w-full" size="xl" icon={MapPin} onClick={seeNearby}>
            {t("قریبی کاریگر دیکھیں", "Qareebi kaarigar dekhein", "See workers nearby")}
          </Button>
          <Button variant="secondary" size="xl" className="w-full" icon={Megaphone} disabled={!categoryId || posting} onClick={() => void postJob()}>
            {t("کام پوسٹ کریں، آفرز لیں", "Kaam post karein, offers lein", "Post the job, get offers")}
          </Button>
        </div>
      )}
    </Screen>
  );
}
