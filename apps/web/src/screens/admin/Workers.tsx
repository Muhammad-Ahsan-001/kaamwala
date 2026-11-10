import { Ban, Check, HardHat, IdCard, RotateCcw, Smartphone } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { data, type AdminWorkerRow, type Category } from "../../data";
import { errorText } from "../../data/errors";
import { areaName, categoryName, personName, phrase, rupees } from "../../data/labels";
import { useData } from "../../lib/useData";
import { useSettings } from "../../lib/settings";
import { digitsOnly } from "../../lib/validate";
import { Async } from "../../ui/async";
import { Avatar, StatusPill } from "../../ui/people";
import { Auto, Button, Card, EmptyState, InlineError, ListSkeleton, MockTag, Rating, Tag, cx } from "../../ui/primitives";
import { AdminShell, refreshAdminCounts } from "./AdminShell";
import { AdminPanel, Facts, FilterBar, Latin, SearchBox, Spinner, phoneLabel, useFlash, useShowMore } from "./parts";

type WorkerState = "pending" | "approved" | "suspended";
type Filter = WorkerState | "all";
type Action = "approve" | "suspend";

const stateOf = (worker: AdminWorkerRow): WorkerState => (worker.suspended ? "suspended" : worker.approved ? "approved" : "pending");

/** Matches names, areas and trades in any script, and phone numbers however they are typed. */
function matchesSearch(worker: AdminWorkerRow, trades: Category[], query: string) {
  const text = query.trim().toLowerCase();
  if (!text) return true;
  const words = [worker.name, worker.area, ...trades.flatMap((c) => [c.nameUr, c.nameRoman, c.nameEn])].join(" ").toLowerCase();
  if (words.includes(text)) return true;
  const digits = digitsOnly(text).replace(/^0/, "");
  return digits.length >= 3 && digitsOnly(worker.phone).includes(digits);
}

function StateTag({ state }: { state: WorkerState }) {
  const { t } = useSettings();
  if (state === "approved") return <Tag>{t("منظور شدہ", "Manzoor shuda", "Approved")}</Tag>;
  if (state === "suspended") return <Tag tone="busy">{t("معطل", "Mu'attal", "Suspended")}</Tag>;
  return <Tag tone="plain">{t("منظوری باقی", "Manzoori baqi", "To approve")}</Tag>;
}

function Actions({ worker, busy, onAct, className }: { worker: AdminWorkerRow; busy: boolean; onAct: (worker: AdminWorkerRow, action: Action) => void; className?: string }) {
  const { t } = useSettings();
  const state = stateOf(worker);
  return (
    <div className={cx("flex gap-2", className)}>
      {state === "pending" && (
        <Button size="md" icon={busy ? Spinner : Check} disabled={busy} className="flex-1 lg:flex-none" onClick={() => onAct(worker, "approve")}>
          {t("منظور کریں", "Manzoor karein", "Approve")}
        </Button>
      )}
      {state === "suspended" ? (
        <Button size="md" variant="secondary" icon={busy ? Spinner : RotateCcw} disabled={busy} className="flex-1 lg:flex-none" onClick={() => onAct(worker, "approve")}>
          {t("بحال کریں", "Bahaal karein", "Reinstate")}
        </Button>
      ) : (
        <Button size="md" variant="secondary" icon={Ban} disabled={busy} className="flex-1 lg:flex-none" onClick={() => onAct(worker, "suspend")}>
          {t("معطل کریں", "Mu'attal karein", "Suspend")}
        </Button>
      )}
    </div>
  );
}

function WorkerDetail({ worker, trades, busy, onAct, onClose }: { worker: AdminWorkerRow; trades: Category[]; busy: boolean; onAct: (worker: AdminWorkerRow, action: Action) => void; onClose: () => void }) {
  const { t, lang } = useSettings();
  const state = stateOf(worker);
  const name = personName(worker.name, lang);
  return (
    <AdminPanel title={name} onClose={onClose} subtitle={<Latin>{phoneLabel(worker.phone)}</Latin>} footer={<Actions worker={worker} busy={busy} onAct={onAct} className="lg:justify-end" />}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar name={worker.name} url={worker.photoUrl} size={64} status={state === "approved" ? worker.status : undefined} />
          <div className="flex min-w-0 flex-1 flex-wrap gap-1">
            <StateTag state={state} />
            {state === "approved" && <StatusPill status={worker.status} />}
            {worker.createdByAgent && (
              <Tag tone="plain">
                {t("ایجنٹ", "Agent", "Agent")}: <Auto text={worker.createdByAgent} />
              </Tag>
            )}
          </div>
        </div>

        <Facts
          items={[
            { label: t("شعبہ", "Shoba", "Trade"), value: trades.length ? trades.map((c) => categoryName(c, lang)).join("، ") : "—" },
            { label: t("علاقہ", "Ilaqa", "Area"), value: areaName(worker.area, lang) },
            { label: t("تجربہ", "Tajurba", "Experience"), value: <><Latin>{worker.years}</Latin> {t("سال", "saal", worker.years === 1 ? "year" : "years")}</> },
            { label: t("ریٹ فی دن", "Rate fi din", "Rate per day"), value: worker.rate ? <Latin>{rupees(worker.rate)}</Latin> : "—" },
            { label: t("مکمل کام", "Mukammal kaam", "Jobs done"), value: <Latin>{worker.trust.jobCount}</Latin> },
            { label: t("ریٹنگ", "Rating", "Rating"), value: worker.trust.ratingCount > 0 ? <Rating value={worker.trust.rating} count={worker.trust.ratingCount} /> : t("ابھی نہیں", "Abhi nahi", "None yet") },
            { label: t("اوقات", "Auqaat", "Working hours"), value: worker.workingHours ? <Auto text={worker.workingHours} /> : "—" },
            { label: t("جواب کی شرح", "Jawab ki sharah", "Response rate"), value: <Latin>{Math.round(worker.trust.responseRate * 100)}%</Latin> },
          ]}
        />

        {worker.skills.length > 0 && (
          <div>
            <h3 className="mb-1 text-base">{t("ہنر", "Hunar", "Skills")}</h3>
            <div className="flex flex-wrap gap-1">
              {worker.skills.map((skill) => (
                <Tag key={skill} tone="plain">
                  <Auto text={phrase(skill, lang)} />
                </Tag>
              ))}
            </div>
          </div>
        )}

        <div>
          <h3 className="mb-1 text-base">{t("پہچان", "Pehchan", "Identity")}</h3>
          <ul className="m-0 list-none space-y-1 p-0 text-sm">
            <li className="flex items-center gap-2">
              <IdCard className="h-5 w-5 shrink-0 text-soft" aria-hidden />
              <span>{worker.cnicDuplicateChecked ? t("شناختی کارڈ درج، کوئی دوہرا اکاؤنٹ نہیں", "CNIC darj, koi dohra account nahi", "CNIC on file, no duplicate account") : t("ابھی شناختی کارڈ نہیں دیا", "Abhi CNIC nahi diya", "No CNIC given yet")}</span>
            </li>
            <li className="flex flex-wrap items-center gap-2">
              <Smartphone className="h-5 w-5 shrink-0 text-soft" aria-hidden />
              <span>{worker.phoneChecked ? t("OTP سے لاگ اِن ہو چکا", "OTP se login ho chuka", "Has signed in with OTP") : t("ابھی OTP سے لاگ اِن نہیں ہوا", "Abhi OTP se login nahi hua", "Has not signed in with OTP yet")}</span>
              <MockTag>{t("OTP فرضی ہے", "OTP farzi hai", "OTP is mocked")}</MockTag>
            </li>
          </ul>
          <p className="mt-2 text-sm text-soft">
            {t("شناختی کارڈ کا صرف یہ دیکھا جاتا ہے کہ نمبر پہلے استعمال نہ ہوا ہو۔ یہ نادرا یا سرکاری تصدیق نہیں۔", "CNIC ka sirf ye dekha jata hai ke number pehle istemal na hua ho. Ye NADRA ya sarkari tasdeeq nahi.", "A CNIC is only checked for duplicates here. This is not NADRA or government verification.")}
          </p>
        </div>

        {worker.photos.length > 0 && (
          <div>
            <h3 className="mb-1 text-base">{t("پرانے کام کی تصویریں", "Puranay kaam ki tasveerein", "Past work")}</h3>
            <div className="grid grid-cols-3 gap-2">
              {worker.photos.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-2xl bg-sunken">
                  <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminPanel>
  );
}

function SuspendDialog({ worker, busy, error, onConfirm, onClose }: { worker: AdminWorkerRow; busy: boolean; error: string | null; onConfirm: () => void; onClose: () => void }) {
  const { t, lang } = useSettings();
  const name = personName(worker.name, lang);
  return (
    <AdminPanel
      kind="dialog"
      title={t(`${name} کو معطل کریں؟`, `${name} ko mu'attal karein?`, `Suspend ${name}?`)}
      onClose={onClose}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button size="md" variant="secondary" disabled={busy} onClick={onClose}>
            {t("رہنے دیں", "Rehne dein", "Keep them")}
          </Button>
          <Button size="md" icon={busy ? Spinner : undefined} disabled={busy} className="bg-busy-600 hover:bg-busy-700" onClick={onConfirm}>
            {t("ہاں، معطل کریں", "Haan, mu'attal karein", "Yes, suspend")}
          </Button>
        </div>
      }
    >
      <p>
        {t(
          "یہ فوراً سائن آؤٹ ہو جائیں گے اور تلاش سے ہٹ جائیں گے۔ کوئی کام جاری ہے تو وہ بھی ختم ہو جائے گا: کیے گئے دنوں کے پیسے رہیں گے، باقی منسوخ۔",
          "Ye foran sign out ho jayenge aur talaash se hat jayenge. Koi kaam jari hai to woh bhi khatam ho jayega: kiye gaye dinon ke paise rahenge, baqi mansookh.",
          "They are signed out at once and removed from search. A job in progress ends with it: days already worked stay paid, the rest are cancelled.",
        )}
      </p>
      {error && (
        <div className="mt-3">
          <InlineError>{error}</InlineError>
        </div>
      )}
    </AdminPanel>
  );
}

const COLUMNS = "lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,1.3fr)_16rem]";

export function AdminWorkers() {
  const { t, lang } = useSettings();
  const workers = useData(() => data.adminWorkers(), [], { reloadOn: ["worker.status"] });
  const categories = useData(() => data.listCategories({ all: true }), [], { reloadOn: ["categories.changed"] });
  const [params, setParams] = useSearchParams();
  const [chosen, setChosen] = useState<Filter | null>(null);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suspending, setSuspending] = useState<AdminWorkerRow | null>(null);
  const { flash, flashNode } = useFlash();

  const tradesOf = useMemo(() => {
    const byId = new Map((categories.data ?? []).map((c) => [c.id, c]));
    return (worker: AdminWorkerRow) => worker.categoryIds.flatMap((id) => byId.get(id) ?? []);
  }, [categories.data]);

  const list = workers.data ?? [];
  const counts = { pending: 0, approved: 0, suspended: 0 };
  list.forEach((worker) => (counts[stateOf(worker)] += 1));
  const filter: Filter = chosen ?? (counts.pending > 0 ? "pending" : "all");

  const shown = list.filter((worker) => (filter === "all" || stateOf(worker) === filter) && matchesSearch(worker, tradesOf(worker), query));

  const openId = params.get("id");
  const opened = openId ? (list.find((worker) => worker.id === openId) ?? null) : null;
  const { visible, moreButton } = useShowMore(shown, `${filter}|${query}`);
  const closeDetail = () => {
    const next = new URLSearchParams(params);
    next.delete("id");
    setParams(next, { replace: true });
  };

  const run = async (worker: AdminWorkerRow, action: Action) => {
    setBusyId(worker.id);
    setError(null);
    const name = personName(worker.name, lang);
    const reinstating = worker.suspended;
    try {
      await data.adminSetWorkerState(worker.id, action);
      workers.reload();
      refreshAdminCounts();
      setSuspending(null);
      flash(action === "suspend" ? t(`${name} معطل ہو گیا`, `${name} mu'attal ho gaya`, `${name} suspended`) : reinstating ? t(`${name} بحال ہو گیا`, `${name} bahaal ho gaya`, `${name} reinstated`) : t(`${name} منظور ہو گیا`, `${name} manzoor ho gaya`, `${name} approved`));
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusyId(null);
    }
  };

  const act = (worker: AdminWorkerRow, action: Action) => {
    if (action === "suspend") {
      setError(null);
      setSuspending(worker);
    } else {
      void run(worker, action);
    }
  };

  return (
    <AdminShell title={t("کاریگر", "Kaarigar", "Workers")} subtitle={t("منظور کریں، معطل کریں یا بحال کریں", "Manzoor karein, mu'attal karein ya bahaal karein", "Approve, suspend or reinstate")}>
      <Async query={workers} skeleton={<ListSkeleton rows={5} />}>
        {() => (
          <div className="space-y-3">
            <FilterBar
              label={t("فلٹر", "Filter", "Filter")}
              value={filter}
              onChange={setChosen}
              options={[
                { value: "pending", label: t("منظوری باقی", "Manzoori baqi", "To approve"), count: counts.pending },
                { value: "approved", label: t("منظور شدہ", "Manzoor shuda", "Approved"), count: counts.approved },
                { value: "suspended", label: t("معطل", "Mu'attal", "Suspended"), count: counts.suspended },
                { value: "all", label: t("سب", "Sab", "All"), count: list.length },
              ]}
            />
            <SearchBox value={query} onChange={setQuery} label={t("تلاش", "Talaash", "Search")} placeholder={t("نام، فون، علاقہ یا شعبہ", "Naam, phone, ilaqa ya shoba", "Name, phone, area or trade")} />

            {error && !suspending && <InlineError>{error}</InlineError>}

            {shown.length === 0 ? (
              <EmptyState
                icon={HardHat}
                title={list.length === 0 ? t("ابھی کوئی کاریگر نہیں", "Abhi koi kaarigar nahi", "No workers yet") : filter === "pending" && !query ? t("کوئی منظوری باقی نہیں", "Koi manzoori baqi nahi", "Nobody is waiting for approval") : t("کچھ نہیں ملا", "Kuch nahi mila", "No matches")}
                body={list.length > 0 && query ? t("کوئی اور لفظ آزمائیں یا فلٹر بدلیں", "Koi aur lafz azmayein ya filter badlein", "Try another word or change the filter") : undefined}
              />
            ) : (
              <Card className="divide-y divide-line overflow-hidden p-0">
                <div className={cx("hidden items-center gap-x-4 px-3 py-2 text-sm font-bold text-soft lg:grid", COLUMNS)}>
                  <span>{t("کاریگر", "Kaarigar", "Worker")}</span>
                  <span>{t("شعبہ اور علاقہ", "Shoba aur ilaqa", "Trade and area")}</span>
                  <span>{t("حالت", "Halat", "State")}</span>
                  <span />
                </div>
                {visible.map((worker) => {
                  const state = stateOf(worker);
                  const trades = tradesOf(worker);
                  const trade = trades[0] ? categoryName(trades[0], lang) : "—";
                  return (
                    <div key={worker.id} className={cx("grid items-center gap-x-4 gap-y-2 p-3", COLUMNS)}>
                      <button type="button" onClick={() => setParams({ id: worker.id }, { replace: true })} className="flex min-h-12 min-w-0 items-center gap-3 text-start">
                        <Avatar name={worker.name} url={worker.photoUrl} size={48} status={state === "approved" ? worker.status : undefined} />
                        <span className="min-w-0 flex-1">
                          <span className="block break-words font-bold">
                            <Auto text={personName(worker.name, lang)} />
                          </span>
                          <span className="block truncate text-sm text-soft">
                            <Latin>{phoneLabel(worker.phone)}</Latin>
                          </span>
                        </span>
                        <span className="shrink-0 lg:hidden">
                          <StateTag state={state} />
                        </span>
                      </button>
                      <div className="min-w-0 truncate text-sm text-soft lg:text-base lg:text-ink">
                        {trade}
                        {trades.length > 1 && <Latin> +{trades.length - 1}</Latin>} · <Auto text={areaName(worker.area, lang)} />
                      </div>
                      <div className="flex min-w-0 flex-wrap items-center gap-1">
                        <span className="hidden lg:inline-flex">
                          <StateTag state={state} />
                        </span>
                        <Tag tone="plain">{worker.cnicDuplicateChecked ? t("شناختی کارڈ: دوہرا نہیں", "CNIC: dohra nahi", "CNIC: no duplicate") : t("شناختی کارڈ نہیں", "CNIC nahi", "No CNIC")}</Tag>
                        {worker.createdByAgent && <Tag tone="plain">{t("ایجنٹ سے", "Agent se", "Via agent")}</Tag>}
                      </div>
                      <Actions worker={worker} busy={busyId === worker.id} onAct={act} className="lg:justify-end" />
                    </div>
                  );
                })}
              </Card>
            )}
            {moreButton}
          </div>
        )}
      </Async>

      {opened && <WorkerDetail worker={opened} trades={tradesOf(opened)} busy={busyId === opened.id} onAct={act} onClose={closeDetail} />}
      {suspending && <SuspendDialog worker={suspending} busy={busyId === suspending.id} error={error} onConfirm={() => void run(suspending, "suspend")} onClose={() => setSuspending(null)} />}
      {flashNode}
    </AdminShell>
  );
}
