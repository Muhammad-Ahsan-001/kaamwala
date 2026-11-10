import { useSyncExternalStore } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const SNOOZE_KEY = "kw.install.snoozedAt";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

function readNumber(key: string): number {
  try {
    return Number(window.localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

function writeNumber(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Private windows can refuse storage; the card may then come back next visit.
  }
}

export function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** iPhones and iPads have no install prompt, only the manual Share menu route. iPadOS reports itself as a Mac. */
function isAppleMobile(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export type InstallState = {
  /** The browser offered an install we can trigger from our own button. */
  canPrompt: boolean;
  /** An iPhone that has not added the app yet. It needs the manual steps. */
  needsIphoneSteps: boolean;
  installed: boolean;
  snoozed: boolean;
};

let deferred: BeforeInstallPromptEvent | null = null;
let justInstalled = false;

function compute(): InstallState {
  const standalone = isStandalone();
  return {
    canPrompt: deferred !== null && !standalone,
    needsIphoneSteps: isAppleMobile() && !standalone,
    installed: standalone || justInstalled,
    snoozed: Date.now() - readNumber(SNOOZE_KEY) < SNOOZE_MS,
  };
}

let snapshot = compute();
const listeners = new Set<() => void>();

function refresh(): void {
  snapshot = compute();
  for (const listener of listeners) listener();
}

// Registered when this module loads: the browser fires this once, often before React has rendered.
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferred = event as BeforeInstallPromptEvent;
  refresh();
});

window.addEventListener("appinstalled", () => {
  deferred = null;
  justInstalled = true;
  refresh();
});

export function useInstall(): InstallState {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, () => snapshot);
}

export function snoozeInstall(): void {
  writeNumber(SNOOZE_KEY, Date.now());
  refresh();
}

export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const event = deferred;
  if (!event) return "unavailable";
  // The browser only lets each of these be used once.
  deferred = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === "dismissed") snoozeInstall();
  else refresh();
  return outcome;
}
