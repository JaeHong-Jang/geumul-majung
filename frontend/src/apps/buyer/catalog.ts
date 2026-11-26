/** 구매자 화면의 품목 기준: 대표 품목, 주 재질 이름, kg·t 가격 표기. */
import { material, shortName, type Listing } from "../../types";

export interface CatalogItem {
  key: string;          // 매물의 target_material과 맞추는 값(소문자)
  material: string;     // 크게 보여 줄 주 재질
  item: string;         // 작게 보여 줄 품목
  category: string;     // 분류 탭
  code: string;         // 폐기물 코드
  icon?: string;        // public/icons 안 파일 이름
}

export const CATEGORIES = [["", "전체"], ["51-03", "폐합성수지"], ["51-29", "폐금속"], ["51-28", "폐지"]] as const;

/** 대표 품목. 매물이 없는 품목도 구매 희망을 올릴 수 있게 고정해 둔다. */
export const CATALOG: CatalogItem[] = [
  { key: "pp", material: "PP", item: "폴리프로필렌, 사출/필름 스크랩", category: "폐합성수지", code: "51-03-01", icon: "mat_pp.png" },
  { key: "pe", material: "PE", item: "폴리에틸렌, 필름/용기 스크랩", category: "폐합성수지", code: "51-03-01", icon: "mat_pe.png" },
  { key: "pet", material: "PET", item: "페트, 병/시트 스크랩", category: "폐합성수지", code: "51-03-01", icon: "vol_plastic.png" },
  { key: "abs", material: "ABS", item: "ABS, 가전/사출 스크랩", category: "폐합성수지", code: "51-03-01", icon: "vol_plastic.png" },
  { key: "철", material: "철", item: "고철, 절단/가공 스크랩", category: "폐금속", code: "51-29-01", icon: "mat_iron.png" },
  { key: "알루미늄", material: "알루미늄", item: "비철금속, 캔/압출 스크랩", category: "폐금속", code: "51-29-02", icon: "mat_aluminum.png" },
  { key: "구리", material: "구리", item: "비철금속, 전선/동 스크랩", category: "폐금속", code: "51-29-02", icon: "vol_metal.png" },
  { key: "골판지", material: "골판지", item: "폐지, 박스/포장재", category: "폐지", code: "51-28-02", icon: "vol_paper.png" },
];

export const keyOf = (l: Pick<Listing, "target_material">) => (l.target_material ?? "").toLowerCase();
export const catalogOf = (key: string) => CATALOG.find((c) => c.key === key.toLowerCase());
/** 크게: 주 재질. 작게: 품목. */
export const mainMaterial = (l: Pick<Listing, "target_material" | "waste_name">) =>
  catalogOf(keyOf(l))?.material ?? (material(l.target_material) || shortName(l.waste_name));
export const itemName = (l: Pick<Listing, "target_material" | "waste_name">) => shortName(l.waste_name);
export const categoryOf = (code: string) => CATEGORIES.find(([c]) => c && code.startsWith(c))?.[1] ?? "기타";
export const iconOf = (key: string) => catalogOf(key)?.icon;

export type PriceUnit = "kg" | "ton";
const UNIT_KEY = "buyer:priceUnit";
export const readUnit = (): PriceUnit => (localStorage.getItem(UNIT_KEY) === "ton" ? "ton" : "kg");
export const saveUnit = (u: PriceUnit) => localStorage.setItem(UNIT_KEY, u);

const num = (n: number) => n.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
/** 원/t를 읽기 쉽게: 380,000 → 38만원, 1,234,500 → 123만 4,500원 */
export function manwon(n: number): string {
  const v = Math.round(n);
  const man = Math.floor(v / 10000), rest = v % 10000;
  if (!man) return `${num(rest)}원`;
  return rest ? `${num(man)}만 ${num(rest)}원` : `${num(man)}만원`;
}
/** 큰 글자 값과 단위, 그리고 다른 단위 환산(작은 글자). */
export function priceParts(perKg: number, unit: PriceUnit) {
  const kg = `${perKg.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}원/kg`;
  const ton = `${manwon(perKg * 1000)}/t`;
  return unit === "ton"
    ? { value: manwon(perKg * 1000).replace(/\s?원$/, ""), suffix: "원/t", other: kg }
    : { value: perKg.toLocaleString("ko-KR", { maximumFractionDigits: 2 }), suffix: "원/kg", other: ton };
}
/** 무게: 1,000kg 이상이면 t로 */
export const weight = (kg: number) =>
  kg >= 1000 ? `${(kg / 1000).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}t` : `${num(kg)}kg`;
