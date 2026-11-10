import { data } from "../data";
import { pushEndpoint } from "./signals";

export type PushState =
  /** This browser cannot receive push at all. */
  | "unsupported"
  /** An iPhone receives push only once the app is on the home screen. */
  | "needs-install"
  /** The server has no push keys, so nothing would ever arrive. */
  | "server-off"
  /** Could not find out yet: no internet to ask the server, or the service worker is still installing. */
  | "unknown"
  | "ask"
  | "blocked"
  | "on"
  | "off";

const OFF_KEY = "kw.push.off";
const ASKED_KEY = "kw.push.asked";

/** Do not keep nagging: at most this many soft asks, this far apart. */
const MAX_ASKS = 3;
const ASK_GAP_MS = 3 * 24 * 60 * 60 * 1000;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Private windows can refuse storage; the choice then lasts for this visit only.
  }
}

const supported = () => "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;

const appleMobile = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** Null when no service worker takes charge in time, as in the dev server where none is registered. */
async function registration(waitMs: number): Promise<ServiceWorkerRegistration | null> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), waitMs));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

function sameKey(current: ArrayBuffer | null, wanted: Uint8Array): boolean {
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === wanted.length && bytes.every((value, index) => value === wanted[index]);
}

/** Subscribes this browser, replacing a subscription made with an older server key, and tells the server. */
async function subscribe(worker: ServiceWorkerRegistration, publicKey: string): Promise<void> {
  const applicationServerKey = keyBytes(publicKey);
  let subscription = await worker.pushManager.getSubscription();
  if (subscription && !sameKey(subscription.options.applicationServerKey, applicationServerKey)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
  await data.subscribePush(subscription.toJSON());
  pushEndpoint.set(subscription.endpoint);
}

export async function pushStatus(): Promise<PushState> {
  if (!supported()) return appleMobile() ? "needs-install" : "unsupported";
  let key;
  try {
    key = await data.getPushKey();
  } catch {
    return "unknown";
  }
  if (!key.enabled || !key.publicKey) return "server-off";
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission === "default") return "ask";
  const worker = await registration(3_000);
  if (!worker) return "unknown";
  return (await worker.pushManager.getSubscription()) ? "on" : "off";
}

/**
 * Asks the browser for permission and subscribes. Call only from a tap: phones ignore the request otherwise,
 * and on iPhone the request has to come before anything else in the handler.
 */
export async function enablePush(): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission === "denied") return "blocked";
  if (permission !== "granted") return "ask";
  const key = await data.getPushKey();
  if (!key.enabled || !key.publicKey) return "server-off";
  const worker = await registration(15_000);
  if (!worker) return "unsupported";
  await subscribe(worker, key.publicKey);
  write(OFF_KEY, null);
  return "on";
}

export async function disablePush(): Promise<void> {
  write(OFF_KEY, "1");
  const worker = await registration(3_000);
  const subscription = await worker?.pushManager.getSubscription();
  if (subscription) {
    await data.unsubscribePush(subscription.endpoint).catch(() => undefined);
    await subscription.unsubscribe();
  }
  pushEndpoint.set(null);
}

/** Keeps the server current after a sign-in or a browser-side change. Asks nobody anything. */
export async function resyncPush(): Promise<void> {
  if (!supported() || Notification.permission !== "granted" || read(OFF_KEY)) return;
  try {
    const key = await data.getPushKey();
    if (!key.enabled || !key.publicKey) return;
    const worker = await registration(10_000);
    if (worker) await subscribe(worker, key.publicKey);
  } catch {
    // Tried again on the next start.
  }
}

export function mayAskForPush(): boolean {
  const [count = 0, at = 0] = (read(ASKED_KEY) ?? "").split(":").map(Number);
  return count < MAX_ASKS && Date.now() - at > ASK_GAP_MS;
}

export function recordPushAsk(): void {
  const [count = 0] = (read(ASKED_KEY) ?? "").split(":").map(Number);
  write(ASKED_KEY, `${count + 1}:${Date.now()}`);
}
