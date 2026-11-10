import { ArrowLeft, Mic } from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { data } from "../../data";
import { useData } from "../../lib/useData";
import { useSettings } from "../../lib/settings";
import { digitsOnly } from "../../lib/validate";
import { Async } from "../../ui/async";
import { Button, Chip, Field, InlineError, LinkButton } from "../../ui/primitives";
import { Screen } from "../../ui/shell";
import { draftProblems, useDraft, type DraftProblem } from "./draft";
import { AgentBanner, SelfSignupFree, TextWithMic } from "./parts";
import { SkillsPicker, TradePicker } from "./TradePicker";

const HOUR_PRESETS = [
  { ur: "صبح 9 سے شام 6", roman: "Subah 9 se sham 6", en: "9 am to 6 pm" },
  { ur: "سارا دن", roman: "Saara din", en: "All day" },
  { ur: "صرف شام کو", roman: "Sirf sham ko", en: "Evenings only" },
];

export function OnboardType() {
  const { t } = useSettings();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { worker, patchWorker } = useDraft();
  const categories = useData(() => data.listCategories(), []);
  const [errors, setErrors] = useState<DraftProblem[]>(params.get("problem") === "trade" ? ["trade"] : []);

  const has = (problem: DraftProblem) => errors.includes(problem);

  const submit = () => {
    const problems = draftProblems(worker);
    setErrors(problems);
    if (problems.length === 0) navigate("/app/onboard");
  };

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
            <Field label={t("آپ کا نام", "Aapka naam", "Your name")} htmlFor="f-name" error={has("name") ? t("اپنا پورا نام لکھیں", "Apna poora naam likhein", "Please enter your name") : undefined}>
              <TextWithMic id="f-name" field="name" value={worker.name} invalid={has("name")} onChange={(name) => patchWorker({ name })} placeholder={t("مثلاً محمد اکرم", "Maslan Muhammad Akram", "e.g. Muhammad Akram")} />
            </Field>

            <Field label={t("آپ کا کام", "Aapka kaam", "Your trade")} error={has("trade") ? t("اپنا کام چنیں یا لکھیں", "Apna kaam chunein ya likhein", "Choose or type your trade") : undefined}>
              <TradePicker categories={list} selected={worker.categoryIds} tradeText={worker.tradeText} onSelected={(categoryIds) => patchWorker({ categoryIds })} onTradeText={(tradeText) => patchWorker({ tradeText })} />
            </Field>

            <Field label={t("آپ کے ہنر", "Aapke hunar", "Your skills")}>
              <SkillsPicker categories={list} categoryIds={worker.categoryIds} skills={worker.skills} onChange={(skills) => patchWorker({ skills })} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t("تجربہ (سال)", "Tajurba (saal)", "Experience (years)")} htmlFor="f-years" error={has("years") ? t("صحیح سال لکھیں", "Sahi saal likhein", "Enter 0 to 70") : undefined}>
                <TextWithMic id="f-years" field="years" value={worker.years} inputMode="numeric" invalid={has("years")} onChange={(v) => patchWorker({ years: digitsOnly(v) })} placeholder="10" />
              </Field>
              <Field label={t("ریٹ (روپے)", "Rate (rupay)", "Rate (Rs)")} htmlFor="f-rate" error={has("rate") ? t("صحیح ریٹ لکھیں", "Sahi rate likhein", "Enter a valid rate") : undefined}>
                <TextWithMic id="f-rate" field="rate" value={worker.rate} inputMode="numeric" invalid={has("rate")} onChange={(v) => patchWorker({ rate: digitsOnly(v) })} placeholder="2000" />
              </Field>
            </div>

            <Field label={t("آپ کا علاقہ", "Aapka ilaqa", "Your area")} htmlFor="f-area" error={has("area") ? t("اپنا علاقہ لکھیں", "Apna ilaqa likhein", "Please enter your area") : undefined}>
              <TextWithMic id="f-area" field="area" value={worker.area} invalid={has("area")} onChange={(area) => patchWorker({ area })} placeholder={t("مثلاً G-9، صدر", "Maslan G-9, Saddar", "e.g. G-9, Saddar")} />
            </Field>

            <Field label={t("کام کے اوقات", "Kaam ke auqat", "Working hours")} htmlFor="f-hours">
              <div className="mb-2 flex flex-wrap gap-2">
                {HOUR_PRESETS.map((preset) => {
                  const label = t(preset.ur, preset.roman, preset.en);
                  return (
                    <Chip key={preset.en} active={worker.workingHours === label} onClick={() => patchWorker({ workingHours: label })}>
                      {label}
                    </Chip>
                  );
                })}
              </div>
              <TextWithMic id="f-hours" field="workingHours" value={worker.workingHours} onChange={(workingHours) => patchWorker({ workingHours })} placeholder={t("یا خود لکھیں", "Ya khud likhein", "Or write your own")} />
            </Field>

            {errors.length > 0 && <InlineError>{t("سرخ خانے مکمل کریں", "Laal khane mukammal karein", "Please fix the fields marked in red")}</InlineError>}
          </form>
        )}
      </Async>
    </Screen>
  );
}
