import { useSyncExternalStore } from "react";
import { ApiError, errorCode, type ApiErrorCode } from "../data/errors";
import type { Job, OfflinePreset, WorkerCard } from "../data/types";
import { noticeStore, queueStore } from "../lib/offline";

type Base = { id: string; userId: string; queuedAt: number };

export type QueuedAction = Base &
  (
    | { kind: "availability"; available: boolean; preset?: OfflinePreset }
    | { kind: "complete-day"; jobId: string; dayNumber: number }
    /** Only ever a one-day job. Finishing a longer job early changes what is owed, so it needs the server. */
    | { kind: "complete-job"; jobId: string }
  );

type NewAction = QueuedAction extends infer A ? (A extends QueuedAction ? Omit<A, "id" | "queuedAt"> : never) : never;

/** Something the worker did offline that the server did not accept, kept until they have read why. */
export type SyncNotice = { id: string; userId: string; at: number; action: QueuedAction; outcome: "refused" | "expired"; code: ApiErrorCode };

export type SyncToast = { kind: "queued" } | { kind: "sent"; count: number };

export type SyncState = {
  /** What the browser says about the network. */
  online: boolean;
  /** False once a request to our server has failed, until one succeeds. Phones can have signal and no internet. */
  reachable: boolean;
  pending: QueuedAction[];
  notices: SyncNotice[];
  syncing: boolean;
  toast: SyncToast | null;
  /** The oldest saved copy shown during this outage. Null while everything is fresh. */
  savedAt: number | null;
  /** Goes up when screens should reload from the server. App keys its routes on this. */
  epoch: number;
};

let state: SyncState = {
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  reachable: true,
  pending: [],
  notices: [],
  syncing: false,
  toast: null,
  savedAt: null,
  epoch: 0,
};

const listeners = new Set<() => void>();

function patch(next: Partial<SyncState>): void {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getState = () => state;

export function useSyncState(): SyncState {
  return useSyncExternalStore(subscribe, getState);
}

/** App.tsx keys its routes on this, so every screen reloads from the server after a sync. */
export function useSyncEpoch(): number {
  return useSyncExternalStore(subscribe, () => state.epoch);
}

const queue = queueStore<QueuedAction>();
const noticesDb = noticeStore<SyncNotice>();

let currentUserId: () => string | null = () => null;
let sendToServer: ((action: QueuedAction) => Promise<unknown>) | null = null;

const inOrder = (actions: QueuedAction[]) => [...actions].sort((a, b) => a.queuedAt - b.queuedAt || a.id.localeCompare(b.id));

let sequence = 0;
const newId = () => `${Date.now().toString(36)}-${(sequence += 1)}`;

/** Disk is the truth when it works; if the browser refuses storage the in-memory list carries this visit. */
async function readFromDisk(): Promise<void> {
  try {
    patch({ pending: inOrder(await queue.all()), notices: (await noticesDb.all()).sort((a, b) => a.at - b.at) });
  } catch {
    // Keep what is in memory.
  }
}

async function eraseAction(id: string): Promise<void> {
  patch({ pending: state.pending.filter((action) => action.id !== id) });
  try {
    await queue.remove(id);
  } catch {
    // Storage is unavailable, so there was nothing on disk either.
  }
}

async function addNotice(action: QueuedAction, outcome: SyncNotice["outcome"], code: ApiErrorCode): Promise<void> {
  const notice: SyncNotice = { id: newId(), userId: action.userId, at: Date.now(), action, outcome, code };
  patch({ notices: [...state.notices, notice] });
  try {
    await noticesDb.put(notice);
  } catch {
    // It still shows during this visit.
  }
}

export async function dismissNotice(id: string): Promise<void> {
  patch({ notices: state.notices.filter((notice) => notice.id !== id) });
  try {
    await noticesDb.remove(id);
  } catch {
    // Storage is unavailable, so there was nothing on disk either.
  }
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function showToast(toast: SyncToast): void {
  if (toastTimer !== null) clearTimeout(toastTimer);
  patch({ toast });
  toastTimer = setTimeout(() => patch({ toast: null }), 4500);
}

/** Saves an action to send later. A newer availability change replaces any older one. */
export async function enqueue(action: NewAction): Promise<QueuedAction> {
  if (action.kind === "availability") {
    for (const old of state.pending) {
      if (old.kind === "availability" && old.userId === action.userId) await eraseAction(old.id);
    }
  }
  const stored = { ...action, id: newId(), queuedAt: Date.now() } as QueuedAction;
  try {
    await queue.put(stored);
  } catch {
    // Storage is unavailable: it stays queued in memory until the app is closed.
  }
  patch({ pending: inOrder([...state.pending, stored]) });
  showToast({ kind: "queued" });
  // Phones can report a connection that does not work, so no "online" event will come. Keep trying.
  if (navigator.onLine) retryLater();
  return stored;
}

/** The person took a queued action back. */
export async function cancelAction(id: string): Promise<void> {
  await eraseAction(id);
  requestReload();
}

export function pendingFor(userId: string | null): QueuedAction[] {
  return userId ? state.pending.filter((action) => action.userId === userId) : [];
}

/** Drops any queued availability change, because a newer one reached the server directly. */
export async function dropQueuedAvailability(userId: string): Promise<void> {
  for (const old of pendingFor(userId)) {
    if (old.kind === "availability") await eraseAction(old.id);
  }
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const PKT_OFFSET_MS = 5 * HOUR_MS;

/** When a busy preset would end. Null for "until I switch back". Mirrors the server's own rule. */
export function presetEnd(preset: OfflinePreset | undefined, from: number): number | null {
  switch (preset) {
    case "1h":
      return from + HOUR_MS;
    case "2h":
      return from + 2 * HOUR_MS;
    case "today":
      return (Math.floor((from + PKT_OFFSET_MS) / DAY_MS) + 1) * DAY_MS - PKT_OFFSET_MS;
    default:
      return null;
  }
}

/** A worker who said "busy for an hour" three hours ago is not busy now, so that change must not be sent. */
function outOfDate(action: QueuedAction): boolean {
  if (action.kind !== "availability" || action.available) return false;
  const end = presetEnd(action.preset, action.queuedAt);
  return end !== null && end <= Date.now();
}

/** What the worker's card looks like once their queued availability change is counted. */
export function overlayWorker(card: WorkerCard, pending: QueuedAction[]): WorkerCard {
  if (card.status === "engaged") return card;
  const latest = [...pending].reverse().find((action) => action.kind === "availability");
  if (latest?.kind !== "availability") return card;
  if (latest.available) return { ...card, status: "available", offlineUntil: null };
  const end = presetEnd(latest.preset, latest.queuedAt);
  return { ...card, status: "offline", offlineUntil: end === null ? null : new Date(end).toISOString() };
}

/**
 * What a job looks like once queued completions are counted, so a day that was marked done
 * offline is not offered again. The job's status stays as the server last said: only the server
 * can say a job is finished.
 */
export function overlayJob(job: Job, pending: QueuedAction[]): Job {
  const mine = pending.filter((action) => action.kind !== "availability" && action.jobId === job.id);
  if (mine.length === 0) return job;
  const doneDays = new Set(mine.flatMap((action) => (action.kind === "complete-day" ? [action.dayNumber] : [])));
  const wholeJob = mine.some((action) => action.kind === "complete-job");
  const at = new Date(mine[0]?.queuedAt ?? Date.now()).toISOString();
  return {
    ...job,
    days: job.days.map((day): Job["days"][number] => (day.status === "scheduled" && (wholeJob || doneDays.has(day.dayNumber)) ? { ...day, status: "completed", completedAt: at } : day)),
  };
}

export function isTransient(error: unknown): boolean {
  if (errorCode(error) === "NETWORK") return true;
  const status = error instanceof ApiError ? error.status : undefined;
  return status !== undefined && (status >= 500 || status === 429);
}

const FIRST_RETRY_MS = 8_000;
const MAX_RETRY_MS = 60_000;
let retryDelay = FIRST_RETRY_MS;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function retryLater(): void {
  if (retryTimer !== null) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flush();
  }, retryDelay);
  retryDelay = Math.min(MAX_RETRY_MS, retryDelay * 2);
}

/** Coming back online and finishing a sync happen close together. They share one reload. */
const RELOAD_SETTLE_MS = 400;
const RELOAD_RECHECK_MS = 1_500;
let reloadTimer: ReturnType<typeof setTimeout> | null = null;

const isTyping = (element: Element | null) => element instanceof HTMLTextAreaElement || (element instanceof HTMLInputElement && element.type !== "button");

/** Reloads every screen from the server, waiting until nobody is typing or reading a sheet. */
export function requestReload(): void {
  if (reloadTimer !== null) return;
  const attempt = () => {
    reloadTimer = null;
    if (document.querySelector('[role="dialog"]') || isTyping(document.activeElement)) {
      reloadTimer = setTimeout(attempt, RELOAD_RECHECK_MS);
      return;
    }
    patch({ epoch: state.epoch + 1 });
  };
  reloadTimer = setTimeout(attempt, RELOAD_SETTLE_MS);
}

/** Two tabs replaying the same queue would be a double-send. */
async function exclusively(task: () => Promise<void>): Promise<void> {
  if (!navigator.locks) {
    await task();
    return;
  }
  await navigator.locks.request("kw-sync", { ifAvailable: true }, async (lock) => {
    if (lock) await task();
  });
}

async function drain(): Promise<void> {
  const userId = currentUserId();
  if (!userId || !navigator.onLine || !sendToServer) return;
  await readFromDisk();
  const todo = pendingFor(userId);
  if (todo.length === 0) return;

  patch({ syncing: true });
  let sent = 0;
  let changed = 0;
  let stalled = false;
  const refusedJobs = new Set<string>();

  for (const action of todo) {
    if (outOfDate(action)) {
      await addNotice(action, "expired", "UNKNOWN");
      await eraseAction(action.id);
      changed += 1;
      continue;
    }
    // Later days of a job the server just refused would only fail the same way.
    if (action.kind !== "availability" && refusedJobs.has(action.jobId)) {
      await eraseAction(action.id);
      changed += 1;
      continue;
    }
    try {
      await sendToServer(action);
      await eraseAction(action.id);
      sent += 1;
      changed += 1;
    } catch (error) {
      if (isTransient(error)) {
        stalled = true;
        break;
      }
      // Signed out meanwhile. The action waits for this person to sign in again.
      if (currentUserId() !== userId) break;
      await addNotice(action, "refused", errorCode(error));
      await eraseAction(action.id);
      changed += 1;
      if (action.kind !== "availability") refusedJobs.add(action.jobId);
    }
  }

  patch({ syncing: false });
  if (stalled) {
    noteUnreachable();
    retryLater();
  } else {
    retryDelay = FIRST_RETRY_MS;
    if (changed > 0) noteReachable();
  }
  if (sent > 0) showToast({ kind: "sent", count: sent });
  if (changed > 0) requestReload();
}

let draining: Promise<void> | null = null;

/** Sends whatever is queued. Safe to call at any time. */
export function flush(): Promise<void> {
  draining ??= exclusively(drain).finally(() => {
    draining = null;
  });
  return draining;
}

const NOTICEABLE_OUTAGE_MS = 3_000;
let outageFrom: number | null = null;

/** Screens that failed during the outage get another go now that it is over. */
function afterOutage(): void {
  const from = outageFrom;
  outageFrom = null;
  if (from !== null && Date.now() - from >= NOTICEABLE_OUTAGE_MS) requestReload();
}

export function noteReachable(): void {
  if (state.reachable && state.savedAt === null) return;
  const wasDown = !state.reachable;
  patch({ reachable: true, savedAt: null });
  if (wasDown) {
    afterOutage();
    void flush();
  }
}

export function noteUnreachable(): void {
  outageFrom ??= Date.now();
  if (state.reachable) patch({ reachable: false });
}

export function noteSavedCopyShown(savedAt: number): void {
  if (state.savedAt === null || savedAt < state.savedAt) patch({ savedAt });
}

let started = false;
let loaded: Promise<void> = Promise.resolve();

/** Resolves once the queue saved on this phone has been read, so nothing is drawn as if it were empty. */
export function whenQueueLoaded(): Promise<void> {
  return loaded;
}

export function startSync(options: { userId: () => string | null; send: (action: QueuedAction) => Promise<unknown> }): void {
  currentUserId = options.userId;
  sendToServer = options.send;
  if (started) return;
  started = true;
  loaded = readFromDisk();

  window.addEventListener("online", () => {
    patch({ online: true, reachable: true, savedAt: null });
    afterOutage();
    void flush();
  });
  window.addEventListener("offline", () => {
    outageFrom ??= Date.now();
    patch({ online: false });
  });
  // A phone can sit in the background across a whole outage, and another tab may have sent things.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void readFromDisk().then(flush);
  });

  void loaded.then(flush);
}
