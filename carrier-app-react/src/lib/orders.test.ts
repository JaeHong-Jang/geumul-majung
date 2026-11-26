import { describe, expect, it } from "vitest";
import type { Filters, LatLng, Order, OrderSeed, RouteResult } from "../types";
import { activeFilterCount, DEFAULT_FILTERS, filterOrders, prepareOrder, reorigin } from "./orders";

const route = (meters: number) => (from: LatLng, to: LatLng): RouteResult => ({ coords: [from, to], meters, seconds: meters / 10, settled: 1, totalNodes: 2, computeMs: 0, hops: 1, snapFrom: 0, snapTo: 0 });
const seed = (p: Partial<OrderSeed>): OrderSeed => ({ id: 1, from: "구미", to: "칠곡", shipper: "가", consignee: "나", stops: [[36, 128], [36.1, 128]], fare: 100000, base: 90000, premium: 5000, wait: 5000, item: "고철", bags: 1, ton: 1, when: "오늘", grade: "A", tags: ["일반"], pay: "익일", rating: 4, cond: "", window: "", dropNote: "", ...p });
const order = (p: Partial<Order> & Partial<OrderSeed>, emptyKm = 5): Order => ({ ...prepareOrder(seed(p), [36, 128], route(10000)), emptyKm, ...p });

const LIST: Order[] = [
  order({ id: 1, fare: 300000, tags: ["장거리"], ton: 4, perKm: 2000 }, 20),
  order({ id: 2, fare: 100000, tags: ["혼적"], ton: 1, perKm: 4000, to: "대구" }, 3),
  order({ id: 3, fare: 200000, tags: ["대형"], ton: 8, perKm: 3000 }, 10),
];
const ids = (f: Partial<Filters>, q = "", saved: number[] = [], sort: "fare" | "near" | "per" = "fare") => filterOrders(LIST, { ...DEFAULT_FILTERS, ...f }, q, sort, saved, (o) => o.id !== 1).map((o) => o.id);

describe("콜 계산", () => {
  it("공차를 포함해 km당 운임을 계산한다", () => {
    const o = prepareOrder(seed({ fare: 100000 }), [36, 128], route(10000));
    expect(o.km).toBe(10);
    expect(o.emptyKm).toBe(10);
    expect(o.perKm).toBe(5000);
  });
  it("미리 계산한 경로가 있으면 다시 계산하지 않는다", () => {
    const leg = { coords: [[36, 128]] as LatLng[], meters: 132000, seconds: 7080 };
    const o = prepareOrder(seed({ pre: { legs: [leg], empty: leg } }), [36, 128], () => { throw new Error("호출되면 안 됨"); });
    expect(o.km).toBe(132);
    expect(o.min).toBe(118);
  });
  it("길이 없으면 조용히 넘어가지 않고 오류를 낸다", () => {
    expect(() => prepareOrder(seed({}), [36, 128], () => null)).toThrow("경로를 찾지 못했습니다");
  });
  it("내 위치 기준 공차는 도로망 안의 상차지만 다시 계산한다", () => {
    const list = [prepareOrder(seed({ id: 1 }), [36, 128], route(10000)), prepareOrder(seed({ id: 2, stops: [[35, 128], [36, 128]] }), [36, 128], route(10000))];
    const out = reorigin(list, [36.2, 128], route(2000), (p) => p[0] >= 36);
    expect(out[0]!.emptyKm).toBe(2);
    expect(out[1]!.emptyKm).toBe(10);
  });
});

describe("콜 필터", () => {
  it("기본값은 5톤 이하만 운임 높은 순으로 보여 준다", () => expect(ids({})).toEqual([1, 2]));
  it("내 차량 맞춤을 끄면 대형도 보인다", () => expect(ids({ fit: false })).toEqual([1, 3, 2]));
  it("공차 상한으로 거른다", () => expect(ids({ maxEmptyKm: 10 })).toEqual([2]));
  it("최저 km당 운임으로 거른다", () => expect(ids({ minPerKm: 3000 })).toEqual([2]));
  it("콜 종류로 거른다", () => expect(ids({ types: ["장거리"] })).toEqual([1]));
  it("지역으로 거른다", () => {
    expect(ids({ region: "far" })).toEqual([1]);
    expect(ids({ region: "local" })).toEqual([2]);
  });
  it("저장한 콜만 본다", () => expect(ids({ savedOnly: true }, "", [2])).toEqual([2]));
  it("지역, 품목, 콜 종류로 검색한다", () => {
    expect(ids({}, "대구")).toEqual([2]);
    expect(ids({}, "혼적")).toEqual([2]);
    expect(ids({}, "없는말")).toEqual([]);
  });
  it("정렬 기준을 바꾼다", () => {
    expect(ids({}, "", [], "near")).toEqual([2, 1]);
    expect(ids({}, "", [], "per")).toEqual([2, 1]);
  });
  it("기본값과 다른 필터만 센다", () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, fit: false, maxEmptyKm: 5, types: ["혼적"] })).toBe(3);
  });
});
