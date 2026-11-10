import { ChevronRight, Save, UserPlus, Users } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { data, type AgentLedgerSummary, type AppSettings } from "../../data";
import { errorText } from "../../data/errors";
import { personName, rupees, splitFee } from "../../data/labels";
import { dateLabel, clockLabel } from "../../lib/dates";
import { useData } from "../../lib/useData";
import { useSettings } from "../../lib/settings";
import { digitsOnly, isValidName, isValidPhone, toLatinDigits } from "../../lib/validate";
import { Async } from "../../ui/async";
import { Avatar } from "../../ui/people";
import { Auto, Button, Card, EmptyState, Field, InlineError, ListSkeleton, MockTag, SectionTitle, Skeleton, Tag, cx } from "../../ui/primitives";
import { AdminShell } from "./AdminShell";
import { Latin, MockNotice, Money, Spinner, Stat, phoneLabel, useFlash } from "./parts";

const sameNumber = (a: string, b: string) => digitsOnly(a).slice(-10) === digitsOnly(b).slice(-10);

function FeeSettings({ initial, onSaved }: { initial: AppSettings; onSaved: (message: string) => void }) {
  const { t } = useSettings();
  const [fee, setFee] = useState(String(initial.agentSignupFee));
  const [percent, setPercent] = useState(String(initial.agentSharePercent));
  const [errors, setErrors] = useState<{ fee?: string; percent?: string }>({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const feeNumber = Number(toLatinDigits(fee));
  const percentNumber = Number(toLatinDigits(percent));
  const feeOk = fee.trim() !== "" && Number.isInteger(feeNumber) && feeNumber >= 0 && feeNumber <= 1_000_000;
  const percentOk = percent.trim() !== "" && Number.isInteger(percentNumber) && percentNumber >= 0 && percentNumber <= 100;
  const preview = feeOk && percentOk ? splitFee({ agentSignupFee: feeNumber, agentSharePercent: percentNumber }) : null;
  const changed = feeNumber !== initial.agentSignupFee || percentNumber !== initial.agentSharePercent;

  const save = async () => {
    const next: typeof errors = {};
    if (!feeOk) next.fee = t("پورے روپے لکھیں، 0 یا زیادہ", "Poore rupay likhein, 0 ya zyada", "Enter whole rupees, 0 or more");
    if (!percentOk) next.percent = t("0 سے 100 تک لکھیں", "0 se 100 tak likhein", "Enter 0 to 100");
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSaving(true);
    setFailure(null);
    try {
      await data.adminSaveSettings({ agentSignupFee: feeNumber, agentSharePercent: percentNumber });
      onSaved(t("فیس محفوظ ہو گئی", "Fee mehfooz ho gayi", "Fee settings saved"));
    } catch (err) {
      setFailure(errorText(err, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <h2 className="text-lg">{t("ایجنٹ سائن اپ فیس", "Agent sign-up fee", "Agent sign-up fee")}</h2>
      <p className="text-sm text-soft">{t("خود سائن اپ ہمیشہ مفت ہے۔ یہ فیس صرف ایجنٹ کے ذریعے سائن اپ پر لگتی ہے۔", "Khud sign up hamesha muft hai. Ye fee sirf agent ke zariye sign up par lagti hai.", "Self-signup is always free. This fee applies only when an agent signs someone up.")}</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label={t("فیس (روپے)", "Fee (Rs)", "Fee (Rs)")} htmlFor="agent-fee" error={errors.fee}>
          <input id="agent-fee" inputMode="numeric" dir="ltr" className="field latin" value={fee} onChange={(event) => setFee(event.target.value)} />
        </Field>
        <Field label={t("ایجنٹ کا حصہ (%)", "Agent ka hissa (%)", "Agent share (%)")} htmlFor="agent-share" error={errors.percent}>
          <input id="agent-share" inputMode="numeric" dir="ltr" className="field latin" value={percent} onChange={(event) => setPercent(event.target.value)} />
        </Field>
      </div>
      {preview && (
        <p className="mt-2 text-sm text-soft">
          {t("ہر سائن اپ پر:", "Har sign up par:", "Each assisted sign-up:")} {t("ایجنٹ", "agent", "agent")} <b className="text-ink"><Money value={preview.agentShare} /></b> · {t("پلیٹ فارم", "platform", "platform")} <b className="text-ink"><Money value={preview.platformShare} /></b>
        </p>
      )}
      <p className="mt-1 text-sm text-soft">{t("نئی فیس صرف نئے سائن اپ پر لگے گی، پرانا حساب نہیں بدلے گا۔", "Nayi fee sirf naye sign up par lagegi, purana hisaab nahi badlega.", "Applies to new sign-ups only. Past ledger entries keep their amounts.")}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="md" icon={saving ? Spinner : Save} disabled={saving || !changed} onClick={() => void save()}>
          {t("محفوظ کریں", "Mehfooz karein", "Save")}
        </Button>
        <MockTag>{t("وصولی فرضی ہے", "Wasooli farzi hai", "Collection is mocked")}</MockTag>
      </div>
      {failure && (
        <div className="mt-2">
          <InlineError>{failure}</InlineError>
        </div>
      )}
    </Card>
  );
}

function AuthoriseAgent({ agents, onAdded }: { agents: AgentLedgerSummary[]; onAdded: (name: string) => void }) {
  const { t } = useSettings();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const add = async () => {
    const next: typeof errors = {};
    if (!isValidName(name)) next.name = t("ایجنٹ کا نام لکھیں", "Agent ka naam likhein", "Enter the agent's name");
    if (!isValidPhone(phone)) next.phone = t("درست نمبر لکھیں، جیسے 0300 1234567", "Durust number likhein, jaise 0300 1234567", "Enter a valid number, like 0300 1234567");
    else if (agents.some((agent) => sameNumber(agent.phone, phone))) next.phone = t("یہ نمبر پہلے سے ایجنٹ ہے", "Ye number pehle se agent hai", "This number is already an agent");
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    setFailure(null);
    try {
      // Authorising changes the account's role, so a worker's number must not be taken over by mistake.
      const workers = await data.adminWorkers();
      const clash = workers.find((worker) => sameNumber(worker.phone, phone));
      if (clash) {
        setErrors({ phone: t(`یہ نمبر کاریگر ${clash.name} کا ہے`, `Ye number kaarigar ${clash.name} ka hai`, `This number belongs to the worker ${clash.name}`) });
        return;
      }
      await data.adminAddAgent(name.trim(), toLatinDigits(phone).replace(/[\s-]/g, ""));
      setName("");
      setPhone("");
      onAdded(name.trim());
    } catch (err) {
      setFailure(errorText(err, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <h2 className="text-lg">{t("نیا ایجنٹ", "Naya agent", "Authorise a new agent")}</h2>
      <p className="text-sm text-soft">{t("اس نمبر سے لاگ اِن کرنے پر ایجنٹ کا سکرین کھلے گا۔", "Is number se login karne par agent ka screen khulega.", "Signing in with this number opens the field-agent screen.")}</p>
      <div className="mt-3 space-y-3">
        <Field label={t("ایجنٹ کا نام", "Agent ka naam", "Agent's name")} htmlFor="agent-name" error={errors.name}>
          <input id="agent-name" dir="auto" className="field" value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label={t("ایجنٹ کا فون", "Agent ka phone", "Agent's phone")} htmlFor="agent-phone" error={errors.phone}>
          <input id="agent-phone" inputMode="tel" dir="ltr" className="field latin" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="0300 1234567" />
        </Field>
        {failure && <InlineError>{failure}</InlineError>}
        <Button size="md" variant="secondary" icon={saving ? Spinner : UserPlus} className="w-full" disabled={saving} onClick={() => void add()}>
          {t("ایجنٹ بنائیں", "Agent banayein", "Authorise agent")}
        </Button>
      </div>
    </Card>
  );
}

function AgentFigure({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <span className={cx("min-w-0 text-sm text-soft lg:text-base", className)}>
      <span className="block truncate text-xs lg:hidden">{label}</span>
      {children}
    </span>
  );
}

function AgentRow({ agent }: { agent: AgentLedgerSummary }) {
  const { t, lang } = useSettings();
  return (
    <Link to={`/admin/agents/${agent.agentId}`} className={cx("grid items-center gap-x-4 gap-y-1 p-3 transition hover:bg-page", AGENT_COLUMNS)}>
      <span className="flex min-w-0 items-center gap-3">
        <Avatar name={agent.agentName} size={44} />
        <span className="min-w-0 flex-1">
          <span className="block break-words font-bold">
            <Auto text={personName(agent.agentName, lang)} />
          </span>
          <span className="block truncate text-sm text-soft">
            <Latin>{phoneLabel(agent.phone)}</Latin>
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-soft lg:hidden rtl:rotate-180" aria-hidden />
      </span>
      {/* Phones: four small figures in a row. Wide screens: each becomes a table column. */}
      <span className="grid grid-cols-4 gap-2 lg:contents">
        <AgentFigure label={t("سائن اپ", "Sign-ups", "Sign-ups")} className="lg:text-center">
          <Latin className="font-bold text-ink">{agent.signups}</Latin>
        </AgentFigure>
        <AgentFigure label={t("کل فیس", "Kul fee", "Total")}>
          <Money value={agent.totalFee} className="font-bold text-ink" />
        </AgentFigure>
        <AgentFigure label={t("ایجنٹ", "Agent", "Agent")}>
          <Money value={agent.agentShare} />
        </AgentFigure>
        <AgentFigure label={t("پلیٹ فارم", "Platform", "Platform")}>
          <Money value={agent.platformShare} />
        </AgentFigure>
      </span>
      <ChevronRight className="hidden h-5 w-5 shrink-0 justify-self-end text-soft lg:block rtl:rotate-180" aria-hidden />
    </Link>
  );
}

const AGENT_COLUMNS = "lg:grid-cols-[minmax(0,1.6fr)_5rem_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_1.5rem]";

export function AdminAgents() {
  const { t } = useSettings();
  const settings = useData(() => data.adminGetSettings(), []);
  const agents = useData(() => data.adminAgents(), []);
  const { flash, flashNode } = useFlash();

  const list = agents.data ?? [];
  const totals = list.reduce((sum, agent) => ({ signups: sum.signups + agent.signups, fee: sum.fee + agent.totalFee, agent: sum.agent + agent.agentShare, platform: sum.platform + agent.platformShare }), { signups: 0, fee: 0, agent: 0, platform: 0 });

  return (
    <AdminShell title={t("فیلڈ ایجنٹ", "Field agents", "Field agents")} subtitle={t("نئے ایجنٹ، فیس اور ہر ایجنٹ کا حساب", "Naye agent, fee aur har agent ka hisaab", "New agents, fee settings and each agent's ledger")}>
      <div className="space-y-3">
        <MockNotice />
        <div className="grid items-start gap-3 lg:grid-cols-2">
          <Async query={settings} skeleton={<Skeleton className="h-64" />}>
            {(value) => (
              <FeeSettings
                key={`${value.agentSignupFee}-${value.agentSharePercent}`}
                initial={value}
                onSaved={(message) => {
                  flash(message);
                  settings.reload();
                }}
              />
            )}
          </Async>
          <AuthoriseAgent
            agents={list}
            onAdded={(name) => {
              agents.reload();
              flash(t(`${name} اب ایجنٹ ہے`, `${name} ab agent hai`, `${name} is now an agent`));
            }}
          />
        </div>

        <SectionTitle>{t("حساب", "Hisaab", "Ledger")}</SectionTitle>
        <Async query={agents} skeleton={<ListSkeleton />}>
          {() => (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label={t("ایجنٹ کے سائن اپ", "Agent sign-ups", "Assisted sign-ups")} value={totals.signups} />
                <Stat label={t("کل فیس", "Kul fee", "Total fees")} value={rupees(totals.fee)} footer={<MockTag>{t("فرضی", "Farzi", "Mock")}</MockTag>} />
                <Stat label={t("ایجنٹوں کا حصہ", "Agents ka hissa", "Agents' share")} value={rupees(totals.agent)} />
                <Stat label={t("پلیٹ فارم کا حصہ", "Platform ka hissa", "Platform share")} value={rupees(totals.platform)} />
              </div>
              {list.length === 0 ? (
                <EmptyState icon={Users} title={t("ابھی کوئی ایجنٹ نہیں", "Abhi koi agent nahi", "No field agents yet")} body={t("اوپر سے پہلا ایجنٹ بنائیں", "Upar se pehla agent banayein", "Authorise the first agent above")} />
              ) : (
                <Card className="divide-y divide-line overflow-hidden p-0">
                  <div className={cx("hidden items-center gap-x-4 px-3 py-2 text-sm font-bold text-soft lg:grid", AGENT_COLUMNS)}>
                    <span>{t("ایجنٹ", "Agent", "Agent")}</span>
                    <span className="text-center">{t("سائن اپ", "Sign-ups", "Sign-ups")}</span>
                    <span>{t("کل فیس", "Kul fee", "Total fees")}</span>
                    <span>{t("ایجنٹ کا حصہ", "Agent ka hissa", "Agent share")}</span>
                    <span>{t("پلیٹ فارم", "Platform", "Platform")}</span>
                    <span />
                  </div>
                  {list.map((agent) => (
                    <AgentRow key={agent.agentId} agent={agent} />
                  ))}
                </Card>
              )}
            </>
          )}
        </Async>
      </div>
      {flashNode}
    </AdminShell>
  );
}

export function AdminAgentLedger() {
  const { t, lang } = useSettings();
  const { id = "" } = useParams();
  const ledger = useData(() => data.adminAgentLedger(id), [id]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  const name = ledger.data ? personName(ledger.data.summary.agentName, lang) : t("ایجنٹ کا حساب", "Agent ka hisaab", "Agent ledger");
  const phone = ledger.data ? <Latin>{phoneLabel(ledger.data.summary.phone)}</Latin> : undefined;

  return (
    <AdminShell title={<Auto text={name} />} subtitle={phone} back="/admin/agents">
      <div className="space-y-3">
        <MockNotice />
        <Async query={ledger} skeleton={<ListSkeleton />}>
          {(value) =>
            !value ? (
              <EmptyState icon={Users} title={t("یہ ایجنٹ نہیں ملا", "Ye agent nahi mila", "Agent not found")} />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Stat label={t("سائن اپ", "Sign-ups", "Sign-ups")} value={value.summary.signups} />
                  <Stat label={t("کل فیس", "Kul fee", "Total fees")} value={rupees(value.summary.totalFee)} />
                  <Stat label={t("ایجنٹ کا حصہ", "Agent ka hissa", "Agent share")} value={rupees(value.summary.agentShare)} />
                  <Stat label={t("پلیٹ فارم کا حصہ", "Platform ka hissa", "Platform share")} value={rupees(value.summary.platformShare)} />
                </div>

                <SectionTitle>{t("اندراج", "Indiraj", "Entries")}</SectionTitle>
                {value.entries.length === 0 ? (
                  <EmptyState icon={UserPlus} title={t("اس ایجنٹ نے ابھی کوئی سائن اپ نہیں کیا", "Is agent ne abhi koi sign up nahi kiya", "No sign-ups from this agent yet")} />
                ) : (
                  <Card className="divide-y divide-line overflow-hidden p-0">
                    {value.entries.map((entry) => (
                      <div key={entry.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 p-3 lg:flex-nowrap">
                        <div className="w-full min-w-0 lg:w-auto lg:flex-1">
                          <Link to={`/admin/workers?id=${entry.workerId}`} className="flex min-h-12 items-center break-words font-bold text-brand-700 hover:underline">
                            <Auto text={personName(entry.workerName, lang)} />
                          </Link>
                          <div className="text-sm text-soft">
                            {dateLabel(entry.createdAt, lang)} · <Latin>{clockLabel(entry.createdAt)}</Latin>
                          </div>
                        </div>
                        <div className="text-sm text-soft lg:w-32">
                          <div>{t("ایجنٹ", "Agent", "Agent")}</div>
                          <Money value={entry.agentShare} className="font-bold text-ink" />
                        </div>
                        <div className="text-sm text-soft lg:w-32">
                          <div>{t("پلیٹ فارم", "Platform", "Platform")}</div>
                          <Money value={entry.platformShare} className="font-bold text-ink" />
                        </div>
                        <div className="text-end lg:w-36">
                          <Money value={entry.fee} className="block font-extrabold" />
                          <Tag tone="plain">{t("فرضی وصولی", "Farzi wasooli", "Mock collected")}</Tag>
                        </div>
                      </div>
                    ))}
                  </Card>
                )}
              </>
            )
          }
        </Async>
      </div>
    </AdminShell>
  );
}
