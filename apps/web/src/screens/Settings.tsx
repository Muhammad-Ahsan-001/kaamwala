import { CircleCheck, Languages, ListChecks, LogOut, MonitorSmartphone, Sun, Volume2, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { data, type WorkerSelf } from "../data";
import { useLogout, useSession } from "../lib/session";
import { useSettings } from "../lib/settings";
import { useData } from "../lib/useData";
import { PwaSettings } from "../pwa/PwaSettings";
import { feedSummary, JOB_FEED_QUESTION, JobFeedSheet } from "../ui/JobFeedPicker";
import { Button, Card, Switch } from "../ui/primitives";
import { LangPills, Screen } from "../ui/shell";

function Row({ icon: Icon, title, body, control, children }: { icon: LucideIcon; title: string; body?: string; control: ReactNode; children?: ReactNode }) {
  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
          <Icon className="h-6 w-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-bold">{title}</div>
          {body && <div className="text-sm text-soft">{body}</div>}
        </div>
        {control}
      </div>
      {children}
    </div>
  );
}

function KeepAwakeRow() {
  const { t, keepAwake, setKeepAwake, wakeLockSupported, onActiveJob, screenHeld } = useSettings();
  const body = !wakeLockSupported ? t("یہ براؤزر اس سہولت کو سپورٹ نہیں کرتا", "Ye browser is sahulat ko support nahi karta", "This browser does not support this feature") : t("جاری کام کے دوران اسکرین بند نہیں ہو گی", "Jari kaam ke dauran screen band nahi hogi", "Your screen stays on during a job in progress");
  const state = !wakeLockSupported || !keepAwake ? null : !onActiveJob ? t("کام شروع ہوتے ہی چلے گا", "Kaam shuru hote hi chalega", "Starts when a job begins") : screenHeld ? t("ابھی اسکرین جلتی رکھی ہوئی ہے", "Abhi screen jalti rakhi hui hai", "Keeping the screen on now") : t("فون نے ابھی اجازت نہیں دی", "Phone ne abhi ijazat nahi di", "The phone has not allowed this right now");

  return (
    <Row icon={MonitorSmartphone} title={t("اسکرین جلتی رکھیں", "Screen jalti rakhein", "Keep screen awake")} body={body} control={<Switch checked={keepAwake && wakeLockSupported} disabled={!wakeLockSupported} onChange={setKeepAwake} label={t("اسکرین جلتی رکھیں", "Screen jalti rakhein", "Keep screen awake")} />}>
      {state && (
        <p className={screenHeld ? "ms-[60px] flex items-center gap-1 text-sm font-bold text-brand-700" : "ms-[60px] text-sm font-semibold text-soft"}>
          {screenHeld && <CircleCheck className="h-4 w-4 shrink-0" aria-hidden />}
          {state}
        </p>
      )}
    </Row>
  );
}

function JobFeedRow() {
  const { t, lang } = useSettings();
  const worker = useData(() => data.getMyWorker(), []);
  const categories = useData(() => data.listCategories(), [], { reloadOn: ["categories.changed"] });
  const [choosing, setChoosing] = useState(false);
  const [saved, setSaved] = useState<WorkerSelf | null>(null);
  const me = saved ?? worker.data;
  if (!me || !categories.data) return null;

  // One wrapper, so the sheet is not a sibling that the card's row dividers draw a line on.
  return (
    <div>
      <Row
        icon={ListChecks}
        title={t(...JOB_FEED_QUESTION)}
        body={feedSummary(me, categories.data, lang, t)}
        control={
          <Button variant="secondary" size="md" onClick={() => setChoosing(true)}>
            {t("چنیں", "Chunein", "Choose")}
          </Button>
        }
      />
      {choosing && (
        <JobFeedSheet
          worker={me}
          categories={categories.data}
          onClose={() => setChoosing(false)}
          onSaved={(card) => {
            setSaved(card);
            setChoosing(false);
          }}
        />
      )}
    </div>
  );
}

export function SettingsScreen() {
  const { t, sunlight, setSunlight, audioCues, setAudioCues } = useSettings();
  const { user } = useSession();
  const logout = useLogout();

  return (
    <Screen title={t("ترتیبات", "Settings", "Settings")} back>
      <Card className="divide-y divide-line p-0">
        <div className="px-3 py-3">
          <div className="mb-2 flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
              <Languages className="h-6 w-6" aria-hidden />
            </span>
            <div className="text-lg font-bold">{t("زبان", "Zaban", "Language")}</div>
          </div>
          <LangPills />
        </div>

        <Row
          icon={Sun}
          title={t("دھوپ کا موڈ", "Dhoop mode", "Sunlight mode")}
          body={t("تیز رنگ اور بڑے حروف، دھوپ میں پڑھنے کے لیے", "Tez rang aur bare huroof, dhoop mein parhne ke liye", "Maximum contrast and larger text for outdoors")}
          control={<Switch checked={sunlight} onChange={setSunlight} label={t("دھوپ کا موڈ", "Dhoop mode", "Sunlight mode")} />}
        />

        {user?.role === "worker" && user.workerId && <JobFeedRow />}

        {user?.role === "worker" && <KeepAwakeRow />}

        <Row
          icon={Volume2}
          title={t("آواز کے اشارے", "Awaz ke ishare", "Audio cues")}
          body={t("بٹن دبانے پر آواز سنیں", "Button dabane par awaz sunein", "Hear a sound when you tap key buttons")}
          control={<Switch checked={audioCues} onChange={setAudioCues} label={t("آواز کے اشارے", "Awaz ke ishare", "Audio cues")} />}
        />
      </Card>

      <PwaSettings />

      <p className="mt-3 text-center text-sm text-soft">
        {t("براؤزر فون کی روشنی خود نہیں بدل سکتا۔ روشنی فون کی سیٹنگ سے بڑھائیں۔", "Browser phone ki roshni khud nahi badal sakta. Roshni phone ki setting se barhayein.", "Browsers cannot change your phone's brightness. Use your phone's own brightness control.")}
      </p>

      {user && (
        <div className="mt-4">
          <Button variant="secondary" size="lg" icon={LogOut} className="w-full" onClick={logout}>
            {t("لاگ آؤٹ", "Log out", "Log out")}
          </Button>
          <p dir="ltr" className="latin mt-1 text-center text-sm text-soft">
            {user.phone}
          </p>
        </div>
      )}
    </Screen>
  );
}
