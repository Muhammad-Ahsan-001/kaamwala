/**
 * End-to-end checks against a running API over real HTTP and WebSocket.
 * Run on a freshly seeded dev database: pnpm db:seed, start the server, then pnpm e2e.
 */
import type { Job, WorkerCard, WsEvent } from "@kaamwala/contracts";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.E2E_BASE ?? "http://127.0.0.1:3002";
const API = `${BASE}/v1`;
const G9 = { lat: 33.6885, lng: 73.0345 };
const prisma = new PrismaClient();

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}${detail === undefined ? "" : ` -> ${JSON.stringify(detail).slice(0, 400)}`}`);
  }
}

const section = (name: string) => console.log(`\n# ${name}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Res<T = any> {
  status: number;
  body: T;
}

async function api<T = any>(
  method: string,
  path: string,
  options: { token?: string; body?: unknown; form?: FormData } = {},
): Promise<Res<T>> {
  const headers: Record<string, string> = {};
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: options.form ?? (options.body !== undefined ? JSON.stringify(options.body) : null),
  });
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as T) : (null as T) };
}

interface Session {
  token: string;
  userId: string;
  workerId: string | null;
}

async function login(phone: string, role?: string): Promise<Session> {
  const otp = await api("POST", "/auth/otp/request", { body: { phone } });
  const res = await api("POST", "/auth/otp/verify", { body: { phone, otp: otp.body.devOtp, role } });
  if (res.status !== 200) throw new Error(`login failed for ${phone}: ${JSON.stringify(res.body)}`);
  return { token: res.body.token, userId: res.body.user.id, workerId: res.body.user.workerId };
}

const searchIds = async (query: string) =>
  ((await api("GET", `/workers?lat=${G9.lat}&lng=${G9.lng}&radiusKm=60&${query}`)).body.items as WorkerCard[]).map(
    (w) => w.id,
  );

const statusOf = async (id: string) => (await api<WorkerCard>("GET", `/workers/${id}`)).body.status;

class Listener {
  events: WsEvent[] = [];
  private socket: WebSocket;

  constructor(token?: string) {
    this.socket = new WebSocket(`${BASE.replace("http", "ws")}/v1/ws${token ? `?token=${token}` : ""}`);
    this.socket.onmessage = (e) => this.events.push(JSON.parse(String(e.data)) as WsEvent);
  }

  ready() {
    return new Promise<void>((resolve, reject) => {
      this.socket.onopen = () => setTimeout(resolve, 150);
      this.socket.onerror = () => reject(new Error("websocket failed"));
    });
  }

  async sawStatus(workerId: string, status: string, timeoutMs = 3000) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      if (this.events.some((e) => e.type === "worker.status" && e.workerId === workerId && e.status === status)) return true;
      await sleep(25);
    }
    return false;
  }

  close() {
    this.socket.close();
  }
}

const jobBody = (extra: Record<string, unknown>) => ({
  categoryId: "electrician",
  description: "Pankha theek karna hai",
  area: "G-9",
  location: G9,
  ...extra,
});

/** A finished booking from negotiating onwards. */
async function agreeAndEngage(job: Job, customer: Session, worker: Session) {
  const card = await api<Job>("POST", `/jobs/${job.id}/card`, { token: customer.token });
  const first = await api<Job>("POST", `/jobs/${job.id}/confirm`, { token: customer.token });
  const second = await api<Job>("POST", `/jobs/${job.id}/confirm`, { token: worker.token });
  return { card, first, second };
}

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const audioForm = (extra: Record<string, string> = {}) => {
  const form = new FormData();
  form.append("audio", new Blob([Buffer.alloc(2048, 7)], { type: "audio/webm;codecs=opus" }), "note.webm");
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  return form;
};
const imageForm = () => {
  const form = new FormData();
  form.append("image", new Blob([PNG], { type: "image/png" }), "photo.png");
  return form;
};

async function main() {
  const anon = new Listener();
  await anon.ready();

  section("Health and auth");
  const health = (await fetch(`${BASE}/healthz`).then((r) => r.json())) as { ok: boolean; gemini: boolean };
  check("healthz responds", health.ok === true, health);
  check("Gemini reported as not configured", health.gemini === false, health);

  const otp = await api("POST", "/auth/otp/request", { body: { phone: "0300 7654321" } });
  check("OTP request returns the disclosed mock code", /^\d{6}$/.test(otp.body.devOtp) && otp.body.mocked === true, otp.body);
  const wrong = await api("POST", "/auth/otp/verify", { body: { phone: "03007654321", otp: "000000" } });
  check("wrong OTP is rejected", wrong.status === 401, wrong);
  const good = await api("POST", "/auth/otp/verify", {
    body: { phone: "03007654321", otp: otp.body.devOtp, role: "customer" },
  });
  check("correct OTP signs in and normalises the phone", good.status === 200 && good.body.user.phone === "+923007654321", good.body);
  const replay = await api("POST", "/auth/otp/verify", { body: { phone: "03007654321", otp: otp.body.devOtp } });
  check("OTP cannot be reused", replay.status === 401, replay);
  const noToken = await api("GET", "/me");
  check("protected route needs a token", noToken.status === 401 && noToken.body.error.code === "UNAUTHORIZED", noToken);
  const staff = await login("+923001112233", "admin");
  const staffMe = await api("GET", "/me", { token: staff.token });
  check("self-registration cannot claim the admin role", staffMe.body.user.role === "customer", staffMe.body);

  section("Typed sign-up");
  const customer = await login("+923007000001", "customer");
  const typedCustomer = await api("POST", "/customers", {
    token: customer.token,
    body: { name: "Rabia Anwar", area: "G-9" },
  });
  check("customer signs up by typing", typedCustomer.status === 201 && typedCustomer.body.name === "Rabia Anwar", typedCustomer);

  const workerSession = await login("+923007000002", "worker");
  const badTrade = await api("POST", "/workers", {
    token: workerSession.token,
    body: { name: "Test", area: "G-9", trade: "qwerty zxcv" },
  });
  check("unknown typed trade asks for the picker", badTrade.status === 422 && badTrade.body.error.code === "TRADE_NOT_RECOGNISED", badTrade);
  const typed = await api<WorkerCard>("POST", "/workers", {
    token: workerSession.token,
    body: { name: "Sajjad Hussain", area: "g 9", trade: "bijli ka kaam, pankha theek karta hoon", years: 6, rate: 1500 },
  });
  check("worker signs up by typing, with no audio", typed.status === 201, typed);
  check("typed trade is normalised by Jev", typed.body.categoryIds?.[0] === "electrician", typed.body);
  check("typed trade gives skills", typed.body.skills?.includes("Fan repair"), typed.body.skills);
  check("area resolves to coordinates", typed.body.area === "G-9" && typed.body.location.lat > 33, typed.body);
  const worker: Session = { ...workerSession, workerId: typed.body.id };
  const twice = await api("POST", "/workers", {
    token: worker.token,
    body: { name: "Sajjad Hussain", area: "G-9", trade: "electrician" },
  });
  check("a phone can register only once", twice.status === 409 && twice.body.error.code === "ALREADY_REGISTERED", twice);

  const urduWorker = await login("+923007000003", "worker");
  const urdu = await api<WorkerCard>("POST", "/workers", {
    token: urduWorker.token,
    body: { name: "علی احمد", area: "صدر", trade: "پلمبر، نلکا ٹھیک کرتا ہوں" },
  });
  check("trade typed in Urdu script works", urdu.status === 201 && urdu.body.categoryIds[0] === "plumber", urdu.body);
  check("Urdu area resolves", urdu.body.area === "Saddar", urdu.body.area);
  check("missing rate falls back to the category floor", urdu.body.rate === 500, urdu.body.rate);

  const edit = await api<WorkerCard>("PATCH", "/workers/me", { token: urduWorker.token, body: { rate: 900 } });
  check("one field can be re-entered", edit.status === 200 && edit.body.rate === 900, edit);

  const draft = await api("POST", "/ai/onboard", {
    token: worker.token,
    body: { text: "Mera naam Imran Khan hai, main electrician hoon, 7 saal ka tajurba, G-9, 1500 rupay" },
  });
  check("typed onboarding text returns a draft", draft.status === 200 && draft.body.categoryIds[0] === "electrician", draft.body);
  check("draft says Jev produced it, not Gemini", draft.body.source === "jev_only", draft.body.source);
  check("draft reads the fields", draft.body.name === "Imran Khan" && draft.body.years === 7 && draft.body.rate === 1500 && draft.body.area === "G-9", draft.body);
  const line = await api("POST", "/ai/tts-text", { token: worker.token, body: { draft: draft.body } });
  check("read-back line is Urdu", line.status === 200 && line.body.text.includes("امران") === false && line.body.text.includes("سال"), line.body);

  section("Agent sign-up");
  const agent = await login("+923000000002");
  const notAgent = await api("POST", "/workers", {
    token: worker.token,
    body: { name: "Someone", area: "G-9", trade: "plumber", forPhone: "03007000099" },
  });
  check("only agents can register for someone else", notAgent.status === 403, notAgent);
  const byAgent = await api<WorkerCard>("POST", "/workers", {
    token: agent.token,
    body: { name: "Rafiq Masih", area: "I-8", trade: "mistri", forPhone: "03007000004", years: 20 },
  });
  check("agent creates a worker by typing", byAgent.status === 201 && byAgent.body.categoryIds[0] === "mistri", byAgent);
  const agentNoPhone = await api("POST", "/workers", { token: agent.token, body: { name: "X Y", area: "G-9", trade: "mistri" } });
  check("agent must give the worker's phone", agentNoPhone.status === 422, agentNoPhone);

  section("Field-agent fees (payment collection is mocked)");
  const entryFor = (workerId: string) => prisma.agentLedgerEntry.findUnique({ where: { workerId } });
  const ledgerCount = () => prisma.agentLedgerEntry.count();
  const agentSignup = (body: Record<string, unknown>) =>
    api<WorkerCard>("POST", "/workers", { token: agent.token, body: { area: "I-8", trade: "mistri", ...body } });

  const publicSettings = await api("GET", "/settings/public");
  check("fee settings are public, 200 at 40%", publicSettings.body.agentSignupFee === 200 && publicSettings.body.agentSharePercent === 40, publicSettings.body);
  check("self-signup creates no ledger entry", (await entryFor(worker.workerId as string)) === null);
  check("second self-signup creates no ledger entry", (await entryFor(urdu.body.id)) === null);
  const firstEntry = await entryFor(byAgent.body.id);
  check(
    "agent signup creates one entry with the right split",
    firstEntry?.fee === 200 && firstEntry.agentShare === 80 && firstEntry.platformShare === 120 && firstEntry.paymentStatus === "mock_collected" && firstEntry.seeded === false,
    firstEntry,
  );
  check("exactly one entry exists for that worker", (await prisma.agentLedgerEntry.count({ where: { workerId: byAgent.body.id } })) === 1);
  check("agent-created worker has not done OTP yet", byAgent.body.phoneChecked === false, byAgent.body.phoneChecked);
  check("agent-created worker has no CNIC on file yet", byAgent.body.cnicChecked === false, byAgent.body.cnicChecked);

  for (const [name, res] of [
    ["customer GET", await api("GET", "/admin/settings", { token: customer.token })],
    ["worker PATCH", await api("PATCH", "/admin/settings", { token: worker.token, body: { agentSignupFee: 1 } })],
    ["agent PATCH", await api("PATCH", "/admin/settings", { token: agent.token, body: { agentSharePercent: 100 } })],
  ] as const) {
    check(`non-admin gets 403 on admin settings (${name})`, res.status === 403, res);
  }
  const anonSettings = await api("GET", "/admin/settings");
  check("anonymous caller gets 401 on admin settings", anonSettings.status === 401, anonSettings);
  const customerSignsOthers = await api("POST", "/workers", {
    token: customer.token,
    body: { name: "Nobody Here", area: "I-8", trade: "mistri", forPhone: "03007000020" },
  });
  check("a customer cannot do an agent signup", customerSignsOthers.status === 403, customerSignsOthers);

  const count0 = await ledgerCount();
  const duplicatePhone = await agentSignup({ name: "Rafiq Masih", forPhone: "03007000004" });
  check("duplicate signup is refused", duplicatePhone.status === 409 && (duplicatePhone.body as any).error.code === "ALREADY_REGISTERED", duplicatePhone);
  check("duplicate signup leaves no ledger entry", (await ledgerCount()) === count0);

  await api("POST", "/workers/me/cnic", { token: worker.token, body: { cnic: "61101-1234567-1" } });
  const blockedCnic = await agentSignup({ name: "Blocked Person", forPhone: "03007000010", cnic: "6110112345671" });
  check("CNIC duplicate blocks the signup", blockedCnic.status === 409 && (blockedCnic.body as any).error.code === "CNIC_DUPLICATE", blockedCnic);
  check("CNIC block leaves no ledger entry", (await ledgerCount()) === count0);
  check("CNIC block leaves no user behind", (await prisma.user.count({ where: { phone: "+923007000010" } })) === 0);
  const badAgentCnic = await agentSignup({ name: "Bad Cnic", forPhone: "03007000012", cnic: "123" });
  check("malformed CNIC blocks the signup with no entry", badAgentCnic.status === 422 && (await ledgerCount()) === count0, badAgentCnic);

  const lateDup = await agentSignup({ name: "Late Duplicate", forPhone: "03007000011" });
  check("signup before the CNIC check records one entry", lateDup.status === 201 && (await ledgerCount()) === count0 + 1, lateDup);
  const lateCheck = await api("POST", `/workers/me/cnic?forWorkerId=${lateDup.body.id}`, {
    token: agent.token,
    body: { cnic: "61101-1234567-1" },
  });
  check("a later CNIC check still catches the duplicate", lateCheck.status === 409 && lateCheck.body.error.code === "CNIC_DUPLICATE", lateCheck);
  check("that entry is removed", (await ledgerCount()) === count0);
  check("that profile is removed", (await api("GET", `/workers/${lateDup.body.id}`)).status === 404);

  const withCnic = await agentSignup({ name: "Karim Bakhsh", forPhone: "03007000013", cnic: "61101-7654321-3" });
  check("signup with a good CNIC succeeds", withCnic.status === 201 && withCnic.body.cnicChecked === true, withCnic.body);
  const agentWorkerLogin = await login("+923007000013");
  const afterOtp = await api<WorkerCard>("GET", `/workers/${agentWorkerLogin.workerId}`);
  check("phone is marked checked once OTP completes", afterOtp.body.phoneChecked === true, afterOtp.body.phoneChecked);
  const keptEntry = await entryFor(withCnic.body.id);
  check("OTP sign-in does not add another entry", keptEntry?.fee === 200 && (await ledgerCount()) === count0 + 1, keptEntry);

  section("Admin fee settings");
  const adminForSettings = await login("+923000000001");
  const initialSettings = await api("GET", "/admin/settings", { token: adminForSettings.token });
  check("admin reads settings", initialSettings.status === 200 && initialSettings.body.agentSharePercent === 40, initialSettings.body);
  for (const [name, body] of [
    ["percent above 100", { agentSharePercent: 150 }],
    ["negative percent", { agentSharePercent: -1 }],
    ["negative fee", { agentSignupFee: -1 }],
    ["fractional fee", { agentSignupFee: 10.5 }],
    ["unknown field", { somethingElse: 1 }],
  ] as const) {
    const res = await api("PATCH", "/admin/settings", { token: adminForSettings.token, body });
    check(`settings reject ${name}`, res.status === 400, res);
  }
  const changed = await api("PATCH", "/admin/settings", {
    token: adminForSettings.token,
    body: { agentSignupFee: 350, agentSharePercent: 33 },
  });
  check("admin changes the fee and share", changed.status === 200 && changed.body.agentSignupFee === 350 && changed.body.agentSharePercent === 33, changed.body);
  const oldEntry = await entryFor(byAgent.body.id);
  check(
    "a settings change does not alter old entries",
    oldEntry?.fee === 200 && oldEntry.agentShare === 80 && oldEntry.platformShare === 120,
    oldEntry,
  );
  const repriced = await agentSignup({ name: "Fee Changed", forPhone: "03007000014" });
  const repricedEntry = await entryFor(repriced.body.id);
  check(
    "a new signup uses the new settings, rounded, adding up",
    repricedEntry?.fee === 350 && repricedEntry.agentShare === 116 && repricedEntry.platformShare === 234,
    repricedEntry,
  );
  const zero = await api("PATCH", "/admin/settings", { token: adminForSettings.token, body: { agentSignupFee: 200, agentSharePercent: 40 } });
  check("settings can be restored one call", zero.body.agentSignupFee === 200 && zero.body.agentSharePercent === 40, zero.body);

  const summaries = await api("GET", "/admin/agents", { token: adminForSettings.token });
  const bashir = summaries.body.items.find((s: any) => s.phone === "+923000000002");
  const bashirEntries = await prisma.agentLedgerEntry.findMany({ where: { agentId: agent.userId } });
  check("summary counts every signup", bashir.signups === bashirEntries.length, [bashir, bashirEntries.length]);
  check("summary totals match the ledger", bashir.totalFee === bashirEntries.reduce((s, e) => s + e.fee, 0) && bashir.agentShare + bashir.platformShare === bashir.totalFee, bashir);
  check("summary has the contract's fields", ["agentId", "agentName", "phone", "signups", "totalFee", "agentShare", "platformShare"].every((k) => k in bashir), Object.keys(bashir));
  const week = await api("GET", "/admin/agents?days=7", { token: adminForSettings.token });
  const bashirWeek = week.body.items.find((s: any) => s.phone === "+923000000002");
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  check("?days=7 covers one week only", bashirWeek.signups === bashirEntries.filter((e) => e.createdAt >= since).length && bashirWeek.signups < bashir.signups, [bashirWeek.signups, bashir.signups]);
  const badDays = await api("GET", "/admin/agents?days=0", { token: adminForSettings.token });
  check("invalid days is refused", badDays.status === 400, badDays);
  const ledger = await api("GET", `/admin/agents/${agent.userId}/ledger`, { token: adminForSettings.token });
  check("ledger returns summary and entries", ledger.status === 200 && ledger.body.entries.length === bashirEntries.length && ledger.body.summary.agentId === agent.userId, ledger.status);
  const shape = ledger.body.entries[0];
  check(
    "ledger entry has the contract's fields, marked mock_collected",
    ["id", "agentId", "agentName", "workerId", "workerName", "fee", "agentShare", "platformShare", "paymentStatus", "createdAt"].every((k) => k in shape) && shape.paymentStatus === "mock_collected",
    shape,
  );
  check("seeded entries are flagged as seeded", bashirEntries.filter((e) => e.seeded).length === 8, bashirEntries.filter((e) => e.seeded).length);
  const nonAgentLedger = await api("GET", `/admin/agents/${customer.userId}/ledger`, { token: adminForSettings.token });
  check("ledger is 404 for someone who is not an agent", nonAgentLedger.status === 404, nonAgentLedger);
  const ledgerForbidden = await api("GET", `/admin/agents/${agent.userId}/ledger`, { token: agent.token });
  check("non-admin gets 403 on the ledger", ledgerForbidden.status === 403, ledgerForbidden);
  const summariesForbidden = await api("GET", "/admin/agents", { token: agent.token });
  check("non-admin gets 403 on summaries", summariesForbidden.status === 403, summariesForbidden);

  section("Discovery");
  const search = await api("GET", `/workers?lat=${G9.lat}&lng=${G9.lng}&radiusKm=30&q=${encodeURIComponent("mera pankha kharab hai")}`);
  check("search by Roman Urdu problem finds workers", search.body.items.length > 0 && search.body.detected.categoryId === "electrician", search.body.detected);
  check("search includes the new typed worker", search.body.items.some((w: WorkerCard) => w.id === worker.workerId));
  check("results carry distance", search.body.items.every((w: WorkerCard) => typeof w.distanceKm === "number"));
  check("results are all available", search.body.items.every((w: WorkerCard) => w.status === "available"));
  const distances = search.body.items.map((w: WorkerCard) => Math.round((w.distanceKm as number) * 2));
  check("sorted by distance band", distances.every((d: number, i: number) => i === 0 || d >= distances[i - 1]), distances);
  const urduSearch = await api("GET", `/workers?q=${encodeURIComponent("نلکا خراب ہے")}`);
  check("search in Urdu script works", urduSearch.body.detected?.categoryId === "plumber", urduSearch.body.detected);
  const far = await api("GET", `/workers?lat=24.86&lng=67.0&radiusKm=10`);
  check("radius excludes distant workers", far.body.items.length === 0, far.body.items.length);
  const problem = await api("POST", "/ai/problem", { token: customer.token, body: { text: "AC thanda nahi kar raha foran chahiye" } });
  check("typed problem detects trade and urgency", problem.body.categoryId === "ac-technician" && problem.body.urgency === "urgent", problem.body);
  check("price estimate respects the floor", problem.body.priceMin >= 1000 && problem.body.priceMax >= problem.body.priceMin, problem.body);
  check("problem result is labelled jev_only", problem.body.source === "jev_only", problem.body.source);

  section("Direct booking, end to end");
  const customerWs = new Listener(customer.token);
  await customerWs.ready();
  const direct = await api<Job>("POST", "/jobs", {
    token: customer.token,
    body: jobBody({ mode: "direct", workerId: worker.workerId, proposedPrice: 550 }),
  });
  check("direct request is created", direct.status === 201 && direct.body.status === "requested", direct);
  check("status reaches anonymous map clients live", await anon.sawStatus(worker.workerId as string, "requested"));
  check("requested worker leaves search", !(await searchIds("categoryId=electrician")).includes(worker.workerId as string));

  const secondCustomer = await login("+923200000002");
  const blocked = await api("POST", "/jobs", {
    token: secondCustomer.token,
    body: jobBody({ mode: "direct", workerId: worker.workerId }),
  });
  check("a second customer cannot request a busy worker", blocked.status === 409 && blocked.body.error.code === "WORKER_NOT_AVAILABLE", blocked);

  const belowFloor = await api("POST", "/jobs", {
    token: customer.token,
    body: jobBody({ mode: "open", proposedPrice: 100 }),
  });
  check("job below the floor is refused", belowFloor.status === 422 && belowFloor.body.error.code === "BELOW_FLOOR", belowFloor);

  const stranger = await api("POST", `/jobs/${direct.body.id}/accept`, { token: secondCustomer.token });
  check("a stranger cannot accept the job", stranger.status === 403, stranger);
  const accepted = await api<Job>("POST", `/jobs/${direct.body.id}/accept`, { token: worker.token });
  check("worker accepts, negotiating begins", accepted.body.status === "negotiating", accepted.body);

  const down = await api<Job>("POST", `/jobs/${direct.body.id}/price`, { token: customer.token, body: { direction: "down" } });
  check("price moves down one step", down.body.proposedPrice === 500, down.body);
  const under = await api("POST", `/jobs/${direct.body.id}/price`, { token: customer.token, body: { direction: "down" } });
  check("price cannot go below the floor", under.status === 422 && under.body.error.code === "BELOW_FLOOR", under);
  await api("POST", `/jobs/${direct.body.id}/price`, { token: worker.token, body: { direction: "up" } });
  const up = await api<Job>("POST", `/jobs/${direct.body.id}/price`, { token: worker.token, body: { direction: "up" } });
  check("price moves up in fixed steps", up.body.proposedPrice === 600, up.body);

  const text = await api("POST", `/jobs/${direct.body.id}/messages`, { token: customer.token, body: { text: "Kal subah aa jayen" } });
  check("text message sends", text.status === 201 && text.body.text === "Kal subah aa jayen", text);
  const voice = await api("POST", `/jobs/${direct.body.id}/messages`, { token: worker.token, form: audioForm() });
  check("voice note is stored", voice.status === 201 && voice.body.audioUrl?.includes("/uploads/"), voice);
  check("no transcript is invented without Gemini", voice.body.transcript === null, voice.body);
  const fetched = await fetch(voice.body.audioUrl);
  check("voice note can be played back", fetched.status === 200, fetched.status);
  const thread = await api("GET", `/jobs/${direct.body.id}/messages`, { token: customer.token });
  check("thread lists both messages", thread.body.items.length === 2, thread.body);
  check("customer's socket receives messages", customerWs.events.some((e) => e.type === "message.created"));

  const { card, first, second } = await agreeAndEngage(direct.body, customer, worker);
  check("job card is generated", card.body.status === "pending_confirmation" && card.body.card?.agreedPrice === 600, card.body);
  check("card is labelled as a template without Gemini", card.body.card?.source === "template", card.body.card);
  check("card carries Jev skills", card.body.card?.skills?.includes("Fan repair") === true, card.body.card);
  check("one confirmation is not enough", first.body.status === "pending_confirmation" && first.body.customerConfirmed, first.body);
  check("second confirmation engages the job", second.body.status === "engaged" && second.body.agreedPrice === 600, second.body);
  check("engaged status reaches the map live", await anon.sawStatus(worker.workerId as string, "engaged"));
  check("worker is engaged", (await statusOf(worker.workerId as string)) === "engaged");

  const locked = await api("POST", "/workers/me/availability", { token: worker.token, body: { available: false, preset: "1h" } });
  check("toggle is locked while engaged", locked.status === 409 && locked.body.error.code === "WORKER_ENGAGED", locked);

  const early = await api("POST", `/jobs/${direct.body.id}/reviews`, { token: customer.token, body: { rating: 5 } });
  check("reviews wait for completion", early.status === 409, early);
  const done = await api<Job>("POST", `/jobs/${direct.body.id}/complete`, { token: worker.token });
  check("job completes", done.body.status === "completed" && done.body.completedAt !== null, done.body);
  check("worker passes through completed", await anon.sawStatus(worker.workerId as string, "completed"));
  check(
    "anonymous sockets receive no private job events",
    !anon.events.some((e) => ["job.updated", "message.created", "offer.created"].includes(e.type)),
  );
  anon.events.length = 0; // so the next wait sees only the return to available

  const earnings = await api("GET", "/workers/me/earnings", { token: worker.token });
  check("earning is recorded", earnings.body.items.length === 1 && earnings.body.items[0].amount === 600, earnings.body);
  check("daily and weekly totals add up", earnings.body.today === 600 && earnings.body.week === 600, earnings.body);

  const review = await api("POST", `/jobs/${direct.body.id}/reviews`, {
    token: customer.token,
    body: { rating: 5, tags: JSON.stringify(["waqt ka paband", "saaf kaam"]) },
  });
  check("customer leaves a tap review", review.status === 201 && review.body.tags.length === 2, review);
  const again = await api("POST", `/jobs/${direct.body.id}/reviews`, { token: customer.token, body: { rating: 1 } });
  check("a review cannot be left twice", again.status === 409, again);
  const back = await api("POST", `/jobs/${direct.body.id}/reviews`, {
    token: worker.token,
    body: { rating: 4, tags: "waqt par adaigi" },
  });
  check("worker rates the hirer", back.status === 201 && back.body.direction === "worker_to_customer", back);
  const hirer = await api("GET", `/customers/${customer.userId}`, { token: worker.token });
  check("hirer profile shows the rating and tags", hirer.body.rating === 4 && hirer.body.tags[0].tag === "waqt par adaigi" && hirer.body.jobCount === 1, hirer.body);

  check("worker returns to available automatically", await anon.sawStatus(worker.workerId as string, "available", 12_000));
  const next = (await api("GET", `/workers?lat=${G9.lat}&lng=${G9.lng}&radiusKm=30&q=pankha`)).body.items.find(
    (w: WorkerCard) => w.id === worker.workerId,
  ) as WorkerCard | undefined;
  check("trust tags appear on the next search", next?.trust.tags.some((t) => t.tag === "waqt ka paband") === true, next?.trust);
  check("trust shows rating and job count", next?.trust.rating === 5 && next?.trust.jobCount === 1, next?.trust);
  check("on-time rate comes from the job's own timestamps", next?.trust.onTimeRate === 1, next?.trust.onTimeRate);
  check("response time comes from the real accept time", typeof next?.trust.avgResponseMinutes === "number" && (next?.trust.avgResponseMinutes as number) < 5, next?.trust.avgResponseMinutes);
  check("typed worker's phone is checked after OTP", next?.phoneChecked === true, next?.phoneChecked);
  check("CNIC on file shows as checked", next?.cnicChecked === true, next?.cnicChecked);
  const seededWorkers = (await api("GET", "/admin/workers", { token: (await login("+923000000001")).token })).body.items as WorkerCard[];
  const seededRates = seededWorkers.filter((w) => w.trust.jobCount > 0).map((w) => w.trust.onTimeRate as number);
  check("seeded on-time rates vary between 0 and 1", seededRates.every((r) => r >= 0 && r <= 1) && new Set(seededRates).size > 2, [...new Set(seededRates)]);
  check("seeded workers have response times", seededWorkers.filter((w) => w.trust.jobCount > 0).every((w) => typeof w.trust.avgResponseMinutes === "number"));
  check("a worker with no replies has a null response time", seededWorkers.some((w) => w.trust.jobCount === 0 && w.trust.avgResponseMinutes === null));
  check("seeded CNIC flags are mixed", seededWorkers.some((w) => w.cnicChecked) && seededWorkers.some((w) => !w.cnicChecked));
  const profile = await api("GET", `/workers/${worker.workerId}`);
  check("worker profile lists reviews", profile.body.reviews.length === 1, profile.body.reviews);
  customerWs.close();

  section("Open job with offers");
  const asif = await login("+923100000002");
  const shahid = await login("+923100000003");
  const open = await api<Job>("POST", "/jobs", { token: customer.token, body: jobBody({ mode: "open" }) });
  check("open job is published", open.status === 201 && open.body.status === "open", open);
  const feed = await api("GET", "/jobs/open", { token: asif.token });
  check("open job appears in the worker feed", feed.body.items.some((j: Job) => j.id === open.body.id), feed.body.items.length);
  const lowOffer = await api("POST", `/jobs/${open.body.id}/offers`, { token: asif.token, body: { price: 100 } });
  check("offer below the floor is refused", lowOffer.status === 422, lowOffer);
  const offerA = await api("POST", `/jobs/${open.body.id}/offers`, { token: asif.token, body: { price: 900, etaMinutes: 30 } });
  const offerB = await api("POST", `/jobs/${open.body.id}/offers`, { token: shahid.token, body: { price: 800 } });
  check("two workers send offers", offerA.status === 201 && offerB.status === 201, [offerA.status, offerB.status]);
  const wrongTrade = await login("+923100000006");
  const notTrade = await api("POST", `/jobs/${open.body.id}/offers`, { token: wrongTrade.token, body: { price: 900 } });
  check("a worker in another trade cannot bid", notTrade.status === 403, notTrade);
  const offers = await api("GET", `/jobs/${open.body.id}/offers`, { token: customer.token });
  check("customer sees offers, cheapest first", offers.body.items.length === 2 && offers.body.items[0].price === 800, offers.body);
  const acceptedOffer = await api<Job>("POST", `/jobs/${open.body.id}/offers/${offerB.body.id}/accept`, { token: customer.token });
  check("accepting an offer starts negotiating at that price", acceptedOffer.body.status === "negotiating" && acceptedOffer.body.proposedPrice === 800, acceptedOffer.body);
  const after = await api("GET", `/jobs/${open.body.id}/offers`, { token: customer.token });
  check("other offers are rejected", after.body.items.find((o: any) => o.id === offerA.body.id).status === "rejected", after.body);
  check("winner is reserved", (await statusOf(shahid.workerId as string)) === "requested");
  check("loser stays available", (await statusOf(asif.workerId as string)) === "available");
  await agreeAndEngage(acceptedOffer.body, customer, shahid);
  check("winner is engaged", (await statusOf(shahid.workerId as string)) === "engaged");
  const openDone = await api<Job>("POST", `/jobs/${open.body.id}/complete`, { token: customer.token });
  check("open job completes", openDone.body.status === "completed", openDone.body);

  section("Crew job");
  const crews = (await api("GET", "/crews")).body.items;
  check("three seeded crews exist", crews.length === 3, crews.length);
  const crew = crews.find((c: any) => c.name === "Madina Tameeraat Crew");
  check("crew shows as available", crew.available === true, crew);
  const memberIds: string[] = crew.members.map((m: WorkerCard) => m.id);
  const leaderPhone = "+923100000027"; // Muhammad Riaz
  const leader = await login(leaderPhone);
  check("leader is who the seed says", leader.workerId === crew.leaderId, leader);
  const memberPhone = "+923100000005"; // Zubair Ahmed
  const member = await login(memberPhone);

  const crewJob = await api<Job>("POST", "/jobs", {
    token: customer.token,
    body: jobBody({ mode: "crew", crewId: crew.id, categoryId: "mistri", description: "Deewar banwani hai" }),
  });
  check("crew booking is created for all members", crewJob.status === 201 && crewJob.body.workerIds.length === 3, crewJob);
  const allRequested = await Promise.all(memberIds.map(statusOf));
  check("every member is requested together", allRequested.every((s) => s === "requested"), allRequested);
  check("one price for the crew", crewJob.body.proposedPrice === 6500, crewJob.body.proposedPrice);
  const memberAccept = await api("POST", `/jobs/${crewJob.body.id}/accept`, { token: member.token });
  check("only the leader can accept", memberAccept.status === 403, memberAccept);
  const crewAccepted = await api<Job>("POST", `/jobs/${crewJob.body.id}/accept`, { token: leader.token });
  check("leader accepts", crewAccepted.body.status === "negotiating", crewAccepted.body);
  await agreeAndEngage(crewAccepted.body, customer, leader);
  const allEngaged = await Promise.all(memberIds.map(statusOf));
  check("every member is engaged together", allEngaged.every((s) => s === "engaged"), allEngaged);
  const crewDone = await api<Job>("POST", `/jobs/${crewJob.body.id}/complete`, { token: leader.token });
  check("crew job completes", crewDone.body.status === "completed", crewDone.body);
  const crewEarnings = await prisma.earning.findMany({ where: { jobId: crewJob.body.id } });
  check("crew earnings split and sum to the price", crewEarnings.length === 3 && crewEarnings.reduce((s, e) => s + e.amount, 0) === 6500, crewEarnings);
  const crewReview = await api("POST", `/jobs/${crewJob.body.id}/reviews`, { token: customer.token, body: { rating: 4, tags: "saaf kaam" } });
  check("crew can be reviewed", crewReview.status === 201, crewReview);

  section("Open crew job");
  const rawal = crews.find((c: any) => c.name === "Rawal Finishing Team");
  const saleem = await login("+923100000036"); // Saleem Akhtar, Rawal leader
  const openCrew = await api<Job>("POST", "/jobs", {
    token: customer.token,
    body: jobBody({ mode: "crew", categoryId: "painter", description: "Poore ghar ka rang" }),
  });
  check("crew job can be posted for bids", openCrew.status === 201 && openCrew.body.status === "open", openCrew);
  const soloBid = await api("POST", `/jobs/${openCrew.body.id}/offers`, { token: saleem.token, body: { price: 5000 } });
  check("a solo bid on a crew job is refused", soloBid.status === 422, soloBid);
  const crewBid = await api("POST", `/jobs/${openCrew.body.id}/offers`, { token: saleem.token, body: { price: 5000, crewId: rawal.id } });
  check("crew leader bids for the crew", crewBid.status === 201 && crewBid.body.crewId === rawal.id, crewBid);
  const crewWin = await api<Job>("POST", `/jobs/${openCrew.body.id}/offers/${crewBid.body.id}/accept`, { token: customer.token });
  check("accepting reserves the whole crew", crewWin.status === 200 && crewWin.body.workerIds.length === 3, crewWin);
  const rawalStatus = await Promise.all(rawal.members.map((m: WorkerCard) => statusOf(m.id)));
  check("all crew members requested", rawalStatus.every((s) => s === "requested"), rawalStatus);
  const cancelled = await api<Job>("POST", `/jobs/${openCrew.body.id}/cancel`, { token: customer.token });
  check("cancel releases the crew", cancelled.body.status === "cancelled", cancelled.body);
  const freed = await Promise.all(rawal.members.map((m: WorkerCard) => statusOf(m.id)));
  check("all crew members are free again", freed.every((s) => s === "available"), freed);

  section("Multi-day jobs");
  const karachiToday = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const plusDays = (n: number) =>
    new Date(Date.parse(`${karachiToday}T00:00:00Z`) + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const plumbing = (extra: Record<string, unknown>) =>
    jobBody({ categoryId: "plumber", description: "Poore ghar ki pipe fitting", ...extra });
  const rateOf = async (id: string) => (await api<WorkerCard>("GET", `/workers/${id}`)).body.rate;
  const finishedOn = (jobId: string) => prisma.earning.findMany({ where: { jobId }, orderBy: [{ dayNumber: "asc" }, { amount: "desc" }] });

  for (const [name, extra] of [
    ["zero days", { durationDays: 0 }],
    ["31 days", { durationDays: 31 }],
    ["a fraction of a day", { durationDays: 1.5 }],
    ["a past start date", { startDate: plusDays(-1) }],
    ["a start 15 days ahead", { startDate: plusDays(15) }],
    ["an impossible date", { startDate: "2026-02-31" }],
    ["a badly written date", { startDate: "12/11/2026" }],
  ] as const) {
    const res = await api("POST", "/jobs", { token: customer.token, body: plumbing({ mode: "open", ...extra }) });
    check(`POST /jobs rejects ${name}`, res.status === 400, res);
  }
  const defaulted = await api<Job>("POST", "/jobs", { token: customer.token, body: plumbing({ mode: "open" }) });
  check("duration defaults to 1 and start to today in Karachi", defaulted.body.durationDays === 1 && defaulted.body.startDate === karachiToday, defaulted.body);
  check("no total or days before agreement", defaulted.body.totalPrice === null && defaulted.body.days?.length === 0, defaulted.body);
  const furthest = await api<Job>("POST", "/jobs", { token: customer.token, body: plumbing({ mode: "open", startDate: plusDays(14), durationDays: 30 }) });
  check("start 14 days ahead and 30 days long is allowed", furthest.status === 201 && furthest.body.durationDays === 30, furthest);
  await api("POST", `/jobs/${defaulted.body.id}/cancel`, { token: customer.token });
  await api("POST", `/jobs/${furthest.body.id}/cancel`, { token: customer.token });

  for (const [text, days] of [
    ["teen din ka nalka ka kaam hai", 3],
    ["دو دن کا کام ہے نلکا", 2],
    ["ek hafta plumber chahiye", 7],
    ["nalka theek karna hai", null],
  ] as const) {
    const res = await api("POST", "/ai/problem", { token: customer.token, body: { text } });
    check(`duration from "${text}" is ${days}`, res.body.durationDays === days && res.body.source === "jev_only", res.body);
  }

  // A direct three-day job, day by day.
  const nadeem = await login("+923100000007");
  const nadeemRate = await rateOf(nadeem.workerId as string);
  const threeDay = await api<Job>("POST", "/jobs", {
    token: customer.token,
    body: plumbing({ mode: "direct", workerId: nadeem.workerId, durationDays: 3, startDate: karachiToday }),
  });
  check("3-day direct job is created at the per-day rate", threeDay.status === 201 && threeDay.body.durationDays === 3 && threeDay.body.proposedPrice === nadeemRate, threeDay.body);
  const threeAccepted = await api<Job>("POST", `/jobs/${threeDay.body.id}/accept`, { token: nadeem.token });
  const three = await agreeAndEngage(threeAccepted.body, customer, nadeem);
  const threeCard = three.card.body.card;
  check(
    "job card carries days, date, per-day rate and total from the database",
    threeCard?.durationDays === 3 && threeCard.startDate === karachiToday && threeCard.pricePerDay === nadeemRate && threeCard.totalPrice === nadeemRate * 3,
    threeCard,
  );
  check("job card states the date range", threeCard?.time.includes(karachiToday) === true && threeCard.time.includes(plusDays(2)), threeCard?.time);
  check("total is per-day price times days", three.card.body.totalPrice === nadeemRate * 3 && three.card.body.agreedPrice === nadeemRate, three.card.body);
  check("no day rows before both confirm", three.first.body.days?.length === 0, three.first.body.days);
  check("confirmation creates 3 scheduled days", three.second.body.status === "engaged" && three.second.body.days?.length === 3 && three.second.body.days.every((d) => d.status === "scheduled"), three.second.body.days);
  check("days run on consecutive dates", three.second.body.days?.map((d) => d.date).join() === [karachiToday, plusDays(1), plusDays(2)].join(), three.second.body.days);
  check("worker is engaged", (await statusOf(nadeem.workerId as string)) === "engaged");
  const threeId = threeDay.body.id;
  const customerDay = await api("POST", `/jobs/${threeId}/days/1/complete`, { token: customer.token });
  check("a customer cannot complete a day", customerDay.status === 403, customerDay);
  const noSuchDay = await api("POST", `/jobs/${threeId}/days/9/complete`, { token: nadeem.token });
  check("a day that does not exist is 404", noSuchDay.status === 404, noSuchDay);
  const dayOne = await api<Job>("POST", `/jobs/${threeId}/days/1/complete`, { token: nadeem.token });
  check("day 1 completes and the job stays engaged", dayOne.body.status === "engaged" && dayOne.body.days?.[0]?.status === "completed", dayOne.body);
  check("worker stays engaged between days", (await statusOf(nadeem.workerId as string)) === "engaged");
  const dayOneAgain = await api<Job>("POST", `/jobs/${threeId}/days/1/complete`, { token: nadeem.token });
  check("completing a day twice is harmless", dayOneAgain.status === 200 && (await finishedOn(threeId)).length === 1, dayOneAgain.status);
  await api("POST", `/jobs/${threeId}/days/2/complete`, { token: nadeem.token });
  const lastDay = await api<Job>("POST", `/jobs/${threeId}/days/3/complete`, { token: nadeem.token });
  check("the last day completes the job", lastDay.body.status === "completed" && lastDay.body.completedAt !== null, lastDay.body);
  check("final total covers all 3 days", lastDay.body.totalPrice === nadeemRate * 3, lastDay.body.totalPrice);
  check("worker goes through completed", (await statusOf(nadeem.workerId as string)) === "completed");
  const threeEarnings = await finishedOn(threeId);
  check("one earning per day", threeEarnings.map((e) => `${e.dayNumber}:${e.amount}`).join() === [1, 2, 3].map((d) => `${d}:${nadeemRate}`).join(), threeEarnings);
  const nadeemMoney = await api("GET", "/workers/me/earnings", { token: nadeem.token });
  check("today's total counts each day's entry", nadeemMoney.body.today === nadeemRate * 3, nadeemMoney.body.today);
  check("week total includes them", nadeemMoney.body.week >= nadeemRate * 3, nadeemMoney.body.week);
  check("earnings expose the day number", nadeemMoney.body.items.filter((e: any) => e.jobId === threeId).map((e: any) => e.dayNumber).sort().join() === "1,2,3", nadeemMoney.body.items[0]);
  const afterDone = await api<Job>("POST", `/jobs/${threeId}/days/3/complete`, { token: nadeem.token });
  check("repeat after the job ended pays nothing", afterDone.status === 200 && (await finishedOn(threeId)).length === 3, afterDone.status);

  // Finishing early.
  const khalid = await login("+923100000010");
  const khalidRate = await rateOf(khalid.workerId as string);
  const earlyJob = await api<Job>("POST", "/jobs", { token: customer.token, body: plumbing({ mode: "direct", workerId: khalid.workerId, durationDays: 3 }) });
  const earlyAccepted = await api<Job>("POST", `/jobs/${earlyJob.body.id}/accept`, { token: khalid.token });
  await agreeAndEngage(earlyAccepted.body, customer, khalid);
  const zeroDays = await api("POST", `/jobs/${earlyJob.body.id}/complete`, { token: customer.token });
  check("finishing with no days done is 409 and says to cancel", zeroDays.status === 409 && zeroDays.body.error.code === "NO_DAYS_COMPLETED" && /cancel/i.test(zeroDays.body.error.message), zeroDays);
  await api("POST", `/jobs/${earlyJob.body.id}/days/1/complete`, { token: khalid.token });
  const lateCancel = await api("POST", `/jobs/${earlyJob.body.id}/cancel`, { token: customer.token });
  check("a job with a paid day cannot be cancelled", lateCancel.status === 409 && lateCancel.body.error.code === "DAYS_ALREADY_COMPLETED", lateCancel);
  const finishedEarly = await api<Job>("POST", `/jobs/${earlyJob.body.id}/complete`, { token: customer.token });
  check("customer can finish early", finishedEarly.status === 200 && finishedEarly.body.status === "completed", finishedEarly.body);
  check("remaining days are skipped", finishedEarly.body.days?.map((d) => d.status).join() === "completed,skipped,skipped", finishedEarly.body.days);
  check("only the completed day is charged", finishedEarly.body.totalPrice === khalidRate && finishedEarly.body.agreedPrice === khalidRate, finishedEarly.body);
  check("only one earning exists", (await finishedOn(earlyJob.body.id)).length === 1);
  const skippedDay = await api("POST", `/jobs/${earlyJob.body.id}/days/2/complete`, { token: khalid.token });
  check("a skipped day cannot be completed", skippedDay.status === 409, skippedDay);

  // The floor applies to the price per day.
  const tariq = await login("+923100000006");
  const lowDaily = await api("POST", "/jobs", { token: customer.token, body: plumbing({ mode: "direct", workerId: tariq.workerId, durationDays: 5, proposedPrice: 100 }) });
  check("floor applies per day even when the total clears it", lowDaily.status === 422 && lowDaily.body.error.code === "BELOW_FLOOR", lowDaily);
  const floorJob = await api<Job>("POST", "/jobs", { token: customer.token, body: plumbing({ mode: "direct", workerId: tariq.workerId, durationDays: 5, proposedPrice: 550 }) });
  await api("POST", `/jobs/${floorJob.body.id}/accept`, { token: tariq.token });
  const toFloor = await api<Job>("POST", `/jobs/${floorJob.body.id}/price`, { token: customer.token, body: { direction: "down" } });
  check("per-day price moves by one step", toFloor.body.proposedPrice === 500, toFloor.body.proposedPrice);
  const underFloor = await api("POST", `/jobs/${floorJob.body.id}/price`, { token: customer.token, body: { direction: "down" } });
  check("per-day price stops at the floor", underFloor.status === 422 && underFloor.body.error.code === "BELOW_FLOOR", underFloor);
  const floorCard = await api<Job>("POST", `/jobs/${floorJob.body.id}/card`, { token: customer.token });
  check("total follows the per-day price", floorCard.body.totalPrice === 2500, floorCard.body.totalPrice);
  const repriced2 = await api<Job>("POST", `/jobs/${floorJob.body.id}/price`, { token: tariq.token, body: { direction: "up" } });
  check("changing the price voids the total and card", repriced2.body.totalPrice === null && repriced2.body.card === null && repriced2.body.status === "negotiating", repriced2.body);
  await api("POST", `/jobs/${floorJob.body.id}/cancel`, { token: customer.token });
  const openFloor = await api<Job>("POST", "/jobs", { token: customer.token, body: plumbing({ mode: "open", durationDays: 5 }) });
  const lowBid = await api("POST", `/jobs/${openFloor.body.id}/offers`, { token: tariq.token, body: { price: 100 } });
  check("an offer below the per-day floor is refused", lowBid.status === 422, lowBid);
  await api("POST", `/jobs/${openFloor.body.id}/cancel`, { token: customer.token });

  // A crew over two days.
  const crewDays = await api<Job>("POST", "/jobs", {
    token: customer.token,
    body: jobBody({ mode: "crew", crewId: rawal.id, categoryId: "painter", description: "Do din ka rang", durationDays: 2 }),
  });
  check("crew gets one per-day price", crewDays.status === 201 && crewDays.body.proposedPrice === 5500, crewDays.body.proposedPrice);
  const crewDaysAccepted = await api<Job>("POST", `/jobs/${crewDays.body.id}/accept`, { token: saleem.token });
  const crewDaysFlow = await agreeAndEngage(crewDaysAccepted.body, customer, saleem);
  check("crew total is per-day price times days", crewDaysFlow.card.body.totalPrice === 11000, crewDaysFlow.card.body.totalPrice);
  const rawalIds: string[] = rawal.members.map((m: WorkerCard) => m.id);
  check("every crew member engages together", (await Promise.all(rawalIds.map(statusOf))).every((s) => s === "engaged"));
  const rawalMember = await login("+923100000016"); // Ghulam Mustafa
  const memberDay = await api("POST", `/jobs/${crewDays.body.id}/days/1/complete`, { token: rawalMember.token });
  check("a crew member who is not the leader cannot complete a day", memberDay.status === 403, memberDay);
  await api("POST", `/jobs/${crewDays.body.id}/days/1/complete`, { token: saleem.token });
  const crewDayOne = await finishedOn(crewDays.body.id);
  check("a crew day pays every member", crewDayOne.length === 3, crewDayOne.length);
  check("a crew day adds up exactly to the per-day price", crewDayOne.reduce((s, e) => s + e.amount, 0) === 5500, crewDayOne.map((e) => e.amount));
  check("the leader receives the remainder", crewDayOne.find((e) => e.workerId === rawal.leaderId)?.amount === 1834 && crewDayOne.filter((e) => e.amount === 1833).length === 2, crewDayOne.map((e) => e.amount));
  const crewDayTwo = await api<Job>("POST", `/jobs/${crewDays.body.id}/days/2/complete`, { token: saleem.token });
  check("the crew's last day completes the job", crewDayTwo.body.status === "completed" && crewDayTwo.body.totalPrice === 11000, crewDayTwo.body);
  const crewAll = await finishedOn(crewDays.body.id);
  check("crew earnings over both days sum exactly", crewAll.length === 6 && crewAll.reduce((s, e) => s + e.amount, 0) === 11000, crewAll.length);

  // Multi-day double booking, under concurrency.
  const usman = await login("+923100000012");
  const [cA, cB] = await Promise.all([login("+923200000003"), login("+923200000004")]);
  const acBody = (extra: Record<string, unknown>) => jobBody({ categoryId: "ac-technician", description: "Teen din AC ka kaam", durationDays: 3, ...extra });
  let multiClean = 0;
  const MULTI_ROUNDS = 6;
  for (let i = 0; i < MULTI_ROUNDS; i++) {
    const a = await api<Job>("POST", "/jobs", { token: cA.token, body: acBody({ mode: "open" }) });
    const b = await api<Job>("POST", "/jobs", { token: cB.token, body: acBody({ mode: "open" }) });
    const oa = await api("POST", `/jobs/${a.body.id}/offers`, { token: usman.token, body: { price: 1500 } });
    const ob = await api("POST", `/jobs/${b.body.id}/offers`, { token: usman.token, body: { price: 1600 } });
    const raced = await Promise.all([
      api<Job>("POST", `/jobs/${a.body.id}/offers/${oa.body.id}/accept`, { token: cA.token }),
      api<Job>("POST", `/jobs/${b.body.id}/offers/${ob.body.id}/accept`, { token: cB.token }),
    ]);
    const held = await prisma.jobAssignment.count({ where: { workerId: usman.workerId as string, active: true } });
    if (raced.filter((r) => r.status === 200).length === 1 && raced.filter((r) => r.status === 409).length === 1 && held === 1) multiClean++;
    await api("POST", `/jobs/${a.body.id}/cancel`, { token: cA.token });
    await api("POST", `/jobs/${b.body.id}/cancel`, { token: cB.token });
  }
  check(`${MULTI_ROUNDS} rounds racing two multi-day jobs for one worker: exactly one wins`, multiClean === MULTI_ROUNDS, multiClean);

  const holding = await api<Job>("POST", "/jobs", { token: cA.token, body: acBody({ mode: "direct", workerId: usman.workerId }) });
  const holdingAccepted = await api<Job>("POST", `/jobs/${holding.body.id}/accept`, { token: usman.token });
  const spareOpen = await api<Job>("POST", "/jobs", { token: cB.token, body: acBody({ mode: "open" }) });
  await api("POST", `/jobs/${holding.body.id}/card`, { token: cA.token });
  const bothConfirm = await Promise.all([
    api<Job>("POST", `/jobs/${holding.body.id}/confirm`, { token: cA.token }),
    api<Job>("POST", `/jobs/${holding.body.id}/confirm`, { token: usman.token }),
  ]);
  check("both sides confirming at once succeeds", bothConfirm.every((r) => r.status === 200) && holdingAccepted.status === 200, bothConfirm.map((r) => r.status));
  const confirmedDays = await prisma.jobDay.count({ where: { jobId: holding.body.id } });
  check("simultaneous confirms create the day rows once", confirmedDays === 3, confirmedDays);
  check("worker is engaged on the multi-day job", (await statusOf(usman.workerId as string)) === "engaged");
  const busyBurst = await Promise.all(
    [cB, customer].flatMap((c) => [1, 2, 3].map(() => api("POST", "/jobs", { token: c.token, body: acBody({ mode: "direct", workerId: usman.workerId }) }))),
  );
  check("6 simultaneous requests for a worker mid-job all fail", busyBurst.every((r) => r.status === 409), busyBurst.map((r) => r.status));
  const busyOffer = await api("POST", `/jobs/${spareOpen.body.id}/offers`, { token: usman.token, body: { price: 1500 } });
  check("a worker mid-job cannot bid elsewhere", busyOffer.status === 409, busyOffer);
  await api("POST", `/jobs/${spareOpen.body.id}/cancel`, { token: cB.token });
  const heldNow = await prisma.jobAssignment.count({ where: { workerId: usman.workerId as string, active: true } });
  check("the worker still holds exactly one job", heldNow === 1, heldNow);
  const dayRace = await Promise.all([1, 2, 3, 4].map(() => api("POST", `/jobs/${holding.body.id}/days/1/complete`, { token: usman.token })));
  check("4 simultaneous day completions all succeed", dayRace.every((r) => r.status === 200), dayRace.map((r) => r.status));
  check("and pay that day once", (await finishedOn(holding.body.id)).length === 1, (await finishedOn(holding.body.id)).length);
  await api("POST", `/jobs/${holding.body.id}/complete`, { token: usman.token });

  // A confirmed job that starts later still takes the worker off the market.
  const kamran = await login("+923100000013");
  const future = await api<Job>("POST", "/jobs", {
    token: cA.token,
    body: acBody({ mode: "direct", workerId: kamran.workerId, durationDays: 2, startDate: plusDays(5) }),
  });
  const futureAccepted = await api<Job>("POST", `/jobs/${future.body.id}/accept`, { token: kamran.token });
  const futureFlow = await agreeAndEngage(futureAccepted.body, cA, kamran);
  check("future-dated booking confirms", futureFlow.second.body.status === "engaged" && futureFlow.second.body.startDate === plusDays(5), futureFlow.second.body);
  check("its days fall on the future dates", futureFlow.second.body.days?.map((d) => d.date).join() === [plusDays(5), plusDays(6)].join(), futureFlow.second.body.days);
  check("worker on a future-dated job is engaged now", (await statusOf(kamran.workerId as string)) === "engaged");
  check("worker on a future-dated job is hidden from search", !(await searchIds("categoryId=ac-technician")).includes(kamran.workerId as string));
  const futureToggle = await api("POST", "/workers/me/availability", { token: kamran.token, body: { available: false, preset: "1h" } });
  check("toggle stays locked before the job starts", futureToggle.status === 409 && futureToggle.body.error.code === "WORKER_ENGAGED", futureToggle);
  const futureRequest = await api("POST", "/jobs", { token: cB.token, body: acBody({ mode: "direct", workerId: kamran.workerId }) });
  check("worker on a future-dated job cannot be requested", futureRequest.status === 409, futureRequest);
  const futureCancel = await api<Job>("POST", `/jobs/${future.body.id}/cancel`, { token: cA.token });
  check("cancelling before any work frees the worker", futureCancel.body.status === "cancelled" && (await statusOf(kamran.workerId as string)) === "available", futureCancel.body.status);
  check("cancelled days are skipped", futureCancel.body.days?.every((d) => d.status === "skipped") === true, futureCancel.body.days);

  // What the seed provides.
  const seededMulti = await prisma.job.count({ where: { durationDays: { gt: 1 }, status: "completed", createdAt: { lt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) } } });
  check("at least two past multi-day jobs are seeded", seededMulti >= 2, seededMulti);
  const akram = await login("+923100000020");
  const akramJobs = (await api("GET", "/jobs/mine", { token: akram.token })).body.items as Job[];
  const activeMulti = akramJobs.find((j) => j.status === "engaged");
  check("an active multi-day job is seeded", activeMulti?.durationDays === 3 && activeMulti.days?.map((d) => d.status).join() === "completed,scheduled,scheduled", activeMulti);
  check("its worker is engaged and hidden", (await statusOf(akram.workerId as string)) === "engaged" && !(await searchIds("categoryId=carpenter")).includes(akram.workerId as string));

  section("Busy toggle");
  const imran = await login("+923100000001");
  check("worker starts in search", (await searchIds("categoryId=electrician")).includes(imran.workerId as string));
  const off = await api<WorkerCard>("POST", "/workers/me/availability", { token: imran.token, body: { available: false, preset: "1h" } });
  check("preset sets an end time", off.body.status === "offline" && off.body.offlineUntil !== null, off.body);
  check("offline reaches the map live", await anon.sawStatus(imran.workerId as string, "offline"));
  check("offline worker disappears from search instantly", !(await searchIds("categoryId=electrician")).includes(imran.workerId as string));
  const noDirect = await api("POST", "/jobs", { token: customer.token, body: jobBody({ mode: "direct", workerId: imran.workerId }) });
  check("offline worker cannot be requested", noDirect.status === 409, noDirect);
  const noBid = await api("POST", `/jobs/${(feed.body.items[0] as Job).id}/offers`, { token: imran.token, body: { price: 900 } });
  check("offline worker cannot bid", noBid.status === 409, noBid);
  await prisma.workerProfile.update({ where: { id: imran.workerId as string }, data: { offlineUntil: new Date(Date.now() - 1000) } });
  anon.events.length = 0;
  check("worker returns when the preset ends", await anon.sawStatus(imran.workerId as string, "available", 8000));
  check("returned worker is back in search", (await searchIds("categoryId=electrician")).includes(imran.workerId as string));

  await api("POST", "/workers/me/availability", { token: imran.token, body: { available: false } });
  const manual = await api<WorkerCard>("GET", `/workers/${imran.workerId}`);
  check("'until I switch back' has no end time", manual.body.status === "offline" && manual.body.offlineUntil === null, manual.body);
  const on = await api<WorkerCard>("POST", "/workers/me/availability", { token: imran.token, body: { available: true } });
  check("worker switches back on", on.body.status === "available", on.body);

  const pending = await api<Job>("POST", "/jobs", { token: customer.token, body: jobBody({ mode: "direct", workerId: imran.workerId }) });
  await api("POST", "/workers/me/availability", { token: imran.token, body: { available: false, preset: "2h" } });
  const declined = await api<Job>("GET", `/jobs/${pending.body.id}`, { token: customer.token });
  check("going offline declines an unanswered request", declined.body.status === "cancelled", declined.body);
  check("and the worker is offline, not available", (await statusOf(imran.workerId as string)) === "offline");
  await api("POST", "/workers/me/availability", { token: imran.token, body: { available: true } });

  section("Admin adds a category with no restart");
  const admin = await login("+923000000001");
  const forbiddenAdmin = await api("POST", "/admin/categories", { token: customer.token, body: {} });
  check("non-admins are refused", forbiddenAdmin.status === 403, forbiddenAdmin);
  const before = await api("POST", "/ai/problem", { token: customer.token, body: { text: "darzi chahiye silai ke liye" } });
  check("Jev does not know the trade yet", before.body.categoryId === null, before.body);
  anon.events.length = 0;
  const created = await api("POST", "/admin/categories", {
    token: admin.token,
    body: {
      nameUr: "درزی",
      nameRoman: "darzi",
      nameEn: "Tailor",
      icon: "🧵",
      keywords: ["darzi", "silai", "درزی", "سلائی"],
      skills: ["Alterations"],
      floorPrice: 300,
      step: 20,
    },
  });
  check("admin creates a category", created.status === 201, created);
  await sleep(200);
  check("apps are told categories changed", anon.events.some((e) => e.type === "categories.changed"));
  const listed = await api("GET", "/categories");
  check("it appears in the public list", listed.body.items.some((c: any) => c.id === created.body.id), listed.body.items.length);
  const after2 = await api("POST", "/ai/problem", { token: customer.token, body: { text: "darzi chahiye silai ke liye" } });
  check("Jev matches it immediately", after2.body.categoryId === created.body.id, after2.body);
  const urdu2 = await api("POST", "/ai/problem", { token: customer.token, body: { text: "درزی چاہیے" } });
  check("Jev matches it in Urdu script", urdu2.body.categoryId === created.body.id, urdu2.body);
  const tailor = await login("+923007000005", "worker");
  const tailorCard = await api<WorkerCard>("POST", "/workers", { token: tailor.token, body: { name: "Nazir Darzi", area: "G-9", trade: "silai ka kaam" } });
  check("onboarding accepts the new trade", tailorCard.status === 201 && tailorCard.body.categoryIds[0] === created.body.id, tailorCard);
  check("search finds it", (await searchIds(`q=darzi`)).includes(tailorCard.body.id));
  const floorEdit = await api("PATCH", `/admin/categories/${created.body.id}`, { token: admin.token, body: { floorPrice: 400, step: 25 } });
  check("admin sets floor and step", floorEdit.body.floorPrice === 400 && floorEdit.body.step === 25, floorEdit.body);
  await api("PATCH", `/admin/categories/${created.body.id}`, { token: admin.token, body: { active: false } });
  const gone = await api("POST", "/ai/problem", { token: customer.token, body: { text: "darzi chahiye" } });
  check("disabling removes it from matching", gone.body.categoryId === null, gone.body);
  const publicNow = await api("GET", "/categories");
  check("disabled category is hidden publicly", !publicNow.body.items.some((c: any) => c.id === created.body.id));
  const allCats = await api("GET", "/categories?all=1", { token: admin.token });
  check("admin still sees it", allCats.body.items.some((c: any) => c.id === created.body.id));
  const notAll = await api("GET", "/categories?all=1", { token: customer.token });
  check("only admins can list disabled categories", notAll.status === 403, notAll);
  const ids = publicNow.body.items.map((c: any) => c.id).reverse();
  const reordered = await api("POST", "/admin/categories/reorder", { token: admin.token, body: { ids } });
  check("categories can be reordered", reordered.body.items[0].id === ids[0], reordered.body.items[0]);

  section("Admin and safety");
  const suspended = await login("+923100000011");
  check("worker is in search before suspension", (await searchIds("categoryId=ac-technician")).includes(suspended.workerId as string));
  const sus = await api("POST", `/admin/workers/${suspended.workerId}/suspend`, { token: admin.token });
  check("admin suspends a worker", sus.status === 200, sus);
  check("suspended worker is out of search", !(await searchIds("categoryId=ac-technician")).includes(suspended.workerId as string));
  const susMe = await api("GET", "/me", { token: suspended.token });
  check("suspended account is locked out", susMe.status === 403, susMe);
  await api("POST", `/admin/workers/${suspended.workerId}/approve`, { token: admin.token });
  check("approval restores the worker", (await searchIds("categoryId=ac-technician")).includes(suspended.workerId as string));
  const stats = await api("GET", "/admin/stats", { token: admin.token });
  check("stats load", stats.status === 200 && stats.body.customers >= 10, stats.body);
  const liveAvailable = await prisma.workerProfile.count({ where: { status: "available", approved: true, user: { suspended: false } } });
  check("availableNow matches live data", stats.body.availableNow === liveAvailable, [stats.body.availableNow, liveAvailable]);
  const liveEngaged = await prisma.workerProfile.count({ where: { status: "engaged" } });
  check("engagedNow matches live data", stats.body.engagedNow === liveEngaged, stats.body.engagedNow);
  check("jobsToday counts today's jobs", stats.body.jobsToday >= 5, stats.body.jobsToday);
  const weekFees = await prisma.agentLedgerEntry.aggregate({
    where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    _sum: { fee: true },
  });
  check("agentFeesWeek matches the ledger", stats.body.agentFeesWeek === weekFees._sum.fee, [stats.body.agentFeesWeek, weekFees._sum.fee]);
  const disputes = await api("GET", "/admin/disputes", { token: admin.token });
  check("seeded dispute is listed", disputes.body.items.length === 1 && disputes.body.items[0].disputeReason !== null, disputes.body);
  const resolved = await api<Job>("POST", `/admin/disputes/${disputes.body.items[0].id}/resolve`, { token: admin.token, body: { resolution: "Refund agreed." } });
  check("admin resolves a dispute", resolved.status === 200 && resolved.body.status === "completed", resolved);
  const adminJobs = await api("GET", "/admin/jobs?status=completed", { token: admin.token });
  check("admin lists jobs by status", adminJobs.body.items.length >= 45, adminJobs.body.items.length);
  const adminWorkers = await api("GET", "/admin/workers", { token: admin.token });
  check("admin lists every worker with phone", adminWorkers.body.items.length >= 45 && adminWorkers.body.items[0].phone, adminWorkers.body.items.length);
  const newAgent = await api("POST", "/admin/agents", { token: admin.token, body: { phone: "03007000006", name: "Naeem Agent" } });
  check("admin authorises an agent", newAgent.status === 201, newAgent);
  const agents = await api("GET", "/admin/agents", { token: admin.token });
  check("agents are listed", agents.body.items.length === 2, agents.body.items);

  section("CNIC");
  const cnicA = await api("POST", "/workers/me/cnic", { token: worker.token, body: { cnic: "61101-1234567-1" } });
  check("typed CNIC is accepted", cnicA.status === 200, cnicA);
  const stored = await prisma.cnicHash.findUnique({ where: { workerId: worker.workerId as string } });
  check("only a 64-character hash is stored", stored?.hash.length === 64 && !stored.hash.includes("6110112345671"), stored);
  const dup = await api("POST", "/workers/me/cnic", { token: urduWorker.token, body: { cnic: "6110112345671" } });
  check("duplicate CNIC is blocked", dup.status === 409 && dup.body.error.code === "CNIC_DUPLICATE", dup);
  const bad = await api("POST", "/workers/me/cnic", { token: urduWorker.token, body: { cnic: "123" } });
  check("malformed CNIC is refused", bad.status === 422, bad);

  section("Without a Gemini key");
  const voiceOnboard = await api("POST", "/ai/onboard", { token: worker.token, form: audioForm() });
  check("voice onboarding returns 503, not a fake profile", voiceOnboard.status === 503 && voiceOnboard.body.error.code === "AI_UNAVAILABLE", voiceOnboard);
  const voiceProblem = await api("POST", "/ai/problem", { token: customer.token, form: audioForm() });
  check("voice problem returns 503", voiceProblem.status === 503, voiceProblem);
  const photoProblem = await api("POST", "/ai/problem", { token: customer.token, form: imageForm() });
  check("photo problem returns 503", photoProblem.status === 503, photoProblem);
  const cnicPhoto = await api("POST", "/workers/me/cnic", { token: urduWorker.token, form: imageForm() });
  check("CNIC photo returns 503", cnicPhoto.status === 503, cnicPhoto);
  const workPhoto = await api("POST", "/workers/me/photos", { token: urduWorker.token, form: imageForm() });
  check("work photo saves and reports AI as unavailable", workPhoto.status === 200 && workPhoto.body.aiAvailable === false && workPhoto.body.skillTags.length === 0, workPhoto);
  const served = await fetch(workPhoto.body.urls[0]);
  check("saved photo is served as webp", served.status === 200 && served.headers.get("content-type") === "image/webp", served.status);
  const notImage = new FormData();
  notImage.append("image", new Blob([Buffer.from("not an image")], { type: "image/png" }), "x.png");
  const invalid = await api("POST", "/uploads/image", { token: customer.token, form: notImage });
  check("a fake image is rejected", invalid.status === 415, invalid);
  const upload = await api("POST", "/uploads/image", { token: customer.token, form: imageForm() });
  check("image upload returns a URL", upload.status === 200 && upload.body.url.includes(".webp"), upload);

  const reviewJobs = await prisma.job.findFirst({ where: { id: open.body.id } });
  const voiceOnly = await api("POST", `/jobs/${reviewJobs?.id}/reviews`, { token: customer.token, form: audioForm() });
  check("voice-only review without AI asks for a tap", voiceOnly.status === 503, voiceOnly);
  const voiceTap = await api("POST", `/jobs/${reviewJobs?.id}/reviews`, { token: customer.token, form: audioForm({ rating: "5" }) });
  check("voice plus tap saves with no invented transcript", voiceTap.status === 201 && voiceTap.body.transcript === null && voiceTap.body.aiAvailable === false, voiceTap);

  section("Push");
  const key = await api("GET", "/push/public-key");
  check("VAPID public key is served", key.body.enabled === true && key.body.publicKey.length > 40, key.body.enabled);
  const sub = await api("POST", "/push/subscribe", {
    token: customer.token,
    body: { endpoint: "https://fcm.googleapis.com/fcm/send/e2e-test", keys: { p256dh: "abc", auth: "def" } },
  });
  check("subscription is stored", sub.status === 201, sub);

  section("Concurrency: no double booking");
  const racer = await login("+923100000004"); // Waseem Abbasi
  const racerId = racer.workerId as string;
  const customers = await Promise.all([3, 4, 5, 6, 7, 8, 9, 10].map((n) => login(`+9232000000${String(n).padStart(2, "0")}`)));
  const [c1, c2] = customers as [Session, Session];

  let cleanRounds = 0;
  const ROUNDS = 12;
  for (let i = 0; i < ROUNDS; i++) {
    const j1 = await api<Job>("POST", "/jobs", { token: c1.token, body: jobBody({ mode: "open" }) });
    const j2 = await api<Job>("POST", "/jobs", { token: c2.token, body: jobBody({ mode: "open" }) });
    const o1 = await api("POST", `/jobs/${j1.body.id}/offers`, { token: racer.token, body: { price: 700 } });
    const o2 = await api("POST", `/jobs/${j2.body.id}/offers`, { token: racer.token, body: { price: 750 } });
    const results = await Promise.all([
      api<Job>("POST", `/jobs/${j1.body.id}/offers/${o1.body.id}/accept`, { token: c1.token }),
      api<Job>("POST", `/jobs/${j2.body.id}/offers/${o2.body.id}/accept`, { token: c2.token }),
    ]);
    const wins = results.filter((r) => r.status === 200);
    const losses = results.filter((r) => r.status === 409);
    const activeNow = await prisma.jobAssignment.count({ where: { workerId: racerId, active: true } });
    if (wins.length === 1 && losses.length === 1 && activeNow === 1) cleanRounds++;
    else console.log("    round", i, results.map((r) => r.status), "active", activeNow);
    const winnerJob = wins[0]?.body.id;
    const winnerToken = results[0]?.status === 200 ? c1.token : c2.token;
    await api("POST", `/jobs/${winnerJob}/cancel`, { token: winnerToken });
    const loserJob = results[0]?.status === 200 ? j2.body.id : j1.body.id;
    await api("POST", `/jobs/${loserJob}/cancel`, { token: results[0]?.status === 200 ? c2.token : c1.token });
  }
  check(`${ROUNDS} rounds of two simultaneous accepts: exactly one wins each time`, cleanRounds === ROUNDS, cleanRounds);

  const burst = await Promise.all(
    customers.map((c) => api<Job>("POST", "/jobs", { token: c.token, body: jobBody({ mode: "direct", workerId: racerId }) })),
  );
  const burstWins = burst.filter((r) => r.status === 201);
  check("8 simultaneous direct requests: exactly one succeeds", burstWins.length === 1 && burst.filter((r) => r.status === 409).length === 7, burst.map((r) => r.status));
  const burstWinner = customers[burst.findIndex((r) => r.status === 201)] as Session;
  await api("POST", `/jobs/${burstWins[0]?.body.id}/cancel`, { token: burstWinner.token });

  const sameJob = await api<Job>("POST", "/jobs", { token: c1.token, body: jobBody({ mode: "open" }) });
  const racer2 = await login("+923100000002");
  const sa = await api("POST", `/jobs/${sameJob.body.id}/offers`, { token: racer.token, body: { price: 700 } });
  const sb = await api("POST", `/jobs/${sameJob.body.id}/offers`, { token: racer2.token, body: { price: 750 } });
  const sameRace = await Promise.all([
    api("POST", `/jobs/${sameJob.body.id}/offers/${sa.body.id}/accept`, { token: c1.token }),
    api("POST", `/jobs/${sameJob.body.id}/offers/${sb.body.id}/accept`, { token: c1.token }),
  ]);
  check("accepting two offers on one job at once: one wins", sameRace.filter((r) => r.status === 200).length === 1, sameRace.map((r) => r.status));
  const assigned = await prisma.jobAssignment.count({ where: { jobId: sameJob.body.id, active: true } });
  check("that job holds exactly one worker", assigned === 1, assigned);
  await api("POST", `/jobs/${sameJob.body.id}/cancel`, { token: c1.token });

  const pindi = (await api("GET", "/crews")).body.items.find((c: any) => c.name === "Pindi Pipe aur Bijli Crew");
  const pindiIds: string[] = pindi.members.map((m: WorkerCard) => m.id);
  const sharedMember = racerId; // Waseem belongs to this crew
  check("race target is a crew member", pindiIds.includes(sharedMember));
  let atomic = 0;
  const CREW_ROUNDS = 8;
  for (let i = 0; i < CREW_ROUNDS; i++) {
    const [crewAttempt, directAttempt] = await Promise.all([
      api<Job>("POST", "/jobs", { token: c1.token, body: jobBody({ mode: "crew", crewId: pindi.id, categoryId: "plumber" }) }),
      api<Job>("POST", "/jobs", { token: c2.token, body: jobBody({ mode: "direct", workerId: sharedMember }) }),
    ]);
    const statuses = await Promise.all(pindiIds.map(statusOf));
    const others = pindiIds.filter((id) => id !== sharedMember);
    const otherStatuses = await Promise.all(others.map(statusOf));
    const oneWinner = [crewAttempt.status, directAttempt.status].filter((s) => s === 201).length === 1;
    const consistent =
      crewAttempt.status === 201 ? statuses.every((s) => s === "requested") : otherStatuses.every((s) => s === "available");
    if (oneWinner && consistent) atomic++;
    else console.log("    crew round", i, crewAttempt.status, directAttempt.status, statuses);
    if (crewAttempt.status === 201) await api("POST", `/jobs/${crewAttempt.body.id}/cancel`, { token: c1.token });
    if (directAttempt.status === 201) await api("POST", `/jobs/${directAttempt.body.id}/cancel`, { token: c2.token });
  }
  check(`${CREW_ROUNDS} crew-versus-direct races stay all-or-nothing`, atomic === CREW_ROUNDS, atomic);

  const doubled = await prisma.$queryRaw<{ workerId: string }[]>`
    SELECT "workerId" FROM "JobAssignment" WHERE active GROUP BY "workerId" HAVING COUNT(*) > 1`;
  check("no worker in the database holds two active jobs", doubled.length === 0, doubled);

  const hold = await api<Job>("POST", "/jobs", { token: c1.token, body: jobBody({ mode: "direct", workerId: racerId }) });
  const otherJob = await prisma.job.findFirstOrThrow({ where: { id: { not: hold.body.id }, status: "completed" } });
  const indexRefused = await prisma.jobAssignment
    .create({ data: { jobId: otherJob.id, workerId: racerId, active: true } })
    .then(() => false)
    .catch(() => true);
  check("the database index refuses a second active job on its own", indexRefused);
  await api("POST", `/jobs/${hold.body.id}/cancel`, { token: c1.token });

  section("Result");
  anon.close();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log(failures.map((f) => ` - ${f}`).join("\n"));
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
