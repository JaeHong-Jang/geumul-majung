export type Role = "buyer" | "seller";
export const roleName = {
  buyer: "구매자",
  seller: "판매자",
};
export const serverRole = {
  buyer: "recycler",
  seller: "factory",
};
export interface Company {
  id: number;
  name: string;
  role: string;
  verified: boolean;
  permit_codes: string[];
  region?: string;
  biz_no?: string;
  permit_no?: string;
  email?: string | null;
  phone?: string | null;
  address?: string;
  lat?: number;
  lon?: number;
  vehicle_no?: string;
  vehicle_type?: string;
  capacity_ton?: number;
  online?: boolean;
}
export interface Price {
  item: string;
  category: string;
  price: number;
  unit: string;
  date: string;
  change_pct?: number | null;
  source_id?: string;
}
export interface Bag {
  id: number;
  waste_code: string;
  waste_name?: string;
  target_material?: string;
  total_kg: number;
  status?: string;
  grade?: string | null;
  purity?: number;
  pass_id?: number | string | null;
  qr?: string;
  listing_id?: number | null;
  has_photo?: boolean;
  created_at?: string;
}
export interface Listing {
  id: number;
  status: string;
  waste_code: string;
  waste_name?: string;
  grade: string;
  total_kg: number;
  price_krw_per_kg: number;
  factory_id: number;
  factory_name?: string;
  bag_count: number;
  region?: string;
  target_material?: string;
  purity_avg?: number;
  composition?: Record<string, number>;
  area?: Point;
  bags?: Bag[];
  bag_ids?: number[];
  market?: Price | null;
  distance_km?: number | null;
  price_vs_market_pct?: number | null;
  favorite?: boolean;
  available_from?: string | null;
  pickup_note?: string;
  terms?: { transport: 'matched' | 'own'; ship_hours: string | null; unload_forklift?: boolean; unload_crane?: boolean; freight_payer?: string };
  seller_notes?: string[];
  factory_rating?: number | null;
  factory_rating_count?: number;
  issued_at?: string;
  mode?: string;
  order_id?: number;
}
export interface Volume {
  waste_code: string;
  waste_name: string;
  target_material: string;
  total_kg: number;
  listing_count: number;
  seller_count: number;
  bag_count: number;
  min_price: number;
  max_price: number;
  grades: Record<string, number>;
  market: Price | null;
}
export interface Bundle {
  id: string;
  waste_code: string;
  waste_name: string;
  target_material: string;
  grade: string;
  listing_ids: number[];
  seller_count: number;
  total_kg: number;
  avg_distance_km: number;
  min_lot_kg: number;
  meets_min_lot: boolean;
  avg_price: number;
  market: Price | null;
  reasons: string[];
  listings: Listing[];
}
export interface Point {
  lat: number;
  lon: number;
}
export interface Handover {
  emitter: unknown;
  carrier: unknown;
  processor: unknown;
  allbaro_no: string | null;
  vehicle_hint?: string | null;   // 지난번 쓴 내 차량 번호(운반자일 때만)
}
export interface Settlement {
  factory_krw?: number;
  platform_krw?: number;
  refund_krw?: number;
  invoice?: boolean;
  resolution?: string;
  note?: string;
  legal_note?: string;
}
export interface Order {
  id: number;
  status: string;
  listing_id: number;
  goods_krw?: number;
  dock?: Dock | null;
  tax_invoice?: { email: string } | null;
  freight_payer?: 'buyer' | 'seller';
  freight_cap_krw: number;
  held_krw?: number;
  unit_price_krw_per_kg?: number;
  freight_krw?: number;
  waste_name?: string;
  total_kg: number;
  grade?: string;
  bag_count?: number;
  bags?: Bag[];
  bag_ids?: number[];
  factory_name?: string;
  recycler_name?: string;
  hauler_name?: string;
  counterparty_names?: string[];
  settlement?: Settlement;
  handover?: Handover;
  allbaro_no?: string | null;
  weight_warning?: unknown;
  dispute_reason?: string;
  history?: { from: string; to: string; by: number; at: string }[];
  transport?: string;
  payment?: string;
  delivery_address?: string;
  desired_date?: string;
  note?: string;
  legal_note?: string;
  updated_at?: string;
  created_at?: string;
}
export interface Home {
  company: Company;
  listings?: Listing[];
  prices?: Price[];
  volumes?: Volume[];
  bundles?: Bundle[];
  recommended?: Listing[];
  active_orders?: number | Order[];
  orders?: Order[];
  bag_count?: number;
  unread?: number;
  settled_total?: number;
  settled_count?: number;
}
export interface Address {
  id: number;
  label: string;
  address: string;
  is_default: boolean;
}
export interface Preview {
  goods_krw: number;
  held_krw: number;
  fee_krw: number;
  items: unknown[];
  pickup_groups?: {
    factory_ids: number[];
    listing_ids: number[];
    total_kg: number;
    radius_km: number;
  }[];
}
export interface GradeResult {
  bag_id: number;
  grade: {
    target_material: string;
    purity: number;
    grade: string | null;
    hazard: boolean;
    reasons: string[];
  };
  pass_id?: string | number;
  qr?: string;
  run_id: string;
}
export interface Advice {
  summary?: string;
  public_claims?: { text: string; level: string }[];
}
export interface Dock { unload: string; load_ok: boolean; max_vehicle: string; hours: string | null; note: string | null }
export interface Route {
  name: string;
  id?: number;
  ids?: number[];
  bundle?: Bundle;
  orders?: Order[];
}
export type Go = (route: Route) => void;
export const codes = [
  ["51-03-01", "폐합성수지류"],
  ["51-29-01", "고철"],
  ["51-29-02", "비철금속"],
  ["51-28-02", "폐지류"],
] as const;
export const fmt = (n: number | undefined | null) =>
  n == null
    ? "확인 중"
    : n.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
export const won = (n: number | undefined | null) => `${fmt(n)}원`;
export const material = (s?: string) =>
  s
    ? ({ pp: "PP", pe: "PE", pet: "PET", pvc: "PVC", abs: "ABS" }[
        s.toLowerCase()
      ] ?? s)
    : "";
export const shortName = (s?: string) => s?.split("(")[0]?.trim() ?? "품목";
export const statusName: Record<string, string> = {
  payment_held: "결제 확인 중",
  dispatched: "판매자 출고 준비",
  picked_up: "운송 중",
  arrived: "입고 검사 대기",
  confirmed: "검사 확정",
  settled: "정산 완료",
  rated: "후기 완료",
  disputed: "검사 이의 확인",
  cancelled: "취소",
  canceled: "취소",
  posted: "게시 중",
  withdrawn: "철회",
  bundle_wait: "묶음 대기",
};

export type OrderChecklist = {
  items: { item: 'recycler_permit' | 'seller_transport' | 'handover_entry'; ok: boolean | null; text: string; detail?: string; laws: { ref: string; label: string }[] }[];
  legal_note: string;
};
export type AssistantReply = {
  answer: string;
  source: 'llm' | 'template' | 'none';
  facts: { headline?: string; detail?: string; text: string; level: string; evidence: { kind: string; ref: string; label: string }[] }[];
  legal_note?: string | null;
};
