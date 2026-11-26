/** [위도, 경도] */
export type LatLng = [number, number];

export type Version = "a" | "b" | "c";
export type ScreenId = "home" | "orders" | "detail" | "trip" | "earn" | "my";
export type SortKey = "fare" | "near" | "per";
export type Grade = "A" | "B" | "C";
export type Region = "all" | "local" | "far";
/** 운행 단계. 0 이동, 1 상차·검수, 2 운송, 3 하차·계량, 4 완료 */
export type TripStage = 0 | 1 | 2 | 3 | 4;

export interface RouteLeg {
  coords: LatLng[];
  meters: number;
  seconds: number;
}
export interface RouteResult extends RouteLeg {
  settled: number;
  totalNodes: number;
  computeMs: number;
  hops: number;
  snapFrom: number;
  snapTo: number;
}

/** data/factories.js에 담긴 콜 원본 */
export interface OrderSeed {
  id: number;
  from: string;
  to: string;
  via?: string;
  viaNote?: string;
  dropLabel?: string;
  shipper: string;
  consignee: string;
  stops: LatLng[];
  fare: number;
  base: number;
  premium: number;
  wait: number;
  item: string;
  bags: number;
  ton: number;
  when: string;
  grade: Grade;
  /** 첫 태그가 콜 종류다 */
  tags: string[];
  pay: string;
  rating: number;
  cond: string;
  window: string;
  dropNote: string;
  /** 먼 지역 콜은 미리 계산한 경로를 담는다 */
  pre?: { legs: RouteLeg[]; empty: RouteLeg | null };
}

/** 경로 계산까지 끝난 콜 */
export interface Order extends OrderSeed {
  legs: RouteLeg[];
  line: LatLng[];
  km: number;
  min: number;
  empty: RouteLeg;
  emptyKm: number;
  emptyMin: number;
  /** 공차를 포함한 km당 운임 */
  perKm: number;
}

export interface Trip {
  id: number;
  stage: TripStage;
  scanned: number;
}

export interface Filters {
  /** 적재량 5톤 이하만 */
  fit: boolean;
  types: string[];
  region: Region;
  maxEmptyKm: number | null;
  minPerKm: number | null;
  savedOnly: boolean;
}

/** [위도, 경도, 공장 ID, 시군구] */
export type Factory = [number, number, string, string];

export interface RoadGraphMeta {
  source: string;
  extractedAt: string;
  bbox: [number, number, number, number];
  vehicle: { heightM: number; grossT: number };
  excludedWays: number;
}
/** [시작 노드, 끝 노드, 미터, 정방향 초, 역방향 초(0이면 통행 불가)] */
export type GraphEdge = [number, number, number, number, number];
export interface RoadGraph {
  nodes: LatLng[];
  edges: GraphEdge[];
  geoms: LatLng[][];
  meta?: Partial<RoadGraphMeta>;
}

export interface LocalData {
  orders: OrderSeed[];
  factories: Factory[];
  depot: LatLng;
}
