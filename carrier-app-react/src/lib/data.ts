/* public 데이터 스크립트가 넣어 둔 값을 읽어 앱에서 쓸 형태로 만든다. */
import type { LatLng, Order, ScreenId, Version } from "../types";
import { createRouter } from "./dijkstra";
import { prepareOrder } from "./orders";

const graph = window.ROAD_GRAPH;
const local = window.LOCAL_DATA;
if (!graph || !local || !window.TILES) throw new Error("지도·도로·공장 데이터를 불러오지 못했습니다. carrier-app/data 폴더가 있는지 확인해 주세요.");

export const GRAPH = graph;
export const FACTORIES = local.factories;
export const router = createRouter(graph);

const [south, west, north, east] = graph.meta.bbox;
export const BOUNDS: [LatLng, LatLng] = [[south, west], [north, east]];
export const inGraph = (p: LatLng): boolean => p[0] >= south && p[0] <= north && p[1] >= west && p[1] <= east;
export const isLocalOrder = (o: Order): boolean => o.stops.every(inGraph);
export const DEPOT = { name: "우리 차고지 · 구미", at: local.depot };

export const INITIAL_ORDERS: Order[] = local.orders.map((s) => prepareOrder(s, local.depot, router.route));
export const CALL_TYPES: string[] = [...new Set(INITIAL_ORDERS.map((o) => o.tags[0] ?? ""))];

export interface LedgerRow { d: string; n: string; v: number; s: "정산 예정" | "정산 완료"; bundle: boolean }
export const LEDGER: LedgerRow[] = [
  { d: "11.03 (화)", n: "구미 공단 → 칠곡 약목", v: 97000, s: "정산 예정", bundle: false },
  { d: "11.03 (화)", n: "구미 구포 → 칠곡 가산", v: 87000, s: "정산 예정", bundle: true },
  { d: "11.02 (월)", n: "구미 임수 → 구미 고아", v: 58000, s: "정산 예정", bundle: false },
  { d: "10.31 (토)", n: "구미 산동 → 김천 아포", v: 112000, s: "정산 예정", bundle: false },
  { d: "10.30 (금)", n: "구미 시미 → 칠곡 석적", v: 46000, s: "정산 완료", bundle: false },
  { d: "10.29 (목)", n: "구미 공단 → 칠곡 북삼", v: 124000, s: "정산 완료", bundle: true },
  { d: "10.28 (수)", n: "구미 금전 → 칠곡 약목", v: 88000, s: "정산 완료", bundle: true },
];
export const WEEK: [string, number][] = [["수", 88000], ["목", 124000], ["금", 46000], ["토", 112000], ["일", 0], ["월", 58000], ["화", 184000]];
export const WEEK_TOTAL = WEEK.reduce((a, d) => a + d[1], 0);
export const PENDING = LEDGER.filter((l) => l.s === "정산 예정").reduce((a, l) => a + l.v, 0);
export const STAGES = ["이동", "상차·검수", "운송", "하차·계량", "완료"] as const;
export const SCREENS: [ScreenId, string][] = [["home", "홈"], ["orders", "운반 요청"], ["detail", "요청 상세"], ["trip", "운행 중"], ["earn", "정산"], ["my", "마이"]];

export const VERSIONS: Record<Version, { name: string; sub: string; refs: string; why: string[]; best: string }> = {
  a: { name: "A. 지도 우선형", sub: "지도에서 일감을 고르는 방식", refs: "Uber Driver, 카카오 T, 쿠팡이츠 배달 파트너의 지도 위 시트 구성을 참고했습니다.", why: ["주변 요청을 운임 표식으로 지도에 올립니다.", "목록을 고르면 공차와 적재 구간이 바로 그려집니다.", "처음 쓰는 기사도 위치 판단이 쉽습니다."], best: "단거리·지역 운행 기사에게 맞습니다." },
  b: { name: "B. 오더 보드형", sub: "목록을 빠르게 훑는 방식", refs: "전국24시콜, 원콜 같은 화물 정보망의 목록 구성과 DAT One 등 해외 로드보드의 공차·km당 운임 필터를 참고했습니다.", why: ["한 화면에 요청을 가장 많이 보여줍니다.", "운임순, 가까운순, 공차 포함 km당 운임순으로 정렬합니다.", "공차 상한과 최저 km당 운임으로 걸러 낼 수 있습니다."], best: "장거리·전업 기사에게 맞습니다." },
  c: { name: "C. 단일 콜형", sub: "콜 한 건에 집중하는 야간 화면", refs: "배민커넥트, 쿠팡이츠의 콜 수락 화면과 제한시간 구성을 참고했습니다.", why: ["한 번에 한 건만 크게 보여줍니다.", "제한시간과 수락 버튼이 화면의 중심입니다.", "어두운 화면이라 야간과 새벽 운행에 맞습니다."], best: "신규·야간 기사와 자동 배차에 맞습니다." },
};
