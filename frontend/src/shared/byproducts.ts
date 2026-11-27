// 사업장에서 많이 나오는 재활용 폐기물 7종(폐기물 코드)과 품목별 주 재질.
// 판매 등록(주 재질 고르기)과 판매자 가입, 회사 정보(나오는 부산물)가 함께 쓴다
export const BYPRODUCT_ITEMS = [
  { code: '51-03-08', name: '폐어망 (그물)', materials: ['나일론', 'PE', 'PP'] },
  { code: '51-03-05', name: '양식용 폐부자', materials: ['EPS'] },
  { code: '51-03-06', name: '폐스티로폼 (부표)', materials: ['EPS'] },
  { code: '51-03-01', name: '폐합성수지 (플라스틱)', materials: ['PP', 'PE', 'PET', 'ABS', 'PS'] },
  { code: '51-29-01', name: '고철', materials: ['철', '주물'] },
  { code: '51-29-02', name: '비철금속', materials: ['알루미늄', '구리', '황동', '스테인리스'] },
  { code: '51-28-02', name: '폐지 (종이류)', materials: ['골판지', '신문지', '백상지'] },
  { code: '51-29-03', name: '폐금속캔', materials: ['알루미늄캔', '철캔'] },
  { code: '51-20-23', name: '폐목재 (팔레트, 포장재)', materials: ['팔레트', '목재 포장재'] },
  { code: '51-99-00', name: '기타 폐기물', materials: [] as string[] },
];
export const OTHER_CODE = '51-99-00';

export type Byproduct = { code: string; material: string; monthly_kg?: number | null };

// 한 달 발생량은 대략만 받는다. 저장 값은 구간의 대표 kg
export const MONTHLY_AMOUNTS: { label: string; kg: number | null }[] = [
  { label: '발생량 모름', kg: null },
  { label: '한 달 1t 미만', kg: 500 },
  { label: '한 달 1~5t', kg: 3000 },
  { label: '한 달 5~20t', kg: 12000 },
  { label: '한 달 20t 이상', kg: 30000 },
];

export const MAX_BYPRODUCTS = 20;

export function amountIndex(kg?: number | null): number {
  if (kg == null) return 0;
  const exact = MONTHLY_AMOUNTS.findIndex((a) => a.kg === kg);
  if (exact >= 0) return exact;
  return kg < 1000 ? 1 : kg < 5000 ? 2 : kg < 20000 ? 3 : 4;
}

export function itemName(code: string): string {
  const name = BYPRODUCT_ITEMS.find((it) => it.code === code)?.name || '';
  return name.replace(/\s*\(.*\)$/, '');
}
