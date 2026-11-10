import { RefreshCw, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import { useSettings } from "../lib/settings";
import { Button, ListSkeleton } from "./primitives";

export type Query<T> = { data: T | null; loading: boolean; error: string | null; reload: () => void };

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useSettings();
  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl bg-sunken px-6 py-8 text-center" role="alert">
      <WifiOff className="h-10 w-10 text-soft" aria-hidden />
      <p className="text-lg font-bold">{t("معلومات نہیں مل سکیں", "Maloomat nahi mil saki", "Could not load this")}</p>
      <p className="text-soft">{t("انٹرنیٹ دیکھ کر دوبارہ کوشش کریں", "Internet dekh kar dobara koshish karein", "Check your internet and try again")}</p>
      <Button size="md" variant="secondary" icon={RefreshCw} onClick={onRetry}>
        {t("دوبارہ", "Dobara", "Try again")}
      </Button>
    </div>
  );
}

/**
 * Standard loading and error handling around a query.
 * A finished query with a null result is passed on, so screens can show "not found".
 */
export function Async<T>({ query, skeleton, children }: { query: Query<T>; skeleton?: ReactNode; children: (data: T) => ReactNode }) {
  if (query.data === null && query.error) return <ErrorState onRetry={query.reload} />;
  if (query.data === null && query.loading) return <>{skeleton ?? <ListSkeleton />}</>;
  return <>{children(query.data as T)}</>;
}
