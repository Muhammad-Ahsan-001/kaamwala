import { Handshake, LoaderCircle, Mic, Square, Undo2, UserCog, Volume2, Wallet } from "lucide-react";
import { useState, type HTMLAttributes } from "react";
import { useNavigate } from "react-router-dom";
import { data, type AppSettings, type OnboardField } from "../../data";
import { errorCode, errorText } from "../../data/errors";
import { HOUR_PRESETS, rupees, splitFee } from "../../data/labels";
import { useSession } from "../../lib/session";
import { useSettings } from "../../lib/settings";
import { toLatinDigits } from "../../lib/validate";
import { Button, Card, Chip, FreeBadge, InlineError, MockTag, cx } from "../../ui/primitives";
import { useVoiceCapture } from "./capture";
import { useDraft } from "./draft";

/** Phone numbers go to the server in plain digits, however they were typed. */
export const cleanPhone = (text: string) => toLatinDigits(text).replace(/[\s-]/g, "");

export function AgentBanner() {
  const { agentFor } = useDraft();
  const { t } = useSettings();
  if (!agentFor) return null;
  return (
    <div className="mb-3 flex items-center gap-2 rounded-2xl bg-brand-100 px-3 py-2 text-brand-800">
      <UserCog className="h-6 w-6 shrink-0" aria-hidden />
      <p className="min-w-0 text-sm font-bold">
        {t("آپ اس کاریگر کی طرف سے بھر رہے ہیں:", "Aap is kaarigar ki taraf se bhar rahe hain:", "Filling in on behalf of:")} <bdi className="latin">{agentFor.phone}</bdi>
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

/** The agent fee and who gets what, always read from the admin's settings. Collection is mocked and says so. */
export function AgentFeeCard({ settings, recorded }: { settings: AppSettings; recorded?: boolean }) {
  const { t } = useSettings();
  const { fee, agentShare, platformShare } = splitFee(settings);
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-bold">
          <Wallet className="h-5 w-5 shrink-0 text-brand-600" aria-hidden />
          {t("ایجنٹ رجسٹریشن فیس", "Agent signup fee", "Agent signup fee")}
        </span>
        <span className="latin text-xl font-extrabold">{rupees(fee)}</span>
      </div>
      <dl className="m-0 mt-2 space-y-1 text-soft">
        <div className="flex items-center justify-between gap-2">
          <dt className="flex items-center gap-1">
            <Handshake className="h-4 w-4 shrink-0" aria-hidden />
            <span>
              {t("ایجنٹ کا حصہ", "Agent ka hissa", "Agent's share")} (<bdi className="latin">{settings.agentSharePercent}%</bdi>)
            </span>
          </dt>
          <dd className="latin m-0 font-bold text-ink">{rupees(agentShare)}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt>
            {t("پلیٹ فارم کا حصہ", "Platform ka hissa", "Platform's share")} (<bdi className="latin">{100 - settings.agentSharePercent}%</bdi>)
          </dt>
          <dd className="latin m-0 font-bold text-ink">{rupees(platformShare)}</dd>
        </div>
      </dl>
      <div className="mt-2">
        <MockTag>{t("نقلی وصولی", "Mock collection", "Mock collection")}</MockTag>
        <p className="mt-1 text-sm text-soft">
          {recorded
            ? t("یہ فیس صرف کھاتے میں لکھی گئی ہے۔ اصل پیسے نہیں لیے گئے۔", "Ye fee sirf khatay mein likhi gayi hai. Asal paise nahi liye gaye.", "This fee was only written in the ledger. No real money was collected.")
            : t("پروفائل بننے پر یہ فیس صرف کھاتے میں لکھی جائے گی۔ اصل پیسے نہیں لیے جاتے۔", "Profile banne par ye fee sirf khatay mein likhi jayegi. Asal paise nahi liye jate.", "When the profile is created this fee is only written in the ledger. No real money is collected.")}
        </p>
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
  const capture = useVoiceCapture();
  const [failure, setFailure] = useState<string | null>(null);

  const toggle = async () => {
    setFailure(null);
    if (capture.recording) {
      await capture.stop();
      return;
    }
    await capture.start(async (audio) => {
      try {
        onChange(await data.transcribeField(field, audio));
      } catch (err) {
        setFailure(
          errorCode(err) === "AI_UNAVAILABLE"
            ? t("آواز کی سہولت ابھی دستیاب نہیں۔ یہاں لکھ دیں۔", "Awaz ki sahulat abhi dastyab nahi. Yahan likh dein.", "Voice is not available right now. Please type it here.")
            : errorText(err, t),
        );
      }
    });
  };

  return (
    <div>
      <div className="relative">
        <input
          id={id}
          dir="auto"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={capture.recording ? t("سن رہے ہیں…", "Sun rahe hain…", "Listening…") : capture.working ? t("سمجھ رہے ہیں…", "Samajh rahe hain…", "Understanding…") : placeholder}
          inputMode={inputMode}
          aria-invalid={invalid}
          autoComplete="off"
          className={cx("field rtl:pl-16 ltr:pr-16", invalid && "border-busy-500", capture.recording && "border-busy-500 bg-busy-50")}
        />
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={capture.working}
          aria-label={capture.recording ? t("ریکارڈنگ ختم کریں", "Recording khatam karein", "Stop recording") : t("بول کر بھریں", "Bol kar bharein", "Fill by voice")}
          className={cx("absolute end-1 top-1 flex h-12 w-12 items-center justify-center rounded-xl disabled:opacity-60", capture.recording ? "bg-busy-500 text-white" : "bg-brand-100 text-brand-700")}
        >
          {capture.working ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden /> : capture.recording ? <Square className="h-5 w-5 fill-current" aria-hidden /> : <Mic className="h-6 w-6" aria-hidden />}
        </button>
      </div>
      {capture.blocked && (
        <div className="mt-1">
          <MicBlocked />
        </div>
      )}
      {capture.tooShort && (
        <div className="mt-1">
          <InlineError>{t("ریکارڈنگ بہت چھوٹی تھی۔ تھوڑا لمبا بولیں۔", "Recording bohat chhoti thi. Thora lamba bolein.", "That recording was too short. Please speak a little longer.")}</InlineError>
        </div>
      )}
      {capture.interrupted && (
        <div className="mt-1">
          <InlineError>{t("ریکارڈنگ بیچ میں رک گئی۔ دوبارہ بولیں یا لکھ کر بھریں۔", "Recording beech mein ruk gayi. Dobara bolein ya likh kar bharein.", "The recording stopped by itself. Please say it again or type instead.")}</InlineError>
        </div>
      )}
      {failure && (
        <div className="mt-1">
          <InlineError>{failure}</InlineError>
        </div>
      )}
    </div>
  );
}

export function MicBlocked() {
  const { t } = useSettings();
  return <InlineError>{t("مائیک نہیں مل سکا۔ آپ لکھ کر بھر سکتے ہیں۔", "Mic nahi mil saka. Aap likh kar bhar sakte hain.", "We could not use the microphone. You can type instead.")}</InlineError>;
}

export function HourPresets({ value, onPick }: { value: string; onPick: (label: string) => void }) {
  const { t } = useSettings();
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {HOUR_PRESETS.map((preset) => {
        const label = t(preset.ur, preset.roman, preset.en);
        return (
          <Chip key={preset.en} active={value === label} onClick={() => onPick(label)}>
            {label}
          </Chip>
        );
      })}
    </div>
  );
}

/** The read-back button, and an honest note when this phone has no Urdu voice. */
export function ListenButton({ speaking, noVoice, onListen }: { speaking: boolean; noVoice: boolean; onListen: () => void }) {
  const { t } = useSettings();
  if (noVoice) {
    return <p className="text-sm text-soft">{t("اس فون میں اردو آواز موجود نہیں، اس لیے سنایا نہیں جا سکتا۔ اوپر لکھا دیکھ لیں۔", "Is phone mein Urdu awaz maujood nahi, is liye sunaya nahi ja sakta. Upar likha dekh lein.", "This phone has no Urdu voice, so this cannot be read aloud. Please check the details above.")}</p>;
  }
  return (
    <Button variant="secondary" size="md" icon={Volume2} className={cx("w-full", speaking && "border-brand-600 text-brand-700")} onClick={onListen}>
      {speaking ? t("سنا رہے ہیں…", "Suna rahe hain…", "Reading aloud…") : t("سن کر دیکھیں", "Sun kar dekhein", "Listen to this")}
    </Button>
  );
}

/** Tapped the wrong role? Signing out is the way back, because a signed-in person cannot reach the role screen. */
/** The first sign-up step has no earlier step while signed in, so back means choosing again, like SwitchRole. */
export function useLeaveSignup() {
  const { signOut } = useSession();
  const navigate = useNavigate();
  return () => {
    signOut();
    navigate("/app", { replace: true });
  };
}

export function SwitchRole() {
  const { t } = useSettings();
  const { signOut } = useSession();
  const navigate = useNavigate();
  return (
    <Button
      variant="ghost"
      size="md"
      icon={Undo2}
      className="w-full"
      onClick={() => {
        signOut();
        navigate("/app");
      }}
    >
      {t("غلط انتخاب؟ واپس جائیں", "Galat intikhab? Wapas jayein", "Wrong choice? Go back")}
    </Button>
  );
}
