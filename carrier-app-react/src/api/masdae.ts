/*
 * 팀 백엔드(마대 장터) 운반업체 API 연동. 형식은 docs/ARCHITECTURE.md와 backend/app/contracts.py를 따른다.
 * 아직 화면에 연결하지 않았다. 지금 화면은 예시 콜을 쓰고, 백엔드 콜 목록에 운임이 생기면 callToSeed로 바꿔 끼운다.
 */
import type { LatLng, OrderSeed, Trip, TripStage } from "../types";

export type OrderStatus = "ordered" | "payment_held" | "dispatched" | "picked_up" | "arrived" | "confirmed" | "settled" | "rated" | "disputed" | "cancelled" | "returned";

export interface CallDto {
  order_id: number;
  waste_code: string;
  total_kg: number;
  pickup: { lat: number; lon: number };
  dropoff: { lat: number; lon: number };
}
export interface BagWeight { bag_id: number; kg: number }

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

const MESSAGES: Record<number, string> = {
  401: "회사 정보를 확인할 수 없습니다. 다시 로그인해 주세요.",
  403: "이 작업을 할 권한이 없습니다. 허가 확인 상태를 살펴 주세요.",
  404: "요청한 주문을 찾을 수 없습니다.",
  409: "이미 다른 기사가 수락했거나 주문 상태가 바뀌었습니다. 목록을 새로고침해 주세요.",
};

export function createMasdaeClient(baseUrl: string, companyId: number, fetchFn: typeof fetch = fetch) {
  async function call<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetchFn(baseUrl + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "X-Company-Id": String(companyId), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!res.ok) throw new ApiError(res.status, MESSAGES[res.status] ?? "서버 요청에 실패했습니다. 잠시 뒤 다시 시도해 주세요.");
    return (await res.json()) as T;
  }
  return {
    listCalls: () => call<CallDto[]>("/v1/calls"),
    acceptCall: (orderId: number, freightKrw: number) => call<{ order_id: number; status: OrderStatus; hauler_id: number }>(`/v1/calls/${orderId}/accept`, { freight_krw: freightKrw }),
    pickup: (orderId: number, bagWeights: BagWeight[]) => call<{ status: OrderStatus }>(`/v1/orders/${orderId}/pickup`, { bag_weights: bagWeights }),
    arrive: (orderId: number) => call<{ status: OrderStatus }>(`/v1/orders/${orderId}/arrive`, {}),
    fillCarrierHandover: (orderId: number, vehicleNo: string) => call<Record<string, unknown>>(`/v1/orders/${orderId}/handover/carrier`, { vehicle_no: vehicleNo }),
  };
}

/** 앱의 운행 단계에 해당하는 주문 상태. 하차·계량 단계는 도착(arrived) 뒤 재활용업체 검사를 기다린다. */
export function statusForStage(stage: TripStage): OrderStatus {
  const map: Record<TripStage, OrderStatus> = { 0: "dispatched", 1: "dispatched", 2: "picked_up", 3: "arrived", 4: "arrived" };
  return map[stage];
}
/** 단계를 넘길 때 서버에 보낼 동작. 이동·하차 처리처럼 서버 상태가 바뀌지 않는 단계는 null이다. */
export function actionForStage(t: Trip): "pickup" | "arrive" | "handover" | null {
  if (t.stage === 1) return "pickup";
  if (t.stage === 2) return "arrive";
  if (t.stage === 3) return "handover";
  return null;
}

/** 백엔드 콜을 화면 콜 원본으로 바꾼다. 콜 목록에 운임·장소명이 없어(QA 03 5번) 운임은 0으로 두고 표시용 값을 채운다. */
export function callToSeed(c: CallDto): OrderSeed {
  const stops: LatLng[] = [[c.pickup.lat, c.pickup.lon], [c.dropoff.lat, c.dropoff.lon]];
  return {
    id: c.order_id, from: "상차지", to: "하차지", shipper: `주문 #${c.order_id}`, consignee: `주문 #${c.order_id}`, stops,
    fare: 0, base: 0, premium: 0, wait: 0, item: `폐기물 ${c.waste_code}`, bags: 0, ton: Math.round(c.total_kg / 100) / 10,
    when: "상차 시간 협의", grade: "A", tags: ["일반"], pay: "운임 협의", rating: 0, cond: "조건 확인 필요", window: "상차 시간 협의", dropNote: "하차 시간 협의",
  };
}
