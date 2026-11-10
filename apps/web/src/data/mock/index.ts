/**
 * MOCK DATA LAYER: everything in this folder is invented for development.
 * No person, review, price or job here is real, and no AI runs. It is replaced by
 * the live API during wiring and must be listed under "Seeded / Mocked" in the README.
 */
import type { Job as ContractJob } from "@kaamwala/contracts";
import { addDays, today } from "../../lib/dates";
import type { DataApi } from "../api";
import { ApiError } from "../errors";
import type { AppSettings, AuthUser, Category, Earning, Job, JobDay, JobFeedItem, Message, NewJob, OfflinePreset, Offer, WorkerCard, WorkerFilter } from "../types";
import { adminStats, defaultSettings, ledger, mockAgents, pastWorkFor, summarise } from "./agents";
import { HOME, adminDisputes, adminWorkers, crews, earnings, hirers, jobs as seedJobs, messages as seedMessages, offers as seedOffers, reviewsFor, seedCategories, workers } from "./seed";

const wait = <T,>(value: T, ms = 60) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

const CUSTOMER: AuthUser = { id: "h1", phone: "03001234567", name: "Ayesha Malik", role: "customer", workerId: null, hasHirerProfile: true };
const WORKER: AuthUser = { id: "u-w1", phone: "03005550100", name: "Muhammad Akram", role: "worker", workerId: "w1", hasHirerProfile: false };

function buildDays(startDate: string, durationDays: number, completed = 0): JobDay[] {
  return Array.from({ length: durationDays }, (_, index) => ({
    dayNumber: index + 1,
    date: addDays(startDate, index),
    status: index < completed ? "completed" : "scheduled",
    completedAt: index < completed ? new Date().toISOString() : null,
  }));
}

/** Seed jobs that span several days: [days, days already finished]. */
const SEED_DURATIONS: Record<string, [number, number]> = {
  "j-open": [3, 0],
  "j-nego": [2, 0],
  "j-card": [3, 0],
  "j-engaged": [5, 1],
  "j-crew": [3, 0],
};

function hydrate(job: ContractJob): Job {
  const [durationDays, completed] = SEED_DURATIONS[job.id] ?? [1, 0];
  const startDate = today();
  const perDay = job.agreedPrice ?? job.proposedPrice;
  return {
    ...job,
    durationDays,
    startDate,
    totalPrice: perDay === null ? null : perDay * durationDays,
    days: buildDays(startDate, durationDays, completed),
    card: job.card && perDay !== null ? { ...job.card, source: "gemini", durationDays, startDate, pricePerDay: perDay, totalPrice: perDay * durationDays } : null,
  };
}

let session: AuthUser = CUSTOMER;
let pendingOtp = "";
let settings: AppSettings = { ...defaultSettings };
let categories: Category[] = seedCategories.map((c) => ({ ...c }));
let jobs: Job[] = seedJobs.map(hydrate);
let offers: Offer[] = [...seedOffers];
const messages: Message[] = [...seedMessages];
const extraEarnings: Earning[] = [];
const categoryListeners = new Set<() => void>();
const notifyCategories = () => categoryListeners.forEach((listener) => listener());

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

function withDistance(worker: WorkerCard, center = HOME): WorkerCard {
  const km = distanceKm(center.lat, center.lng, worker.location.lat, worker.location.lng);
  return { ...worker, distanceKm: Math.round(km * 10) / 10 };
}

/** Simple keyword match for development. The real app uses the Jev engine. */
function matchCategory(text: string): Category | null {
  const lower = text.toLowerCase();
  let best: { category: Category; score: number } | null = null;
  for (const category of categories.filter((c) => c.active)) {
    const words = [...category.keywords, category.nameRoman, category.nameEn, category.nameUr];
    const score = words.filter((w) => lower.includes(w.toLowerCase())).length;
    if (score > 0 && (!best || score > best.score)) best = { category, score };
  }
  return best?.category ?? null;
}

function presetUntil(preset: OfflinePreset): string | null {
  if (preset === "manual") return null;
  const until = new Date();
  if (preset === "1h") until.setHours(until.getHours() + 1);
  if (preset === "2h") until.setHours(until.getHours() + 2);
  if (preset === "today") until.setHours(23, 59, 0, 0);
  return until.toISOString();
}

let me: WorkerCard = withDistance(workers[0]!);

function refreshMe() {
  if (me.status === "offline" && me.offlineUntil && new Date(me.offlineUntil).getTime() <= Date.now()) {
    me = { ...me, status: "available", offlineUntil: null };
  }
  return me;
}

function setWorkerStatus(ids: string[], status: WorkerCard["status"]) {
  for (const worker of workers) if (ids.includes(worker.id)) worker.status = status;
  if (ids.includes(me.id)) me = { ...me, status, offlineUntil: null };
}

function applyFilter(list: WorkerCard[], filter: WorkerFilter) {
  const q = filter.q?.trim().toLowerCase();
  return list.filter((w) => {
    if (filter.categoryId && !w.categoryIds.includes(filter.categoryId)) return false;
    if (q && !`${w.name} ${w.area} ${w.skills.join(" ")}`.toLowerCase().includes(q)) return false;
    if (filter.radiusKm !== undefined && (w.distanceKm ?? 0) > filter.radiusKm) return false;
    if (filter.minRating !== undefined && w.trust.rating < filter.minRating) return false;
    return true;
  });
}

function jobOrThrow(id: string): Job {
  const job = jobs.find((j) => j.id === id);
  if (!job) throw new ApiError("NOT_FOUND", "Job not found");
  return job;
}

function update(id: string, patch: Partial<Job>): Job {
  const updated = { ...jobOrThrow(id), ...patch };
  jobs = jobs.map((j) => (j.id === id ? updated : j));
  return updated;
}

function withEstimate(job: Job): JobFeedItem {
  return { ...job, priceMin: job.floor, priceMax: job.floor * 3, distanceKm: withDistance({ ...me, location: job.location }, me.location).distanceKm };
}

function createOffersFor(job: Job) {
  const nearby = workers
    .filter((w) => w.status === "available" && w.categoryIds.includes(job.categoryId))
    .map((w) => withDistance(w))
    .slice(0, 3);
  offers = [
    ...offers,
    ...nearby.map((worker, index): Offer => ({
      id: `${job.id}-o${index}`,
      jobId: job.id,
      worker,
      price: job.floor + job.step * (index + 2),
      etaMinutes: 20 + index * 10,
      status: "pending",
      createdAt: new Date().toISOString(),
    })),
  ];
}

function finishJob(jobId: string, days: JobDay[]) {
  const job = jobOrThrow(jobId);
  const perDay = job.agreedPrice ?? job.proposedPrice ?? 0;
  const done = days.filter((d) => d.status === "completed").length;
  // A one-day job is always charged in full, whichever button finished it.
  const charged = job.durationDays === 1 ? 1 : done;
  setWorkerStatus(job.workerIds, "available");
  if (job.durationDays === 1) {
    extraEarnings.unshift({ id: `e-${Date.now()}`, jobId, amount: perDay, categoryId: job.categoryId, earnedAt: new Date().toISOString(), dayNumber: null });
  }
  return update(jobId, { status: "completed", completedAt: new Date().toISOString(), days, totalPrice: perDay * charged });
}

export const mockApi: DataApi = {
  connection: () => "demo",

  requestOtp: () => {
    pendingOtp = String(1000 + Math.floor(Math.random() * 9000));
    return wait({ devOtp: pendingOtp });
  },

  verifyOtp: (phone, otp, role) => {
    if (otp !== pendingOtp) return Promise.reject(new ApiError("INVALID_OTP", "That code is not correct"));
    session = role === "worker" ? { ...WORKER, phone } : role === "customer" ? { ...CUSTOMER, phone } : { id: "a1", phone, name: "Usman Tariq", role, workerId: null, hasHirerProfile: false };
    return wait(session);
  },

  session: () => wait(session),

  getPublicSettings: () => wait({ ...settings }),

  listCategories: (options) => wait([...categories].filter((c) => options?.all || c.active).sort((a, b) => a.sortOrder - b.sortOrder)),

  saveCategory: (input, id) => {
    if (id) {
      categories = categories.map((c) => (c.id === id ? { ...c, ...input } : c));
    } else {
      categories = [...categories, { ...input, id: `cat-${Date.now()}`, sortOrder: categories.length }];
    }
    notifyCategories();
    return wait(categories.find((c) => c.id === id) ?? categories[categories.length - 1]!);
  },

  reorderCategories: (ids) => {
    categories = categories.map((c) => ({ ...c, sortOrder: ids.indexOf(c.id) }));
    notifyCategories();
    return wait(undefined);
  },

  onCategoriesChanged: (listener) => {
    categoryListeners.add(listener);
    return () => {
      categoryListeners.delete(listener);
    };
  },

  matchTrade: (text) => wait(matchCategory(text)),

  listWorkers: (filter = {}) => {
    const visible = workers.filter((w) => w.status === "available" && w.approved).map((w) => withDistance(w, filter.center));
    const sorted = applyFilter(visible, filter).sort(
      (a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0) || b.trust.rating - a.trust.rating || b.trust.responseRate - a.trust.responseRate,
    );
    return wait(sorted);
  },

  getWorker: (id) => {
    if (id === "me") return wait(refreshMe());
    const worker = workers.find((w) => w.id === id);
    return wait(worker ? withDistance(worker) : null);
  },
  getWorkerReviews: (id) => wait(reviewsFor(id === "me" ? me.id : id)),
  getWorkerExtras: (id) => wait({ pastWork: pastWorkFor((id === "me" ? me : workers.find((w) => w.id === id))?.skills ?? []), cnicDuplicateChecked: true }),
  getMyWorker: () => wait(refreshMe()),

  setAvailability: (available, preset = "manual") => {
    if (me.status === "engaged") return Promise.reject(new ApiError("WORKER_ENGAGED", "Locked while on a job"));
    me = { ...me, status: available ? "available" : "offline", offlineUntil: available ? null : presetUntil(preset) };
    return wait(me);
  },

  createWorker: (profile) => {
    let categoryIds = profile.categoryIds;
    if (categoryIds.length === 0 && profile.trade) {
      const match = matchCategory(profile.trade);
      if (!match) return Promise.reject(new ApiError("TRADE_NOT_RECOGNISED", "Trade not recognised"));
      categoryIds = [match.id];
    }
    me = { ...me, name: profile.name, categoryIds, skills: profile.skills, years: profile.years ?? 0, rate: profile.rate ?? 0, area: profile.area, status: "available" };
    if (profile.forPhone && session.role === "agent") {
      const agent = mockAgents.find((a) => a.agentId === session.id) ?? mockAgents[0]!;
      const agentShare = Math.round((settings.agentSignupFee * settings.agentSharePercent) / 100);
      ledger.unshift({
        id: `e-${Date.now()}`,
        agentId: agent.agentId,
        agentName: agent.agentName,
        workerId: `w-${Date.now()}`,
        workerName: profile.name,
        fee: settings.agentSignupFee,
        agentShare,
        platformShare: settings.agentSignupFee - agentShare,
        paymentStatus: "mock_collected",
        createdAt: new Date().toISOString(),
      });
    }
    return wait(me, 400);
  },

  uploadCnic: () => wait(undefined, 300),
  uploadPhoto: () => wait(undefined, 300),
  createCustomer: () => wait(undefined, 300),

  getHirer: (id) => wait(hirers.find((h) => h.id === (id === "me" ? "h1" : id)) ?? null),

  listCrews: (categoryId) => wait(categoryId ? crews.filter((c) => c.categoryIds.includes(categoryId)) : crews),
  getCrew: (id) => wait(crews.find((c) => c.id === id) ?? null),

  listOpenJobs: () => wait(jobs.filter((j) => j.status === "open" && j.mode === "open").map(withEstimate)),
  listMyJobs: () => wait(session.role === "worker" ? jobs.filter((j) => j.workerIds.includes(session.workerId ?? "")) : jobs.filter((j) => j.customerId === session.id)),
  listUpcomingJobs: () => wait(jobs.filter((j) => j.status === "engaged" || j.status === "pending_confirmation")),
  getJob: (id) => wait(jobs.find((j) => j.id === id) ?? null),

  createJob: (input: NewJob) => {
    const category = categories.find((c) => c.id === input.categoryId);
    const job: Job = {
      id: `j-${Date.now()}`,
      mode: input.mode,
      status: input.mode === "open" ? "open" : "negotiating",
      customerId: session.id,
      customerName: session.name ?? "",
      categoryId: input.categoryId,
      description: input.description,
      urgency: input.urgency,
      area: input.area,
      location: input.location,
      scheduledFor: null,
      photoUrls: [],
      floor: category?.floorPrice ?? 0,
      step: category?.step ?? 50,
      proposedPrice: input.proposedPrice ?? category?.floorPrice ?? 0,
      proposedBy: session.id,
      agreedPrice: null,
      workerIds: input.workerId ? [input.workerId] : (crews.find((c) => c.id === input.crewId)?.members.map((m) => m.id) ?? []),
      crewId: input.crewId ?? null,
      card: null,
      customerConfirmed: false,
      workerConfirmed: false,
      createdAt: new Date().toISOString(),
      completedAt: null,
      durationDays: input.durationDays,
      startDate: input.startDate,
      totalPrice: null,
      days: buildDays(input.startDate, input.durationDays),
    };
    jobs = [job, ...jobs];
    if (input.mode === "open") createOffersFor(job);
    return wait(job, 300);
  },

  sendOffer: () => wait(undefined, 200),
  listOffers: (jobId) => wait(offers.filter((o) => o.jobId === jobId).map((o) => ({ ...o, worker: withDistance(o.worker) }))),

  acceptOffer: (jobId, offerId) => {
    const offer = offers.find((o) => o.id === offerId);
    if (!offer) return Promise.reject(new ApiError("NOT_FOUND", "Offer not found"));
    if (workers.find((w) => w.id === offer.worker.id)?.status !== "available") return Promise.reject(new ApiError("WORKER_NOT_AVAILABLE", "Worker is no longer available"));
    return wait(update(jobId, { status: "negotiating", workerIds: [offer.worker.id], proposedPrice: offer.price, proposedBy: offer.worker.userId }), 200);
  },

  adjustPrice: (jobId, direction) => {
    const job = jobOrThrow(jobId);
    const next = (job.proposedPrice ?? job.floor) + (direction === "up" ? job.step : -job.step);
    if (next < job.floor) return Promise.reject(new ApiError("BELOW_FLOOR", "Below the floor price"));
    return wait(update(jobId, { proposedPrice: next, proposedBy: session.id, card: null, customerConfirmed: false, workerConfirmed: false, status: "negotiating" }));
  },

  generateCard: (jobId) => {
    const job = jobOrThrow(jobId);
    const pricePerDay = job.proposedPrice ?? job.floor;
    const totalPrice = pricePerDay * job.durationDays;
    return wait(
      update(jobId, {
        status: "pending_confirmation",
        agreedPrice: pricePerDay,
        totalPrice,
        workerConfirmed: true,
        card: { task: job.description, addressArea: job.area, time: "صبح 10 بجے", agreedPrice: pricePerDay, source: "gemini", durationDays: job.durationDays, startDate: job.startDate, pricePerDay, totalPrice },
      }),
      500,
    );
  },

  confirmJob: (jobId) => {
    const job = jobOrThrow(jobId);
    setWorkerStatus(job.workerIds, "engaged");
    return wait(update(jobId, { customerConfirmed: true, workerConfirmed: true, status: "engaged" }), 250);
  },

  completeDay: (jobId, dayNumber) => {
    const job = jobOrThrow(jobId);
    const days = job.days.map((d): JobDay => (d.dayNumber === dayNumber ? { ...d, status: "completed", completedAt: new Date().toISOString() } : d));
    extraEarnings.unshift({ id: `e-${Date.now()}`, jobId, amount: job.agreedPrice ?? 0, categoryId: job.categoryId, earnedAt: new Date().toISOString(), dayNumber });
    if (days.every((d) => d.status === "completed")) return wait(finishJob(jobId, days), 200);
    return wait(update(jobId, { days }), 200);
  },

  completeJob: (jobId) => {
    const job = jobOrThrow(jobId);
    const days = job.days.map((d): JobDay => (d.status === "scheduled" && job.durationDays > 1 ? { ...d, status: "skipped" } : d));
    return wait(finishJob(jobId, days), 200);
  },

  listMessages: (jobId) => wait(messages.filter((m) => m.jobId === jobId)),

  sendVoiceNote: (jobId) => {
    const message: Message = {
      id: `m-${Date.now()}`,
      jobId,
      senderId: session.id,
      audioUrl: "mock",
      transcript: "ٹھیک ہے بھائی، گیارہ سو کر لیں۔",
      text: null,
      createdAt: new Date().toISOString(),
    };
    messages.push(message);
    return wait(message, 500);
  },

  transcribeReview: () => wait({ transcript: "بہت اچھا کام کیا، وقت پر آئے اور قیمت بھی مناسب تھی۔", tags: ["waqt ka paband", "munasib qeemat", "saaf kaam"], source: "gemini" as const }, 500),

  submitReview: () => wait(undefined, 250),

  getEarnings: () => {
    const base = earnings();
    const extra = extraEarnings.reduce((sum, e) => sum + e.amount, 0);
    return wait({ ...base, items: [...extraEarnings, ...base.items], today: base.today + extra, week: base.week + extra, jobCount: base.jobCount + extraEarnings.length });
  },

  transcribeOnboarding: () =>
    wait(
      {
        name: "محمد اکرم",
        categoryIds: [categories.find((c) => c.active)?.id ?? ""].filter(Boolean),
        skills: ["pankha theek karna", "wiring"],
        years: 10,
        rate: 2000,
        area: "G-9",
        workingHours: "صبح 9 سے شام 6 بجے",
        transcript: "میرا نام محمد اکرم ہے۔ میں بجلی کا کام کرتا ہوں، پنکھے اور وائرنگ۔ دس سال کا تجربہ ہے۔ جی نائن میں رہتا ہوں۔ دن کے دو ہزار روپے لیتا ہوں۔ صبح نو سے شام چھ بجے تک کام کرتا ہوں۔",
        source: "gemini",
      },
      700,
    ),

  transcribeField: (field) => {
    const samples: Record<typeof field, string> = {
      name: "محمد اکرم",
      trade: "بجلی کا کام",
      skills: "پنکھا، وائرنگ",
      years: "10",
      rate: "2000",
      area: "G-9",
      workingHours: "صبح 9 سے شام 6 بجے",
    };
    return wait(samples[field], 700);
  },

  transcribeCustomer: () => wait({ name: "عائشہ ملک", area: "G-9/2", address: "گلی 14", transcript: "میرا نام عائشہ ملک ہے، میں جی نائن ٹو میں گلی چودہ میں رہتی ہوں۔" }, 600),

  analyzeProblem: (input) => {
    const text = input.text?.trim() || "mere ghar ka pankha nahi chal raha, jaldi kisi ko bhejo";
    const category = matchCategory(text);
    const urgent = /jaldi|abhi|fori|urgent|جلدی|ابھی|فوری/i.test(text);
    const days = /(\d+)\s*(din|day|دن)/i.exec(text)?.[1];
    return wait(
      {
        transcript: input.text ? null : text,
        categoryId: category?.id ?? null,
        skills: category?.skills.slice(0, 1) ?? [],
        urgency: urgent ? "urgent" : "normal",
        priceMin: category ? category.floorPrice : null,
        priceMax: category ? category.floorPrice * 3 : null,
        summary: text,
        confidence: category ? 0.91 : 0,
        source: "gemini",
        durationDays: days ? Math.min(30, Number(days)) : null,
      },
      500,
    );
  },

  adminStats: () => wait(adminStats(workers.filter((w) => w.status === "available").length, workers.filter((w) => w.status === "engaged").length)),
  adminWorkers: () => wait(adminWorkers()),
  adminJobs: () => wait(jobs),
  adminDisputes: () => wait(adminDisputes()),
  adminSetWorkerState: () => wait(undefined),
  adminGetSettings: () => wait({ ...settings }),
  adminSaveSettings: (next) => {
    settings = { ...next };
    return wait({ ...settings }, 200);
  },
  adminAgents: () => wait(mockAgents.map((a) => summarise(a.agentId)!).sort((a, b) => b.totalFee - a.totalFee)),
  adminAgentLedger: (id) => {
    const summary = summarise(id);
    return wait(summary ? { summary, entries: ledger.filter((e) => e.agentId === id) } : null);
  },
  adminAddAgent: (name, phone) => {
    mockAgents.push({ agentId: `a-${Date.now()}`, agentName: name, phone });
    return wait(undefined, 200);
  },
};
