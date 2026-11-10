import L from "leaflet";
import { LoaderCircle, LocateFixed } from "lucide-react";
import { useEffect, useRef } from "react";
import type { LatLng, WorkerCard } from "../data";
import { initials } from "../data/labels";
import { useSettings } from "../lib/settings";
import { avatarColor } from "./people";

const GREEN = "#137A57";
/** The whole pin can be tapped, even though the drawing is smaller. */
const TAP_SIZE = 48;

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function workerPin(name: string, selected: boolean) {
  const size = selected ? 46 : 36;
  const height = Math.max(TAP_SIZE, size + 8);
  return L.divIcon({
    className: "map-pin",
    iconSize: [TAP_SIZE, height],
    iconAnchor: [TAP_SIZE / 2, height],
    html: `<div style="position:absolute;left:${(TAP_SIZE - size) / 2}px;bottom:0;width:${size}px;height:${size + 8}px">
      <span class="map-pulse" style="width:${size}px;height:${size}px"></span>
      <div style="position:relative;width:${size}px;height:${size}px;border-radius:9999px;background:${avatarColor(name)};border:3px solid #fff;box-shadow:0 0 0 2px ${GREEN},0 4px 10px rgba(60,50,30,.3);color:#fff;font:700 ${selected ? 15 : 12}px var(--latin);display:flex;align-items:center;justify-content:center">${escapeHtml(initials(name))}</div>
      <div style="position:absolute;left:50%;bottom:0;margin-left:-5px;width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:8px solid ${GREEN}"></div>
    </div>`,
  });
}

const homePin = L.divIcon({
  className: "map-pin",
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  html: `<div style="width:22px;height:22px;border-radius:9999px;background:#F2A71B;border:4px solid #fff;box-shadow:0 0 0 7px rgba(19,122,87,.18)"></div>`,
});

/** Plain Leaflet in a small React wrapper, with OpenStreetMap tiles. */
export function WorkersMap({
  workers,
  center,
  radiusKm,
  height = "100%",
  bottomInset = 0,
  selectedId,
  onSelect,
  onLocate,
  locating,
}: {
  workers: WorkerCard[];
  center: LatLng;
  radiusKm: number;
  height?: number | string;
  /** Pixels covered by a sheet at the bottom, so the radius and the credit stay in view. */
  bottomInset?: number;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onLocate?: () => void;
  locating?: boolean;
}) {
  const { t } = useSettings();
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<L.LayerGroup | null>(null);
  const pins = useRef(new Map<string, { marker: L.Marker; selected: boolean }>());
  const area = useRef<{ circle: L.Circle; home: L.Marker } | null>(null);
  const select = useRef(onSelect);
  select.current = onSelect;

  useEffect(() => {
    const container = element.current;
    if (!container) return;
    const instance = L.map(container, { zoomControl: false, scrollWheelZoom: false, attributionControl: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(instance);
    markers.current = L.layerGroup().addTo(instance);
    map.current = instance;
    // Rotating a phone or a collapsing address bar changes the size without telling Leaflet.
    const resized = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => instance.invalidateSize());
    resized?.observe(container);
    const allPins = pins.current;
    return () => {
      resized?.disconnect();
      instance.remove();
      map.current = null;
      markers.current = null;
      area.current = null;
      allPins.clear();
    };
  }, []);

  useEffect(() => {
    const corner = element.current?.querySelector<HTMLElement>(".leaflet-bottom.leaflet-right");
    if (corner) corner.style.bottom = `${bottomInset}px`;
  }, [bottomInset]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const position: L.LatLngTuple = [center.lat, center.lng];
    if (area.current) {
      area.current.circle.setLatLng(position).setRadius(radiusKm * 1000);
      area.current.home.setLatLng(position);
    } else {
      // A circle can only measure its bounds once the map has a view.
      instance.setView(position, 13, { animate: false });
      const circle = L.circle(position, { radius: radiusKm * 1000, color: GREEN, weight: 1.5, dashArray: "5 6", fillColor: GREEN, fillOpacity: 0.08 }).addTo(instance);
      const home = L.marker(position, { icon: homePin, interactive: false, keyboard: false }).addTo(instance);
      area.current = { circle, home };
    }
    instance.fitBounds(area.current.circle.getBounds(), { paddingTopLeft: [12, 56], paddingBottomRight: [12, bottomInset + 12] });
  }, [center.lat, center.lng, radiusKm, bottomInset]);

  // Only the pins that changed are touched, so a worker going busy never makes the others flicker.
  useEffect(() => {
    const layer = markers.current;
    if (!layer) return;
    const present = new Set<string>();
    for (const worker of workers) {
      present.add(worker.id);
      const selected = worker.id === selectedId;
      const pin = pins.current.get(worker.id);
      if (!pin) {
        const marker = L.marker([worker.location.lat, worker.location.lng], { icon: workerPin(worker.name, selected), title: worker.name, zIndexOffset: selected ? 1000 : 0 })
          .on("click", () => select.current?.(worker.id))
          .addTo(layer);
        pins.current.set(worker.id, { marker, selected });
      } else if (pin.selected !== selected) {
        pin.marker.setIcon(workerPin(worker.name, selected)).setZIndexOffset(selected ? 1000 : 0);
        pin.selected = selected;
      }
    }
    for (const [id, pin] of pins.current) {
      if (present.has(id)) continue;
      layer.removeLayer(pin.marker);
      pins.current.delete(id);
    }
  }, [workers, selectedId]);

  return (
    <div className="relative w-full" style={{ height }} dir="ltr">
      <div ref={element} className="h-full w-full" />
      {onLocate && (
        <button
          type="button"
          onClick={onLocate}
          disabled={locating}
          aria-label={t("میری جگہ", "Meri jagah", "My location")}
          className="absolute right-3 top-3 z-[400] flex h-12 w-12 items-center justify-center rounded-2xl bg-surface text-ink shadow-card transition active:scale-95"
        >
          {locating ? <LoaderCircle className="h-6 w-6 animate-spin text-brand-600" aria-hidden /> : <LocateFixed className="h-6 w-6" aria-hidden />}
        </button>
      )}
    </div>
  );
}
