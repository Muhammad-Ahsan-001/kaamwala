import { CalendarDays, ChevronDown, Info, MapPin, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { data, type Category, type Earning, type Job } from "../data";
import { areaName, categoryName, rupees } from "../data/labels";
import { clockLabel, dateLabel, isoDate, rangeLabel } from "../lib/dates";
import { useData } from "../lib/useData";
import { useSettings, type Lang } from "../lib/settings";
import { Async } from "../ui/async";
import { Bars, type Bar } from "../ui/Bars";
import { CategoryIcon } from "../ui/CategoryIcon";
import { Auto, Card, EmptyState, ListSkeleton, SectionTitle, Skeleton, Tag, cx } from "../ui/primitives";
import { Screen } from "../ui/shell";

const weekday = (date: string, lang: Lang) => new Date(`${date}T12:00:00`).toLocaleDateString(lang === "ur" ? "ur-PK" : "en-GB", { weekday: "short" });

/** The calendar day this money was earned on, by the same clock the server uses for today and week. */
const pakistanDate = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });

type JobEarnings = { jobId: string; categoryId: string; total: number; latest: string; entries: Earning[] };

function groupByJob(items: Earning[]): JobEarnings[] {
  const groups = new Map<string, JobEarnings>();
  for (const item of items) {
    const group = groups.get(item.jobId);
    if (group) {
      group.total += item.amount;
      group.entries.push(item);
    } else {
      groups.set(item.jobId, { jobId: item.jobId, categoryId: item.categoryId, total: item.amount, latest: item.earnedAt, entries: [item] });
    }
  }
  // Items arrive newest first, so each job's first entry is its latest. Its days read better in order.
  for (const group of groups.values()) group.entries.sort((a, b) => (a.dayNumber ?? 0) - (b.dayNumber ?? 0));
  return [...groups.values()];
}

function JobEarningsRow({ group, category, job }: { group: JobEarnings; category?: Category; job?: Job }) {
  const { t, lang } = useSettings();
  const [open, setOpen] = useState(false);
  const title = job?.card?.task ?? job?.description;
  const paidDays = group.entries.length;
  const panelId = `earning-${group.jobId}`;

  return (
    <div>
      <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)} className="flex min-h-16 w-full items-center gap-3 px-3 py-2 text-start">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sunken text-brand-700">
          <CategoryIcon name={category?.icon} className="h-6 w-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 font-bold">
            {categoryName(category, lang)}
            {job?.crewId && <Tag tone="plain">{t("ٹیم", "Crew", "Crew")}</Tag>}
            {job?.status === "engaged" && <Tag tone="busy">{t("جاری", "Jari", "In progress")}</Tag>}
          </span>
          {title && (
            <span className="block truncate text-sm text-soft">
              <Auto text={title} />
            </span>
          )}
          <span className="block text-sm text-soft">
            {dateLabel(group.latest, lang)}
            {paidDays > 1 && (
              <>
                {" · "}
                <span className="latin">{paidDays}</span> {t("دن", "din", "days")}
              </>
            )}
          </span>
        </span>
        <span className="latin shrink-0 text-lg font-extrabold">{rupees(group.total)}</span>
        <ChevronDown className={cx("h-5 w-5 shrink-0 text-faint transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div id={panelId} className="animate-rise border-t border-line bg-sunken/60 px-3 py-1">
          <ul className="m-0 list-none divide-y divide-line p-0">
            {group.entries.map((entry) => (
              <li key={entry.id} className="flex min-h-12 items-center justify-between gap-3 py-1">
                <span className="min-w-0">
                  {entry.dayNumber !== null && (
                    <span className="font-semibold">
                      {t("دن", "Din", "Day")} <span className="latin">{entry.dayNumber}</span>
                      {" · "}
                    </span>
                  )}
                  <span className="text-sm text-soft">
                    {dateLabel(entry.earnedAt, lang)} · <span className="latin">{clockLabel(entry.earnedAt)}</span>
                  </span>
                </span>
                <span className="latin shrink-0 font-bold">{rupees(entry.amount)}</span>
              </li>
            ))}
          </ul>
          <Link to={`/app/jobs/${group.jobId}`} className="flex min-h-12 items-center justify-center font-bold text-brand-700">
            {t("کام کھولیں", "Kaam kholein", "Open this job")}
          </Link>
        </div>
      )}
    </div>
  );
}

export function Earnings() {
  const { t, lang } = useSettings();
  const workerId = data.currentUser()?.workerId ?? null;
  const earnings = useData(() => data.getEarnings(), [], {
    reloadOn: ["job.updated"],
    when: (event) => event.type === "job.updated" && workerId !== null && event.job.workerIds.includes(workerId),
  });
  const categories = useData(() => data.listCategories(), [], { reloadOn: ["categories.changed"] });
  const jobs = useData(() => data.listMyJobs(), [], { reloadOn: ["job.updated"] });
  const upcoming = useData(() => data.listUpcomingJobs(), [], { reloadOn: ["job.updated"] });

  const jobsById = useMemo(() => new Map((jobs.data ?? []).map((job) => [job.id, job] as const)), [jobs.data]);
  const today = isoDate(new Date());

  return (
    <Screen title={t("میری کمائی", "Meri kamai", "My earnings")} nav="worker" speak={earnings.data ? `آج کی کمائی ${earnings.data.today} روپے۔ اس ہفتے ${earnings.data.week} روپے۔` : undefined}>

      <Async
        query={earnings}
        skeleton={
          <div className="space-y-3" role="status" aria-busy="true">
            <Skeleton className="h-28" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
            <Skeleton className="h-44" />
          </div>
        }
      >
        {(value) => {
          const bars: Bar[] = value.daily.map((day, index, all) => ({ key: day.date, label: weekday(day.date, lang), value: day.amount, display: rupees(day.amount), emphasised: index === all.length - 1 }));
          const earningDays = [...value.daily].reverse().filter((day) => day.amount > 0);
          const entriesOn = (date: string) => value.items.filter((item) => pakistanDate(item.earnedAt) === date).length;
          const grouped = groupByJob(value.items);
          return (
            <div className="animate-rise">
              <Card className="border-brand-600 bg-brand-600 text-white">
                <div className="flex items-center gap-2 font-semibold">
                  <Wallet className="h-5 w-5" aria-hidden />
                  {t("آج کی کمائی", "Aaj ki kamai", "Today's earnings")}
                </div>
                <div className="latin mt-1 whitespace-nowrap text-4xl font-extrabold tracking-tight">
                  {rupees(value.today)}
                </div>
              </Card>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <Card>
                  <div className="font-semibold text-soft">{t("اس ہفتے", "Is hafte", "This week")}</div>
                  <div className="latin whitespace-nowrap text-2xl font-extrabold tracking-tight">
                    {rupees(value.week)}
                  </div>
                </Card>
                <Card>
                  <div className="font-semibold text-soft">{t("کل کام", "Kul kaam", "Paid jobs")}</div>
                  <div className="latin whitespace-nowrap text-2xl font-extrabold tracking-tight">
                    {value.jobCount}
                  </div>
                </Card>
              </div>

              <Card className="mt-3">
                <h2 className="mb-2 text-base">{t("پچھلے 7 دن کی کمائی", "Pichle 7 din ki kamai", "Earnings over the last 7 days")}</h2>
                <Bars bars={bars} title={t("پچھلے 7 دن کی کمائی", "Pichle 7 din ki kamai", "Earnings over the last 7 days")} />
              </Card>

              <SectionTitle>{t("روزانہ کی کمائی", "Rozana ki kamai", "Income per day")}</SectionTitle>
              {earningDays.length === 0 ? (
                <EmptyState icon={CalendarDays} title={t("پچھلے 7 دن کوئی کمائی نہیں", "Pichle 7 din koi kamai nahi", "Nothing earned in the last 7 days")} />
              ) : (
                <Card className="divide-y divide-line p-0">
                  {earningDays.map((day) => {
                    const count = entriesOn(day.date);
                    return (
                      <div key={day.date} className="flex min-h-14 items-center justify-between gap-3 px-3 py-2">
                        <div className="min-w-0">
                          <div className="font-bold">
                            {day.date === today ? t("آج", "Aaj", "Today") : weekday(day.date, lang)}
                            <span className="ms-2 text-sm font-normal text-soft">{dateLabel(day.date, lang)}</span>
                          </div>
                          {count > 0 && (
                            <div className="text-sm text-soft">
                              <span className="latin">{count}</span> {t("ادائیگی", "adaigi", count === 1 ? "payment" : "payments")}
                            </div>
                          )}
                        </div>
                        <span className="latin shrink-0 text-lg font-extrabold">{rupees(day.amount)}</span>
                      </div>
                    );
                  })}
                </Card>
              )}

              <SectionTitle>{t("ہر کام کی کمائی", "Har kaam ki kamai", "Income per job")}</SectionTitle>
              {grouped.length === 0 ? (
                <EmptyState icon={Wallet} title={t("ابھی کوئی کمائی نہیں", "Abhi koi kamai nahi", "No earnings yet")} body={t("پہلا کام مکمل کریں", "Pehla kaam mukammal karein", "Finish your first job to see it here")} />
              ) : (
                <Card className="divide-y divide-line p-0">
                  {grouped.map((group) => (
                    <JobEarningsRow key={group.jobId} group={group} category={categories.data?.find((c) => c.id === group.categoryId)} job={jobsById.get(group.jobId)} />
                  ))}
                </Card>
              )}

              <SectionTitle>{t("آنے والے کام", "Aane wale kaam", "Upcoming jobs")}</SectionTitle>
              <Async query={upcoming} skeleton={<ListSkeleton rows={1} />}>
                {(list) => {
                  const withCards = list.filter((job) => job.card && workerId !== null && job.workerIds.includes(workerId));
                  return withCards.length === 0 ? (
                    <EmptyState icon={CalendarDays} title={t("ابھی کوئی آنے والا کام نہیں", "Abhi koi aane wala kaam nahi", "No upcoming jobs")} />
                  ) : (
                    <div className="stagger space-y-3">
                      {withCards.map((job) => (
                        <Link key={job.id} to={`/app/jobs/${job.id}`} className="block rounded-3xl border border-line bg-surface p-3 transition active:scale-[0.99]">
                          <div className="flex items-center gap-3">
                            <CalendarDays className="h-7 w-7 shrink-0 text-brand-600" aria-hidden />
                            <div className="min-w-0 flex-1">
                              <div className="font-bold">
                                <Auto text={job.card?.task ?? job.description} />
                              </div>
                              <div className="flex flex-wrap items-center gap-x-1 text-sm text-soft">
                                <MapPin className="h-4 w-4" aria-hidden />
                                <Auto text={areaName(job.area, lang)} /> · {rangeLabel(job.startDate, job.durationDays, lang)}
                              </div>
                            </div>
                            <div className="shrink-0 text-end">
                              <div className="latin font-bold">{rupees(job.totalPrice ?? 0)}</div>
                              <Tag tone={job.status === "engaged" ? "busy" : "plain"}>{job.status === "engaged" ? t("پکا", "Pakka", "Booked") : t("تصدیق باقی", "Tasdeeq baqi", "To confirm")}</Tag>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  );
                }}
              </Async>

              <p className="mt-4 flex gap-2 text-sm text-soft">
                <Info className="mt-1 h-4 w-4 shrink-0" aria-hidden />
                <span>{t("یہ رقم طے شدہ قیمت اور مکمل دنوں کے حساب سے ہے۔ پیسے گاہک آپ کو براہِ راست دیتا ہے، ایپ پیسے نہیں رکھتی۔", "Ye raqam tay shuda qeemat aur mukammal dinon ke hisab se hai. Paise customer aap ko seedha deta hai, app paise nahi rakhti.", "These amounts come from your agreed prices and completed days. Customers pay you directly; the app does not hold money.")}</span>
              </p>
            </div>
          );
        }}
      </Async>
    </Screen>
  );
}
