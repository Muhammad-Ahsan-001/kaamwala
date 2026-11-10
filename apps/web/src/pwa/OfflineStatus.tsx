import { CheckCheck, CloudOff, LoaderCircle, RefreshCw, WifiOff, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, errorText } from "../data/errors";
import type { OfflinePreset } from "../data/types";
import { clockLabel } from "../lib/dates";
import { useSession } from "../lib/session";
import { useSettings } from "../lib/settings";
import { Button, Sheet, cx } from "../ui/primitives";
import { cancelAction, dismissNotice, useSyncState, type QueuedAction, type SyncNotice } from "./queue";
import { applyUpdate, useUpdateWaiting } from "./register";

type Translate = (ur: string, roman: string, en: string) => string;

const PRESET_WORDS: Record<OfflinePreset, readonly [string, string, string]> = {
  "1h": ["1 گھنٹہ", "1 ghanta", "1 hour"],
  "2h": ["2 گھنٹے", "2 ghante", "2 hours"],
  today: ["آج کا دن", "Aaj ka din", "today"],
  manual: ["جب تک بدلوں", "Jab tak badloon", "until I switch back"],
};

function describe(action: QueuedAction, t: Translate): string {
  switch (action.kind) {
    case "availability": {
      if (action.available) return t("میں فارغ ہوں", "Main farigh hoon", "I am available");
      const preset = action.preset ? PRESET_WORDS[action.preset] : null;
      const base = t("میں مصروف ہوں", "Main masroof hoon", "I am busy");
      return preset ? `${base} (${t(...preset)})` : base;
    }
    case "complete-day":
      return t(`دن ${action.dayNumber} مکمل`, `Din ${action.dayNumber} mukammal`, `Day ${action.dayNumber} done`);
    case "complete-job":
      return t("کام مکمل", "Kaam mukammal", "Job finished");
  }
}

function reason(notice: SyncNotice, t: Translate): string {
  if (notice.outcome === "expired") return t("یہ وقت انٹرنیٹ آنے سے پہلے ختم ہو چکا تھا، اس لیے نہیں بھیجا گیا۔", "Ye waqt internet aane se pehle khatam ho chuka tha, is liye nahi bheja gaya.", "That time had already passed before you were back online, so it was not sent.");
  switch (notice.code) {
    case "INVALID_JOB_STATE":
      return t("یہ کام اب جاری نہیں۔ ہو سکتا ہے منسوخ یا مکمل ہو چکا ہو۔", "Ye kaam ab jari nahi. Ho sakta hai mansookh ya mukammal ho chuka ho.", "This job is no longer under way. It may have been cancelled or finished.");
    case "DAY_SKIPPED":
      return t("یہ دن چھوڑ دیا گیا تھا۔", "Ye din chhor diya gaya tha.", "This day was skipped.");
    case "NOT_FOUND":
    case "FORBIDDEN":
      return t("یہ کام اب آپ کے پاس نہیں۔", "Ye kaam ab aap ke paas nahi.", "This job is no longer yours.");
    default:
      return errorText(new ApiError(notice.code, ""), t);
  }
}

function PendingSheet({ pending, onClose }: { pending: QueuedAction[]; onClose: () => void }) {
  const { t } = useSettings();
  return (
    <Sheet title={t("بھیجنے کے انتظار میں", "Bhejne ke intezar mein", "Waiting to be sent")} onClose={onClose}>
      <p className="text-soft">{t("یہ ابھی سرور تک نہیں پہنچے، اس لیے گاہک کو نظر نہیں آتے۔ انٹرنیٹ آنے پر ایپ کھلی ہو تو خود چلے جائیں گے۔", "Ye abhi server tak nahi pohnche, is liye gahak ko nazar nahi aate. Internet aane par app khuli ho to khud chale jayenge.", "These have not reached the server, so customers cannot see them yet. They go by themselves once you are online with the app open.")}</p>
      <ul className="mt-3 divide-y divide-line">
        {pending.map((action) => (
          <li key={action.id} className="flex items-center gap-2 py-1">
            <span className="min-w-0 flex-1 font-bold">{describe(action, t)}</span>
            <button type="button" onClick={() => void cancelAction(action.id)} aria-label={t("ہٹائیں", "Hatayein", "Remove")} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-soft hover:bg-sunken">
              <X className="h-6 w-6" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

function RefusedSheet({ notices }: { notices: SyncNotice[] }) {
  const { t } = useSettings();
  const dismissAll = () => {
    for (const notice of notices) void dismissNotice(notice.id);
  };
  return (
    <Sheet title={t("یہ نہیں ہو سکا", "Ye nahi ho saka", "This could not be done")} onClose={dismissAll}>
      <ul className="space-y-3">
        {notices.map((notice) => (
          <li key={notice.id} className="rounded-2xl bg-busy-50 p-3">
            <p className="font-bold text-busy-700">{describe(notice.action, t)}</p>
            <p className="text-ink">{reason(notice, t)}</p>
            {notice.action.kind !== "availability" && (
              <Link to={`/app/jobs/${notice.action.jobId}`} onClick={dismissAll} className="mt-1 inline-flex min-h-12 items-center font-bold text-brand-700 underline">
                {t("کام دیکھیں", "Kaam dekhein", "Open this job")}
              </Link>
            )}
          </li>
        ))}
      </ul>
      <Button className="mt-3 w-full" size="xl" onClick={dismissAll}>
        {t("ٹھیک ہے", "Theek hai", "OK")}
      </Button>
    </Sheet>
  );
}

function Banner({ onOpenPending, pendingCount }: { onOpenPending: () => void; pendingCount: number }) {
  const { t } = useSettings();
  const sync = useSyncState();
  const ref = useRef<HTMLDivElement>(null);
  const down = !sync.online || !sync.reachable;
  const visible = down || pendingCount > 0;

  useLayoutEffect(() => {
    const root = document.documentElement;
    const node = ref.current;
    if (!visible || !node) return;
    const measure = () => root.style.setProperty("--kw-banner-h", `${node.offsetHeight}px`);
    measure();
    root.classList.add("kw-banner");
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      observer.disconnect();
      root.classList.remove("kw-banner");
      root.style.removeProperty("--kw-banner-h");
    };
  }, [visible]);

  if (!visible) return null;

  const headline = !sync.online
    ? t("انٹرنیٹ نہیں", "Internet nahi", "No internet")
    : !sync.reachable
      ? t("سرور سے رابطہ نہیں", "Server se rabta nahi", "Cannot reach the server")
      : sync.syncing
        ? t("بھیج رہے ہیں…", "Bhej rahe hain…", "Sending…")
        : t("بھیجنے کے انتظار میں", "Bhejne ke intezar mein", "Waiting to send");

  const Icon = sync.syncing ? LoaderCircle : down ? WifiOff : CloudOff;

  const content = (
    <>
      <Icon className={cx("h-6 w-6 shrink-0", sync.syncing && "animate-spin")} aria-hidden />
      <span className="min-w-0 flex-1 text-start font-bold">
        {headline}
        {sync.savedAt !== null && (
          <span className="font-normal">
            {" · "}
            {t("محفوظ معلومات", "Mehfooz maloomat", "Saved info from")}{" "}
            <span dir="ltr" className="latin">
              {clockLabel(new Date(sync.savedAt).toISOString())}
            </span>
          </span>
        )}
      </span>
      {pendingCount > 0 && (
        <span className="latin shrink-0 rounded-full bg-amber-800 px-2.5 py-0.5 text-sm font-bold text-white">
          {pendingCount}
          <span className="sr-only"> {t("باقی", "baqi", "waiting")}</span>
        </span>
      )}
    </>
  );

  const shell = "fixed inset-x-0 top-0 z-[600] flex min-h-12 items-center gap-2 bg-amber-100 px-3 text-amber-800 shadow-card";
  const style = { paddingTop: "max(0.125rem, env(safe-area-inset-top))", paddingBottom: "0.125rem" };

  return pendingCount > 0 ? (
    <div ref={ref} className={shell} style={style} role="status">
      <button type="button" onClick={onOpenPending} className="flex min-h-12 w-full items-center gap-2">
        {content}
      </button>
    </div>
  ) : (
    <div ref={ref} className={shell} style={style} role="status">
      {content}
    </div>
  );
}

function Toast() {
  const { t } = useSettings();
  const { toast } = useSyncState();
  if (!toast) return null;
  const message =
    toast.kind === "queued"
      ? t("انٹرنیٹ آتے ہی بھیج دیا جائے گا", "Internet aate hi bhej diya jayega", "Will be sent once you are back online")
      : toast.count === 1
        ? t("آپ کی تبدیلی بھیج دی گئی", "Aap ki tabdeeli bhej di gayi", "Your change was sent")
        : t(`آپ کی ${toast.count} تبدیلیاں بھیج دی گئیں`, `Aap ki ${toast.count} tabdeeliyan bhej di gayin`, `${toast.count} changes were sent`);
  return (
    <div role="status" className="pointer-events-none fixed inset-x-3 bottom-20 z-[900] mx-auto flex max-w-md animate-rise items-center gap-2 rounded-2xl bg-ink px-4 py-2 font-bold text-white shadow-lift" style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
      {toast.kind === "sent" ? <CheckCheck className="h-5 w-5 shrink-0" aria-hidden /> : <CloudOff className="h-5 w-5 shrink-0" aria-hidden />}
      <span className="min-w-0 flex-1">{message}</span>
    </div>
  );
}

function UpdateCard() {
  const { t } = useSettings();
  const waiting = useUpdateWaiting();
  const [dismissed, setDismissed] = useState(false);
  if (!waiting || dismissed) return null;
  return (
    <div className="fixed inset-x-3 bottom-20 z-[800] mx-auto flex max-w-md animate-rise items-center gap-2 rounded-2xl border border-line bg-surface p-2 shadow-lift" style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
      <RefreshCw className="ms-1 h-5 w-5 shrink-0 text-brand-700" aria-hidden />
      <span className="min-w-0 flex-1 font-bold">{t("نیا ورژن تیار ہے", "Naya version tayar hai", "A new version is ready")}</span>
      <Button size="md" onClick={applyUpdate}>
        {t("تازہ کریں", "Taza karein", "Update")}
      </Button>
      <button type="button" aria-label={t("بند کریں", "Band karein", "Close")} onClick={() => setDismissed(true)} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-soft hover:bg-sunken">
        <X className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}

export function OfflineStatus() {
  const { user } = useSession();
  const sync = useSyncState();
  const [listOpen, setListOpen] = useState(false);
  const pending = sync.pending.filter((action) => action.userId === user?.id);
  const notices = sync.notices.filter((notice) => notice.userId === user?.id);

  useEffect(() => {
    if (pending.length === 0) setListOpen(false);
  }, [pending.length]);

  return (
    <>
      <Banner pendingCount={pending.length} onOpenPending={() => setListOpen(true)} />
      {listOpen && <PendingSheet pending={pending} onClose={() => setListOpen(false)} />}
      {notices.length > 0 && <RefusedSheet notices={notices} />}
      <Toast />
      <UpdateCard />
    </>
  );
}
