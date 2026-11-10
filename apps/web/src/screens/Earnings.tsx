import { CalendarDays, CloudOff, MapPin, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { data } from "../data";
import { areaName, categoryName, rupees } from "../data/labels";
import { dateLabel, rangeLabel } from "../lib/dates";
import { cached } from "../lib/offline";
import { useData } from "../lib/useData";
import { useSettings } from "../lib/settings";
import { Async } from "../ui/async";
import { Bars, type Bar } from "../ui/Bars";
import { CategoryIcon } from "../ui/CategoryIcon";
import { Auto, Card, EmptyState, ListSkeleton, SectionTitle, Skeleton, Tag } from "../ui/primitives";
import { Screen } from "../ui/shell";

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short" });

export function Earnings() {
  const { t, lang } = useSettings();
  const online = useOnline();
  const earnings = useData(() => cached("earnings", () => data.getEarnings()), []);
  const categories = useData(() => cached("categories", () => data.listCategories()), []);
  const upcoming = useData(() => cached("upcoming", () => data.listUpcomingJobs()), []);
  const showingSaved = !online || earnings.data?.stale;

  return (
    <Screen title={t("میری کمائی", "Meri kamai", "My earnings")} nav="worker" speak={earnings.data ? `آج کی کمائی ${earnings.data.value.today} روپے۔ اس ہفتے ${earnings.data.value.week} روپے۔` : undefined}>
      {showingSaved && (
        <div className="mb-3 flex items-center gap-2 rounded-2xl bg-sunken px-3 py-2 font-semibold text-soft">
          <CloudOff className="h-6 w-6 shrink-0" aria-hidden />
          <span className="flex-1">{t("انٹرنیٹ نہیں، محفوظ معلومات دکھا رہے ہیں", "Internet nahi, mehfooz maloomat dikha rahe hain", "No internet. Showing saved information")}</span>
        </div>
      )}

      <Async
        query={earnings}
        skeleton={
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
            <Skeleton className="h-44" />
          </div>
        }
      >
        {({ value }) => {
          const bars: Bar[] = value.daily.map((day, index, all) => ({ key: day.date, label: dayLabel(day.date), value: day.amount, display: rupees(day.amount), emphasised: index === all.length - 1 }));
          return (
            <div className="animate-rise">
              <div className="grid grid-cols-2 gap-3">
                <Card className="border-brand-600 bg-brand-600 text-white">
                  <div className="font-semibold">{t("آج", "Aaj", "Today")}</div>
                  <div className="latin whitespace-nowrap text-2xl font-extrabold tracking-tight">{rupees(value.today)}</div>
                </Card>
                <Card>
                  <div className="font-semibold text-soft">{t("اس ہفتے", "Is hafte", "This week")}</div>
                  <div className="latin whitespace-nowrap text-2xl font-extrabold tracking-tight">{rupees(value.week)}</div>
                </Card>
              </div>

              <Card className="mt-3">
                <h2 className="mb-2 text-base">{t("پچھلے 7 دن کی کمائی", "Pichle 7 din ki kamai", "Earnings over the last 7 days")}</h2>
                <Bars bars={bars} title={t("پچھلے 7 دن کی کمائی", "Pichle 7 din ki kamai", "Earnings over the last 7 days")} />
              </Card>

              <SectionTitle>{t("آنے والے کام", "Aane wale kaam", "Upcoming jobs")}</SectionTitle>
              <Async query={upcoming} skeleton={<ListSkeleton rows={1} />}>
                {({ value: jobs }) => {
                  const withCards = jobs.filter((job) => job.card);
                  return withCards.length === 0 ? (
                    <EmptyState icon={CalendarDays} title={t("ابھی کوئی آنے والا کام نہیں", "Abhi koi aane wala kaam nahi", "No upcoming jobs")} />
                  ) : (
                    <div className="stagger space-y-3">
                      {withCards.map((job) => (
                        <Card key={job.id} className="flex items-center gap-3 p-3">
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
                          <span className="latin shrink-0 font-bold">{rupees(job.totalPrice ?? 0)}</span>
                        </Card>
                      ))}
                    </div>
                  );
                }}
              </Async>

              <SectionTitle>{t("ہر کام کی کمائی", "Har kaam ki kamai", "Income per job")}</SectionTitle>
              {value.items.length === 0 ? (
                <EmptyState icon={Wallet} title={t("ابھی کوئی کمائی نہیں", "Abhi koi kamai nahi", "No earnings yet")} body={t("پہلا کام مکمل کریں", "Pehla kaam mukammal karein", "Finish your first job to see it here")} />
              ) : (
                <Card className="divide-y divide-line p-0">
                  {value.items.map((item) => {
                    const category = categories.data?.value.find((c) => c.id === item.categoryId);
                    return (
                      <div key={item.id} className="flex items-center gap-3 px-3 py-2">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sunken text-brand-700">
                          <CategoryIcon name={category?.icon} className="h-6 w-6" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 font-bold">
                            {categoryName(category, lang)}
                            {item.dayNumber !== null && (
                              <Tag tone="plain">
                                {t("دن", "Din", "Day")} <span className="latin">{item.dayNumber}</span>
                              </Tag>
                            )}
                          </div>
                          <div className="text-sm text-soft">{dateLabel(item.earnedAt, lang)}</div>
                        </div>
                        <span className="latin shrink-0 text-lg font-bold">{rupees(item.amount)}</span>
                      </div>
                    );
                  })}
                </Card>
              )}
            </div>
          );
        }}
      </Async>
    </Screen>
  );
}
