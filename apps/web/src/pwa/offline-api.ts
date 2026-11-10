import type { DataApi } from "../data/api";
import { ApiError, errorCode } from "../data/errors";
import type { Job, OfflinePreset, ReviewView, WorkerCard, WorkerDetail, WorkerExtras, WorkerSelf } from "../data/types";
import { copyKey, forgetCopiesExcept, markStale, readCopy, saveCopy, type Saved } from "../lib/offline";
import { enqueue, dropQueuedAvailability, flush, isTransient, noteReachable, noteSavedCopyShown, noteUnreachable, overlayJob, overlayWorker, pendingFor, startSync, whenQueueLoaded, type QueuedAction } from "./queue";
import { askForPushSoon, pushEndpoint } from "./signals";

const KEY = {
  myWorker: "me.worker",
  myDetail: "me.detail",
  myHirer: "me.hirer",
  jobs: "jobs.mine",
  upcoming: "jobs.upcoming",
  job: (id: string) => `job.${id}`,
  messages: (id: string) => `messages.${id}`,
  earnings: "earnings",
  categories: "categories",
  areas: "areas",
  settings: "settings.public",
} as const;

const UPCOMING_STATUSES: Job["status"][] = ["engaged", "pending_confirmation"];

/** Saved data is at most this old before a fresh copy is fetched in the background. */
const PRIME_AFTER_MS = 2 * 60 * 1000;
const PRIME_DELAY_MS = 4_000;

const networkError = () => new ApiError("NETWORK", "Could not reach the server.");

/**
 * Wraps the live API so the screens work with no internet: what the worker needs is saved as it
 * is read and returned when the network is gone, and availability and day completion wait in a
 * queue. Screens need no special handling, and everything else behaves exactly as before.
 */
export function withOffline(live: DataApi): DataApi {
  const userId = () => live.currentUser()?.id ?? null;
  const pending = () => pendingFor(userId());

  /** A saved copy, tagged stale and reported to the banner. */
  async function fromSaved<T extends object>(saved: Saved<T> | null, overlay?: (value: T) => T): Promise<T | null> {
    if (!saved) return null;
    noteSavedCopyShown(saved.savedAt);
    return markStale(overlay ? overlay(saved.value) : saved.value, saved.savedAt);
  }

  /** Network first, then the saved copy. Only "cannot reach the server" falls back; a real refusal still throws. */
  async function read<T extends object>(key: string, load: () => Promise<T>, overlay?: (value: T) => T, alternative?: () => Promise<T | null>): Promise<T> {
    const scoped = copyKey(key);
    await whenQueueLoaded();
    const offline = async (): Promise<T | null> => (await fromSaved(await readCopy<T>(scoped), overlay)) ?? (alternative ? alternative() : null);

    if (!navigator.onLine) {
      const copy = await offline();
      if (copy) return copy;
      throw networkError();
    }
    try {
      const value = await load();
      noteReachable();
      void saveCopy(scoped, value);
      return overlay ? overlay(value) : value;
    } catch (error) {
      if (!isTransient(error)) throw error;
      noteUnreachable();
      const copy = await offline();
      if (copy) return copy;
      throw error;
    }
  }

  const overlayCard = <T extends WorkerCard>(card: T): T => overlayWorker(card, pending()) as T;
  const overlayOne = (job: Job) => overlayJob(job, pending());
  const overlayMany = (jobs: Job[]) => jobs.map(overlayOne);

  const isOwnWorker = (id: string) => id === "me" || id === live.currentUser()?.workerId;
  const isOwnHirer = (id: string) => id === "me" || id === userId();

  /** The job as last saved, from its own copy or from the saved job list. Queued work is counted. */
  async function savedJob(id: string): Promise<Saved<Job> | null> {
    const own = await readCopy<Job>(copyKey(KEY.job(id)));
    const list = await readCopy<Job[]>(copyKey(KEY.jobs));
    const fromList = list?.value.find((job) => job.id === id);
    if (own && (!list || !fromList || own.savedAt >= list.savedAt)) return own;
    return fromList && list ? { value: fromList, savedAt: list.savedAt } : null;
  }

  async function savedDetail(): Promise<Saved<WorkerDetail> | null> {
    return readCopy<WorkerDetail>(copyKey(KEY.myDetail));
  }

  const attempt = async <T>(call: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> => {
    if (!navigator.onLine) return { ok: false };
    try {
      const value = await call();
      noteReachable();
      return { ok: true, value };
    } catch (error) {
      if (!isTransient(error)) throw error;
      noteUnreachable();
      return { ok: false };
    }
  };

  /** Earlier queued work goes first, so the server sees things in the order the worker did them. */
  const sendQueuedFirst = async () => {
    await whenQueueLoaded();
    if (navigator.onLine && pending().length > 0) await flush();
  };

  const requireUser = () => {
    const id = userId();
    if (!id) throw new ApiError("UNAUTHORIZED", "Sign in first.", 401);
    return id;
  };

  const api: DataApi = {
    ...live,

    signOut() {
      // The token is read as the call starts, so this request still carries it.
      const endpoint = pushEndpoint.get();
      if (endpoint) void live.unsubscribePush(endpoint).catch(() => undefined);
      pushEndpoint.set(null);
      live.signOut();
    },

    getMyWorker: () => read(KEY.myWorker, live.getMyWorker, overlayCard),

    getWorker: (id) => {
      if (!isOwnWorker(id)) return live.getWorker(id);
      return read(KEY.myDetail, async () => {
        const detail = await live.getWorker(id);
        if (!detail) throw new ApiError("NOT_FOUND", "No such worker.", 404);
        return detail as WorkerDetail;
      }, overlayCard).catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      });
    },

    getWorkerReviews: async (id) => {
      if (!isOwnWorker(id)) return live.getWorkerReviews(id);
      return read<ReviewView[]>(`${KEY.myDetail}.reviews`, () => live.getWorkerReviews(id), undefined, async () => (await savedDetail())?.value.reviews ?? null);
    },

    getWorkerExtras: async (id) => {
      if (!isOwnWorker(id)) return live.getWorkerExtras(id);
      return read<WorkerExtras>(`${KEY.myDetail}.extras`, () => live.getWorkerExtras(id), undefined, async () => {
        const detail = (await savedDetail())?.value;
        return detail ? { pastWork: detail.pastWork, cnicDuplicateChecked: detail.cnicDuplicateChecked } : null;
      });
    },

    getHirer: (id) => {
      if (!isOwnHirer(id)) return live.getHirer(id);
      return read(KEY.myHirer, async () => {
        const detail = await live.getHirer(id);
        if (!detail) throw new ApiError("NOT_FOUND", "No such customer.", 404);
        return detail;
      }).catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      });
    },

    listMyJobs: () => read(KEY.jobs, live.listMyJobs, overlayMany),

    listUpcomingJobs: () =>
      read(KEY.upcoming, live.listUpcomingJobs, overlayMany, async () => {
        const saved = await readCopy<Job[]>(copyKey(KEY.jobs));
        return fromSaved(saved && { value: saved.value.filter((job) => UPCOMING_STATUSES.includes(job.status)), savedAt: saved.savedAt }, overlayMany);
      }),

    getJob: (id) =>
      read(KEY.job(id), async () => {
        const job = await live.getJob(id);
        if (!job) throw new ApiError("NOT_FOUND", "No such job.", 404);
        return job;
      }, overlayOne, async () => fromSaved(await savedJob(id), overlayOne)).catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }),

    listMessages: (id) => read(KEY.messages(id), () => live.listMessages(id)),
    getEarnings: () => read(KEY.earnings, live.getEarnings),
    listCategories: (options) => (options?.all ? live.listCategories(options) : read(KEY.categories, () => live.listCategories())),
    getAreas: () => read(KEY.areas, live.getAreas),
    getPublicSettings: () => read(KEY.settings, live.getPublicSettings),

    createJob: async (input) => {
      const job = await live.createJob(input);
      askForPushSoon();
      return job;
    },

    setAvailability: async (available: boolean, preset?: OfflinePreset) => {
      const user = requireUser();
      await whenQueueLoaded();
      // This change supersedes any older one still waiting, whichever way it reaches the server.
      await dropQueuedAvailability(user);
      await sendQueuedFirst();
      const result = await attempt(() => live.setAvailability(available, preset));
      if (result.ok) {
        void saveCopy(copyKey(KEY.myWorker), result.value);
        return result.value;
      }
      const saved = await readCopy<WorkerSelf>(copyKey(KEY.myWorker));
      if (!saved) throw networkError();
      if (overlayCard(saved.value).status === "engaged") throw new ApiError("WORKER_ENGAGED", "Finish the current job first.", 409);
      await enqueue({ kind: "availability", userId: user, available, ...(preset ? { preset } : {}) });
      return markStale(overlayCard(saved.value), saved.savedAt);
    },

    completeDay: async (jobId, dayNumber) => {
      const user = requireUser();
      await sendQueuedFirst();
      const result = await attempt(() => live.completeDay(jobId, dayNumber));
      if (result.ok) return result.value;
      const saved = await savedJob(jobId);
      if (!saved) throw networkError();
      const job = overlayOne(saved.value);
      if (job.status !== "engaged") throw new ApiError("INVALID_JOB_STATE", "This job is not under way.", 409);
      const day = job.days.find((entry) => entry.dayNumber === dayNumber);
      if (!day) throw new ApiError("NOT_FOUND", "No such day.", 404);
      if (day.status === "skipped") throw new ApiError("DAY_SKIPPED", "This day was skipped.", 409);
      if (day.status === "scheduled") await enqueue({ kind: "complete-day", userId: user, jobId, dayNumber });
      return markStale(overlayOne(saved.value), saved.savedAt);
    },

    completeJob: async (jobId) => {
      const user = requireUser();
      await sendQueuedFirst();
      const result = await attempt(() => live.completeJob(jobId));
      if (result.ok) return result.value;
      const saved = await savedJob(jobId);
      if (!saved) throw networkError();
      const job = overlayOne(saved.value);
      if (job.status !== "engaged") throw new ApiError("INVALID_JOB_STATE", "This job is not under way.", 409);
      // Once every day is already waiting to be sent, tapping again adds nothing.
      if (job.days.every((day) => day.status !== "scheduled")) return markStale(job, saved.savedAt);
      // Ending a longer job early changes what is owed, so it waits for the server to be there.
      if (job.durationDays > 1) throw networkError();
      await enqueue({ kind: "complete-job", userId: user, jobId });
      return markStale(overlayOne(saved.value), saved.savedAt);
    },
  };

  const send = (action: QueuedAction): Promise<unknown> => {
    switch (action.kind) {
      case "availability":
        return live.setAvailability(action.available, action.preset).then((card) => saveCopy(copyKey(KEY.myWorker), card));
      case "complete-day":
        return live.completeDay(action.jobId, action.dayNumber);
      case "complete-job":
        return live.completeJob(action.jobId).catch(async (error: unknown) => {
          // The first try may have arrived with only its reply lost. Then the job being finished is success.
          if (errorCode(error) === "INVALID_JOB_STATE" && (await live.getJob(action.jobId))?.status === "completed") return;
          throw error;
        });
    }
  };

  /** Fetches what the worker will want offline, so it is there even for screens they have not opened yet. */
  async function prime(): Promise<void> {
    const user = live.currentUser();
    if (!user || !navigator.onLine) return;
    const tasks: [string, () => Promise<unknown>][] = [
      [KEY.jobs, api.listMyJobs],
      [KEY.categories, api.listCategories],
      [KEY.areas, api.getAreas],
    ];
    if (user.role === "worker" && user.workerId) {
      tasks.push([KEY.myWorker, api.getMyWorker], [KEY.myDetail, () => api.getWorker("me")], [KEY.earnings, api.getEarnings]);
    }
    if (user.role === "customer" && user.hasHirerProfile) tasks.push([KEY.myHirer, () => api.getHirer("me")]);
    for (const [key, load] of tasks) {
      const saved = await readCopy(copyKey(key));
      if (saved && Date.now() - saved.savedAt < PRIME_AFTER_MS) continue;
      await load().catch(() => undefined);
    }
  }

  let primeTimer: ReturnType<typeof setTimeout> | null = null;
  const schedulePrime = () => {
    if (primeTimer !== null) clearTimeout(primeTimer);
    primeTimer = setTimeout(() => {
      primeTimer = null;
      void prime();
    }, PRIME_DELAY_MS);
  };

  let knownUser = userId();
  live.onSessionChange(() => {
    const next = userId();
    if (next === knownUser) return;
    knownUser = next;
    void forgetCopiesExcept(next);
    schedulePrime();
    void flush();
  });

  live.onConnection((state) => {
    if (state === "live") {
      noteReachable();
      void flush();
    }
  });

  window.addEventListener("online", schedulePrime);
  startSync({ userId, send });
  schedulePrime();

  return api;
}
