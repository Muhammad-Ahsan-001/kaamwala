import { Bell, Compass, Download, Volume2, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../lib/session";
import { useSettings } from "../lib/settings";
import { Button, Card, Switch, Tag } from "../ui/primitives";
import { promptInstall, useInstall } from "./install";
import { IphoneSteps } from "./Invitations";
import { disablePush, enablePush, pushStatus, type PushState } from "./push";
import { TOUR_HOME, resetTour, tourKindFor } from "./tour";
import { hasUrduVoice } from "./voice";

function Row({ icon: Icon, title, body, control }: { icon: LucideIcon; title: string; body?: string; control?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-lg font-bold">{title}</div>
        {body && <div className="text-sm text-soft">{body}</div>}
      </div>
      {control}
    </div>
  );
}

function NotificationsRow() {
  const { t } = useSettings();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void pushStatus().then(setState);
  }, []);

  const toggle = useCallback(async (on: boolean) => {
    setBusy(true);
    setFailed(false);
    try {
      if (on) {
        setState(await enablePush());
      } else {
        await disablePush();
        setState(await pushStatus());
      }
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, []);

  const title = t("اطلاعات", "Ittelaat", "Notifications");
  const body = failed
    ? t("چالو نہیں ہو سکیں، دوبارہ کوشش کریں", "Chalu nahi ho sakin, dobara koshish karein", "Could not turn them on. Please try again")
    : state === "on"
      ? t("نئے کام اور جواب کی اطلاع ملے گی", "Naye kaam aur jawab ki ittela milegi", "You will hear about new jobs and replies")
      : state === "blocked"
        ? t("براؤزر نے روک رکھی ہیں۔ براؤزر کی سیٹنگ سے چالو کریں۔", "Browser ne rok rakhi hain. Browser ki setting se chalu karein.", "Blocked by your browser. Turn them on in browser settings.")
        : state === "needs-install"
          ? t("آئی فون پر پہلے ایپ ہوم اسکرین پر رکھیں", "iPhone par pehle app home screen par rakhein", "On iPhone, add the app to your home screen first")
          : state === "server-off"
            ? t("ابھی یہ سہولت چالو نہیں", "Abhi ye sahulat chalu nahi", "Not switched on for this service yet")
            : state === "unsupported"
              ? t("یہ براؤزر اسے سپورٹ نہیں کرتا", "Ye browser ise support nahi karta", "This browser does not support this")
              : state === "unknown"
                ? t("ابھی پتا نہیں چل سکا۔ تھوڑی دیر بعد دیکھیں۔", "Abhi pata nahi chal saka. Thori der baad dekhein.", "Could not check just now. Please look again shortly.")
                : t("نئے کام اور جواب کی اطلاع پائیں", "Naye kaam aur jawab ki ittela payein", "Get told about new jobs and replies");

  const canSwitch = state === "on" || state === "off" || state === "ask";
  return <Row icon={Bell} title={title} body={body} control={canSwitch ? <Switch checked={state === "on"} disabled={busy} onChange={(on) => void toggle(on)} label={title} /> : undefined} />;
}

function InstallRow() {
  const { t } = useSettings();
  const install = useInstall();
  const [iphoneSteps, setIphoneSteps] = useState(false);
  const title = t("ایپ انسٹال کریں", "App install karein", "Install the app");

  if (install.installed) return <Row icon={Download} title={title} control={<Tag>{t("انسٹال ہے", "Install hai", "Installed")}</Tag>} />;
  if (!install.canPrompt && !install.needsIphoneSteps) return null;
  return (
    <>
      <Row
        icon={Download}
        title={title}
        body={t("ہوم اسکرین پر رکھیں", "Home screen par rakhein", "Keep it on your home screen")}
        control={
          <Button
            size="md"
            variant="secondary"
            onClick={() => {
              if (install.canPrompt) void promptInstall();
              else setIphoneSteps(true);
            }}
          >
            {install.canPrompt ? t("انسٹال", "Install", "Install") : t("طریقہ", "Tareeqa", "How")}
          </Button>
        }
      />
      {iphoneSteps && <IphoneSteps onClose={() => setIphoneSteps(false)} />}
    </>
  );
}

function TourRow() {
  const { t } = useSettings();
  const { user } = useSession();
  const navigate = useNavigate();
  const kind = user ? tourKindFor(user) : null;
  if (!kind || !user) return null;
  return (
    <Row
      icon={Compass}
      title={t("ایپ کا ٹور", "App ka tour", "App tour")}
      body={t("دوبارہ دیکھیں کہ ایپ کیسے چلتی ہے", "Dobara dekhein ke app kaise chalti hai", "See how the app works again")}
      control={
        <Button
          size="md"
          variant="secondary"
          onClick={() => {
            resetTour(kind, user.id);
            navigate(TOUR_HOME[kind]);
          }}
        >
          {t("دیکھیں", "Dekhein", "Start")}
        </Button>
      }
    />
  );
}

function VoiceRow() {
  const { t } = useSettings();
  const [ready, setReady] = useState<boolean | null>(null);

  useEffect(() => {
    void hasUrduVoice().then(setReady);
  }, []);

  if (ready === null) return null;
  return (
    <Row
      icon={Volume2}
      title={t("اردو آواز", "Urdu awaz", "Urdu voice")}
      body={
        ready
          ? t("اس فون میں اردو آواز موجود ہے", "Is phone mein Urdu awaz mojood hai", "This phone has an Urdu voice")
          : t("اس فون میں اردو آواز نہیں۔ فون کی Text-to-speech سیٹنگ میں اردو شامل کریں۔", "Is phone mein Urdu awaz nahi. Phone ki Text-to-speech setting mein Urdu shamil karein.", "No Urdu voice on this phone, so nothing is spoken. Add Urdu in your phone's text-to-speech settings.")
      }
    />
  );
}

/** Notifications, install, tour and voice, for the Settings screen. */
export function PwaSettings() {
  return (
    <Card className="mt-3 divide-y divide-line p-0">
      <NotificationsRow />
      <InstallRow />
      <TourRow />
      <VoiceRow />
    </Card>
  );
}
