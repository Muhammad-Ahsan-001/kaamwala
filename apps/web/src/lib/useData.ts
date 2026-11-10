import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type DependencyList } from "react";
import { data, type ConnectionState, type WsEvent, type WsEventType } from "../data";

type State<T> = { data: T | null; loading: boolean; error: string | null };

export type UseDataOptions = {
  /** Reload when any of these server events arrives, and after the socket reconnects. */
  reloadOn?: readonly WsEventType[];
  /** Narrow reloadOn, e.g. to one job: (e) => e.type === "job.updated" && e.job.id === id */
  when?: (event: WsEvent) => boolean;
};

/** Events often arrive in bursts, such as one per crew member. They share one reload. */
const RELOAD_COALESCE_MS = 200;

const sameDeps = (a: DependencyList, b: DependencyList) => a.length === b.length && a.every((value, index) => Object.is(value, b[index]));

/** Run an async loader, tracking loading and error, and reload on demand or on server events. */
export function useData<T>(load: () => Promise<T>, deps: DependencyList, options: UseDataOptions = {}) {
  const [state, setState] = useState<State<T>>({ data: null, loading: true, error: null });
  const [tick, setTick] = useState(0);
  const lastDeps = useRef<DependencyList | null>(null);
  const when = useRef(options.when);
  when.current = options.when;

  useEffect(() => {
    let active = true;
    const isReload = lastDeps.current !== null && sameDeps(lastDeps.current, deps);
    lastDeps.current = deps;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    load()
      .then((result) => {
        if (active) setState({ data: result, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (!active) return;
        const error = err instanceof Error ? err.message : String(err);
        // A background refresh that fails must not blank a screen that is showing good data.
        setState((prev) => ({ data: isReload ? prev.data : null, loading: false, error }));
      });
    return () => {
      active = false;
    };
    // The caller owns the dependency list, as with useEffect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  const reloadKey = options.reloadOn?.join(",") ?? "";
  useEffect(() => {
    if (!reloadKey) return;
    const types = new Set(reloadKey.split(","));
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      timer ??= setTimeout(() => {
        timer = null;
        reload();
      }, RELOAD_COALESCE_MS);
    };

    const offEvent = data.onEvent((event) => {
      if (types.has(event.type) && (when.current?.(event) ?? true)) schedule();
    });

    // Whatever happened while the socket was down was never delivered, so catch up.
    let wasLive = data.connection() === "live";
    const offConnection = data.onConnection((next) => {
      const live = next === "live";
      if (live && !wasLive) schedule();
      wasLive = live;
    });

    return () => {
      if (timer !== null) clearTimeout(timer);
      offEvent();
      offConnection();
    };
  }, [reloadKey, reload]);

  return { ...state, reload };
}

/** The status socket's real state, kept current. Use this to decide whether to show a "live" badge. */
export function useConnection(): ConnectionState {
  return useSyncExternalStore(data.onConnection, data.connection);
}
