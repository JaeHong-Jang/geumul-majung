/* 콜 계산과 필터. 전역 데이터에 의존하지 않아 테스트하기 쉽다. */
import type { Filters, LatLng, Order, OrderSeed, RouteLeg, RouteResult, SortKey, Trip } from "../types";

export type RouteFn = (from: LatLng, to: LatLng) => RouteResult | null;

export const DEFAULT_FILTERS: Filters = { fit: true, types: [], region: "all", maxEmptyKm: null, minPerKm: null, savedOnly: false };
export const MAX_FIT_TON = 5;

export const won = (n: number): string => n.toLocaleString("ko-KR") + "원";
export const km1 = (x: number): string => x.toFixed(1) + "km";
export const callType = (o: Pick<OrderSeed, "tags">): string => o.tags[0] ?? "";
export const routeTitle = (o: Pick<OrderSeed, "from" | "to">): string => `${o.from} → ${o.to}`;

function need<T>(v: T | null, what: string): T {
  if (v === null) throw new Error("경로를 찾지 못했습니다: " + what);
  return v;
}

function withEmpty<T extends Omit<Order, "empty" | "emptyKm" | "emptyMin" | "perKm">>(o: T, empty: RouteLeg): T & Pick<Order, "empty" | "emptyKm" | "emptyMin" | "perKm"> {
  const emptyKm = empty.meters / 1000;
  return { ...o, empty, emptyKm, emptyMin: Math.round(empty.seconds / 60), perKm: Math.round(o.fare / (o.km + emptyKm)) };
}

/** 차고지에서 첫 상차지까지(공차), 상차지부터 마지막 하차지까지(적재)를 계산한다. 먼 지역 콜은 미리 계산한 경로를 쓴다. */
export function prepareOrder(seed: OrderSeed, depot: LatLng, route: RouteFn): Order {
  const legs: RouteLeg[] = seed.pre
    ? seed.pre.legs
    : seed.stops.slice(0, -1).map((s, i) => need(route(s, seed.stops[i + 1]!), seed.from));
  const km = legs.reduce((a, l) => a + l.meters, 0) / 1000;
  const min = Math.round(legs.reduce((a, l) => a + l.seconds, 0) / 60);
  const line = legs.flatMap((l) => l.coords);
  const empty = seed.pre?.empty ?? need(route(depot, seed.stops[0]!), "공차 " + seed.from);
  return withEmpty({ ...seed, legs, km, min, line }, empty);
}

/** 내 위치 기준으로 공차를 다시 계산한다. 내장 도로망 밖 상차지는 그대로 둔다. */
export function reorigin(orders: Order[], at: LatLng, route: RouteFn, inGraph: (p: LatLng) => boolean): Order[] {
  return orders.map((o) => {
    const first = o.stops[0]!;
    if (!inGraph(first)) return o;
    const r = route(at, first);
    return r ? withEmpty(o, r) : o;
  });
}

export function filterOrders(orders: Order[], f: Filters, q: string, sort: SortKey, saved: readonly number[], isLocal: (o: Order) => boolean): Order[] {
  const text = q.trim();
  const key: Record<SortKey, (o: Order) => number> = { fare: (o) => -o.fare, near: (o) => o.emptyKm, per: (o) => -o.perKm };
  return orders
    .filter((o) => !f.fit || o.ton <= MAX_FIT_TON)
    .filter((o) => !f.types.length || f.types.includes(callType(o)))
    .filter((o) => f.region === "all" || (f.region === "local") === isLocal(o))
    .filter((o) => f.maxEmptyKm === null || o.emptyKm <= f.maxEmptyKm)
    .filter((o) => f.minPerKm === null || o.perKm >= f.minPerKm)
    .filter((o) => !f.savedOnly || saved.includes(o.id))
    .filter((o) => !text || (o.from + o.to + o.item + o.tags.join(" ")).includes(text))
    .sort((a, b) => key[sort](a) - key[sort](b));
}

/** 기본값과 다른 필터 수. 필터 버튼의 숫자로 쓴다 */
export function activeFilterCount(f: Filters): number {
  return [!f.fit, f.types.length > 0, f.region !== "all", f.maxEmptyKm !== null, f.minPerKm !== null, f.savedOnly].filter(Boolean).length;
}

export const tripTitle = (t: Trip, o: Order): string => ["상차지로 이동 중", `${o.shipper}에서 상차 중`, `${o.consignee}로 운송 중`, `${o.consignee}에서 하차 중`, "운행 완료"][t.stage] ?? "";
