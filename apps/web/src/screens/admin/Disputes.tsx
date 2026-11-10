import { Check, CircleCheck, Flag, Gavel } from "lucide-react";
import { useMemo, useState } from "react";
import { data, type AdminDispute, type Category } from "../../data";
import { errorCode, errorText } from "../../data/errors";
import { areaName, categoryName, personName, savedChoice } from "../../data/labels";
import { dateLabel } from "../../lib/dates";
import { useData } from "../../lib/useData";
import { useSettings } from "../../lib/settings";
import { Async } from "../../ui/async";
import { CategoryIcon } from "../../ui/CategoryIcon";
import { Auto, Button, Card, EmptyState, Field, InlineError, ListSkeleton, Tag } from "../../ui/primitives";
import { AdminShell, refreshAdminCounts } from "./AdminShell";
import { FilterBar, JOB_STATUS, Latin, Money, Spinner, useFlash } from "./parts";

const MIN_LENGTH = 3;
const MAX_LENGTH = 1000;

/** Days already worked were paid, so a job with any of them closes as completed, whichever way the dispute went. */
const workedDays = (dispute: AdminDispute) => dispute.days.filter((day) => day.status === "completed").length;
const closesAsCompleted = (dispute: AdminDispute) => dispute.completedAt !== null || workedDays(dispute) > 0;

function ResolveForm({ dispute, onDone, onCancel }: { dispute: AdminDispute; onDone: () => void; onCancel: () => void }) {
  const { t } = useSettings();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const worked = workedDays(dispute);

  const save = async () => {
    const trimmed = text.trim();
    if (trimmed.length < MIN_LENGTH) {
      setError(t("فیصلہ کم از کم 3 حروف کا ہو", "Faisla kam az kam 3 huroof ka ho", "Write at least 3 characters"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await data.adminResolveDispute(dispute.id, trimmed);
      onDone();
    } catch (err) {
      if (errorCode(err) === "INVALID_JOB_STATE") {
        setError(t("یہ شکایت پہلے ہی حل ہو چکی ہے", "Ye shikayat pehle hi hal ho chuki hai", "This dispute was already resolved"));
      } else {
        setError(errorText(err, t));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 space-y-2 border-t border-line pt-3">
      <Field label={t("فیصلہ", "Faisla", "Resolution")} htmlFor={`resolve-${dispute.id}`} hint={t("دونوں فریق کو کیا بتایا گیا اور کیا طے ہوا", "Dono fareeq ko kya bataya gaya aur kya tay hua", "What was decided and told to both sides")}>
        <textarea id={`resolve-${dispute.id}`} rows={3} dir="auto" maxLength={MAX_LENGTH} className="field resize-none" value={text} onChange={(event) => setText(event.target.value)} autoFocus />
      </Field>
      <p className="text-sm font-semibold text-soft">
        {closesAsCompleted(dispute)
          ? t(`یہ کام مکمل شمار ہوگا کیونکہ ${worked} دن کا کام ہو چکا ہے۔`, `Ye kaam mukammal shumar hoga kyunke ${worked} din ka kaam ho chuka hai.`, `This job will close as completed, because ${worked} ${worked === 1 ? "day was" : "days were"} already worked.`)
          : t("یہ کام منسوخ شمار ہوگا کیونکہ کوئی دن مکمل نہیں ہوا۔", "Ye kaam mansookh shumar hoga kyunke koi din mukammal nahi hua.", "This job will close as cancelled, because no day was worked.")}
      </p>
      {error && <InlineError>{error}</InlineError>}
      <div className="flex flex-wrap gap-2">
        <Button size="md" icon={saving ? Spinner : Check} disabled={saving} className="flex-1 sm:flex-none" onClick={() => void save()}>
          {t("فیصلہ محفوظ کریں", "Faisla mehfooz karein", "Save resolution")}
        </Button>
        <Button size="md" variant="ghost" disabled={saving} onClick={onCancel}>
          {t("رہنے دیں", "Rehne dein", "Cancel")}
        </Button>
      </div>
    </div>
  );
}

function DisputeCard({ dispute, category, resolving, onResolve, onCancel, onDone }: { dispute: AdminDispute; category?: Category; resolving: boolean; onResolve: () => void; onCancel: () => void; onDone: () => void }) {
  const { t, lang } = useSettings();
  const workers = dispute.workerNames.map((name) => personName(name, lang)).join("، ") || "—";
  const open = dispute.status === "disputed";
  const status = JOB_STATUS[dispute.status];
  const worked = workedDays(dispute);

  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sunken text-brand-700">
          <CategoryIcon name={category?.icon} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-bold">
            <Auto text={personName(dispute.customerName, lang)} /> <span className="font-normal text-soft">{t("اور", "aur", "and")}</span> <Auto text={workers} />
          </div>
          <div className="text-sm text-soft">
            {categoryName(category, lang) || "—"} · <Auto text={areaName(dispute.area, lang)} />
            {dispute.disputedAt && (
              <>
                {" "}
                · <Auto text={dateLabel(dispute.disputedAt, lang)} />
              </>
            )}
          </div>
        </div>
        <span className="shrink-0">
          <Tag tone={status.tone}>{t(status.ur, status.roman, status.en)}</Tag>
        </span>
      </div>

      <div className="mt-3 rounded-2xl bg-busy-50 px-3 py-2">
        <div className="text-sm font-bold text-busy-700">{t("شکایت", "Shikayat", "Complaint")}</div>
        <p dir="auto">
          <Auto text={dispute.disputeReason ? savedChoice(dispute.disputeReason, t) : "—"} />
        </p>
      </div>

      <dl className="m-0 mt-3 grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-soft">{t("فی دن", "Fi din", "Per day")}</dt>
          <dd className="m-0 font-bold">{dispute.agreedPrice !== null ? <Money value={dispute.agreedPrice} /> : "—"}</dd>
        </div>
        <div>
          <dt className="text-soft">{t("کیے گئے دن", "Kiye gaye din", "Days worked")}</dt>
          <dd className="m-0 font-bold">
            <Latin>{worked} / {dispute.durationDays}</Latin>
          </dd>
        </div>
        <div>
          <dt className="text-soft">{t("واجب", "Wajib", "Owed")}</dt>
          <dd className="m-0 font-bold">{dispute.totalPrice !== null ? <Money value={dispute.totalPrice} /> : "—"}</dd>
        </div>
      </dl>

      {dispute.disputeResolution && (
        <div className="mt-3 rounded-2xl bg-brand-50 px-3 py-2">
          <div className="flex items-center gap-1 text-sm font-bold text-brand-700">
            <CircleCheck className="h-4 w-4 shrink-0" aria-hidden />
            {t("فیصلہ", "Faisla", "Resolution")}
          </div>
          <p dir="auto">
            <Auto text={dispute.disputeResolution} />
          </p>
        </div>
      )}

      {open &&
        (resolving ? (
          <ResolveForm dispute={dispute} onCancel={onCancel} onDone={onDone} />
        ) : (
          <div className="mt-3">
            <Button size="md" variant="secondary" icon={Gavel} className="w-full sm:w-auto" onClick={onResolve}>
              {t("فیصلہ کریں", "Faisla karein", "Resolve")}
            </Button>
          </div>
        ))}
    </Card>
  );
}

export function AdminDisputes() {
  const { t } = useSettings();
  const disputes = useData(() => data.adminDisputes(), [], { reloadOn: ["job.updated"] });
  const categories = useData(() => data.listCategories({ all: true }), [], { reloadOn: ["categories.changed"] });
  const [tab, setTab] = useState<"open" | "resolved">("open");
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const { flash, flashNode } = useFlash();

  const categoryOf = useMemo(() => {
    const byId = new Map((categories.data ?? []).map((c) => [c.id, c]));
    return (dispute: AdminDispute) => byId.get(dispute.categoryId);
  }, [categories.data]);

  const list = disputes.data ?? [];
  const open = list.filter((dispute) => dispute.status === "disputed");
  const resolved = list.filter((dispute) => dispute.status !== "disputed");
  const shown = tab === "open" ? open : resolved;

  return (
    <AdminShell title={t("شکایات", "Shikayat", "Disputes")} subtitle={t("دونوں فریق کی بات سن کر فیصلہ لکھیں", "Dono fareeq ki baat sun kar faisla likhein", "Hear both sides, then record the decision")}>
      <Async query={disputes} skeleton={<ListSkeleton />}>
        {() => (
          <div className="space-y-3">
            <FilterBar
              label={t("فلٹر", "Filter", "Filter")}
              value={tab}
              onChange={setTab}
              options={[
                { value: "open", label: t("کھلی", "Khuli", "Open"), count: open.length },
                { value: "resolved", label: t("حل شدہ", "Hal shuda", "Resolved"), count: resolved.length },
              ]}
            />
            {shown.length === 0 ? (
              <EmptyState icon={Flag} title={tab === "open" ? t("کوئی کھلی شکایت نہیں", "Koi khuli shikayat nahi", "No open disputes") : t("ابھی کوئی شکایت حل نہیں ہوئی", "Abhi koi shikayat hal nahi hui", "No disputes resolved yet")} />
            ) : (
              <div className="stagger grid items-start gap-3 lg:grid-cols-2">
                {shown.map((dispute) => (
                  <DisputeCard
                    key={dispute.id}
                    dispute={dispute}
                    category={categoryOf(dispute)}
                    resolving={resolvingId === dispute.id}
                    onResolve={() => setResolvingId(dispute.id)}
                    onCancel={() => setResolvingId(null)}
                    onDone={() => {
                      setResolvingId(null);
                      disputes.reload();
                      refreshAdminCounts();
                      flash(t("فیصلہ محفوظ ہو گیا", "Faisla mehfooz ho gaya", "Resolution saved"));
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </Async>
      {flashNode}
    </AdminShell>
  );
}
