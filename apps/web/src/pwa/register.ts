import { useSyncExternalStore } from "react";
import { registerSW } from "virtual:pwa-register";

const UPDATE_CHECK_MS = 60 * 60 * 1000;

let apply: ((reload?: boolean) => Promise<void>) | null = null;
let waiting = false;
const listeners = new Set<() => void>();

/** Registers the service worker. In the dev server this does nothing, so there is no offline mode there. */
export function startServiceWorker(): void {
  if (apply) return;
  apply = registerSW({
    immediate: true,
    onNeedRefresh() {
      waiting = true;
      for (const listener of listeners) listener();
    },
    onRegisteredSW(_url, worker) {
      if (worker) setInterval(() => void worker.update().catch(() => undefined), UPDATE_CHECK_MS);
    },
  });
}

/** True once a new version is downloaded and waiting. */
export function useUpdateWaiting(): boolean {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, () => waiting);
}

/** Takes the new version. The plugin only reloads when the worker already controlled this page at load. */
export function applyUpdate(): void {
  navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
  void apply?.(true);
}
