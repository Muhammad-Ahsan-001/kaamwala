import { Ban, Briefcase, Check, ChevronRight, Flag, HardHat, Save, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { data, type AppSettings, type Job } from "../../data";
import { rupees, splitFee } from "../../data/labels";
import { useData } from "../../lib/useData";
import { isValidName, isValidPhone } from "../../lib/validate";
import { Async } from "../../ui/async";
import { Bars, type Bar } from "../../ui/Bars";
import { Avatar } from "../../ui/people";
import { Button, Card, EmptyState, Field, InlineError, ListSkeleton, MockTag, SectionTitle, Skeleton, Tag } from "../../ui/primitives";
import { AdminShell } from "./AdminShell";

const STATUS_TONE: Record<Job["status"], "brand" | "busy" | "plain"> = {
  open: "plain",
  requested: "plain",
  negotiating: "plain",
  pending_confirmation: "plain",
  engaged: "busy",
  completed: "brand",
  cancelled: "plain",
  disputed: "busy",
};

function Tile({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <Card>
      <div className="text-sm text-soft">{label}</div>
      <div className={`text-3xl font-extrabold tracking-tight ${tone ?? ""}`}>{value}</div>
    </Card>
  );
}

export function AdminDashboard() {
  const stats = useData(() => data.adminStats(), []);

  return (
    <AdminShell title="Dashboard">
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
        {(value) => {
          const bars: Bar[] = value.jobsByDay.map((day, index, all) => ({ key: day.date, label: new Date(day.date).toLocaleDateString("en-GB", { weekday: "short" }), value: day.count, display: String(day.count), emphasised: index === all.length - 1 }));
          return (
            <>
              <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Tile label="Farigh abhi" value={value.availableNow} tone="text-brand-600" />
                <Tile label="Engaged" value={value.engagedNow} tone="text-busy-500" />
                <Tile label="Jobs aaj" value={value.jobsToday} />
                <Tile label="Agent fees (week)" value={rupees(value.agentFeesWeek)} />
              </div>
              <Card className="mt-3">
                <h2 className="mb-2 text-base">Jobs per day, last 7 days</h2>
                <Bars bars={bars} title="Jobs per day, last 7 days" height={130} />
              </Card>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Link to="/admin/workers" className="flex items-center gap-3 rounded-3xl border border-line bg-surface p-4 transition active:scale-[0.99]">
                  <HardHat className="h-7 w-7 text-brand-600" aria-hidden />
                  <span className="flex-1 font-bold">{value.pendingWorkers} workers to approve</span>
                  <ChevronRight className="h-5 w-5 text-soft" aria-hidden />
                </Link>
                <Link to="/admin/disputes" className="flex items-center gap-3 rounded-3xl border border-line bg-surface p-4 transition active:scale-[0.99]">
                  <Flag className="h-7 w-7 text-busy-500" aria-hidden />
                  <span className="flex-1 font-bold">{value.disputes} open disputes</span>
                  <ChevronRight className="h-5 w-5 text-soft" aria-hidden />
                </Link>
              </div>
            </>
          );
        }}
      </Async>
    </AdminShell>
  );
}

export function AdminWorkers() {
  const workers = useData(() => data.adminWorkers(), []);
  const categories = useData(() => data.listCategories({ all: true }), []);
  const [decided, setDecided] = useState<Record<string, "approve" | "suspend">>({});
  const [failed, setFailed] = useState(false);

  const decide = (id: string, action: "approve" | "suspend") => {
    setFailed(false);
    setDecided((d) => ({ ...d, [id]: action }));
    data.adminSetWorkerState(id, action).catch(() => {
      setFailed(true);
      setDecided(({ [id]: _removed, ...rest }) => rest);
    });
  };

  const label = (id: string) => categories.data?.find((c) => c.id === id)?.nameEn ?? "";

  return (
    <AdminShell title="Workers">
      {failed && (
        <div className="mb-3">
          <InlineError>That change could not be saved. Please try again.</InlineError>
        </div>
      )}
      <Async query={workers} skeleton={<ListSkeleton />}>
        {(list) =>
          list.length === 0 ? (
            <EmptyState icon={HardHat} title="No workers yet" />
          ) : (
            <div className="stagger grid gap-3 lg:grid-cols-2">
              {list.map((worker) => {
                const decision = decided[worker.id];
                return (
                  <Card key={worker.id}>
                    <div className="flex items-center gap-3">
                      <Avatar name={worker.name} url={worker.photoUrl} size={48} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-bold">{worker.name}</div>
                        <div className="text-sm text-soft">
                          {label(worker.categoryIds[0] ?? "")} · {worker.area} · {worker.phone}
                        </div>
                      </div>
                      {worker.approved && !decision && <Tag>Approved</Tag>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Tag tone="plain">{worker.cnicDuplicateChecked ? "CNIC hash: no duplicate" : "No CNIC yet"}</Tag>
                      {worker.createdByAgent && <Tag tone="plain">Added by {worker.createdByAgent}</Tag>}
                    </div>
                    {decision ? (
                      <p className="mt-2 font-bold text-soft">{decision === "approve" ? "Approved" : "Suspended"}</p>
                    ) : (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {!worker.approved && (
                          <Button size="md" icon={Check} onClick={() => decide(worker.id, "approve")}>
                            Approve
                          </Button>
                        )}
                        <Button size="md" variant="secondary" icon={Ban} className={worker.approved ? "col-span-2" : undefined} onClick={() => decide(worker.id, "suspend")}>
                          Suspend
                        </Button>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )
        }
      </Async>
    </AdminShell>
  );
}

export function AdminJobs() {
  const jobs = useData(() => data.adminJobs(), []);
  const categories = useData(() => data.listCategories({ all: true }), []);
  const label = (id: string) => categories.data?.find((c) => c.id === id)?.nameEn ?? "";

  return (
    <AdminShell title="Jobs">
      <Async query={jobs} skeleton={<ListSkeleton />}>
        {(list) =>
          list.length === 0 ? (
            <EmptyState icon={Briefcase} title="No jobs yet" />
          ) : (
            <Card className="divide-y divide-line p-0">
              {list.map((job) => (
                <div key={job.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <div className="font-bold">{label(job.categoryId)}</div>
                    <div className="text-sm text-soft">
                      {job.mode} · {job.area} · {job.durationDays} {job.durationDays === 1 ? "day" : "days"}
                      {job.agreedPrice ? ` · ${rupees(job.agreedPrice)}/day` : ""}
                    </div>
                  </div>
                  <Tag tone={STATUS_TONE[job.status]}>{job.status.replace("_", " ")}</Tag>
                </div>
              ))}
            </Card>
          )
        }
      </Async>
    </AdminShell>
  );
}

export function AdminDisputes() {
  const disputes = useData(() => data.adminDisputes(), []);
  return (
    <AdminShell title="Disputes">
      <Async query={disputes} skeleton={<ListSkeleton />}>
        {(list) =>
          list.length === 0 ? (
            <EmptyState icon={Flag} title="No open disputes" />
          ) : (
            <div className="stagger space-y-3">
              {list.map((dispute) => (
                <Card key={dispute.id}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-bold">
                      <Flag className="h-5 w-5 text-busy-500" aria-hidden />
                      {dispute.customerName} and {dispute.workerName}
                    </span>
                    <span className="shrink-0 font-bold">{rupees(dispute.agreedPrice)}</span>
                  </div>
                  <p className="mt-1 text-soft">{dispute.reason}</p>
                </Card>
              ))}
            </div>
          )
        }
      </Async>
    </AdminShell>
  );
}

function FeeSettings({ initial, onSaved }: { initial: AppSettings; onSaved: () => void }) {
  const [fee, setFee] = useState(String(initial.agentSignupFee));
  const [percent, setPercent] = useState(String(initial.agentSharePercent));
  const [errors, setErrors] = useState<{ fee?: string; percent?: string }>({});
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<"idle" | "saved" | "failed">("idle");

  const feeNumber = Number(fee);
  const percentNumber = Number(percent);
  const valid = Number.isInteger(feeNumber) && feeNumber >= 0 && Number.isInteger(percentNumber) && percentNumber >= 0 && percentNumber <= 100;
  const preview = valid ? splitFee({ agentSignupFee: feeNumber, agentSharePercent: percentNumber }) : null;

  const save = async () => {
    const next: typeof errors = {};
    if (!Number.isInteger(feeNumber) || feeNumber < 0) next.fee = "Enter a whole number, 0 or more.";
    if (!Number.isInteger(percentNumber) || percentNumber < 0 || percentNumber > 100) next.percent = "Enter a percentage from 0 to 100.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSaving(true);
    setState("idle");
    try {
      await data.adminSaveSettings({ agentSignupFee: feeNumber, agentSharePercent: percentNumber });
      setState("saved");
      onSaved();
    } catch {
      setState("failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <h2 className="text-lg">Agent signup fee</h2>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <Field label="Fee (Rs)" htmlFor="fee" error={errors.fee}>
          <input id="fee" inputMode="numeric" className="field" value={fee} onChange={(e) => setFee(e.target.value)} />
        </Field>
        <Field label="Agent share (%)" htmlFor="share" error={errors.percent}>
          <input id="share" inputMode="numeric" className="field" value={percent} onChange={(e) => setPercent(e.target.value)} />
        </Field>
      </div>
      {preview && (
        <p className="mt-2 text-sm text-soft">
          Each assisted signup: agent keeps <b className="text-ink">{rupees(preview.agentShare)}</b>, platform keeps <b className="text-ink">{rupees(preview.platformShare)}</b>.
        </p>
      )}
      <p className="mt-1 text-sm text-soft">Self-signup is always free.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="md" icon={Save} disabled={saving} onClick={() => void save()}>
          Save
        </Button>
        <MockTag>Collection is mocked</MockTag>
        {state === "saved" && <span className="font-bold text-brand-700">Saved</span>}
      </div>
      {state === "failed" && (
        <div className="mt-2">
          <InlineError>Could not save the settings.</InlineError>
        </div>
      )}
    </Card>
  );
}

export function AdminAgents() {
  const settings = useData(() => data.adminGetSettings(), []);
  const agents = useData(() => data.adminAgents(), []);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [saving, setSaving] = useState(false);

  const add = async () => {
    const next: typeof errors = {};
    if (!isValidName(name)) next.name = "Enter the agent's name.";
    if (!isValidPhone(phone)) next.phone = "Enter a valid number, like 0300 1234567.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSaving(true);
    try {
      await data.adminAddAgent(name.trim(), phone.trim());
      setName("");
      setPhone("");
      agents.reload();
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminShell title="Field agents">
      <div className="grid gap-3 lg:grid-cols-2">
        <Async query={settings} skeleton={<Skeleton className="h-56" />}>
          {(value) => <FeeSettings initial={value} onSaved={settings.reload} />}
        </Async>
        <Card>
          <h2 className="text-lg">Authorise an agent</h2>
          <div className="mt-2 space-y-3">
            <Field label="Agent name" htmlFor="agent-name" error={errors.name}>
              <input id="agent-name" className="field" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Agent phone" htmlFor="agent-phone" error={errors.phone}>
              <input id="agent-phone" inputMode="tel" className="field" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0300 1234567" />
            </Field>
            <Button size="md" variant="secondary" icon={UserPlus} className="w-full" disabled={saving} onClick={() => void add()}>
              Authorise agent
            </Button>
          </div>
        </Card>
      </div>

      <SectionTitle>Agents</SectionTitle>
      <Async query={agents} skeleton={<ListSkeleton />}>
        {(list) =>
          list.length === 0 ? (
            <EmptyState icon={Users} title="No field agents yet" />
          ) : (
            <Card className="divide-y divide-line p-0">
              {list.map((agent) => (
                <Link key={agent.agentId} to={`/admin/agents/${agent.agentId}`} className="flex items-center gap-3 p-3 transition hover:bg-page">
                  <Avatar name={agent.agentName} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{agent.agentName}</span>
                    <span className="block text-sm text-soft">{agent.signups} signups · agent {rupees(agent.agentShare)} · platform {rupees(agent.platformShare)}</span>
                  </span>
                  <span className="shrink-0 font-extrabold">{rupees(agent.totalFee)}</span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-soft" aria-hidden />
                </Link>
              ))}
            </Card>
          )
        }
      </Async>
    </AdminShell>
  );
}

export function AdminAgentLedger() {
  const { id = "" } = useParams();
  const ledger = useData(() => data.adminAgentLedger(id), [id]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  return (
    <AdminShell title={ledger.data?.summary.agentName ?? "Agent ledger"} action={<MockTag>Collection is mocked</MockTag>}>
      <Async query={ledger} skeleton={<ListSkeleton />}>
        {(value) =>
          !value ? (
            <EmptyState icon={Users} title="Agent not found" />
          ) : (
            <>
              <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Tile label="Signups" value={value.summary.signups} />
                <Tile label="Total fees" value={rupees(value.summary.totalFee)} />
                <Tile label="Agent share" value={rupees(value.summary.agentShare)} />
                <Tile label="Platform share" value={rupees(value.summary.platformShare)} />
              </div>
              <SectionTitle>Entries</SectionTitle>
              {value.entries.length === 0 ? (
                <EmptyState icon={UserPlus} title="No signups yet" />
              ) : (
                <Card className="divide-y divide-line p-0">
                  {value.entries.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate font-bold">{entry.workerName}</div>
                        <div className="text-sm text-soft">
                          {new Date(entry.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · agent {rupees(entry.agentShare)} · platform {rupees(entry.platformShare)}
                        </div>
                      </div>
                      <div className="shrink-0 text-end">
                        <div className="font-extrabold">{rupees(entry.fee)}</div>
                        <div className="text-xs text-soft">Mock collected</div>
                      </div>
                    </div>
                  ))}
                </Card>
              )}
            </>
          )
        }
      </Async>
    </AdminShell>
  );
}
