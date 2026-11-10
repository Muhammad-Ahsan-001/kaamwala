import { ArrowLeft, HardHat, House, MessageSquareText, UserCog, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { data } from "../data";
import { errorCode } from "../data/errors";
import type { Role } from "@kaamwala/contracts";
import { useSettings } from "../lib/settings";
import { digitsOnly, isValidPhone } from "../lib/validate";
import { Logo } from "../ui/Logo";
import { Button, Field, FreeBadge, MockTag, cx } from "../ui/primitives";
import { Headline, LangPills, ReadAloud, Screen } from "../ui/shell";

function RoleCard({ to, icon: Icon, ur, en, tone }: { to: string; icon: LucideIcon; ur: string; en: string; tone: "green" | "plain" }) {
  const { lang } = useSettings();
  const english = lang === "en";
  return (
    <Link to={to} className={cx("flex min-h-32 items-center gap-4 rounded-4xl border p-4 transition active:scale-[0.98]", tone === "green" ? "border-brand-600 bg-brand-100" : "border-line bg-surface")}>
      <span className={cx("flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl", tone === "green" ? "bg-brand-600 text-white" : "bg-amber-100 text-amber-700")}>
        <Icon className="h-8 w-8" aria-hidden />
      </span>
      <span className="min-w-0 flex-1" dir={english ? "ltr" : "rtl"}>
        <span className={cx("block text-2xl font-bold", english ? "latin" : "ur")}>{english ? en : ur}</span>
        <span className={cx("block text-sm text-soft", english ? "ur" : "latin")}>{english ? ur : en}</span>
      </span>
    </Link>
  );
}

export function RoleChooser() {
  const { t } = useSettings();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 py-3">
      <header className="flex min-h-14 items-center justify-between">
        <Logo stacked={false} />
        <ReadAloud text="آپ کے محلے کا اڈا، اب آپ کے فون پر۔ اگر آپ کام کرتے ہیں تو پہلا بٹن دبائیں۔ اگر کام کروانا ہے تو دوسرا بٹن دبائیں۔" />
      </header>

      <div className="mb-6 mt-8 flex-1">
        <Headline ur="آپ کے محلے کا اڈا، اب آپ کے فون پر" roman="Aap ke mohallay ka adda, ab aap ke phone par" en="Your neighbourhood adda, now on your phone" size="4xl" />
      </div>

      <div className="space-y-3">
        <RoleCard to="/app/login?role=worker" icon={HardHat} tone="green" ur="میں کام کرتا ہوں" en="I'm a worker" />
        <RoleCard to="/app/login?role=customer" icon={House} tone="plain" ur="مجھے کام کروانا ہے" en="I need work done" />
      </div>

      <LangPills className="mt-4" />

      <Link to="/app/login?role=agent" className="mt-1 flex min-h-12 items-center justify-center gap-2 text-sm font-bold text-brand-700">
        <UserCog className="h-5 w-5" aria-hidden />
        {t("فیلڈ ایجنٹ لاگ ان", "Field agent login", "Field agent sign in")}
      </Link>
    </div>
  );
}

const DESTINATIONS: Partial<Record<Role, string>> = {
  worker: "/app/onboard",
  customer: "/app/signup/customer",
  agent: "/app/agent/new",
};

function roleFrom(value: string | null): Role {
  return value === "customer" || value === "agent" ? value : "worker";
}

export function Login() {
  const { t } = useSettings();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const role = roleFrom(params.get("role"));
  const [phone, setPhone] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const sendCode = async () => {
    if (!isValidPhone(phone)) {
      setError(t("صحیح فون نمبر لکھیں، جیسے 0300 1234567", "Sahi phone number likhein, jaise 0300 1234567", "Enter a valid number, like 0300 1234567"));
      return;
    }
    setError(undefined);
    setBusy(true);
    try {
      const { devOtp: otp } = await data.requestOtp(phone);
      setDevOtp(otp);
    } catch {
      setError(t("کوڈ نہیں بھیجا جا سکا۔ دوبارہ کوشش کریں۔", "Code nahi bheja ja saka. Dobara koshish karein.", "Could not send the code. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (code.length < 4) {
      setError(t("پورا کوڈ لکھیں", "Poora code likhein", "Enter the full code"));
      return;
    }
    setError(undefined);
    setBusy(true);
    try {
      await data.verifyOtp(phone, code, role);
      navigate(DESTINATIONS[role] ?? "/app");
    } catch (err) {
      setError(
        errorCode(err) === "INVALID_OTP"
          ? t("کوڈ درست نہیں", "Code durust nahi", "That code is not correct")
          : t("دوبارہ کوشش کریں", "Dobara koshish karein", "Please try again"),
      );
    } finally {
      setBusy(false);
    }
  };

  const askingCode = devOtp !== null;

  return (
    <Screen
      back="/app"
      steps={{ total: 3, current: 1 }}
      footer={
        <Button className="w-full" size="xl" disabled={busy} icon={askingCode ? ArrowLeft : MessageSquareText} onClick={() => void (askingCode ? verify() : sendCode())}>
          {askingCode ? t("آگے بڑھیں", "Aage barhein", "Continue") : t("کوڈ بھیجیں", "Code bhejein", "Send code")}
        </Button>
      }
    >
      <Headline ur="آپ کا فون نمبر" roman="Aapka phone number" en="Your phone number" />
      {role !== "agent" && (
        <div className="mt-1">
          <FreeBadge>{t("اپنی رجسٹریشن بالکل مفت", "Apni signup bilkul muft", "Signing yourself up is free")}</FreeBadge>
        </div>
      )}
      <div className="mt-4">
        {!askingCode ? (
          <Field label={t("فون نمبر", "Phone number", "Phone number")} htmlFor="phone" error={error}>
            <input id="phone" dir="ltr" inputMode="tel" autoComplete="tel" className="field latin text-2xl" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0300 1234567" />
          </Field>
        ) : (
          <div className="space-y-4">
            <div className="rounded-3xl border border-dashed border-faint bg-surface p-4 text-center">
              <MockTag>{t("نقلی کوڈ: SMS نہیں بھیجا گیا", "Mock code: SMS nahi bheja gaya", "Mock code: no SMS is sent")}</MockTag>
              <p className="latin mt-1 text-4xl font-extrabold tracking-[0.3em]">{devOtp}</p>
            </div>
            <Field label={t("کوڈ لکھیں", "Code likhein", "Enter the code")} htmlFor="otp" error={error}>
              <input id="otp" dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="field latin text-center text-3xl tracking-[0.4em]" value={code} onChange={(e) => setCode(digitsOnly(e.target.value))} />
            </Field>
          </div>
        )}
      </div>
    </Screen>
  );
}
