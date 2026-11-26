import { describe, expect, it } from "vitest";
import type { GraphEdge, LatLng, RoadGraph } from "../types";
import { createRouter, haversine } from "./dijkstra";

const graph = (nodes: LatLng[], edges: GraphEdge[]): RoadGraph => ({ nodes, edges, geoms: edges.map(() => []) });
const LINE: LatLng[] = [[36, 128], [36, 128.01], [36, 128.02], [36.01, 128.01]];

function bellmanFord(g: RoadGraph, s: number): Float64Array {
  const d = new Float64Array(g.nodes.length).fill(Infinity);
  d[s] = 0;
  for (let i = 0; i < g.nodes.length; i++) {
    for (const [u, v, , f, b] of g.edges) {
      if (f > 0 && d[u]! + f < d[v]!) d[v] = d[u]! + f;
      if (b > 0 && d[v]! + b < d[u]!) d[u] = d[v]! + b;
    }
  }
  return d;
}

describe("다익스트라", () => {
  it("빠른 우회로를 고른다", () => {
    const r = createRouter(graph(LINE, [[0, 2, 500, 100, 100], [0, 1, 300, 10, 10], [1, 2, 300, 10, 10]]));
    const route = r.shortest(0, 2)!;
    expect(route.seconds).toBe(20);
    expect(route.meters).toBe(600);
    expect(route.hops).toBe(2);
  });
  it("일방통행을 거슬러 가지 않는다", () => {
    const r = createRouter(graph(LINE, [[0, 1, 300, 10, 0]]));
    expect(r.shortest(0, 1)?.seconds).toBe(10);
    expect(r.shortest(1, 0)).toBeNull();
  });
  it("연결되지 않은 지점은 null을 돌려준다", () => {
    expect(createRouter(graph(LINE, [[0, 1, 300, 10, 10]])).shortest(0, 3)).toBeNull();
  });
  it("역방향 간선은 중간 형상점을 뒤집어 잇는다", () => {
    const mid: LatLng = [36.001, 128.005];
    const r = createRouter({ nodes: LINE, edges: [[0, 1, 300, 10, 10]], geoms: [[mid]] });
    expect(r.shortest(1, 0)!.coords).toEqual([LINE[1], mid, LINE[0]]);
  });
  it("좌표를 가장 가까운 교차점에 붙인다", () => {
    const r = createRouter(graph(LINE, [[0, 1, 300, 10, 10]]));
    const near = r.nearest(36.0001, 128.0101);
    expect(near.node).toBe(1);
    expect(near.snapMeters).toBeLessThan(30);
  });
  it("무작위 그래프에서 벨만-포드와 결과가 같다", () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const n = 200;
    const nodes: LatLng[] = Array.from({ length: n }, (_, i) => [36 + i * 0.001, 128]);
    const edges: GraphEdge[] = Array.from({ length: 600 }, () => [Math.floor(rnd() * n), Math.floor(rnd() * n), 100, 1 + Math.floor(rnd() * 90), rnd() < 0.3 ? 0 : 1 + Math.floor(rnd() * 90)]);
    const g = graph(nodes, edges);
    const r = createRouter(g);
    for (const s of [0, 17, 99]) {
      const d = bellmanFord(g, s);
      for (const t of [5, 50, 150, 199]) {
        const route = r.shortest(s, t);
        if (d[t] === Infinity) expect(route).toBeNull();
        else expect(route?.seconds).toBeCloseTo(d[t]!, 6);
      }
    }
  });
  it("거리 계산이 실제 값과 맞는다", () => {
    expect(haversine([36, 128], [37, 128]) / 1000).toBeCloseTo(111.2, 0);
  });
});
