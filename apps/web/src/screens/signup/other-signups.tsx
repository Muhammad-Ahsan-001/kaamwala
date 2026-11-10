import { ArrowLeft, Check, CircleCheck, Home, Keyboard, LoaderCircle, LogOut, MapPin, Mic, Pencil, User } from "lucide-react";
import { useState } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { data } from "../../data";
import { errorCode, errorText } from "../../data/errors";
import { cue } from "../../lib/audio";
import { clock } from "../../lib/useRecorder";
import { useData } from "../../lib/useData";
import { useSession } from "../../lib/session";
import { useSettings } from "../../lib/settings";
import { isValidName, isValidPhone } from "../../lib/validate";
import { Async } from "../../ui/async";
import { AiTag, Auto, Button, Card, Field, IconButton, InlineError, LinkButton } from "../../ui/primitives";
import { Headline, Screen } from "../../ui/shell";
import { Asked, QuestionVoice } from "../../ui/QuestionVoice";
import { BigMic, LiveWave, Typewriter } from "../../ui/voice";
import { AreaPicker, useAreas } from "./AreaPicker";
import { useVoiceCapture } from "./capture";
import { areaIsKnown, useDraft } from "./draft";
import { AgentFeeCard, MicBlocked, SelfSignupFree, SwitchRole, TextWithMic, cleanPhone, useLeaveSignup } from "./parts";

const CUSTOMER_TO_SAY = [
  { icon: User, ur: "نام", roman: "Naam", en: "Name" },
  { icon: MapPin, ur: "علاقہ", roman: "Ilaqa", en: "Area" },
  { icon: Home, ur: "پتا", roman: "Pata", en: "Address" },
];

export function CustomerVoice() {
  const { t, audioCues } = useSettings();
  const navigate = useNavigate();
  const { customer, patchCustomer } = useDraft();
  const capture = useVoiceCapture();
  const [failure, setFailure] = useState<string | null>(null);
  const hasDraft = Boolean(customer.name || customer.area || customer.address);
  const leaveSignup = useLeaveSignup();

  const onAudio = async (audio: Blob) => {
    try {
      const heard = await data.transcribeCustomer(audio);
      const merged = {
        name: customer.name || heard.name,
        area: customer.area || heard.area,
        address: customer.address || heard.address,
        transcript: heard.transcript,
        aiSource: "gemini" as const,
      };
      patchCustomer(merged);
      cue("success", audioCues);
      // Without a name there is nothing to confirm yet, so ask for it where it can be typed.
      navigate(merged.name ? "/app/signup/customer/confirm" : "/app/signup/customer/type?missing=name");
    } catch (err) {
      if (errorCode(err) === "AI_UNAVAILABLE") navigate("/app/signup/customer/type?voice=off");
      else setFailure(errorText(err, t));
    }
  };

  const onMic = async () => {
    setFailure(null);
    cue("tap", audioCues);
    if (capture.recording) await capture.stop();
    else await capture.start(onAudio);
  };

  const trouble = Boolean(failure) || capture.blocked;

  return (
    <Screen
      back={leaveSignup}
      steps={{ total: 3, current: 2 }}
      speak="اپنا نام اور علاقہ بتائیں۔"
      footer={
        <LinkButton to="/app/signup/customer/type" variant={trouble ? "primary" : "secondary"} size="xl" icon={Keyboard} className="w-full">
          {t("لکھ کر بھریں", "Likh kar bharein", "Type instead")}
        </LinkButton>
      }
    >
      <Asked voice="customer-intro">
        <Headline ur="اپنا نام اور علاقہ بتائیں" roman="Naam aur ilaqa — bas bolein" en="Say your name and area" />
      </Asked>
      <div className="mt-1">
        <SelfSignupFree />
      </div>
      <ul className="m-0 mt-3 grid list-none grid-cols-3 gap-2 p-0">
        {CUSTOMER_TO_SAY.map(({ icon: Icon, ur, roman, en }) => (
          <li key={en} className="flex items-center justify-center gap-1.5 rounded-2xl bg-sunken px-2 py-1 text-sm font-semibold">
            <Icon className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
            {t(ur, roman, en)}
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-col items-center">
        {capture.working ? (
          <div className="flex h-36 flex-col items-center justify-center text-soft" role="status">
            <LoaderCircle className="h-12 w-12 animate-spin text-brand-600" aria-hidden />
            <p className="font-semibold">{t("سمجھ رہے ہیں…", "Samajh rahe hain…", "Understanding…")}</p>
          </div>
        ) : (
          <BigMic recording={capture.recording} onClick={() => void onMic()} size={120} label={capture.recording ? t("ریکارڈنگ ختم کریں", "Recording khatam karein", "Stop recording") : t("بولنا شروع کریں", "Bolna shuru karein", "Start speaking")} />
        )}
        {capture.recording ? (
          <>
            <LiveWave analyser={capture.analyser} />
            <p className="text-sm text-soft">
              <bdi className="latin">{clock(capture.seconds)}</bdi>
            </p>
            <p className="font-semibold text-soft">{t("بات پوری ہو تو دوبارہ دبائیں", "Baat poori ho to dobara dabayein", "Tap again when you finish")}</p>
          </>
        ) : (
          !capture.working && <p className="font-semibold text-soft">{t("مائیک دبا کر بولیں", "Mic daba kar bolein", "Tap the mic and speak")}</p>
        )}
      </div>
      {capture.blocked && (
        <div className="mt-3">
          <MicBlocked />
        </div>
      )}
      {capture.tooShort && (
        <div className="mt-3">
          <InlineError>{t("ریکارڈنگ بہت چھوٹی تھی۔ تھوڑا لمبا بولیں۔", "Recording bohat chhoti thi. Thora lamba bolein.", "That recording was too short. Please speak a little longer.")}</InlineError>
        </div>
      )}
      {capture.interrupted && (
        <div className="mt-3">
          <InlineError>{t("ریکارڈنگ بیچ میں رک گئی۔ دوبارہ بولیں یا لکھ کر بھریں۔", "Recording beech mein ruk gayi. Dobara bolein ya likh kar bharein.", "The recording stopped by itself. Please say it again or type instead.")}</InlineError>
        </div>
      )}
      {failure && (
        <div className="mt-3">
          <InlineError>{failure}</InlineError>
        </div>
      )}
      {hasDraft && !capture.busy && (
        <LinkButton to="/app/signup/customer/type" variant="ghost" size="md" icon={Pencil} className="mt-2 w-full">
          {t("اپنی لکھی تفصیل دیکھیں", "Apni likhi tafseel dekhein", "See what you entered")}
        </LinkButton>
      )}
      {!capture.busy && (
        <div className="mt-1">
          <SwitchRole />
        </div>
      )}
    </Screen>
  );
}

export function CustomerType() {
  const { t } = useSettings();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { customer, patchCustomer } = useDraft();
  const areas = useAreas();
  const sentBack = params.get("problem");
  const [tried, setTried] = useState(false);
  const voiceOff = params.get("voice") === "off";
  const nameMissing = params.get("missing") === "name";
  const pickArea = t("فہرست سے علاقہ چنیں یا اپنی جگہ دیں", "List se ilaqa chunein ya apni jagah dein", "Please pick an area from the list or share your location");

  const problems: { name?: string; area?: string } = {};
  if (!isValidName(customer.name)) problems.name = t("اپنا نام لکھیں", "Apna naam likhein", "Please enter your name");
  if (!customer.area.trim()) problems.area = t("اپنا علاقہ لکھیں یا چنیں", "Apna ilaqa likhein ya chunein", "Please enter or choose your area");
  else if (areas.data && !customer.location && !areaIsKnown(customer.area, areas.data)) problems.area = pickArea;
  // After the first attempt the marks follow what is on screen, so a fixed field stops being red.
  const errors = tried ? problems : sentBack === "area" ? { area: pickArea } : {};

  const submit = () => {
    setTried(true);
    if (Object.keys(problems).length === 0) navigate("/app/signup/customer/confirm");
  };

  return (
    <Screen
      title={t("لکھ کر بھریں", "Likh kar bharein", "Type your details")}
      back="/app/signup/customer"
      footer={
        <Button className="w-full" size="xl" icon={ArrowLeft} onClick={submit}>
          {t("آگے بڑھیں", "Aage barhein", "Continue")}
        </Button>
      }
    >
      {voiceOff && (
        <div className="mb-3">
          <InlineError>{t("آواز کی سہولت ابھی کام نہیں کر رہی، اس لیے کچھ نہیں بھرا گیا۔ اپنی تفصیل یہاں لکھ دیں۔", "Awaz ki sahulat abhi kaam nahi kar rahi, is liye kuch nahi bhara gaya. Apni tafseel yahan likh dein.", "Voice is not working right now, so nothing was filled in. Please type your details here.")}</InlineError>
        </div>
      )}
      {nameMissing && !customer.name && (
        <div className="mb-3">
          <InlineError>{t("آپ کا نام سنائی نہیں دیا۔ یہاں لکھ دیں۔", "Aapka naam sunai nahi diya. Yahan likh dein.", "We did not catch your name. Please type it here.")}</InlineError>
        </div>
      )}
      <div className="mb-2 flex justify-center">
        <SelfSignupFree />
      </div>
      <LinkButton to="/app/signup/customer" variant="ghost" size="md" icon={Mic} className="mb-4 w-full bg-brand-50">
        {t("بول کر بھریں", "Bol kar bharein", "Use voice instead")}
      </LinkButton>
      <form
        className="space-y-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Field label={t("آپ کا نام", "Aapka naam", "Your name")} htmlFor="c-name" action={<QuestionVoice id="field-name" />} error={errors.name}>
          <TextWithMic id="c-name" field="name" value={customer.name} invalid={Boolean(errors.name)} onChange={(name) => patchCustomer({ name })} placeholder={t("اپنا نام", "Apna naam", "Your full name")} />
        </Field>
        <Field label={t("آپ کا علاقہ", "Aapka ilaqa", "Your area")} htmlFor="c-area" action={<QuestionVoice id="customer-area" />} error={errors.area}>
          <AreaPicker id="c-area" value={customer.area} location={customer.location} invalid={Boolean(errors.area)} onChange={patchCustomer} />
        </Field>
        <Field label={t("گھر کا پتا (اختیاری)", "Ghar ka pata (ikhtiyari)", "Home address (optional)")} htmlFor="c-address" action={<QuestionVoice id="customer-address" />} hint={t("پورا پتا صرف بکنگ کے بعد دکھایا جائے گا", "Poora pata sirf booking ke baad dikhaya jayega", "Your full address is shared only after a booking")}>
          <input id="c-address" dir="auto" className="field" value={customer.address} onChange={(e) => patchCustomer({ address: e.target.value })} placeholder={t("گلی، مکان نمبر", "Gali, makan number", "Street, house number")} />
        </Field>
      </form>
    </Screen>
  );
}

export function CustomerConfirm() {
  const { t, audioCues } = useSettings();
  const navigate = useNavigate();
  const { customer, resetCustomer } = useDraft();
  const areas = useAreas();
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const areaProblem = !customer.area.trim() || Boolean(areas.data && !customer.location && !areaIsKnown(customer.area, areas.data));

  if (!isValidName(customer.name)) return <Navigate to="/app/signup/customer/type?missing=name" replace />;

  const rows = [
    { icon: User, label: t("نام", "Naam", "Name"), value: customer.name, optional: false },
    { icon: MapPin, label: t("علاقہ", "Ilaqa", "Area"), value: customer.area, optional: false },
    { icon: Home, label: t("پتا", "Pata", "Address"), value: customer.address, optional: true },
  ];

  const confirm = async () => {
    if (areaProblem) {
      navigate("/app/signup/customer/type?problem=area");
      return;
    }
    setSaving(true);
    setFailure(null);
    try {
      await data.createCustomer({
        name: customer.name.trim(),
        area: customer.area.trim(),
        address: customer.address.trim(),
        ...(customer.location ? { location: customer.location } : {}),
      });
      cue("success", audioCues);
      resetCustomer();
      navigate("/app/describe", { replace: true });
    } catch (err) {
      setFailure(errorText(err, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      back
      steps={{ total: 3, current: 3 }}
      footer={
        <Button size="xl" icon={Check} className="w-full text-xl" disabled={saving} onClick={() => void confirm()}>
          {saving ? t("محفوظ ہو رہا ہے…", "Mehfooz ho raha hai…", "Saving…") : t("ٹھیک ہے", "Theek hai", "Looks right")}
        </Button>
      }
    >
      <Asked voice="customer-confirm">
        <Headline ur="کیا یہ ٹھیک ہے؟" roman="Kya ye theek hai?" en="Is this right?" />
      </Asked>
      {customer.transcript && (
        <div className="mt-3 rounded-3xl bg-sunken p-4">
          <p className="mb-1 text-sm font-bold text-soft">{t("آپ نے کہا", "Aap ne kaha", "You said")}</p>
          <div className="text-lg">
            <Typewriter text={customer.transcript} />
          </div>
        </div>
      )}
      <Card className="mt-3 divide-y divide-line p-0">
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <h2 className="text-base">{t("آپ کی تفصیل", "Aapki tafseel", "Your details")}</h2>
          {customer.aiSource && <AiTag label={t("اے آئی نے سنا", "AI ne suna", "Heard by AI")} />}
        </div>
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-3 px-3 py-2">
            <row.icon className="h-6 w-6 shrink-0 text-brand-600" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="text-sm text-soft">{row.label}</div>
              <div className="font-bold">
                {row.value ? (
                  <Auto text={row.value} className="break-words" />
                ) : (
                  <span className="font-normal text-faint">{row.optional ? t("اختیاری", "Ikhtiyari", "Optional") : t("ضروری ہے", "Zaroori hai", "Needed")}</span>
                )}
              </div>
            </div>
            <IconButton icon={Pencil} label={t(`${row.label} لکھ کر بدلیں`, `${row.label} likh kar badlein`, `Type ${row.label}`)} onClick={() => navigate("/app/signup/customer/type")} />
          </div>
        ))}
      </Card>
      {areaProblem && (
        <div className="mt-3">
          <InlineError>{t("فہرست سے اپنا علاقہ چنیں۔", "List se apna ilaqa chunein.", "Please pick your area from the list.")}</InlineError>
        </div>
      )}
      {failure && (
        <div className="mt-3">
          <InlineError>{failure}</InlineError>
        </div>
      )}
    </Screen>
  );
}

export function AgentNew() {
  const { t } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useSession();
  const { agentFor, setAgentFor, resetWorker, patchWorker, worker } = useDraft();
  const settings = useData(() => data.getPublicSettings(), []);
  const stillOpen = agentFor && !agentFor.created ? agentFor : null;
  const [phone, setPhone] = useState(stillOpen?.phone ?? "");
  const [name, setName] = useState(stillOpen?.name ?? "");
  const [error, setError] = useState<string>();
  const saved = (location.state as { saved?: { name: string; approved: boolean } } | null)?.saved;

  const start = (path: string) => {
    if (!isValidPhone(phone)) {
      setError(t("صحیح فون نمبر لکھیں، جیسے 0300 1234567", "Sahi phone number likhein, jaise 0300 1234567", "Enter a valid number, like 0300 1234567"));
      return;
    }
    setError(undefined);
    const clean = cleanPhone(phone);
    // Coming back for the same worker keeps what was already filled in.
    if (stillOpen?.phone !== clean) resetWorker();
    setAgentFor({ phone: clean, name: name.trim() });
    if (name.trim() && (stillOpen?.phone !== clean || !worker.name)) patchWorker({ name: name.trim() });
    navigate(path);
  };

  return (
    <Screen
      title={t("نیا کاریگر شامل کریں", "Naya kaarigar shamil karein", "Add a worker")}
      right={
        <IconButton
          icon={LogOut}
          label={t("لاگ آؤٹ", "Log out", "Sign out")}
          onClick={() => {
            signOut();
            navigate("/app");
          }}
        />
      }
    >
      {saved && (
        <div className="mb-3 flex items-start gap-2 rounded-2xl bg-brand-100 px-3 py-2 font-bold text-brand-700" role="status">
          <CircleCheck className="mt-1 h-6 w-6 shrink-0" aria-hidden />
          <span className="min-w-0">
            <Auto text={saved.name} />{" "}
            {saved.approved ? t("کی پروفائل بن گئی۔ گاہک اسے ڈھونڈ سکتے ہیں۔", "ki profile ban gayi. Gahak ise dhoond sakte hain.", "now has a profile. Customers can find it.") : t("کی پروفائل بن گئی۔ ایڈمن کی منظوری کا انتظار ہے۔", "ki profile ban gayi. Admin ki manzoori ka intezar hai.", "now has a profile, waiting for an admin to approve it.")}
          </span>
        </div>
      )}
      <p className="mb-4 text-soft">{t("جن کے پاس فون نہیں، ان کی پروفائل آپ اپنے فون سے بنائیں۔", "Jin ke paas phone nahi, unki profile aap apne phone se banayein.", "Create a profile from your phone for workers who cannot use one.")}</p>
      <Async query={settings}>{(value) => <AgentFeeCard settings={value} />}</Async>
      <div className="mt-5 space-y-5">
        <Field label={t("کاریگر کا فون نمبر", "Kaarigar ka phone number", "Worker's phone number")} htmlFor="a-phone" action={<QuestionVoice id="agent-phone" />} error={error}>
          <input id="a-phone" dir="ltr" type="tel" inputMode="tel" className="field latin" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0300 1234567" />
        </Field>
        <Field label={t("کاریگر کا نام (اختیاری)", "Kaarigar ka naam (ikhtiyari)", "Worker's name (optional)")} htmlFor="a-name" action={<QuestionVoice id="agent-name" />}>
          <input id="a-name" dir="auto" className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <Button size="xl" icon={Mic} disabled={!settings.data} onClick={() => start("/app/onboard")}>
          {t("بول کر", "Bol kar", "By voice")}
        </Button>
        <Button variant="secondary" size="xl" icon={Keyboard} disabled={!settings.data} onClick={() => start("/app/onboard/type")}>
          {t("لکھ کر", "Likh kar", "By typing")}
        </Button>
      </div>
    </Screen>
  );
}
