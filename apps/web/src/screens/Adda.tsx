import { SearchX, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { data } from "../data";
import { DEFAULT_CENTER } from "../data/defaults";
import { categoryName } from "../data/labels";
import { useData } from "../lib/useData";
import { useSettings } from "../lib/settings";
import { Async } from "../ui/async";
import { CategoryIcon } from "../ui/CategoryIcon";
import { DragSheet, SHEET_DEFAULT_VISIBLE } from "../ui/DragSheet";
import { WorkerRow } from "../ui/people";
import { Chip, EmptyState, ListSkeleton, Skeleton, cx } from "../ui/primitives";
import { LangCycle, Screen } from "../ui/shell";
import { WorkersMap } from "../ui/WorkersMap";

const RADII = [3, 5, 10];

export function Adda() {
  const { t, lang } = useSettings();
  const [params, setParams] = useSearchParams();
  const categoryId = params.get("cat") || undefined;
  const hireQuery = useMemo(() => {
    const days = params.get("days");
    const start = params.get("start");
    return days && start ? `?days=${days}&start=${start}` : "";
  }, [params]);
  const [radiusKm, setRadiusKm] = useState(3);
  const [topRated, setTopRated] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [center, setCenter] = useState(DEFAULT_CENTER);

  const categories = useData(() => data.listCategories(), []);
  const workers = useData(() => data.listWorkers({ categoryId, radiusKm, center, minRating: topRated ? 4 : undefined }), [categoryId, radiusKm, center, topRated]);

  useEffect(() => data.onCategoriesChanged(categories.reload), [categories.reload]);

  const ordered = useMemo(() => {
    if (!workers.data || !selected) return workers.data;
    return [...workers.data].sort((a, b) => Number(b.id === selected) - Number(a.id === selected));
  }, [workers.data, selected]);

  const setCategory = (id?: string) => {
    const next = new URLSearchParams(params);
    if (id) next.set("cat", id);
    else next.delete("cat");
    setParams(next, { replace: true });
    setSelected(null);
  };

  const locate = () => {
    navigator.geolocation?.getCurrentPosition((position) => setCenter({ lat: position.coords.latitude, lng: position.coords.longitude }), () => undefined, { timeout: 8000 });
  };

  const live = data.connection() === "live";
  const count = workers.data?.length ?? 0;
  const insetEstimate = Math.round((window.innerHeight - 64) * SHEET_DEFAULT_VISIBLE);

  const header = (
    <div className="scroll-x flex gap-2 overflow-x-auto px-4 pb-2">
      <Chip active={!categoryId} onClick={() => setCategory()}>
        {t("سب", "Sab", "All")}
      </Chip>
      {categories.data?.map((category) => (
        <Chip key={category.id} active={categoryId === category.id} onClick={() => setCategory(category.id)}>
          <CategoryIcon name={category.icon} className="h-5 w-5" />
          {categoryName(category, lang)}
        </Chip>
      ))}
      <Chip active={topRated} icon={Star} onClick={() => setTopRated((v) => !v)}>
        <span className="latin">4+</span>
      </Chip>
    </div>
  );

  return (
    <Screen nav="customer" bare>
      <div className="relative overflow-hidden" style={{ height: "calc(100dvh - 4rem - env(safe-area-inset-bottom))" }}>
        <div className="absolute inset-0">
          {workers.data ? <WorkersMap workers={workers.data} center={center} radiusKm={radiusKm} selectedId={selected} onSelect={setSelected} onLocate={locate} bottomInset={insetEstimate} /> : <Skeleton className="h-full w-full rounded-none" />}
        </div>

        <div className="absolute right-3 top-[72px] z-[400] rounded-2xl bg-surface shadow-card">
          <LangCycle />
        </div>

        <div className="absolute left-3 top-3 z-[400] flex items-center gap-2 rounded-full bg-surface px-3 py-2 text-sm font-bold shadow-card">
          {live && (
            <>
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-70" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-500" />
              </span>
              <span>{t("لائیو", "Live", "Live")} ·</span>
            </>
          )}
          <span>
            <span className="latin">{count}</span> {t("فارغ کاریگر", "farigh kaarigar", "available")}
          </span>
        </div>

        <DragSheet header={header} label={t("فہرست اوپر نیچے کریں", "List upar neeche karein", "Move the list up or down")}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h1 className="text-lg">{t("قریب کے کاریگر", "Qareeb ke kaarigar", "Workers nearby")}</h1>
            <div className="flex gap-1" role="group" aria-label={t("فاصلہ", "Faasla", "Distance")}>
              {RADII.map((km) => (
                <button key={km} dir="ltr" type="button" aria-pressed={radiusKm === km} onClick={() => setRadiusKm(km)} className={cx("latin h-12 min-w-12 rounded-2xl px-2 text-sm font-bold transition active:scale-95", radiusKm === km ? "bg-brand-600 text-white" : "bg-sunken text-soft")}>
                  {km} km
                </button>
              ))}
            </div>
          </div>
          <Async query={{ ...workers, data: ordered }} skeleton={<ListSkeleton />}>
            {(list) =>
              list.length === 0 ? (
                <EmptyState icon={SearchX} title={t("ابھی اس علاقے میں کوئی فارغ نہیں", "Abhi is ilaqay mein koi farigh nahi", "Nobody is available here right now")} body={t("فاصلہ بڑھا کر دیکھیں", "Faasla barha kar dekhein", "Try a wider distance")} />
              ) : (
                <div className="stagger space-y-3">
                  {list.map((worker) => (
                    <WorkerRow key={worker.id} worker={worker} highlighted={worker.id === selected} hireQuery={hireQuery} />
                  ))}
                </div>
              )
            }
          </Async>
        </DragSheet>
      </div>
    </Screen>
  );
}
