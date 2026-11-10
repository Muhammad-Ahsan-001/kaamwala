import { Handshake, Mic, Square, UserCog, Wallet } from "lucide-react";
import { useState, type HTMLAttributes } from "react";
import { data, type AppSettings, type OnboardField } from "../../data";
import { rupees, splitFee } from "../../data/labels";
import { useRecorder } from "../../lib/useRecorder";
import { useSettings } from "../../lib/settings";
import { Card, FreeBadge, InlineError, MockTag, cx } from "../../ui/primitives";
import { useDraft } from "./draft";

export function AgentBanner() {
  const { agentFor } = useDraft();
  const { t } = useSettings();
  if (!agentFor) return null;
  return (
    <div className="mb-3 flex items-center gap-2 rounded-2xl bg-brand-100 px-3 py-2 text-brand-800">
      <UserCog className="h-6 w-6 shrink-0" aria-hidden />
      <p className="text-sm font-bold">
        {t("آپ اس کاریگر کی طرف سے بھر رہے ہیں:", "Aap is kaarigar ki taraf se bhar rahe hain:", "Filling in on behalf of:")} <span className="latin">{agentFor.phone}</span>
      </p>
    </div>
  );
}

export function SelfSignupFree() {
  const { t } = useSettings();
  const { agentFor } = useDraft();
  if (agentFor) return null;
  return <FreeBadge>{t("اپنی رجسٹریشن بالکل مفت", "Apni signup bilkul muft", "Signing yourself up is free")}</FreeBadge>;
}

/** The agent fee and who gets what, always read from the admin's settings. */
export function AgentFeeCard({ settings }: { settings: AppSettings }) {
  const { t } = useSettings();
  const { fee, agentShare, platformShare } = splitFee(settings);
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-bold">
          <Wallet className="h-5 w-5 text-brand-600" aria-hidden />
          {t("ایجنٹ رجسٹریشن فیس", "Agent signup fee", "Agent signup fee")}
        </span>
        <span className="latin text-xl font-extrabold">{rupees(fee)}</span>
      </div>
      <dl className="m-0 mt-2 space-y-1 text-soft">
        <div className="flex items-center justify-between gap-2">
          <dt className="flex items-center gap-1">
            <Handshake className="h-4 w-4" aria-hidden />
            {t("ایجنٹ کا حصہ", "Agent ka hissa", "Agent's share")} (<span className="latin">{settings.agentSharePercent}%</span>)
          </dt>
          <dd className="latin m-0 font-bold text-ink">{rupees(agentShare)}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt>{t("پلیٹ فارم کا حصہ", "Platform ka hissa", "Platform's share")}</dt>
          <dd className="latin m-0 font-bold text-ink">{rupees(platformShare)}</dd>
        </div>
      </dl>
      <div className="mt-2">
        <MockTag>{t("نقلی ادائیگی: اصل پیسے نہیں لیے جاتے", "Mock payment: asal paise nahi liye jate", "Mock payment: no real money is collected")}</MockTag>
      </div>
    </Card>
  );
}

/** A text box that also takes dictation, so typing and voice can be mixed per field. */
export function TextWithMic({
  id,
  field,
  value,
  onChange,
  placeholder,
  inputMode,
  invalid,
}: {
  id: string;
  field: OnboardField;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  invalid?: boolean;
}) {
  const { t } = useSettings();
  const recorder = useRecorder();
  const [working, setWorking] = useState(false);
  const recording = recorder.status === "recording";

  const toggle = async () => {
    if (!recording) {
      await recorder.start();
      return;
    }
    const audio = await recorder.stop();
    if (!audio) return;
    setWorking(true);
    try {
      onChange(await data.transcribeField(field, audio));
    } finally {
      setWorking(false);
    }
  };

  const blocked = recorder.status === "denied" || recorder.status === "unsupported";

  return (
    <div>
      <div className="relative">
        <input
          id={id}
          dir="auto"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={recording ? t("سن رہے ہیں…", "Sun rahe hain…", "Listening…") : working ? t("سمجھ رہے ہیں…", "Samajh rahe hain…", "Understanding…") : placeholder}
          inputMode={inputMode}
          aria-invalid={invalid}
          autoComplete="off"
          className={cx("field rtl:pl-16 ltr:pr-16", invalid && "border-busy-500", recording && "border-busy-500 bg-busy-50")}
        />
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={working}
          aria-label={recording ? t("ریکارڈنگ ختم کریں", "Recording khatam karein", "Stop recording") : t("بول کر بھریں", "Bol kar bharein", "Fill by voice")}
          className={cx("absolute end-1 top-1 flex h-12 w-12 items-center justify-center rounded-xl", recording ? "bg-busy-500 text-white" : "bg-brand-100 text-brand-700")}
        >
          {recording ? <Square className="h-5 w-5 fill-current" aria-hidden /> : <Mic className="h-6 w-6" aria-hidden />}
        </button>
      </div>
      {blocked && <div className="mt-1"><MicBlocked /></div>}
    </div>
  );
}

export function MicBlocked() {
  const { t } = useSettings();
  return <InlineError>{t("مائیک نہیں مل سکا۔ آپ لکھ کر بھر سکتے ہیں۔", "Mic nahi mil saka. Aap likh kar bhar sakte hain.", "We could not use the microphone. You can type instead.")}</InlineError>;
}
