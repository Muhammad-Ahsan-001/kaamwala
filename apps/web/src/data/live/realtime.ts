import type { ConnectionState, WsEvent, WsEventType } from "../types";
import { WS_URL } from "./http";
import { sessionStore } from "./session-store";

/** The server sends a heartbeat every 30 seconds. Missing two means the socket is dead. */
const HEARTBEAT_TIMEOUT_MS = 75_000;
const BACKOFF_FIRST_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
/** A socket only counts as healthy once it has stayed up this long, so a flapping one keeps backing off. */
const STABLE_AFTER_MS = 10_000;

const CLOSE_TOKEN_EXPIRED = 4401;
const CLOSE_SUSPENDED = 4403;

const EVENT_TYPES = new Set<string>([
  "worker.status",
  "job.updated",
  "offer.created",
  "offer.updated",
  "message.created",
  "message.transcribed",
  "categories.changed",
  "crew.invited",
  "job.closed",
] satisfies WsEventType[]);

const eventListeners = new Set<(event: WsEvent) => void>();
const connectionListeners = new Set<(state: ConnectionState) => void>();

let started = false;
let socket: WebSocket | null = null;
let state: ConnectionState = "connecting";
let attempts = 0;
let lastFrameAt = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
let stableTimer: ReturnType<typeof setTimeout> | null = null;

function setState(next: ConnectionState): void {
  if (state === next) return;
  state = next;
  for (const listener of connectionListeners) listener(next);
}

function clearTimers(): void {
  if (retryTimer !== null) clearTimeout(retryTimer);
  if (watchdogTimer !== null) clearTimeout(watchdogTimer);
  if (stableTimer !== null) clearTimeout(stableTimer);
  retryTimer = watchdogTimer = stableTimer = null;
}

/** Forgets the current socket. Its handlers check it is still the current one, so they go quiet. */
function drop(): void {
  const old = socket;
  socket = null;
  clearTimers();
  if (!old) return;
  try {
    old.close();
  } catch {
    // Already closed.
  }
}

function retryLater(): void {
  if (retryTimer !== null) return;
  const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_FIRST_MS * 2 ** attempts);
  attempts += 1;
  // Jitter, so every phone does not come back at the same instant after a restart.
  const jittered = delay * (0.8 + Math.random() * 0.4);
  setState(navigator.onLine ? "connecting" : "offline");
  retryTimer = setTimeout(() => {
    retryTimer = null;
    connect();
  }, jittered);
}

function armWatchdog(): void {
  if (watchdogTimer !== null) clearTimeout(watchdogTimer);
  watchdogTimer = setTimeout(() => {
    drop();
    retryLater();
  }, HEARTBEAT_TIMEOUT_MS);
}

function receive(raw: unknown): void {
  if (typeof raw !== "string") return;
  let parsed: { type?: unknown };
  try {
    parsed = JSON.parse(raw) as { type?: unknown };
  } catch {
    return;
  }
  if (typeof parsed.type !== "string" || !EVENT_TYPES.has(parsed.type)) return;
  for (const listener of [...eventListeners]) {
    try {
      listener(parsed as WsEvent);
    } catch (error) {
      console.error("event listener failed", error);
    }
  }
}

function connect(): void {
  drop();
  if (!navigator.onLine) {
    setState("offline");
    return;
  }
  setState("connecting");

  const token = sessionStore.token();
  let ws: WebSocket;
  try {
    ws = new WebSocket(`${WS_URL}/v1/ws${token ? `?token=${encodeURIComponent(token)}` : ""}`);
  } catch {
    retryLater();
    return;
  }
  socket = ws;

  ws.onopen = () => {
    if (ws !== socket) return;
    lastFrameAt = Date.now();
    armWatchdog();
    stableTimer = setTimeout(() => {
      attempts = 0;
    }, STABLE_AFTER_MS);
    setState("live");
  };

  ws.onmessage = (event) => {
    if (ws !== socket) return;
    lastFrameAt = Date.now();
    armWatchdog();
    receive(event.data);
  };

  ws.onclose = (event) => {
    if (ws !== socket) return;
    socket = null;
    clearTimers();
    if (event.code === CLOSE_TOKEN_EXPIRED || event.code === CLOSE_SUSPENDED) {
      // The session is over. Clearing it reconnects as an anonymous socket for public events.
      sessionStore.clear();
      return;
    }
    retryLater();
  };
}

function reconnectNow(): void {
  attempts = 0;
  connect();
}

function isStale(): boolean {
  return socket === null || Date.now() - lastFrameAt > HEARTBEAT_TIMEOUT_MS;
}

function start(): void {
  if (started) return;
  started = true;

  window.addEventListener("online", reconnectNow);
  window.addEventListener("offline", () => {
    drop();
    setState("offline");
  });
  // Phones freeze timers in the background, so check again the moment the app is looked at.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && isStale()) reconnectNow();
  });

  // Signing in or out changes what this socket may hear.
  let knownToken = sessionStore.token();
  sessionStore.subscribe(() => {
    if (sessionStore.token() === knownToken) return;
    knownToken = sessionStore.token();
    reconnectNow();
  });

  connect();
}

export const realtime = {
  start,
  connection: (): ConnectionState => state,
  onConnection(listener: (next: ConnectionState) => void): () => void {
    connectionListeners.add(listener);
    return () => {
      connectionListeners.delete(listener);
    };
  },
  onEvent(listener: (event: WsEvent) => void): () => void {
    start();
    eventListeners.add(listener);
    return () => {
      eventListeners.delete(listener);
    };
  },
};
