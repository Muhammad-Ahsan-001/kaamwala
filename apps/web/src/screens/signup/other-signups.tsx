import { ArrowLeft, Check, CircleCheck, Home, Keyboard, MapPin, Mic, Pencil, User } from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { data } from "../../data";
import { cue } from "../../lib/audio";
import { clock, useRecorder } from "../../lib/useRecorder";
import { useData } from "../../lib/useData";
import { useSettings } from "../../lib/settings";
import { isValidName, isValidPhone } from "../../lib/validate";
import { Async } from "../../ui/async";
import { Auto, Button, Card, Field, IconButton, InlineError, LinkButton } from "../../ui/primitives";
import { Headline, Screen } from "../../ui/shell";
import { BigMic, LiveWave } from "../../ui/voice";
import { useDraft } from "./draft";
import { AgentFeeCard, MicBlocked, SelfSignupFree } from "./parts";

export function CustomerVoice() {
  const { t, audioCues } = useSettings();
  const navigate = useNavigate();
  const { customer, patchCustomer } = useDraft();
  const recorder = useRecorder();
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);
  const recording = recorder.status === "recording";

  const onMic = async () => {
    setFailed(false);
    cue("tap", audioCues);
    if (!recording) {
      await recorder.start();
      return;
    }
    const audio = await recorder.stop();
    if (!audio) return;
    setWorking(true);
    try {
      const heard = await data.transcribeCustomer(audio);
      patchCustomer({ name: customer.name || heard.name, area: customer.area || heard.area, address: customer.address || heard.address });
      navigate("/app/signup/customer/confirm");
    } catch {
      setFailed(true);
    } finally {
      setWorking(false);
    }
  };

  const blocked = recorder.status === "denied" || recorder.status === "unsupported";

  return (
    <Screen
      back="/app"
      steps={{ total: 2, current: 1 }}
      speak="اپنا نام اور علاقہ بتائیں۔"
      footer={
        <LinkButton to="/app/signup/customer/type" variant="secondary" icon={Keyboard} className="w-full">
          {t("لکھ کر بھریں", "Likh kar bharein", "Type instead")}
        </LinkButton>
      }
    >
      <Headline ur="اپنا نام اور علاقہ بتائیں" roman="Naam aur ilaqa — bas bolein" en="Say your name and area" />
      <div className="mt-1">
        <SelfSignupFree />
      </div>
      <div className="mt-8 flex flex-col items-center">
        <BigMic recording={recording} onClick={() => void onMic()} disabled={working} size={128} label={recording ? t("ریکارڈنگ ختم کریں", "Recording khatam karein", "Stop recording") : t("بولنا شروع کریں", "Bolna shuru karein", "Start speaking")} />
        {recording ? (
          <>
            <LiveWave analyser={recorder.analyser} />
            <p className="text-sm text-soft">
              <span className="latin">{clock(recorder.seconds)}</span>
            </p>
          </>
        ) : (
          <p className="font-semibold text-soft">{working ? t("سمجھ رہے ہیں…", "Samajh rahe hain…", "Understanding…") : t("مائیک دبا کر بولیں", "Mic daba kar bolein", "Tap the mic and speak")}</p>
        )}
      </div>
      {blocked && (
        <div className="mt-3">
          <MicBlocked />
        </div>
      )}
      {failed && (
        <div className="mt-3">
          <InlineError>{t("آواز سمجھ نہیں آئی۔ دوبارہ بولیں یا لکھ کر بھریں۔", "Awaz samajh nahi aayi. Dobara bolein ya likh kar bharein.", "We could not understand that. Try again or type instead.")}</InlineError>
        </div>
      )}
    </Screen>
  );
}

export function CustomerType() {
  const { t } = useSettings();
  const navigate = useNavigate();
  const { customer, patchCustomer } = useDraft();
  const [errors, setErrors] = useState<{ name?: string; area?: string }>({});

  const submit = () => {
    const next: typeof errors = {};
    if (!isValidName(customer.name)) next.name = t("اپنا نام لکھیں", "Apna naam likhein", "Please enter your name");
    if (!customer.area.trim()) next.area = t("اپنا علاقہ لکھیں", "Apna ilaqa likhein", "Please enter your area");
    setErrors(next);
    if (Object.keys(next).length === 0) navigate("/app/signup/customer/confirm");
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
      <div className="mb-2 flex justify-center">
        <SelfSignupFree />
      </div>
      <LinkButton to="/app/signup/customer" variant="ghost" size="md" icon={Mic} className="mb-4 w-full bg-brand-50">
        {t("بول کر بھریں", "Bol kar bharein", "Use voice instead")}
      </LinkButton>
      <div className="space-y-5">
        <Field label={t("آپ کا نام", "Aapka naam", "Your name")} htmlFor="c-name" error={errors.name}>
          <input id="c-name" dir="auto" className="field" value={customer.name} onChange={(e) => patchCustomer({ name: e.target.value })} placeholder={t("مثلاً عائشہ ملک", "Maslan Ayesha Malik", "e.g. Ayesha Malik")} />
        </Field>
        <Field label={t("آپ کا علاقہ", "Aapka ilaqa", "Your area")} htmlFor="c-area" error={errors.area}>
          <input id="c-area" dir="auto" className="field" value={customer.area} onChange={(e) => patchCustomer({ area: e.target.value })} placeholder={t("مثلاً G-9، صدر", "Maslan G-9, Saddar", "e.g. G-9, Saddar")} />
        </Field>
        <Field label={t("گھر کا پتا (اختیاری)", "Ghar ka pata (ikhtiyari)", "Home address (optional)")} htmlFor="c-address" hint={t("پورا پتا صرف بکنگ کے بعد دکھایا جائے گا", "Poora pata sirf booking ke baad dikhaya jayega", "Your full address is shared only after a booking")}>
          <input id="c-address" dir="auto" className="field" value={customer.address} onChange={(e) => patchCustomer({ address: e.target.value })} placeholder={t("گلی، مکان نمبر", "Gali, makan number", "Street, house number")} />
        </Field>
      </div>
    </Screen>
  );
}

export function CustomerConfirm() {
  const { t, audioCues } = useSettings();
  const navigate = useNavigate();
  const { customer, resetCustomer } = useDraft();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!customer.name) return <Navigate to="/app/signup/customer" replace />;

  const rows = [
    { icon: User, label: t("نام", "Naam", "Name"), value: customer.name },
    { icon: MapPin, label: t("علاقہ", "Ilaqa", "Area"), value: customer.area },
    { icon: Home, label: t("پتا", "Pata", "Address"), value: customer.address },
  ];

  const confirm = async () => {
    setSaving(true);
    setFailed(false);
    try {
      await data.createCustomer(customer);
      cue("success", audioCues);
      resetCustomer();
      navigate("/app/describe");
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      title={t("کیا یہ ٹھیک ہے؟", "Kya ye theek hai?", "Is this correct?")}
      back
      footer={
        <Button size="xl" icon={Check} className="w-full" disabled={saving} onClick={() => void confirm()}>
          {t("ٹھیک ہے", "Theek hai", "Looks right")}
        </Button>
      }
    >
      <Card className="divide-y divide-line p-0">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-3 px-3 py-2">
            <row.icon className="h-6 w-6 shrink-0 text-brand-600" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="text-sm text-soft">{row.label}</div>
              <div className="font-bold">{row.value ? <Auto text={row.value} /> : <span className="font-normal text-faint">{t("خالی", "Khali", "Empty")}</span>}</div>
            </div>
            <IconButton icon={Pencil} label={t(`${row.label} لکھ کر بدلیں`, `${row.label} likh kar badlein`, `Type ${row.label}`)} onClick={() => navigate("/app/signup/customer/type")} />
          </div>
        ))}
      </Card>
      {failed && (
        <div className="mt-3">
          <InlineError>{t("محفوظ نہیں ہو سکا۔ دوبارہ کوشش کریں۔", "Mehfooz nahi ho saka. Dobara koshish karein.", "Could not save. Please try again.")}</InlineError>
        </div>
      )}
    </Screen>
  );
}

export function AgentNew() {
  const { t } = useSettings();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setAgentFor, resetWorker } = useDraft();
  const settings = useData(() => data.getPublicSettings(), []);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const justSaved = params.get("done") === "1";

  const start = (path: string) => {
    if (!isValidPhone(phone)) {
      setError(t("صحیح فون نمبر لکھیں، جیسے 0300 1234567", "Sahi phone number likhein, jaise 0300 1234567", "Enter a valid number, like 0300 1234567"));
      return;
    }
    setError(undefined);
    resetWorker();
    setAgentFor({ phone, name });
    navigate(path);
  };

  return (
    <Screen title={t("نیا کاریگر شامل کریں", "Naya kaarigar shamil karein", "Add a worker")} back="/app">
      {justSaved && (
        <div className="mb-3 flex items-center gap-2 rounded-2xl bg-brand-100 px-3 py-2 font-bold text-brand-700">
          <CircleCheck className="h-6 w-6 shrink-0" aria-hidden />
          {t("پروفائل بن گئی، منظوری کے لیے بھیج دی گئی", "Profile ban gayi, manzoori ke liye bhej di gayi", "Profile created and sent for approval")}
        </div>
      )}
      <p className="mb-4 text-soft">{t("جن کے پاس فون نہیں، ان کی پروفائل آپ اپنے فون سے بنائیں۔", "Jin ke paas phone nahi, unki profile aap apne phone se banayein.", "Create a profile from your phone for workers who cannot use one.")}</p>
      <Async query={settings}>{(value) => <AgentFeeCard settings={value} />}</Async>
      <div className="mt-5 space-y-5">
        <Field label={t("کاریگر کا فون نمبر", "Kaarigar ka phone number", "Worker's phone number")} htmlFor="a-phone" error={error}>
          <input id="a-phone" dir="ltr" inputMode="tel" className="field latin" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0300 1234567" />
        </Field>
        <Field label={t("کاریگر کا نام (اختیاری)", "Kaarigar ka naam (ikhtiyari)", "Worker's name (optional)")} htmlFor="a-name">
          <input id="a-name" dir="auto" className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <Button size="xl" icon={Mic} onClick={() => start("/app/onboard")}>
          {t("بول کر", "Bol kar", "By voice")}
        </Button>
        <Button variant="secondary" size="xl" icon={Keyboard} onClick={() => start("/app/onboard/type")}>
          {t("لکھ کر", "Likh kar", "By typing")}
        </Button>
      </div>
    </Screen>
  );
}
