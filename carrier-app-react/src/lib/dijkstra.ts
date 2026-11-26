/* 도로 그래프 위 다익스트라. 간선 가중치는 통행 시간(초)이다. */
import type { LatLng, RoadGraph, RouteResult } from "../types";

class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];

  get size(): number {
    return this.keys.length;
  }
  push(key: number, val: number): void {
    const { keys, vals } = this;
    let i = keys.length;
    keys.push(key);
    vals.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p]! <= key) break;
      keys[i] = keys[p]!;
      vals[i] = vals[p]!;
      i = p;
    }
    keys[i] = key;
    vals[i] = val;
  }
  pop(): { key: number; val: number } {
    const { keys, vals } = this;
    const out = { key: keys[0]!, val: vals[0]! };
    const lastKey = keys.pop()!;
    const lastVal = vals.pop()!;
    const n = keys.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && keys[r]! < keys[l]! ? r : l;
        if (keys[c]! >= lastKey) break;
        keys[i] = keys[c]!;
        vals[i] = vals[c]!;
        i = c;
      }
      keys[i] = lastKey;
      vals[i] = lastVal;
    }
    return out;
  }
}

export function haversine(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const t = Math.PI / 180;
  const s = Math.sin(((b[0] - a[0]) * t) / 2);
  const c = Math.sin(((b[1] - a[1]) * t) / 2);
  const h = s * s + Math.cos(a[0] * t) * Math.cos(b[0] * t) * c * c;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 인접 간선: 도착 노드, 초, 미터, 형상 인덱스, 역방향 여부 */
export interface AdjEdge {
  to: number;
  seconds: number;
  meters: number;
  geom: number;
  reverse: boolean;
}
export interface Router {
  size: number;
  adj: AdjEdge[][];
  nearest(lat: number, lon: number): { node: number; snapMeters: number };
  shortest(s: number, t: number): Omit<RouteResult, "snapFrom" | "snapTo"> | null;
  route(from: LatLng, to: LatLng): RouteResult | null;
}

export function createRouter(graph: RoadGraph): Router {
  const N = graph.nodes.length;
  const adj: AdjEdge[][] = Array.from({ length: N }, () => []);
  graph.edges.forEach(([u, v, meters, forward, backward], geom) => {
    if (forward > 0) adj[u]!.push({ to: v, seconds: forward, meters, geom, reverse: false });
    if (backward > 0) adj[v]!.push({ to: u, seconds: backward, meters, geom, reverse: true });
  });

  const nearest: Router["nearest"] = (lat, lon) => {
    let best = -1;
    let bd = Infinity;
    const cos = Math.cos((lat * Math.PI) / 180);
    graph.nodes.forEach((n, i) => {
      const dy = n[0] - lat;
      const dx = (n[1] - lon) * cos;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    const node = graph.nodes[best];
    return { node: best, snapMeters: node ? Math.round(haversine([lat, lon], node)) : Infinity };
  };

  const shortest: Router["shortest"] = (s, t) => {
    const t0 = performance.now();
    const dist = new Float64Array(N).fill(Infinity);
    const prevNode = new Int32Array(N).fill(-1);
    const prevEdge = new Array<AdjEdge | undefined>(N);
    const done = new Uint8Array(N);
    const heap = new MinHeap();
    let settled = 0;
    dist[s] = 0;
    heap.push(0, s);
    while (heap.size) {
      const { key, val: u } = heap.pop();
      if (done[u]) continue;
      done[u] = 1;
      settled++;
      if (u === t) break;
      for (const e of adj[u]!) {
        const nd = key + e.seconds;
        if (nd < dist[e.to]!) {
          dist[e.to] = nd;
          prevNode[e.to] = u;
          prevEdge[e.to] = e;
          heap.push(nd, e.to);
        }
      }
    }
    const computeMs = performance.now() - t0;
    const seconds = dist[t]!;
    if (seconds === Infinity) return null;
    const chain: AdjEdge[] = [];
    for (let c = t; c !== s; c = prevNode[c]!) chain.push(prevEdge[c]!);
    chain.reverse();
    const coords: LatLng[] = [graph.nodes[s]!];
    let meters = 0;
    for (const e of chain) {
      meters += e.meters;
      const g = graph.geoms[e.geom] ?? [];
      coords.push(...(e.reverse ? g.slice().reverse() : g), graph.nodes[e.to]!);
    }
    return { coords, meters, seconds, settled, totalNodes: N, computeMs, hops: chain.length };
  };

  return {
    size: N,
    adj,
    nearest,
    shortest,
    route(from, to) {
      const a = nearest(from[0], from[1]);
      const b = nearest(to[0], to[1]);
      const r = shortest(a.node, b.node);
      return r && { ...r, snapFrom: a.snapMeters, snapTo: b.snapMeters };
    },
  };
}
