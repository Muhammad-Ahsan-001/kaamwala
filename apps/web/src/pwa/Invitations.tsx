import { Bell, Check, Download, Share, SquarePlus, X, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { data } from "../data";
import { useSession } from "../lib/session";
import { useSettings } from "../lib/settings";
import { Logo } from "../ui/Logo";
import { Button, Sheet } from "../ui/primitives";
import { promptInstall, snoozeInstall, useInstall } from "./install";
import { enablePush, mayAskForPush, pushStatus, recordPushAsk } from "./push";
import { onPushAskWanted } from "./signals";
import { TOUR_HOME, runTour, tourKindFor, tourSeen, waitForTourAnchors, type TourKind } from "./tour";

/** Automated browsers are not first-time people: these would only sit on top of what they are testing. */
const automated = () => navigator.webdriver === true;

const INSTALL_DELAY_MS = 5_000;
const PUSH_AFTER_TOUR_MS = 900;
const PUSH_RETURN_VISIT_MS = 5_000;
const PUSH_AFTER_POST_MS = 1_500;

/** Screens where someone is in the middle of a form, which a card would interrupt. */
const isFormRoute = (path: string) => /^\/app\/(login|onboard|signup|agent)/.test(path);

export function IphoneSteps({ onClose }: { onClose: () => void }) {
  const { t } = useSettings();
  const steps: { icon: LucideIcon; text: string }[] = [
    { icon: Share, text: t("براؤزر میں شیئر کا نشان دبائیں", "Browser mein Share ka nishan dabayein", "Tap the Share icon in your browser") },
    { icon: SquarePlus, text: t("نیچے جا کر Add to Home Screen چنیں", "Neeche ja kar Add to Home Screen chunein", "Scroll down and choose Add to Home Screen") },
    { icon: Check, text: t("اوپر Add دبائیں", "Upar Add dabayein", "Tap Add at the top") },
  ];
  return (
    <Sheet title={t("آئی فون پر ایپ رکھیں", "iPhone par app rakhein", "Add to your iPhone")} onClose={onClose}>
      <ol className="space-y-2">
        {steps.map(({ icon: Icon, text }, index) => (
          <li key={text} className="flex items-center gap-3 rounded-2xl bg-sunken p-3">
            <span className="latin flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 font-bold text-white">{index + 1}</span>
            <Icon className="h-6 w-6 shrink-0 text-brand-700" aria-hidden />
            <span className="min-w-0 flex-1 font-semibold">{text}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-soft">{t("آئی فون پر اطلاعات بھی تبھی ملتی ہیں جب ایپ ہوم اسکرین پر ہو۔", "iPhone par ittelaat bhi tabhi milti hain jab app home screen par ho.", "On iPhone, notifications only work once the app is on your home screen.")}</p>
      <Button className="mt-3 w-full" size="xl" onClick={onClose}>
        {t("ٹھیک ہے", "Theek hai", "OK")}
      </Button>
    </Sheet>
  );
}

function InstallCard({ iphone, onIphone, onDismiss }: { iphone: boolean; onIphone: () => void; onDismiss: () => void }) {
  const { t } = useSettings();
  return (
    <div className="fixed inset-x-3 bottom-20 z-[800] mx-auto max-w-md animate-rise rounded-3xl border border-line bg-surface p-3 shadow-lift" style={{ marginBottom: "env(safe-area-inset-bottom)" }} role="region" aria-label={t("ایپ انسٹال کریں", "App install karein", "Install the app")}>
      <div className="flex items-start gap-3">
        <Logo size={44} wordmark={false} />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold">{t("ایپ فون پر رکھیں", "App phone par rakhein", "Keep the app on your phone")}</p>
          <p className="text-sm text-soft">{t("ایک ٹچ میں کھولیں، اور انٹرنیٹ کے بغیر بھی اپنے کام اور کمائی دیکھیں۔", "Ek touch mein kholein, aur internet ke baghair bhi apne kaam aur kamai dekhein.", "Open it in one tap, and see your jobs and earnings even with no internet.")}</p>
        </div>
        <button type="button" onClick={onDismiss} aria-label={t("بند کریں", "Band karein", "Close")} className="-m-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-soft hover:bg-sunken">
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
      <Button
        className="mt-2 w-full"
        size="lg"
        icon={iphone ? Share : Download}
        onClick={() => {
          if (iphone) onIphone();
          else void promptInstall();
        }}
      >
        {iphone ? t("طریقہ دیکھیں", "Tareeqa dekhein", "Show me how") : t("انسٹال کریں", "Install karein", "Install")}
      </Button>
    </div>
  );
}

type PushAudience = "worker" | "customer";

function PushAsk({ audience, onDone }: { audience: PushAudience; onDone: (state: "on" | "blocked" | "failed" | "later") => void }) {
  const { t } = useSettings();
  const [busy, setBusy] = useState(false);
  const worker = audience === "worker";

  const yes = async () => {
    setBusy(true);
    try {
      const state = await enablePush();
      onDone(state === "on" ? "on" : state === "blocked" ? "blocked" : "failed");
    } catch {
      onDone("failed");
    }
  };

  return (
    <Sheet title={worker ? t("نئے کام کی اطلاع", "Naye kaam ki ittela", "Hear about new jobs") : t("جواب کی اطلاع", "Jawab ki ittela", "Know when workers reply")} onClose={() => onDone("later")}>
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
          <Bell className="h-6 w-6" aria-hidden />
        </span>
        <p className="min-w-0 flex-1 text-soft">
          {worker
            ? t("نیا کام آتے ہی فون پر اطلاع آئے گی، چاہے ایپ بند ہو۔", "Naya kaam aate hi phone par ittela aayegi, chahe app band ho.", "Your phone will tell you when a new job comes in, even with the app closed.")
            : t("جیسے ہی کاریگر جواب دے یا آفر بھیجے، فون پر اطلاع آئے گی۔", "Jaise hi kaarigar jawab de ya offer bheje, phone par ittela aayegi.", "Your phone will tell you as soon as a worker replies or sends an offer.")}
        </p>
      </div>
      <Button className="mt-3 w-full" size="xl" icon={Bell} disabled={busy} onClick={() => void yes()}>
        {t("ہاں، اطلاع دیں", "Haan, ittela dein", "Yes, notify me")}
      </Button>
      <Button className="mt-2 w-full" variant="ghost" size="lg" disabled={busy} onClick={() => onDone("later")}>
        {t("ابھی نہیں", "Abhi nahi", "Not now")}
      </Button>
    </Sheet>
  );
}

function PushResult({ state }: { state: "on" | "blocked" | "failed" }) {
  const { t } = useSettings();
  const text =
    state === "on"
      ? t("اطلاعات چالو ہو گئیں", "Ittelaat chalu ho gayin", "Notifications are on")
      : state === "blocked"
        ? t("اطلاعات بند ہیں۔ انہیں براؤزر کی سیٹنگ سے چالو کر سکتے ہیں۔", "Ittelaat band hain. Inhein browser ki setting se chalu kar sakte hain.", "Notifications are off. You can turn them on in your browser settings.")
        : t("اطلاعات چالو نہیں ہو سکیں۔ ترتیبات سے دوبارہ کوشش کریں۔", "Ittelaat chalu nahi ho sakin. Settings se dobara koshish karein.", "Notifications could not be turned on. You can try again in Settings.");
  return (
    <div role="status" className="pointer-events-none fixed inset-x-3 bottom-20 z-[900] mx-auto flex max-w-md animate-rise items-center gap-2 rounded-2xl bg-ink px-4 py-2 font-bold text-white shadow-lift" style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
      <Bell className="h-5 w-5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">{text}</span>
    </div>
  );
}

/** First-use tour, then the notification ask, then the install card. Never two at once. */
export function Invitations() {
  const { user } = useSession();
  const { pathname } = useLocation();
  const { lang, audioCues } = useSettings();
  const install = useInstall();
  const [touring, setTouring] = useState(false);
  const [tourJustEnded, setTourJustEnded] = useState(false);
  const [pushAudience, setPushAudience] = useState<PushAudience | null>(null);
  const [pushResult, setPushResult] = useState<"on" | "blocked" | "failed" | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [iphoneSteps, setIphoneSteps] = useState(false);

  const kind: TourKind | null = user ? tourKindFor(user) : null;
  const userId = user?.id;

  useEffect(() => {
    if (!kind || !userId || automated() || pathname !== TOUR_HOME[kind] || tourSeen(kind, userId)) return;
    let cancelled = false;
    let stop: (() => void) | null = null;
    void (async () => {
      if (!(await waitForTourAnchors(kind, () => cancelled))) return;
      if (cancelled) return;
      setTouring(true);
      stop = await runTour({
        kind,
        userId,
        lang,
        audioCues,
        onEnd: () => {
          setTouring(false);
          setTourJustEnded(true);
        },
      });
      if (cancelled) stop();
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
    // Starting once per visit to home. A language change must not restart a tour in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, userId, pathname]);

  const offerPush = useCallback(async (audience: PushAudience) => {
    if (automated() || !mayAskForPush()) return;
    if ((await pushStatus()) === "ask") setPushAudience(audience);
  }, []);

  // A worker has no job to wait on yet, so the moment is right after learning what the app does.
  useEffect(() => {
    if (kind !== "worker" || !userId || pathname !== TOUR_HOME.worker || touring || !tourSeen("worker", userId)) return;
    const timer = setTimeout(() => void offerPush("worker"), tourJustEnded ? PUSH_AFTER_TOUR_MS : PUSH_RETURN_VISIT_MS);
    return () => clearTimeout(timer);
  }, [kind, userId, pathname, touring, tourJustEnded, offerPush]);

  // A customer's moment is having just asked for help, with an answer now to wait for.
  useEffect(
    () =>
      onPushAskWanted(() => {
        if (data.currentUser()?.role === "customer") setTimeout(() => void offerPush("customer"), PUSH_AFTER_POST_MS);
      }),
    [offerPush],
  );

  const installable = (install.canPrompt || install.needsIphoneSteps) && !install.installed && !install.snoozed;
  const installBlocked = automated() || !installable || touring || pushAudience !== null || isFormRoute(pathname);

  useEffect(() => {
    if (installBlocked) {
      setShowInstall(false);
      return;
    }
    const timer = setTimeout(() => setShowInstall(true), INSTALL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [installBlocked]);

  useEffect(() => {
    if (!pushResult) return;
    const timer = setTimeout(() => setPushResult(null), 4_500);
    return () => clearTimeout(timer);
  }, [pushResult]);

  return (
    <>
      {showInstall && !iphoneSteps && <InstallCard iphone={!install.canPrompt} onIphone={() => setIphoneSteps(true)} onDismiss={snoozeInstall} />}
      {iphoneSteps && (
        <IphoneSteps
          onClose={() => {
            setIphoneSteps(false);
            snoozeInstall();
          }}
        />
      )}
      {pushAudience && (
        <PushAsk
          audience={pushAudience}
          onDone={(state) => {
            recordPushAsk();
            setPushAudience(null);
            if (state !== "later") setPushResult(state);
          }}
        />
      )}
      {pushResult && <PushResult state={pushResult} />}
    </>
  );
}
