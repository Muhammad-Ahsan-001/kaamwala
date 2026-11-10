import { ArrowLeft, Mic } from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { data } from "../../data";
import { useData } from "../../lib/useData";
import { useSession } from "../../lib/session";
import { useSettings } from "../../lib/settings";
import { digitsOnly } from "../../lib/validate";
import { Async } from "../../ui/async";
import { Button, Field, InlineError, LinkButton } from "../../ui/primitives";
import { Screen } from "../../ui/shell";
import { QuestionVoice } from "../../ui/QuestionVoice";
import { AreaPicker, useAreas } from "./AreaPicker";
import { draftProblems, useDraft, type DraftProblem } from "./draft";
import { AgentBanner, HourPresets, SelfSignupFree, TextWithMic } from "./parts";
import { SkillsPicker, TradePicker } from "./TradePicker";

const PROBLEMS: readonly string[] = ["trade", "area"];

export function OnboardType() {
  const { t } = useSettings();
  const navigate = useNavigate();
  const { user } = useSession();
  const [params] = useSearchParams();
  const { worker, agentFor, patchWorker } = useDraft();
  const categories = useData(() => data.listCategories(), [], { reloadOn: ["categories.changed"] });
  const areas = useAreas();
  const sentBack = params.get("problem");
  const [tried, setTried] = useState(false);
  const voiceOff = params.get("voice") === "off";
  const problems = draftProblems(worker, areas.data);
  // After the first attempt the marks follow what is on screen, so a fixed field stops being red.
  const errors: DraftProblem[] = tried ? problems : sentBack && PROBLEMS.includes(sentBack) ? [sentBack as DraftProblem] : [];

  const has = (problem: DraftProblem) => errors.includes(problem);

  const submit = () => {
    setTried(true);
    if (problems.length === 0) navigate("/app/onboard", { state: { typed: true } });
  };

  if (user?.role === "agent" && !agentFor) return <Navigate to="/app/agent/new" replace />;

  return (
    <Screen
      title={t("لکھ کر بھریں", "Likh kar bharein", "Type your details")}
      back="/app/onboard"
      footer={
        <Button className="w-full" size="xl" onClick={submit} icon={ArrowLeft}>
          {t("آگے بڑھیں", "Aage barhein", "Continue")}
        </Button>
      }
    >
      <AgentBanner />
      {voiceOff && (
        <div className="mb-3">
          <InlineError>{t("آواز کی سہولت ابھی کام نہیں کر رہی، اس لیے کچھ نہیں بھرا گیا۔ اپنی تفصیل یہاں لکھ دیں۔", "Awaz ki sahulat abhi kaam nahi kar rahi, is liye kuch nahi bhara gaya. Apni tafseel yahan likh dein.", "Voice is not working right now, so nothing was filled in. Please type your details here.")}</InlineError>
        </div>
      )}
      <div className="mb-2 flex justify-center">
        <SelfSignupFree />
      </div>
      <LinkButton to="/app/onboard" variant="ghost" size="md" icon={Mic} className="mb-1 w-full bg-brand-50">
        {t("بول کر بھریں", "Bol kar bharein", "Use voice instead")}
      </LinkButton>
      <p className="mb-3 text-center text-sm text-soft">{t("اردو یا رومن اردو، جیسے آسان ہو لکھیں", "Urdu ya Roman Urdu, jaise aasan ho likhein", "Write in Urdu or Roman Urdu, whichever is easier")}</p>

      <Async query={categories}>
        {(list) => (
          <form
            className="space-y-5"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Field label={t("آپ کا نام", "Aapka naam", "Your name")} htmlFor="f-name" action={<QuestionVoice id="field-name" />}error={has("name") ? t("اپنا پورا نام لکھیں", "Apna poora naam likhein", "Please enter your name") : undefined}>
              <TextWithMic id="f-name" field="name" value={worker.name} invalid={has("name")} onChange={(name) => patchWorker({ name })} placeholder={t("اپنا نام", "Apna naam", "Your full name")} />
            </Field>

            <Field label={t("آپ کا کام", "Aapka kaam", "Your trade")} action={<QuestionVoice id="field-trade" />}error={has("trade") ? t("اپنا کام چنیں یا لکھیں", "Apna kaam chunein ya likhein", "Choose or type your trade") : undefined}>
              <TradePicker categories={list} selected={worker.categoryIds} tradeText={worker.tradeText} onSelected={(categoryIds) => patchWorker({ categoryIds })} onTradeText={(tradeText) => patchWorker({ tradeText })} />
            </Field>

            <Field label={t("آپ کے ہنر (اختیاری)", "Aapke hunar (ikhtiyari)", "Your skills (optional)")} action={<QuestionVoice id="field-skills" />}>
              <SkillsPicker categories={list} categoryIds={worker.categoryIds} skills={worker.skills} onChange={(skills) => patchWorker({ skills })} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t("تجربہ (سال)", "Tajurba (saal)", "Experience (years)")} htmlFor="f-years" action={<QuestionVoice id="field-years" />}error={has("years") ? t("0 سے 70 لکھیں", "0 se 70 likhein", "Enter 0 to 70") : undefined}>
                <TextWithMic id="f-years" field="years" value={worker.years} inputMode="numeric" invalid={has("years")} onChange={(v) => patchWorker({ years: digitsOnly(v) })} placeholder="10" />
              </Field>
              <Field label={t("ریٹ فی دن (روپے)", "Rate fi din (rupay)", "Rate per day (Rs)")} htmlFor="f-rate" action={<QuestionVoice id="field-rate" />}error={has("rate") ? t("صحیح ریٹ لکھیں", "Sahi rate likhein", "Enter a valid rate") : undefined}>
                <TextWithMic id="f-rate" field="rate" value={worker.rate} inputMode="numeric" invalid={has("rate")} onChange={(v) => patchWorker({ rate: digitsOnly(v) })} placeholder="2000" />
              </Field>
            </div>

            <Field label={t("آپ کا علاقہ", "Aapka ilaqa", "Your area")} htmlFor="f-area" action={<QuestionVoice id="field-area" />}error={has("area") ? (worker.area.trim() ? t("فہرست سے علاقہ چنیں یا اپنی جگہ دیں", "List se ilaqa chunein ya apni jagah dein", "Please pick an area from the list or share your location") : t("اپنا علاقہ لکھیں یا چنیں", "Apna ilaqa likhein ya chunein", "Please enter or choose your area")) : undefined}>
              <AreaPicker id="f-area" value={worker.area} location={worker.location} invalid={has("area")} onChange={patchWorker} />
            </Field>

            <Field label={t("کام کے اوقات (اختیاری)", "Kaam ke auqat (ikhtiyari)", "Working hours (optional)")} htmlFor="f-hours" action={<QuestionVoice id="field-hours" />}>
              <HourPresets value={worker.workingHours} onPick={(workingHours) => patchWorker({ workingHours })} />
              <TextWithMic id="f-hours" field="workingHours" value={worker.workingHours} onChange={(workingHours) => patchWorker({ workingHours })} placeholder={t("یا خود لکھیں", "Ya khud likhein", "Or write your own")} />
            </Field>

            {errors.length > 0 && <InlineError>{t("سرخ خانے مکمل کریں", "Laal khane mukammal karein", "Please fix the fields marked in red")}</InlineError>}
          </form>
        )}
      </Async>
    </Screen>
  );
}
