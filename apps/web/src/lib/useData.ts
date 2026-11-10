import { useCallback, useEffect, useState, type DependencyList } from "react";

type State<T> = { data: T | null; loading: boolean; error: string | null };

/** Run an async loader, tracking loading and error, and reload on demand. */
export function useData<T>(load: () => Promise<T>, deps: DependencyList) {
  const [state, setState] = useState<State<T>>({ data: null, loading: true, error: null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    load()
      .then((data) => {
        if (active) setState({ data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (active) setState({ data: null, loading: false, error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      active = false;
    };
    // The caller owns the dependency list, as with useEffect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
