import { CircleCheck, LoaderCircle, LocateFixed } from "lucide-react";
import { useState } from "react";
import { data, type Area, type LatLng } from "../../data";
import { useData } from "../../lib/useData";
import { useSettings, type Lang } from "../../lib/settings";
import { Button, Chip, InlineError, Skeleton } from "../../ui/primitives";
import { areaIsKnown, areaMatches, sameArea } from "./draft";
import { TextWithMic } from "./parts";

let loading: Promise<Area[]> | null = null;

/** The list only changes with a release, so one request serves every screen. */
function loadAreas(): Promise<Area[]> {
  loading ??= data.getAreas().catch((err: unknown) => {
    loading = null;
    throw err;
  });
  return loading;
}

export function useAreas() {
  return useData(loadAreas, []);
}

/** Sector codes such as G-9 are read the same way in both scripts. */
const areaLabel = (area: Area, lang: Lang) => (lang === "ur" && !/^[A-Z]-\d+$/.test(area.name) ? area.nameUr : area.name);

function kmBetween(a: LatLng, b: LatLng): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

function nearest(point: LatLng, areas: Area[]): { area: Area; km: number } | null {
  let best: { area: Area; km: number } | null = null;
  for (const area of areas) {
    const km = kmBetween(point, area);
    if (!best || km < best.km) best = { area, km };
  }
  return best;
}

type GpsState = "idle" | "working" | "failed";

/** Type or say an area, choose it from the real list, or share GPS. Always ends somewhere the server can place. */
export function AreaPicker({
  id,
  value,
  location,
  invalid,
  onChange,
}: {
  id: string;
  value: string;
  location: LatLng | null;
  invalid?: boolean;
  onChange: (next: { area: string; location: LatLng | null }) => void;
}) {
  const { t, lang } = useSettings();
  const areas = useAreas();
  const [gps, setGps] = useState<GpsState>("idle");
  const list = areas.data ?? [];
  const query = value.trim();
  const chosen = list.find((area) => sameArea(query, area.name));
  // Once an area is chosen the whole list stays reachable, with the chosen one first.
  const matches = chosen ? [chosen, ...list.filter((area) => area !== chosen)] : query ? list.filter((area) => areaMatches(query, area)).slice(0, 9) : list;

  const locate = () => {
    if (!navigator.geolocation) {
      setGps("failed");
      return;
    }
    setGps("working");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const point = { lat: coords.latitude, lng: coords.longitude };
        // A sector they named stays. Anything vaguer, like "Islamabad", gives way to where they really are.
        const named = query && areaIsKnown(query, list) ? query : null;
        void (named ? Promise.resolve(named) : data.placeNear(point).catch(() => nearest(point, list)?.area.name ?? "")).then((area) => {
          setGps("idle");
          onChange({ area, location: point });
        });
      },
      () => setGps("failed"),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  };

  return (
    <div>
      <TextWithMic
        id={id}
        field="area"
        value={value}
        invalid={invalid}
        onChange={(area) => onChange({ area, location: null })}
        placeholder={t("مثلاً G-9، صدر", "Maslan G-9, Saddar", "e.g. G-9, Saddar")}
      />

      {matches.length > 0 && (
        <div className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-2xl" aria-label={t("علاقے", "Ilaqay", "Areas")}>
          {matches.map((area) => (
            <Chip key={area.name} active={sameArea(value, area.name)} onClick={() => onChange({ area: area.name, location: null })}>
              <bdi>{areaLabel(area, lang)}</bdi>
            </Chip>
          ))}
        </div>
      )}
      {areas.loading && !areas.data && <Skeleton className="mt-2 h-12 w-full" />}
      {areas.error && !areas.data && (
        <p className="mt-1 text-sm text-soft">{t("علاقوں کی فہرست نہیں مل سکی۔ اپنا علاقہ لکھ دیں۔", "Ilaqon ki list nahi mil saki. Apna ilaqa likh dein.", "The list of areas did not load. Please type your area.")}</p>
      )}

      <Button variant="ghost" size="md" icon={gps === "working" ? LoaderCircle : LocateFixed} className="mt-2 w-full bg-brand-50" disabled={gps === "working" || list.length === 0} onClick={locate}>
        {gps === "working" ? t("جگہ ڈھونڈ رہے ہیں…", "Jagah dhoond rahe hain…", "Finding your location…") : t("میری موجودہ جگہ لیں", "Meri maujooda jagah lein", "Use my current location")}
      </Button>

      {location && (
        <p className="mt-1 flex items-center gap-1 text-sm font-bold text-brand-700">
          <CircleCheck className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            {t("آپ کی جگہ لے لی گئی:", "Aapki jagah le li gayi:", "Your location was added:")} <bdi>{value}</bdi>
          </span>
        </p>
      )}
      {gps === "failed" && (
        <div className="mt-2">
          <InlineError>{t("جگہ نہیں مل سکی۔ فہرست سے علاقہ چنیں۔", "Jagah nahi mil saki. List se ilaqa chunein.", "Could not get your location. Please pick an area from the list.")}</InlineError>
        </div>
      )}
    </div>
  );
}
