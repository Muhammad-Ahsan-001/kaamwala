import { Briefcase, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { data, type Category, type Job } from "../../data";
import { areaName, categoryName, personName, phrase } from "../../data/labels";
import { dateLabel, rangeLabel } from "../../lib/dates";
import { useData } from "../../lib/useData";
import { useSettings } from "../../lib/settings";
import { Async } from "../../ui/async";
import { CategoryIcon } from "../../ui/CategoryIcon";
import { AiTag, Auto, Card, EmptyState, ListSkeleton, Tag, cx } from "../../ui/primitives";
import { AdminShell } from "./AdminShell";
import { AdminPanel, Facts, FilterBar, JOB_MODE, JOB_STATUS, Latin, Money, SearchBox, useShowMore } from "./parts";

type Filter = "all" | "active" | "engaged" | "completed" | "cancelled" | "disputed";

const IN_PROGRESS: Job["status"][] = ["open", "requested", "negotiating", "pending_confirmation"];

const filterOf = (job: Job): Exclude<Filter, "all"> => (IN_PROGRESS.includes(job.status) ? "active" : (job.status as Exclude<Filter, "all" | "active">));

const LIST_LIMIT = 200;

function JobDetail({ job, category, onClose }: { job: Job; category?: Category; onClose: () => void }) {
  const { t, lang } = useSettings();
  const workers = useData(() => data.adminWorkers(), []);
  const status = JOB_STATUS[job.status];
  const names = job.workerIds.map((id) => workers.data?.find((worker) => worker.id === id)?.name).filter((name): name is string => Boolean(name));
  const doneDays = job.days.filter((day) => day.status === "completed").length;

  const dayStatus = {
    scheduled: t("باقی", "Baqi", "Scheduled"),
    completed: t("مکمل", "Mukammal", "Done"),
    skipped: t("چھوڑا گیا", "Chhora gaya", "Skipped"),
  };

  return (
    <AdminPanel title={categoryName(category, lang) || t("کام", "Kaam", "Job")} subtitle={<span>{dateLabel(job.createdAt, lang)}</span>} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1">
          <Tag tone={status.tone}>{t(status.ur, status.roman, status.en)}</Tag>
          <Tag tone="plain">{t(JOB_MODE[job.mode].ur, JOB_MODE[job.mode].roman, JOB_MODE[job.mode].en)}</Tag>
          {job.urgency === "urgent" && <Tag tone="busy">{t("فوری", "Foran", "Urgent")}</Tag>}
        </div>

        <p dir="auto">
          <Auto text={job.description} />
        </p>

        <Facts
          items={[
            { label: t("گاہک", "Gahak", "Customer"), value: <Auto text={personName(job.customerName, lang)} /> },
            { label: t("کاریگر", "Kaarigar", "Workers"), value: names.length > 0 ? names.map((name) => personName(name, lang)).join("، ") : "—" },
            { label: t("علاقہ", "Ilaqa", "Area"), value: areaName(job.area, lang) },
            { label: t("تاریخیں", "Tareekhein", "Dates"), value: rangeLabel(job.startDate, job.durationDays, lang) },
            { label: t("فی دن", "Fi din", "Per day"), value: job.agreedPrice !== null ? <Money value={job.agreedPrice} /> : job.proposedPrice !== null ? <><Money value={job.proposedPrice} /> <span className="font-normal text-soft">({t("تجویز", "tajweez", "proposed")})</span></> : "—" },
            { label: t("کل", "Kul", "Total"), value: job.totalPrice !== null ? <Money value={job.totalPrice} /> : "—" },
            { label: t("کم از کم قیمت", "Kam az kam qeemat", "Floor"), value: <Money value={job.floor} /> },
            { label: t("بھاؤ کا قدم", "Bhao ka qadam", "Step"), value: <Money value={job.step} /> },
          ]}
        />

        {job.card && (
          <div>
            <h3 className="mb-1 flex flex-wrap items-center gap-2 text-base">
              {t("جاب کارڈ", "Job card", "Job card")}
              {job.card.source === "gemini" ? <AiTag label="AI" icon={Sparkles} /> : <Tag tone="plain">{t("بغیر AI کے بنا", "Baghair AI ke bana", "Made without AI")}</Tag>}
            </h3>
            <p dir="auto" className="text-soft">
              <Auto text={job.card.task} />
            </p>
            <p className="mt-1 text-sm text-soft">
              {t("گاہک", "Gahak", "Customer")}: {job.customerConfirmed ? t("تصدیق ہو گئی", "Tasdeeq ho gayi", "Confirmed") : t("تصدیق باقی", "Tasdeeq baqi", "Not yet")} · {t("کاریگر", "Kaarigar", "Worker")}: {job.workerConfirmed ? t("تصدیق ہو گئی", "Tasdeeq ho gayi", "Confirmed") : t("تصدیق باقی", "Tasdeeq baqi", "Not yet")}
            </p>
          </div>
        )}

        {job.days.length > 0 && (
          <div>
            <h3 className="mb-1 text-base">
              {t("دن", "Din", "Days")} <Latin className="font-normal text-soft">{doneDays} / {job.durationDays}</Latin>
            </h3>
            <ul className="m-0 grid list-none grid-cols-2 gap-1 p-0">
              {job.days.map((day) => (
                <li key={day.dayNumber} className="flex items-center justify-between gap-2 rounded-xl bg-sunken px-2 py-1 text-sm">
                  <span>{dateLabel(day.date, lang)}</span>
                  <span className={cx("font-bold", day.status === "completed" ? "text-brand-700" : "text-soft")}>{dayStatus[day.status]}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {job.photoUrls.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {job.photoUrls.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-2xl bg-sunken">
                <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
        )}
        {job.card?.skills && job.card.skills.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {job.card.skills.map((skill) => (
              <Tag key={skill} tone="plain">
                <Auto text={phrase(skill, lang)} />
              </Tag>
            ))}
          </div>
        )}
      </div>
    </AdminPanel>
  );
}

const COLUMNS = "lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.8fr)_10rem]";

export function AdminJobs() {
  const { t, lang } = useSettings();
  const jobs = useData(() => data.adminJobs(), [], { reloadOn: ["job.updated"] });
  const categories = useData(() => data.listCategories({ all: true }), [], { reloadOn: ["categories.changed"] });
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const categoryOf = useMemo(() => {
    const byId = new Map((categories.data ?? []).map((c) => [c.id, c]));
    return (job: Job) => byId.get(job.categoryId);
  }, [categories.data]);

  const list = jobs.data ?? [];
  const counts: Record<Filter, number> = { all: list.length, active: 0, engaged: 0, completed: 0, cancelled: 0, disputed: 0 };
  list.forEach((job) => (counts[filterOf(job)] += 1));

  const text = query.trim().toLowerCase();
  const shown = list.filter((job) => {
    if (filter !== "all" && filterOf(job) !== filter) return false;
    if (!text) return true;
    const category = categoryOf(job);
    return [job.customerName, job.area, job.description, category?.nameUr, category?.nameRoman, category?.nameEn].join(" ").toLowerCase().includes(text);
  });

  const opened = openId ? list.find((job) => job.id === openId) : undefined;
  const { visible, moreButton } = useShowMore(shown, `${filter}|${text}`);

  return (
    <AdminShell title={t("کام", "Kaam", "Jobs")} subtitle={t("تمام کاموں کی اصل حالت، خود بخود تازہ", "Tamam kaamon ki asal halat, khud ba khud taaza", "Every job and where it stands, updated as it changes")}>
      <Async query={jobs} skeleton={<ListSkeleton rows={6} />}>
        {() => (
          <div className="space-y-3">
            <FilterBar
              label={t("فلٹر", "Filter", "Filter")}
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: t("سب", "Sab", "All"), count: counts.all },
                { value: "active", label: t("زیرِ عمل", "Zer-e-amal", "Being arranged"), count: counts.active },
                { value: "engaged", label: t("کام جاری", "Kaam jari", "In progress"), count: counts.engaged },
                { value: "completed", label: t("مکمل", "Mukammal", "Completed"), count: counts.completed },
                { value: "cancelled", label: t("منسوخ", "Mansookh", "Cancelled"), count: counts.cancelled },
                { value: "disputed", label: t("شکایت", "Shikayat", "Disputed"), count: counts.disputed },
              ]}
            />
            <SearchBox value={query} onChange={setQuery} label={t("تلاش", "Talaash", "Search")} placeholder={t("گاہک، علاقہ یا کام", "Gahak, ilaqa ya kaam", "Customer, area or work")} />

            {shown.length === 0 ? (
              <EmptyState icon={Briefcase} title={list.length === 0 ? t("ابھی کوئی کام نہیں", "Abhi koi kaam nahi", "No jobs yet") : t("کچھ نہیں ملا", "Kuch nahi mila", "No matches")} />
            ) : (
              <Card className="divide-y divide-line overflow-hidden p-0">
                <div className={cx("hidden items-center gap-x-4 px-3 py-2 text-sm font-bold text-soft lg:grid", COLUMNS)}>
                  <span>{t("کام", "Kaam", "Job")}</span>
                  <span>{t("تفصیل", "Tafseel", "Details")}</span>
                  <span>{t("قیمت", "Qeemat", "Price")}</span>
                  <span>{t("حالت", "Halat", "Status")}</span>
                </div>
                {visible.map((job) => {
                  const category = categoryOf(job);
                  const status = JOB_STATUS[job.status];
                  const mode = JOB_MODE[job.mode];
                  const tag = <Tag tone={status.tone}>{t(status.ur, status.roman, status.en)}</Tag>;
                  return (
                    <button key={job.id} type="button" onClick={() => setOpenId(job.id)} className={cx("grid w-full items-center gap-x-4 gap-y-1 p-3 text-start transition hover:bg-page", COLUMNS)}>
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sunken text-brand-700">
                          <CategoryIcon name={category?.icon} className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-bold">{categoryName(category, lang) || "—"}</span>
                          <span className="block truncate text-sm text-soft">
                            <Auto text={personName(job.customerName, lang)} /> · <Auto text={dateLabel(job.createdAt, lang)} />
                          </span>
                        </span>
                        <span className="shrink-0 lg:hidden">{tag}</span>
                      </span>
                      <span className="min-w-0 truncate text-sm text-soft">
                        <Auto text={areaName(job.area, lang)} /> · {t(mode.ur, mode.roman, mode.en)} · <Latin>{job.durationDays}</Latin> {t("دن", "din", job.durationDays === 1 ? "day" : "days")}
                      </span>
                      <span className="min-w-0 truncate text-sm font-bold">
                        {job.agreedPrice !== null ? (
                          <>
                            <Money value={job.agreedPrice} /> <span className="font-normal text-soft">{t("فی دن", "fi din", "/ day")}</span>
                          </>
                        ) : (
                          <span className="font-normal text-faint">{t("طے نہیں ہوئی", "Tay nahi hui", "Not agreed")}</span>
                        )}
                      </span>
                      <span className="hidden lg:inline">{tag}</span>
                    </button>
                  );
                })}
              </Card>
            )}
            {moreButton}
            {list.length >= LIST_LIMIT && <p className="text-sm text-soft">{t("سب سے نئے 200 کام دکھائے گئے ہیں", "Sab se naye 200 kaam dikhaye gaye hain", "Showing the newest 200 jobs")}</p>}
          </div>
        )}
      </Async>

      {opened && <JobDetail job={opened} category={categoryOf(opened)} onClose={() => setOpenId(null)} />}
    </AdminShell>
  );
}
