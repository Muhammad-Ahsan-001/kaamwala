import { LoaderCircle, LocateFixed, MapPin, Megaphone, SearchX, Star, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { data, type Area, type LatLng, type WorkerCard } from "../data";
import { categoryName } from "../data/labels";
import { useConnection, useData } from "../lib/useData";
import { useSettings } from "../lib/settings";
import { Async } from "../ui/async";
import { CategoryIcon } from "../ui/CategoryIcon";
import { DragSheet, SHEET_DEFAULT_VISIBLE } from "../ui/DragSheet";
import { AreaSheet, placeName, useJobPlace } from "../ui/hire";
import { WorkerRow } from "../ui/people";
import { Button, Chip, EmptyState, LinkButton, ListSkeleton, Skeleton, cx } from "../ui/primitives";
import { LogoutButton } from "../ui/LogoutButton";
import { LangCycle, Screen } from "../ui/shell";
import { WorkersMap } from "../ui/WorkersMap";

const RADII = [3, 5, 10];
const GPS_TIMEOUT_MS = 8_000;
const GPS_MAX_AGE_MS = 60_000;

type Origin = { center: LatLng; kind: "gps" | "home" | "area"; label: string | null };
type GpsState = "idle" | "asking" | "blocked" | "failed";

/** Survives going to a profile and coming back, so the customer is not located all over again. */
let lastOrigin: Origin | null = null;

function LiveBadge({ count }: { count: number | null }) {
  const { t } = useSettings();
  const connection = useConnection();
  return (
    <div role="status" className="flex max-w-full items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-sm font-bold shadow-card">
      {connection === "live" ? (
        <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-70" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-500" />
        </span>
      ) : (
        <span className={cx("h-2.5 w-2.5 shrink-0 rounded-full", connection === "connecting" ? "bg-amber-400" : "bg-faint")} aria-hidden />
      )}
      <span className="truncate">
        {connection === "live" ? t("لائیو", "Live", "Live") : connection === "connecting" ? t("جڑ رہا ہے", "Jurr raha hai", "Reconnecting") : t("آف لائن", "Offline", "Offline")}
        {count !== null && (
          <>
            {" · "}
            <span className="latin">{count}</span> {t("فارغ کاریگر", "farigh kaarigar", "available")}
          </>
        )}
      </span>
    </div>
  );
}

export function Adda() {
  const { t, lang } = useSettings();
  const [params, setParams] = useSearchParams();
  const categoryId = params.get("cat") || undefined;
  const hireQuery = useMemo(() => {
    const query = new URLSearchParams();
    const days = params.get("days");
    const start = params.get("start");
    if (days && start) {
      query.set("days", days);
      query.set("start", start);
    }
    if (categoryId) query.set("cat", categoryId);
    const text = query.toString();
    return text ? `?${text}` : "";
  }, [params, categoryId]);
  const [radiusKm, setRadiusKm] = useState(RADII[0] as number);
  const [topRated, setTopRated] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [origin, setOriginState] = useState<Origin | null>(lastOrigin);
  const [gps, setGps] = useState<GpsState>("idle");
  const [choosingArea, setChoosingArea] = useState(false);
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const pickedByHand = useRef(lastOrigin?.kind === "area");
  const reconnected = useRef(false);
  const chips = useRef<HTMLDivElement>(null);

  const jobPlace = useJobPlace();
  const home = jobPlace.place;
  const center = origin?.center ?? null;

  const categories = useData(() => data.listCategories(), []);
  const workers = useData<WorkerCard[] | null>(
    () => (center ? data.listWorkers({ categoryId, radiusKm, center, minRating: topRated ? 4 : undefined }) : Promise.resolve(null)),
    [categoryId, radiusKm, center, topRated],
    // Someone leaving is applied straight from the event below. Someone coming back needs their full card.
    { reloadOn: ["worker.status"], when: (event) => event.type === "worker.status" && event.status === "available" },
  );

  useEffect(() => data.onCategoriesChanged(categories.reload), [categories.reload]);

  // A worker who stops being available leaves the map and list the moment the event arrives.
  useEffect(
    () =>
      data.onEvent((event) => {
        if (event.type !== "worker.status") return;
        setGone((current) => {
          if (event.status !== "available" && current.has(event.workerId)) return current;
          if (event.status === "available" && !current.has(event.workerId)) return current;
          const next = new Set(current);
          if (event.status === "available") next.delete(event.workerId);
          else next.add(event.workerId);
          return next;
        });
      }),
    [],
  );

  // Events missed while disconnected are settled by the fresh list that follows reconnecting.
  useEffect(
    () =>
      data.onConnection((state) => {
        if (state === "live") reconnected.current = true;
      }),
    [],
  );
  useEffect(() => {
    if (!reconnected.current || workers.loading) return;
    reconnected.current = false;
    setGone(new Set());
  }, [workers.data, workers.loading]);

  const setOrigin = useCallback((next: Origin) => {
    lastOrigin = next;
    setOriginState(next);
  }, []);

  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setGps("failed");
      return;
    }
    setGps("asking");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGps("idle");
        // The customer chose an area while this was still looking, and that choice stands.
        if (pickedByHand.current) return;
        setOrigin({ center: { lat: position.coords.latitude, lng: position.coords.longitude }, kind: "gps", label: null });
      },
      (error) => setGps(error.code === error.PERMISSION_DENIED ? "blocked" : "failed"),
      { timeout: GPS_TIMEOUT_MS, maximumAge: GPS_MAX_AGE_MS },
    );
  }, [setOrigin]);

  useEffect(() => {
    if (!lastOrigin) locate();
  }, [locate]);

  // The saved area shows something useful at once, and is the fallback if the phone gives no location.
  useEffect(() => {
    if (!origin && home) setOrigin({ center: home.location, kind: "home", label: home.area });
  }, [origin, home, setOrigin]);

  const noLocation = gps === "blocked" || gps === "failed";
  const mustChoose = !origin && !home && noLocation && !jobPlace.loading;
  useEffect(() => {
    if (mustChoose) setChoosingArea(true);
  }, [mustChoose]);

  const chooseArea = (area: Area) => {
    pickedByHand.current = true;
    setGps("idle");
    setOrigin({ center: { lat: area.lat, lng: area.lng }, kind: "area", label: area.name });
    jobPlace.pick(area);
    setChoosingArea(false);
    setSelected(null);
  };

  const backToMyLocation = () => {
    pickedByHand.current = false;
    locate();
  };

  const visible = useMemo(() => workers.data?.filter((worker) => !gone.has(worker.id)) ?? null, [workers.data, gone]);

  const ordered = useMemo(() => {
    if (!visible || !selected) return visible;
    return [...visible].sort((a, b) => Number(b.id === selected) - Number(a.id === selected));
  }, [visible, selected]);

  const setCategory = (id?: string) => {
    const next = new URLSearchParams(params);
    if (id) next.set("cat", id);
    else next.delete("cat");
    setParams(next, { replace: true });
    setSelected(null);
  };

  // A trade chosen on the previous screen may be far along the row.
  const categoryCount = categories.data?.length ?? 0;
  useEffect(() => {
    if (!categoryId || categoryCount === 0) return;
    chips.current?.querySelector('[aria-pressed="true"][data-category]')?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [categoryId, categoryCount]);

  const insetEstimate = Math.round((window.innerHeight - 64) * SHEET_DEFAULT_VISIBLE);
  const nextRadius = RADII.find((km) => km > radiusKm);
  const originName = origin?.label ? placeName(origin.label, jobPlace.areas.data, lang) : null;
  const whereText =
    gps === "asking" && !origin
      ? t("آپ کی جگہ ڈھونڈ رہے ہیں…", "Aap ki jagah dhoond rahe hain…", "Finding your location…")
      : origin?.kind === "gps"
        ? t("آپ کی جگہ کے قریب", "Aap ki jagah ke qareeb", "Near your location")
        : originName
          ? t(`${originName} کے قریب`, `${originName} ke qareeb`, `Near ${originName}`)
          : t("علاقہ چنیں", "Ilaqa chunein", "Choose an area");
  const fallbackNote =
    noLocation && origin?.kind === "home"
      ? gps === "blocked"
        ? t("لوکیشن کی اجازت نہیں ملی", "Location ki ijazat nahi mili", "Location not allowed")
        : t("لوکیشن نہیں مل سکی", "Location nahi mil saki", "Could not get your location")
      : null;

  const header = (
    <div ref={chips} className="scroll-x flex gap-2 overflow-x-auto px-4 pb-2">
      <Chip active={!categoryId} onClick={() => setCategory()}>
        {t("سب", "Sab", "All")}
      </Chip>
      <Chip active={topRated} icon={Star} onClick={() => setTopRated((v) => !v)}>
        <span dir="ltr" className="latin">
          4+
        </span>
      </Chip>
      {categories.data?.map((category) => (
        <Chip key={category.id} data-category active={categoryId === category.id} onClick={() => setCategory(category.id)}>
          <CategoryIcon name={category.icon} className="h-5 w-5" />
          {categoryName(category, lang)}
        </Chip>
      ))}
    </div>
  );

  const postLink = (
    <div className="space-y-2">
      <LinkButton to="/app/describe" variant="secondary" size="md" className="w-full" icon={Megaphone}>
        {t("کام پوسٹ کریں، آفرز لیں", "Kaam post karein, offers lein", "Post the job, get offers")}
      </LinkButton>
      <LinkButton to="/app/crew-job" variant="secondary" size="md" className="w-full" icon={UsersRound}>
        {t("پوری ٹیم بلائیں", "Poori crew bulao", "Hire a whole crew")}
      </LinkButton>
    </div>
  );

  return (
    <Screen nav="customer" bare>
      <div className="relative overflow-hidden" style={{ height: "calc(100dvh - 4rem - env(safe-area-inset-bottom))" }}>
        <div className="absolute inset-0">
          {center ? <WorkersMap workers={visible ?? []} center={center} radiusKm={radiusKm} selectedId={selected} onSelect={setSelected} onLocate={backToMyLocation} locating={gps === "asking"} bottomInset={insetEstimate} /> : <Skeleton className="h-full w-full rounded-none" />}
        </div>

        <div className="absolute right-3 top-[72px] z-[400] flex flex-col rounded-2xl bg-surface shadow-card">
          <LangCycle />
          <LogoutButton />
        </div>

        <div className="absolute left-3 top-3 z-[400] flex max-w-[calc(100%-5.5rem)] flex-col items-start gap-2">
          <LiveBadge count={visible ? visible.length : null} />
          <button type="button" onClick={() => setChoosingArea(true)} className="flex min-h-12 max-w-full items-center gap-2 rounded-2xl bg-surface px-3 py-1 text-start text-sm font-semibold shadow-card transition active:scale-[0.99]">
            {gps === "asking" ? <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-brand-600" aria-hidden /> : origin?.kind === "gps" ? <LocateFixed className="h-5 w-5 shrink-0 text-brand-600" aria-hidden /> : <MapPin className="h-5 w-5 shrink-0 text-brand-600" aria-hidden />}
            <span className="min-w-0">
              <span className="block truncate">{whereText}</span>
              {fallbackNote && <span className="block truncate text-xs font-normal text-amber-700">{fallbackNote}</span>}
            </span>
            <span className="shrink-0 font-bold text-brand-700">{t("بدلیں", "Badlein", "Change")}</span>
          </button>
        </div>

        <DragSheet header={header} label={t("فہرست اوپر نیچے کریں", "List upar neeche karein", "Move the list up or down")} revealKey={selected}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h1 className="min-w-0 truncate text-lg">{t("قریب کے کاریگر", "Qareeb ke kaarigar", "Workers nearby")}</h1>
            <div className="flex shrink-0 gap-1" role="group" aria-label={t("فاصلہ", "Faasla", "Distance")}>
              {RADII.map((km) => (
                <button key={km} dir="ltr" type="button" aria-pressed={radiusKm === km} onClick={() => setRadiusKm(km)} className={cx("latin h-12 min-w-12 rounded-2xl px-2 text-sm font-bold transition active:scale-95", radiusKm === km ? "bg-brand-600 text-white" : "bg-sunken text-soft")}>
                  {km} km
                </button>
              ))}
            </div>
          </div>

          {!center ? (
            mustChoose ? (
              <div className="space-y-2">
                <EmptyState icon={MapPin} title={t("آپ کی جگہ نہیں مل سکی", "Aap ki jagah nahi mil saki", "We could not find your location")} body={t("علاقہ چنیں، پھر قریب کے کاریگر دکھائیں گے", "Ilaqa chunein, phir qareeb ke kaarigar dikhayenge", "Choose an area and we will show workers near it")} />
                <Button className="w-full" icon={MapPin} onClick={() => setChoosingArea(true)}>
                  {t("علاقہ چنیں", "Ilaqa chunein", "Choose an area")}
                </Button>
              </div>
            ) : (
              <ListSkeleton />
            )
          ) : (
            <Async query={{ ...workers, data: ordered }} skeleton={<ListSkeleton />}>
              {(list) =>
                list && list.length > 0 ? (
                  <>
                    <div className="stagger space-y-3">
                      {list.map((worker) => (
                        <WorkerRow key={worker.id} worker={worker} highlighted={worker.id === selected} hireQuery={hireQuery} />
                      ))}
                    </div>
                    <div className="mt-3">{postLink}</div>
                  </>
                ) : (
                  <div className="space-y-2">
                    <EmptyState icon={SearchX} title={t("ابھی اس علاقے میں کوئی فارغ نہیں", "Abhi is ilaqay mein koi farigh nahi", "Nobody is available here right now")} body={nextRadius ? t("فاصلہ بڑھا کر دیکھیں", "Faasla barha kar dekhein", "Try a wider distance") : t("دوسرا علاقہ چنیں یا کام پوسٹ کریں", "Doosra ilaqa chunein ya kaam post karein", "Choose another area or post the job")} />
                    {nextRadius && (
                      <Button variant="secondary" size="md" className="w-full" onClick={() => setRadiusKm(nextRadius)}>
                        <span className="latin">{nextRadius} km</span> {t("تک دیکھیں", "tak dekhein", "radius")}
                      </Button>
                    )}
                    {postLink}
                  </div>
                )
              }
            </Async>
          )}
        </DragSheet>
      </div>

      {choosingArea && <AreaSheet areas={jobPlace.areas} onPick={chooseArea} onClose={() => setChoosingArea(false)} />}
    </Screen>
  );
}
