import { ArrowLeft, HardHat, House, MessageSquareText, PencilLine, RefreshCw, ShieldAlert, UserCog, type LucideIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { data, type Role } from "../data";
import { errorText } from "../data/errors";
import { LeaveRoute } from "../lib/back";
import { useSession } from "../lib/session";
import { useSettings } from "../lib/settings";
import { digitsOnly, isValidPhone } from "../lib/validate";
import { Logo } from "../ui/Logo";
import { Button, Card, Field, FreeBadge, MockTag, Tag, cx } from "../ui/primitives";
import { Headline, LangPills, ReadAloud, Screen } from "../ui/shell";
import { Asked, QuestionVoice } from "../ui/QuestionVoice";
import { cleanPhone } from "./signup/parts";

function RoleCard({ to, icon: Icon, ur, roman, en, tone }: { to: string; icon: LucideIcon; ur: string; roman: string; en: string; tone: "green" | "plain" }) {
  const { lang } = useSettings();
  const urdu = lang === "ur";
  return (
    <Link to={to} className={cx("flex min-h-32 items-center gap-4 rounded-4xl border p-4 transition active:scale-[0.98]", tone === "green" ? "border-brand-600 bg-brand-100" : "border-line bg-surface")}>
      <span className={cx("flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl", tone === "green" ? "bg-brand-600 text-white" : "bg-amber-100 text-amber-700")}>
        <Icon className="h-8 w-8" aria-hidden />
      </span>
      <span className="min-w-0 flex-1" dir={urdu ? "rtl" : "ltr"}>
        <span className={cx("block text-2xl font-bold", urdu ? "ur" : "latin")}>{lang === "ur" ? ur : lang === "roman" ? roman : en}</span>
        {urdu && <span className="latin block text-sm text-soft">{roman}</span>}
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
        <ReadAloud text="آپ کے محلے کا اڈا، اب آپ کے فون پر۔ اگر آپ کو کام چاہیے تو پہلا بٹن دبائیں۔ اگر کام کروانا ہے تو دوسرا بٹن دبائیں۔" />
      </header>

      <div className="mb-6 mt-8 flex-1">
        <Headline ur="آپ کے محلے کا اڈا، اب آپ کے فون پر" roman="Aap ke mohallay ka adda, ab aap ke phone par" en="Your neighbourhood adda, now on your phone" size="4xl" />
        <QuestionVoice id="role-choice" className="mt-3" />
      </div>

      <div className="space-y-3">
        <RoleCard to="/app/login?role=worker" icon={HardHat} tone="green" ur="مجھے کام چاہیے" roman="Mujhe kaam chahiye" en="I want work" />
        <RoleCard to="/app/login?role=customer" icon={House} tone="plain" ur="مجھے کام کروانا ہے" roman="Mujhe kaam karwana hai" en="I need work done" />
      </div>

      <LangPills className="mt-4" />

      <Link to="/app/login?role=agent" className="mt-1 flex min-h-12 items-center justify-center gap-2 text-sm font-bold text-brand-700">
        <UserCog className="h-5 w-5" aria-hidden />
        {t("فیلڈ ایجنٹ لاگ ان", "Field agent login", "Field agent sign in")}
      </Link>
    </div>
  );
}

/** Absent means this phone keeps the role it already has. Only a person choosing "worker" or "customer" may change it. */
function roleFrom(value: string | null): Role | undefined {
  return value === "customer" || value === "worker" || value === "agent" ? value : undefined;
}

/** Only a path inside this app, so a crafted link cannot send someone elsewhere after sign-in. */
function safeNext(value: string | null): string | null {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : null;
}

/** Staff accounts are only ever made by an admin or the seed. Anyone else at a staff door is told so plainly. */
function WrongDoor({ door }: { door: "agent" | "admin" }) {
  const { t } = useSettings();
  const { home, signOut } = useSession();
  const navigate = useNavigate();
  const admin = door === "admin";
  return (
    <Screen
      title={admin ? t("ایڈمن", "Admin", "Admin") : t("فیلڈ ایجنٹ", "Field agent", "Field agent")}
      footer={
        <div className="space-y-2">
          <Button className="w-full" size="xl" icon={ArrowLeft} onClick={() => navigate(home, { replace: true })}>
            {t("اپنے اکاؤنٹ میں جائیں", "Apne account mein jayein", "Go to my account")}
          </Button>
          <Button
            className="w-full"
            variant="ghost"
            size="md"
            onClick={() => {
              signOut();
              navigate(admin ? "/admin/login" : "/app");
            }}
          >
            {t("دوسرا نمبر استعمال کریں", "Doosra number istemal karein", "Use a different number")}
          </Button>
        </div>
      }
    >
      <Card className="flex items-start gap-3">
        <ShieldAlert className="mt-1 h-8 w-8 shrink-0 text-busy-600" aria-hidden />
        <div className="min-w-0">
          <h2 className="text-xl">
            {admin
              ? t("یہ اکاؤنٹ ایڈمن نہیں", "Ye account admin nahi", "This account is not an admin")
              : t("یہ نمبر ایجنٹ کے طور پر منظور نہیں", "Ye number agent ke taur par manzoor nahi", "This number is not an approved agent")}
          </h2>
          <p className="mt-1 text-soft">
            {admin
              ? t("ایڈمن پینل کھولنے کے لیے ایڈمن نمبر سے لاگ ان کریں۔", "Admin panel kholne ke liye admin number se login karein.", "Sign in with an admin number to open the admin panel.")
              : t("ایجنٹ کا اکاؤنٹ صرف ایڈمن بنا سکتا ہے۔", "Agent ka account sirf admin bana sakta hai.", "Only an admin can create an agent account.")}
          </p>
        </div>
      </Card>
    </Screen>
  );
}

export function Login({ door }: { door?: "admin" }) {
  const { t } = useSettings();
  const { user, home } = useSession();
  const [params] = useSearchParams();
  const role = door ?? roleFrom(params.get("role"));
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
      const { devOtp: otp } = await data.requestOtp(cleanPhone(phone));
      setDevOtp(otp);
      setCode("");
    } catch (err) {
      setError(errorText(err, t));
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
      // Signing in updates the session, and the check below then leaves this screen.
      await data.verifyOtp(cleanPhone(phone), code, role);
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  };

  if (user && (role === "agent" || role === "admin") && user.role !== role) return <WrongDoor door={role} />;
  if (user) return <LeaveRoute to={safeNext(params.get("next")) ?? home} />;

  const askingCode = devOtp !== null;
  const roleLabel =
    role === "worker"
      ? t("مجھے کام چاہیے", "Mujhe kaam chahiye", "I want work")
      : role === "customer"
        ? t("مجھے کام کروانا ہے", "Mujhe kaam karwana hai", "I need work done")
        : role === "agent"
          ? t("فیلڈ ایجنٹ", "Field agent", "Field agent")
          : role === "admin"
            ? t("ایڈمن", "Admin", "Admin")
            : null;
  const staffTitle =
    role === "admin" ? t("ایڈمن لاگ ان", "Admin login", "Admin sign in") : role === "agent" ? t("فیلڈ ایجنٹ لاگ ان", "Field agent login", "Field agent sign in") : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void (askingCode ? verify() : sendCode());
  };

  return (
    <Screen
      back={role === "admin" ? "/" : "/app"}
      {...(staffTitle ? { title: staffTitle } : { steps: { total: 3, current: 1 } })}
      speak={askingCode ? "اپنا کوڈ لکھیں اور آگے بڑھیں کا بٹن دبائیں۔" : "اپنا فون نمبر لکھیں اور کوڈ بھیجیں کا بٹن دبائیں۔"}
      footer={
        <Button className="w-full" size="xl" type="submit" form="login-form" disabled={busy} icon={askingCode ? ArrowLeft : MessageSquareText}>
          {busy ? t("ذرا ٹھہریں…", "Zara thehrein…", "Please wait…") : askingCode ? t("آگے بڑھیں", "Aage barhein", "Continue") : t("کوڈ بھیجیں", "Code bhejein", "Send code")}
        </Button>
      }
    >
      {roleLabel && (
        <div className="mb-1">
          <Tag tone="plain">{roleLabel}</Tag>
        </div>
      )}
      <Asked voice={askingCode ? "login-code" : "login-phone"}>
        <Headline ur={askingCode ? "اپنا کوڈ لکھیں" : "آپ کا فون نمبر"} roman={askingCode ? "Apna code likhein" : "Aapka phone number"} en={askingCode ? "Enter your code" : "Your phone number"} />
      </Asked>
      {role !== "agent" && role !== "admin" && !askingCode && (
        <div className="mt-1">
          <FreeBadge>{t("اپنی رجسٹریشن بالکل مفت", "Apni signup bilkul muft", "Signing yourself up is free")}</FreeBadge>
        </div>
      )}
      {role === "agent" && !askingCode && <p className="mt-1 text-soft">{t("یہ لاگ ان صرف منظور شدہ ایجنٹوں کے لیے ہے۔", "Ye login sirf manzoor shuda agents ke liye hai.", "This sign-in is only for approved agents.")}</p>}
      {role === "admin" && !askingCode && <p className="mt-1 text-soft">{t("یہ لاگ ان صرف کام والا کے ایڈمن کے لیے ہے۔", "Ye login sirf KaamWala ke admin ke liye hai.", "This sign-in is only for KaamWala admins.")}</p>}

      <form id="login-form" className="mt-4" noValidate onSubmit={submit}>
        {!askingCode ? (
          <Field label={t("فون نمبر", "Phone number", "Phone number")} htmlFor="phone" error={error}>
            <input id="phone" dir="ltr" type="tel" inputMode="tel" autoComplete="tel" className="field latin text-2xl" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0300 1234567" />
          </Field>
        ) : (
          <div className="space-y-4">
            <p className="text-soft">
              {t("نمبر:", "Number:", "Number:")} <bdi className="latin font-bold text-ink">{cleanPhone(phone)}</bdi>
            </p>
            <button type="button" onClick={() => setCode(devOtp ?? "")} aria-label={t("یہ کوڈ لگائیں", "Ye code lagayein", "Use this code")} className="block w-full rounded-3xl border border-dashed border-faint bg-surface p-4 text-center">
              <MockTag>{t("نقلی کوڈ: SMS نہیں بھیجا گیا", "Mock code: SMS nahi bheja gaya", "Mock code: no SMS is sent")}</MockTag>
              <span className="latin mt-1 block text-4xl font-extrabold tracking-[0.3em]">{devOtp}</span>
              <span className="mt-1 block text-sm font-bold text-brand-700">{t("لگانے کے لیے دبائیں", "Lagane ke liye dabayein", "Tap to fill it in")}</span>
            </button>
            <Field label={t("کوڈ لکھیں", "Code likhein", "Enter the code")} htmlFor="otp" error={error}>
              <input id="otp" dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="field latin text-center text-3xl tracking-[0.4em]" value={code} onChange={(e) => setCode(digitsOnly(e.target.value))} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="ghost"
                size="md"
                icon={PencilLine}
                onClick={() => {
                  setDevOtp(null);
                  setCode("");
                  setError(undefined);
                }}
              >
                {t("نمبر بدلیں", "Number badlein", "Change number")}
              </Button>
              <Button variant="ghost" size="md" icon={RefreshCw} disabled={busy} onClick={() => void sendCode()}>
                {t("نیا کوڈ", "Naya code", "New code")}
              </Button>
            </div>
          </div>
        )}
      </form>
    </Screen>
  );
}
