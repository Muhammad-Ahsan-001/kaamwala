import { canonicalText } from "@kaamwala/jev";
import { AREAS, findArea } from "./areas";
import { distanceKm } from "./geo";

export interface Point {
  lat: number;
  lng: number;
}

/** A place this close to a listed area is simply "near" it. Further out, the map's own name is more honest. */
const NEAR_KM = 2.5;
const LOOKUP_TIMEOUT_MS = 5_000;
/** Nominatim's public service allows one request a second. */
const LOOKUP_GAP_MS = 1_100;
const MAX_WAITING = 8;
const MAX_REMEMBERED = 2_000;

const NOMINATIM = "https://nominatim.openstreetmap.org";
const LOOKUP_HEADERS = { "User-Agent": "KaamWala/1.0 (https://kaamwala.avezea.com)", "Accept-Language": "en" };
/** Only the twin cities themselves. A wider box returned same-named places 40 km away. */
const VIEWBOX = "72.85,33.80,73.30,33.45";

/** Words that name a whole city or country, which is no use for finding someone nearby. */
const GENERIC_WORDS = new Set(
  ["islamabad", "isb", "rawalpindi", "rwp", "pindi", "punjab", "pakistan", "city", "shehr", "اسلام آباد", "اسلام", "آباد", "راولپنڈی", "پنڈی", "پنجاب", "پاکستان", "شہر"].flatMap((word) =>
    canonicalText(word).split(" "),
  ),
);

export function isGenericPlace(text: string): boolean {
  const words = canonicalText(text).split(" ").filter(Boolean);
  return words.every((word) => GENERIC_WORDS.has(word));
}

export function nearestListed(point: Point): { name: string; km: number } {
  let best = { name: AREAS[0]!.name, km: Number.POSITIVE_INFINITY };
  for (const area of AREAS) {
    const km = distanceKm(point, area);
    if (km < best.km) best = { name: area.name, km };
  }
  return best;
}

let waiting = 0;
let lastTurn: Promise<unknown> = Promise.resolve();
const remembered = new Map<string, unknown>();

/** Asks the public map service one request at a time. Null when it is busy, slow or says nothing. */
async function lookUp<T>(key: string, path: string, read: (body: unknown) => T | null): Promise<T | null> {
  if (remembered.has(key)) return remembered.get(key) as T | null;
  if (waiting >= MAX_WAITING) return null;
  waiting += 1;
  const turn = lastTurn.then(async () => {
    try {
      const res = await fetch(`${NOMINATIM}${path}`, { headers: LOOKUP_HEADERS, signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) });
      if (!res.ok) return null;
      const value = read(await res.json());
      if (remembered.size >= MAX_REMEMBERED) remembered.clear();
      remembered.set(key, value);
      return value;
    } catch {
      return null;
    } finally {
      waiting -= 1;
    }
  });
  lastTurn = turn.then(() => new Promise((resolve) => setTimeout(resolve, LOOKUP_GAP_MS)));
  return turn;
}

const NAME_FIELDS = ["neighbourhood", "suburb", "quarter", "residential", "hamlet", "village", "town", "city_district", "road"];

/** The name of the place at a point: a listed area when one is close, otherwise what the map calls it. */
export async function placeNear(point: Point): Promise<string> {
  const nearest = nearestListed(point);
  if (nearest.km <= NEAR_KM) return nearest.name;
  const key = `near:${point.lat.toFixed(3)},${point.lng.toFixed(3)}`;
  const params = new URLSearchParams({ lat: String(point.lat), lon: String(point.lng), format: "jsonv2", zoom: "16", addressdetails: "1" });
  const name = await lookUp(key, `/reverse?${params}`, (body) => {
    const address = (body as { address?: Record<string, string> }).address ?? {};
    const field = NAME_FIELDS.find((f) => address[f] && !isGenericPlace(address[f]));
    return field ? (address[field] as string) : null;
  });
  return name ?? nearest.name;
}

export type FoundPlace = Point & { name: string; listed: boolean };

/** Finds a named place in the twin cities. A whole city is not a place to send someone to. */
export async function findPlace(text: string): Promise<FoundPlace | null> {
  const known = findArea(text);
  if (known) return { name: known.name, lat: known.lat, lng: known.lng, listed: true };
  if (isGenericPlace(text)) return null;
  const params = new URLSearchParams({ q: text, format: "jsonv2", limit: "1", countrycodes: "pk", viewbox: VIEWBOX, bounded: "1" });
  const point = await lookUp(`find:${canonicalText(text)}`, `/search?${params}`, (body) => {
    const first = (body as { lat?: string; lon?: string }[])[0];
    return first?.lat && first.lon ? { lat: Number(first.lat), lng: Number(first.lon) } : null;
  });
  return point ? { ...point, name: text.trim(), listed: false } : null;
}

/** Where to file someone. An exact location always wins over the words, and a vague word gives way to the real place name. */
export async function resolvePlace(text: string, location?: Point): Promise<(Point & { area: string }) | null> {
  const spoken = text.trim();
  const known = spoken ? findArea(spoken) : null;
  if (location) {
    const area = known?.name ?? (spoken && !isGenericPlace(spoken) ? spoken : await placeNear(location));
    return { area, lat: location.lat, lng: location.lng };
  }
  if (known) return { area: known.name, lat: known.lat, lng: known.lng };
  const found = spoken ? await findPlace(spoken) : null;
  return found ? { area: spoken, lat: found.lat, lng: found.lng } : null;
}
