import L from "leaflet";
import type { Factory, LatLng } from "../types";

const TILE_BOUNDS: [LatLng, LatLng] = [[34.6, 126.4], [37.6, 130.0]];
const EMPTY = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

/* 내장 타일을 먼저 쓰고, 온라인이면 없는 칸만 OSM 서버에서 받는다 */
class DataTiles extends L.TileLayer {
  private live: boolean;
  constructor(live: boolean, options: L.TileLayerOptions) {
    super("", options);
    this.live = live;
  }
  override getTileUrl(c: L.Coords): string {
    const zoom = (this as unknown as { _getZoomForUrl(): number })._getZoomForUrl();
    const k = `${zoom}/${c.x}/${c.y}`;
    return window.TILES?.[k] ?? (this.live ? `https://tile.openstreetmap.org/${k}.png` : EMPTY);
  }
}

export function addTiles(m: L.Map, live: boolean): L.TileLayer {
  return new DataTiles(live, {
    minZoom: live ? 6 : 8,
    ...(live ? {} : { minNativeZoom: 8 }),
    maxNativeZoom: live ? 19 : 13,
    maxZoom: live ? 19 : 15,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 기여자',
  }).addTo(m);
}

export function createMap(el: HTMLElement, live: boolean): L.Map {
  const m = L.map(el, { zoomControl: false, minZoom: live ? 6 : 8, maxZoom: live ? 19 : 15, maxBoundsViscosity: 1, zoomSnap: 0.25, ...(live ? {} : { maxBounds: TILE_BOUNDS }) });
  m.attributionControl.setPrefix(false);
  addTiles(m, live);
  return m;
}

export const divIcon = (cls: string, html: string, w: number, h: number): L.DivIcon =>
  L.divIcon({ className: "", html: `<div class="mk ${cls}">${html}</div>`, iconSize: [w, h], iconAnchor: [w / 2, h / 2] });

export const dot = (m: L.Map, at: LatLng, cls: string): L.Marker =>
  L.marker(at, { icon: divIcon(cls, "", 20, 20), keyboard: false, interactive: false }).addTo(m);

const TRUCK = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>';
export const truck = (m: L.Map, at: LatLng): L.Marker =>
  L.marker(at, { icon: divIcon("mk-truck", TRUCK, 32, 32), keyboard: false, interactive: false, zIndexOffset: 500 }).addTo(m);

export function label(m: L.Map, at: LatLng, text: string, dir: "up" | "down"): void {
  const icon = L.divIcon({ className: "", html: `<div class="mk mk-label" style="transform:translate(-50%,${dir === "up" ? "-170%" : "60%"})">${text}</div>`, iconSize: [0, 0] });
  L.marker(at, { icon, keyboard: false, interactive: false }).addTo(m);
}

export function lineOn(m: L.Map, coords: LatLng[], color: string, dash?: string): void {
  if (!dash) L.polyline(coords, { color: "#FFFFFF", weight: 8, opacity: 0.9, lineJoin: "round", interactive: false }).addTo(m);
  L.polyline(coords, { color, weight: dash ? 4 : 5, lineJoin: "round", interactive: false, ...(dash ? { dashArray: dash } : {}) }).addTo(m);
}

export function factoryDots(m: L.Map, list: Factory[], color: string): void {
  const renderer = L.canvas({ padding: 0.3 });
  for (const x of list) L.circleMarker([x[0], x[1]], { renderer, radius: 2.5, weight: 0, fillColor: color, fillOpacity: 0.75, interactive: false }).addTo(m);
}
