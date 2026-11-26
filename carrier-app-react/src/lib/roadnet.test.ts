import { describe, expect, it } from "vitest";
import { createRouter } from "./dijkstra";
import { build, query, type OsmResponse } from "./roadnet";

const V = { heightM: 3.6, grossT: 12 };
const node = (id: number, lon: number) => ({ type: "node" as const, id, lat: 36, lon });
const way = (id: number, nodes: number[], tags: Record<string, string>) => ({ type: "way" as const, id, nodes, tags });
const NODES = [1, 2, 3, 4, 5, 6].map((i) => node(i, 128 + i * 0.01));

describe("도로 그래프 생성", () => {
  it("일방통행 태그를 반영한다", () => {
    const osm: OsmResponse = { elements: [...NODES, way(1, [1, 2, 3], { highway: "primary" }), way(2, [3, 4], { highway: "primary", oneway: "yes" }), way(3, [4, 1], { highway: "primary", oneway: "yes" })] };
    const g = build(osm, V)!;
    const oneway = g.edges.filter((e) => e[4] === 0);
    expect(oneway).toHaveLength(2);
  });
  it("차량 조건에 걸리는 도로를 뺀다", () => {
    const osm: OsmResponse = { elements: [...NODES, way(1, [1, 2], { highway: "primary" }), way(2, [2, 3], { highway: "primary", maxheight: "3.0" }), way(3, [2, 4], { highway: "primary", maxweight: "10" }), way(4, [2, 5], { highway: "primary", maxheight: "4.0" })] };
    const g = build(osm, V)!;
    expect(g.meta?.excludedWays).toBe(2);
    expect(g.nodes).toHaveLength(3);
  });
  it("끊긴 조각이 아니라 가장 큰 도로망을 고른다", () => {
    const osm: OsmResponse = { elements: [...NODES, way(1, [1, 2], { highway: "primary" }), way(2, [3, 4], { highway: "primary" }), way(3, [4, 5], { highway: "primary" }), way(4, [5, 6], { highway: "primary" })] };
    expect(build(osm, V)!.nodes).toHaveLength(4);
  });
  it("도로가 없으면 null을 돌려준다", () => {
    expect(build({ elements: [node(1, 128)] }, V)).toBeNull();
  });
  it("제한속도로 시간을 계산하고 차종 상한을 넘지 않는다", () => {
    const osm: OsmResponse = { elements: [...NODES, way(1, [1, 2], { highway: "motorway", maxspeed: "110" })] };
    const g = build({ elements: [...osm.elements, way(2, [2, 1], { highway: "motorway" })] }, V)!;
    const r = createRouter(g).shortest(0, 1)!;
    expect(r.seconds).toBeCloseTo(r.meters / (80 / 3.6), 0);
  });
  it("먼 구간 조회문은 큰 도로만 받는다", () => {
    expect(query([36, 128], [36.1, 128], 11)).toContain("residential");
    expect(query([36, 128], [36.5, 128], 55)).not.toContain("residential");
  });
});
