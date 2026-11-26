/* Overpass 응답(OSM JSON)을 다익스트라용 그래프로 바꾼다. */
import type { GraphEdge, LatLng, RoadGraph } from "../types";
import { haversine } from "./dijkstra";

const SPEED: Record<string, number> = { motorway: 80, motorway_link: 40, trunk: 70, trunk_link: 40, primary: 50, primary_link: 35, secondary: 40, secondary_link: 30, tertiary: 35, tertiary_link: 30, unclassified: 25, residential: 20 };

interface OsmNode { type: "node"; id: number; lat: number; lon: number }
interface OsmWay { type: "way"; id: number; nodes: number[]; tags?: Record<string, string> }
export interface OsmResponse { elements: (OsmNode | OsmWay)[] }

const num = (s?: string): number | null => {
  const m = String(s ?? "").match(/[\d.]+/);
  return m ? parseFloat(m[0]) : null;
};
const r5 = (x: number): number => Math.round(x * 1e5) / 1e5;

interface RawEdge { a: number; b: number; seg: number[]; m: number; fs: number; bs: number }

/** 코사라주 알고리즘으로 가장 큰 강연결 요소를 찾는다. 끊긴 도로 조각에 좌표가 붙는 일을 막는다. */
function largestComponent(fwd: Map<number, number[]>, rev: Map<number, number[]>): Set<number> | null {
  const seen = new Set<number>();
  const order: number[] = [];
  for (const start of fwd.keys()) {
    if (seen.has(start)) continue;
    seen.add(start);
    const stack: [number, number][] = [[start, 0]];
    while (stack.length) {
      const top = stack[stack.length - 1]!;
      const list = fwd.get(top[0]) ?? [];
      const next = list[top[1]++];
      if (next === undefined) {
        order.push(top[0]);
        stack.pop();
      } else if (!seen.has(next)) {
        seen.add(next);
        stack.push([next, 0]);
      }
    }
  }
  const assigned = new Set<number>();
  let best: Set<number> | null = null;
  for (let i = order.length - 1; i >= 0; i--) {
    const root = order[i]!;
    if (assigned.has(root)) continue;
    const comp = new Set([root]);
    const stack = [root];
    assigned.add(root);
    while (stack.length) {
      for (const v of rev.get(stack.pop()!) ?? []) {
        if (!assigned.has(v)) {
          assigned.add(v);
          comp.add(v);
          stack.push(v);
        }
      }
    }
    if (!best || comp.size > best.size) best = comp;
  }
  return best;
}

export function build(osm: OsmResponse, vehicle: { heightM: number; grossT: number }): RoadGraph | null {
  const pos = new Map<number, LatLng>();
  for (const e of osm.elements) if (e.type === "node") pos.set(e.id, [e.lat, e.lon]);
  let excludedWays = 0;
  const ways = osm.elements.filter((e): e is OsmWay & { tags: Record<string, string> } => {
    if (e.type !== "way" || !e.tags) return false;
    const t = e.tags;
    const h = num(t.maxheight);
    const w = num(t.maxweight);
    if ((h && h < vehicle.heightM) || (w && w < vehicle.grossT) || t.hgv === "no" || t.access === "no" || t.access === "private" || t.motor_vehicle === "no") {
      excludedWays++;
      return false;
    }
    return true;
  });
  const use = new Map<number, number>();
  for (const w of ways) w.nodes.forEach((n, i) => use.set(n, (use.get(n) ?? 0) + (i === 0 || i === w.nodes.length - 1 ? 2 : 1)));

  const raw: RawEdge[] = [];
  for (const w of ways) {
    const t = w.tags;
    let fw = true;
    let bw = true;
    if (t.oneway === "yes" || t.oneway === "1" || t.oneway === "true" || t.highway === "motorway" || t.junction === "roundabout") bw = false;
    if (t.oneway === "-1") { fw = false; bw = true; }
    if (t.oneway === "no") { fw = true; bw = true; }
    const cls = SPEED[t.highway ?? ""] ?? 20;
    const limit = num(t.maxspeed);
    const v = (limit ? Math.min(limit, cls) : cls) / 3.6;
    let start = 0;
    for (let i = 1; i < w.nodes.length; i++) {
      if ((use.get(w.nodes[i]!) ?? 0) < 2 && i !== w.nodes.length - 1) continue;
      const seg = w.nodes.slice(start, i + 1);
      start = i;
      if (!seg.every((n) => pos.has(n)) || seg[0] === seg[seg.length - 1]) continue;
      let m = 0;
      for (let k = 1; k < seg.length; k++) m += haversine(pos.get(seg[k - 1]!)!, pos.get(seg[k]!)!);
      raw.push({ a: seg[0]!, b: seg[seg.length - 1]!, seg, m, fs: fw ? m / v : 0, bs: bw ? m / v : 0 });
    }
  }

  const fwd = new Map<number, number[]>();
  const rev = new Map<number, number[]>();
  const add = (M: Map<number, number[]>, a: number, b: number): void => {
    const l = M.get(a);
    if (l) l.push(b);
    else M.set(a, [b]);
  };
  for (const e of raw) {
    if (e.fs) { add(fwd, e.a, e.b); add(rev, e.b, e.a); }
    if (e.bs) { add(fwd, e.b, e.a); add(rev, e.a, e.b); }
  }
  const best = largestComponent(fwd, rev);
  if (!best || best.size < 2) return null;

  const idx = new Map<number, number>();
  const nodes: LatLng[] = [];
  const edges: GraphEdge[] = [];
  const geoms: LatLng[][] = [];
  const P = (id: number): LatLng => {
    const p = pos.get(id)!;
    return [r5(p[0]), r5(p[1])];
  };
  const nid = (id: number): number => {
    let i = idx.get(id);
    if (i === undefined) {
      i = nodes.length;
      idx.set(id, i);
      nodes.push(P(id));
    }
    return i;
  };
  for (const e of raw) {
    if (!best.has(e.a) || !best.has(e.b)) continue;
    edges.push([nid(e.a), nid(e.b), Math.round(e.m), Math.round(e.fs * 10) / 10, Math.round(e.bs * 10) / 10]);
    geoms.push(e.seg.slice(1, -1).map(P));
  }
  return { nodes, edges, geoms, meta: { excludedWays } };
}

/** 두 좌표를 감싸는 영역의 도로 조회문. 먼 구간은 큰 도로만 받아 응답을 줄인다 */
export function query(a: LatLng, b: LatLng, directKm: number): string {
  const major = "motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link";
  const cls = directKm <= 30 ? major + "|unclassified|residential" : major;
  const mLat = Math.max((directKm * 0.3) / 111, 0.04);
  const mLon = Math.max((directKm * 0.3) / 88, 0.05);
  const bb = [Math.min(a[0], b[0]) - mLat, Math.min(a[1], b[1]) - mLon, Math.max(a[0], b[0]) + mLat, Math.max(a[1], b[1]) + mLon].map((x) => x.toFixed(4)).join(",");
  return `[out:json][timeout:60];way["highway"~"^(${cls})$"](${bb});out body;>;out skel qt;`;
}
