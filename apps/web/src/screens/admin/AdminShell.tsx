import { Briefcase, ChevronRight, Flag, HardHat, LayoutDashboard, LogOut, Tags, UserPlus, type LucideIcon } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { data } from "../../data";
import { useGoBack } from "../../lib/back";
import { useConnection, useData } from "../../lib/useData";
import { useSession } from "../../lib/session";
import { useSettings } from "../../lib/settings";
import { Logo } from "../../ui/Logo";
import { IconButton, cx } from "../../ui/primitives";
import { LangPicker } from "../../ui/shell";
import type { Words } from "./parts";

type Tab = Words & { to: string; end?: boolean; icon: LucideIcon; shortEn?: string; count?: "pendingWorkers" | "disputes" };

const TABS: Tab[] = [
  { to: "/admin", end: true, icon: LayoutDashboard, ur: "خلاصہ", roman: "Khulasa", en: "Dashboard", shortEn: "Home" },
  { to: "/admin/workers", icon: HardHat, ur: "کاریگر", roman: "Kaarigar", en: "Workers", count: "pendingWorkers" },
  { to: "/admin/jobs", icon: Briefcase, ur: "کام", roman: "Kaam", en: "Jobs" },
  { to: "/admin/disputes", icon: Flag, ur: "شکایات", roman: "Shikayat", en: "Disputes", count: "disputes" },
  { to: "/admin/categories", icon: Tags, ur: "شعبے", roman: "Shobay", en: "Categories", shortEn: "Trades" },
  { to: "/admin/agents", icon: UserPlus, ur: "ایجنٹ", roman: "Agents", en: "Field agents", shortEn: "Agents" },
];

type Counts = { pendingWorkers: number; disputes: number };

/** Every admin page mounts its own shell. Remembering the last counts stops the badges blinking between pages. */
let lastCounts: Counts | null = null;

const countListeners = new Set<() => void>();

/** Call after a change that moves a badge but sends no server event, such as approving a worker who is already online. */
export function refreshAdminCounts() {
  countListeners.forEach((listener) => listener());
}

function useCounts(): Counts | null {
  const stats = useData(() => data.adminStats(), [], { reloadOn: ["worker.status", "job.updated"] });
  const { reload } = stats;

  useEffect(() => {
    countListeners.add(reload);
    return () => {
      countListeners.delete(reload);
    };
  }, [reload]);

  if (stats.data) lastCounts = { pendingWorkers: stats.data.pendingWorkers, disputes: stats.data.disputes };
  return lastCounts;
}

function Badge({ value, className }: { value: number; className?: string }) {
  return <span className={cx("latin flex h-5 min-w-5 items-center justify-center rounded-full bg-busy-600 px-1 text-xs font-bold text-white", className)}>{value > 99 ? "99+" : value}</span>;
}

/** Says what the status socket is really doing. Never shows "live" unless it is open. */
function LiveState() {
  const { t } = useSettings();
  const state = useConnection();
  const label = state === "live" ? t("لائیو", "Live", "Live") : state === "connecting" ? t("جڑ رہا ہے", "Jur raha hai", "Connecting") : t("آف لائن", "Offline", "Offline");
  return (
    <span className="inline-flex items-center gap-1.5 px-1 text-xs font-bold text-soft" role="status">
      <span className={cx("h-2.5 w-2.5 shrink-0 rounded-full", state === "live" ? "bg-brand-500" : state === "connecting" ? "bg-amber-400" : "bg-faint")} aria-hidden />
      {label}
    </span>
  );
}

function SidebarLink({ tab, count }: { tab: Tab; count: number }) {
  const { t } = useSettings();
  const Icon = tab.icon;
  return (
    <NavLink
      to={tab.to}
      end={tab.end}
      className={({ isActive }) => cx("flex min-h-12 items-center gap-3 rounded-2xl px-3 font-semibold transition", isActive ? "bg-brand-100 text-brand-700" : "text-soft hover:bg-sunken")}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{t(tab.ur, tab.roman, tab.en)}</span>
      {count > 0 && <Badge value={count} />}
    </NavLink>
  );
}

function BottomLink({ tab, count }: { tab: Tab; count: number }) {
  const { t, lang } = useSettings();
  const Icon = tab.icon;
  return (
    <NavLink
      to={tab.to}
      end={tab.end}
      className={({ isActive }) => cx("relative flex min-h-16 min-w-0 flex-col items-center justify-center font-semibold", lang === "ur" ? "text-sm" : "text-xs", isActive ? "text-brand-700" : "text-faint")}
    >
      <span className="relative">
        <Icon className="h-6 w-6" aria-hidden />
        {count > 0 && <Badge value={count} className="absolute -end-3 -top-1.5" />}
      </span>
      <span className="max-w-full truncate px-0.5">{t(tab.ur, tab.roman, tab.shortEn ?? tab.en)}</span>
    </NavLink>
  );
}

function BackLink({ to }: { to: string }) {
  const { t } = useSettings();
  const goBack = useGoBack(to, to);
  return (
    <button type="button" aria-label={t("واپس", "Wapas", "Back")} onClick={goBack} className="-ms-2 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-ink hover:bg-sunken">
      <ChevronRight className="h-7 w-7 ltr:rotate-180" aria-hidden />
    </button>
  );
}

/** Every admin screen sits in this. It follows the app's language and direction. */
export function AdminShell({ title, subtitle, back, action, children }: { title: ReactNode; subtitle?: ReactNode; back?: string; action?: ReactNode; children: ReactNode }) {
  const { t } = useSettings();
  const { signOut } = useSession();
  const counts = useCounts();
  const signOutLabel = t("سائن آؤٹ", "Sign out", "Sign out");
  const countOf = (tab: Tab) => (tab.count ? (counts?.[tab.count] ?? 0) : 0);

  return (
    <div className="min-h-dvh bg-page md:grid md:grid-cols-[248px_minmax(0,1fr)]">
      {/* Phone header */}
      <header className="sticky top-0 z-[500] flex min-h-14 items-center gap-1 border-b border-line bg-surface px-3 md:hidden">
        <Logo size={36} wordmark={false} />
        <span className="ms-1 rounded-full bg-sunken px-2.5 py-0.5 text-xs font-bold text-soft">{t("ایڈمن", "Admin", "Admin")}</span>
        <span className="flex-1" />
        <LiveState />
        <LangPicker />
        <IconButton icon={LogOut} label={signOutLabel} onClick={signOut} />
      </header>

      {/* Wide-screen sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-e border-line bg-surface md:flex">
        <div className="flex min-h-20 items-center justify-between gap-2 px-4">
          <Logo size={36} stacked={false} />
          <span className="rounded-full bg-sunken px-2.5 py-0.5 text-xs font-bold text-soft">{t("ایڈمن", "Admin", "Admin")}</span>
        </div>
        <nav className="flex flex-col gap-1 px-2" aria-label={t("ایڈمن", "Admin", "Admin")}>
          {TABS.map((tab) => (
            <SidebarLink key={tab.to} tab={tab} count={countOf(tab)} />
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-1 border-t border-line p-2">
          <LiveState />
          <span className="flex-1" />
          <LangPicker />
          <IconButton icon={LogOut} label={signOutLabel} onClick={signOut} />
        </div>
      </aside>

      <main className="mx-auto w-full min-w-0 max-w-6xl animate-page-in px-4 pb-28 pt-4 md:p-8">
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          {back && <BackLink to={back} />}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-extrabold tracking-tight">{title}</h1>
            {subtitle && <p className="text-soft">{subtitle}</p>}
          </div>
          {action}
        </div>
        {children}
      </main>

      {/* Phone navigation: every section in one tap, no sideways scrolling. */}
      <nav className="fixed inset-x-0 bottom-0 z-[500] grid grid-cols-6 border-t border-line bg-surface md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }} aria-label={t("ایڈمن", "Admin", "Admin")}>
        {TABS.map((tab) => (
          <BottomLink key={tab.to} tab={tab} count={countOf(tab)} />
        ))}
      </nav>
    </div>
  );
}
