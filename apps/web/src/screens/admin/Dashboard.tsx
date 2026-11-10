import { ChevronRight, CircleCheck, Flag, HardHat, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { data, type AdminStats, type Job, type WorkerStatus } from "../../data";
import { rupees } from "../../data/labels";
import { useData } from "../../lib/useData";
import { useSettings, type Lang } from "../../lib/settings";
import { Async } from "../../ui/async";
import { Bars, type Bar } from "../../ui/Bars";
import { Card, MockTag, Skeleton, cx } from "../../ui/primitives";
import { AdminShell } from "./AdminShell";
import { JOB_STATUS, Latin, Stat, type Words } from "./parts";

export { AdminWorkers } from "./Workers";
export { AdminJobs } from "./Jobs";
export { AdminDisputes } from "./Disputes";
export { AdminAgents, AdminAgentLedger } from "./Agents";

const WORKER_STATUS: Record<WorkerStatus, Words> = {
  available: { ur: "فارغ", roman: "Farigh", en: "Available" },
  requested: { ur: "درخواست آئی", roman: "Request aayi", en: "Requested" },
  engaged: { ur: "کام پر", roman: "Kaam par", en: "On a job" },
  completed: { ur: "کام مکمل", roman: "Kaam mukammal", en: "Just finished" },
  offline: { ur: "آف لائن", roman: "Offline", en: "Offline" },
};

const WORKER_ORDER: WorkerStatus[] = ["available", "requested", "engaged", "completed", "offline"];
const JOB_ORDER: Job["status"][] = ["open", "requested", "negotiating", "pending_confirmation", "engaged", "completed", "cancelled", "disputed"];

/** Dates arrive as plain Pakistan calendar days, so they are named without shifting to the viewer's zone. */
function weekday(date: string, lang: Lang) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(lang === "ur" ? "ur-PK" : "en-GB", { weekday: "short", timeZone: "UTC" });
}

function Attention({ to, icon: Icon, count, waiting, clear }: { to: string; icon: LucideIcon; count: number; waiting: string; clear: string }) {
  const active = count > 0;
  return (
    <Link to={to} className={cx("flex min-h-20 items-center gap-3 rounded-3xl border p-4 transition active:scale-[0.99]", active ? "border-busy-100 bg-busy-50" : "border-line bg-surface")}>
      {active ? <Icon className="h-7 w-7 shrink-0 text-busy-600" aria-hidden /> : <CircleCheck className="h-7 w-7 shrink-0 text-brand-600" aria-hidden />}
      <span className="min-w-0 flex-1 font-bold">
        {active ? (
          <>
            <Latin className="text-2xl font-extrabold">{count}</Latin> {waiting}
          </>
        ) : (
          <span className="text-soft">{clear}</span>
        )}
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-soft rtl:rotate-180" aria-hidden />
    </Link>
  );
}

/** One thin meter per status. All rows are one measure, so they share one colour and one scale. */
function Breakdown({ title, rows }: { title: string; rows: { key: string; label: string; value: number }[] }) {
  const { t } = useSettings();
  const max = Math.max(1, ...rows.map((row) => row.value));
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return (
    <Card className="min-w-0">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-base">{title}</h2>
        <span className="shrink-0 text-sm text-soft">
          <Latin className="font-bold text-ink">{total}</Latin> {t("کل", "kul", "total")}
        </span>
      </div>
      <ul className="m-0 list-none space-y-1 p-0">
        {rows.map((row) => (
          <li key={row.key} className="grid grid-cols-[7.5rem_minmax(0,1fr)_2.5rem] items-center gap-2">
            <span className="truncate text-sm text-soft">{row.label}</span>
            <span className="h-2 overflow-hidden rounded-full bg-sunken" aria-hidden>
              <span className="block h-full rounded-full bg-brand-600" style={{ width: `${(row.value / max) * 100}%` }} />
            </span>
            <span className="latin text-end text-sm font-bold tabular-nums">{row.value}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Overview({ stats }: { stats: AdminStats }) {
  const { t, lang } = useSettings();
  const bars: Bar[] = stats.jobsByDay.map((day, index, all) => ({ key: day.date, label: weekday(day.date, lang), value: day.count, display: String(day.count), emphasised: index === all.length - 1 }));
  const weekTotal = stats.jobsByDay.reduce((sum, day) => sum + day.count, 0);

  return (
    <div className="space-y-3">
      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("ابھی فارغ", "Abhi farigh", "Available now")} value={stats.availableNow} tone="text-brand-600" />
        <Stat label={t("کام پر", "Kaam par", "On a job")} value={stats.engagedNow} tone="text-busy-500" />
        <Stat label={t("آج کے کام", "Aaj ke kaam", "Jobs today")} value={stats.jobsToday} />
        <Stat label={t("ایجنٹ فیس، 7 دن", "Agent fee, 7 din", "Agent fees, 7 days")} value={rupees(stats.agentFeesWeek)} footer={<MockTag>{t("فرضی", "Farzi", "Mock")}</MockTag>} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Attention to="/admin/workers" icon={HardHat} count={stats.pendingWorkers} waiting={t("کاریگر منظوری کے منتظر", "kaarigar manzoori ke muntazir", stats.pendingWorkers === 1 ? "worker to approve" : "workers to approve")} clear={t("کوئی منظوری باقی نہیں", "Koi manzoori baqi nahi", "Nobody waiting for approval")} />
        <Attention to="/admin/disputes" icon={Flag} count={stats.disputes} waiting={stats.disputes === 1 ? t("شکایت کھلی ہے", "shikayat khuli hai", "open dispute") : t("شکایات کھلی ہیں", "shikayat khuli hain", "open disputes")} clear={t("کوئی کھلی شکایت نہیں", "Koi khuli shikayat nahi", "No open disputes")} />
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card className="min-w-0">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="text-base">{t("روزانہ کام، پچھلے 7 دن", "Rozana kaam, pichlay 7 din", "Jobs per day, last 7 days")}</h2>
            <span className="shrink-0 text-sm text-soft">
              <Latin className="font-bold text-ink">{weekTotal}</Latin> {t("کل", "kul", "total")}
            </span>
          </div>
          <Bars bars={bars} title={t("روزانہ کام، پچھلے 7 دن", "Rozana kaam, pichlay 7 din", "Jobs per day, last 7 days")} height={150} />
        </Card>
        <Breakdown title={t("کاریگر، ابھی کی حالت", "Kaarigar, abhi ki halat", "Workers by status")} rows={WORKER_ORDER.map((status) => ({ key: status, label: t(WORKER_STATUS[status].ur, WORKER_STATUS[status].roman, WORKER_STATUS[status].en), value: stats.workersByStatus[status] ?? 0 }))} />
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Breakdown title={t("کام، ہر حالت میں", "Kaam, har halat mein", "Jobs by status")} rows={JOB_ORDER.map((status) => ({ key: status, label: t(JOB_STATUS[status].ur, JOB_STATUS[status].roman, JOB_STATUS[status].en), value: stats.jobsByStatus[status] ?? 0 }))} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          <Stat label={t("گاہک", "Gahak", "Customers")} value={stats.customers} />
          <Stat label={t("فعال شعبے", "Faal shobay", "Active categories")} value={stats.activeCategories} />
        </div>
      </div>
    </div>
  );
}

export function AdminDashboard() {
  const { t } = useSettings();
  const stats = useData(() => data.adminStats(), [], { reloadOn: ["worker.status", "job.updated", "categories.changed"] });

  return (
    <AdminShell title={t("خلاصہ", "Khulasa", "Dashboard")} subtitle={t("ابھی کی اصل صورتحال", "Abhi ki asal soorat-e-haal", "What is happening right now")}>
      <Async
        query={stats}
        skeleton={
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-24" />
            ))}
          </div>
        }
      >
        {(value) => <Overview stats={value} />}
      </Async>
    </AdminShell>
  );
}
