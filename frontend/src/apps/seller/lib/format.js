export const won = (n) => `${Math.round(Number(n)).toLocaleString('ko-KR')}원`;
export const kg = (n) => `${Number(n).toLocaleString('ko-KR', { maximumFractionDigits: 3 })}kg`;
export const perKg = (n) => n == null ? '비공개' : `${Number(n).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원/kg`;

export { dateText } from '../../../shared/format';

// 주문 상태 (docs/ARCHITECTURE.md 4절 + 8.5 출구)
export const ORDER_STATUS = {
  ordered: '주문 접수',
  payment_held: '결제 확인 중',
  dispatched: '출고 준비',
  picked_up: '운송 중',
  arrived: '입고지 도착, 검사 대기',
  confirmed: '검사 확정',
  settled: '정산 완료',
  rated: '후기 완료',
  disputed: '분쟁',
  cancelled: '취소됨',
  returned: '반송',
};
export const orderStatus = (s) => ORDER_STATUS[s] || s;

// 판매자가 지금 할 일(거래 상태별 다음 버튼). 운송은 판매자가 맡아 출고까지 기록, 도착 확인은 구매자가 검사와 함께
export function orderNextStep(o) {
  if (!o) return null;
  if (o.status === 'dispatched') return { label: '출고 처리', to: 'pickup' };
  if (['arrived', 'confirmed', 'settled', 'rated'].includes(o.status) && !(o.allbaro_no || o.handover?.allbaro_no)) return { label: '인계서 입력', to: 'handover' };
  if (['settled', 'rated'].includes(o.status)) return { label: '정산 상세', to: 'settlement' };
  return null;
}

export const LISTING_STATUS = {
  posted: '판매 중',
  bundle_wait: '모아서 팔기 대기',
  sold: '주문 진행',
  withdrawn: '판매 내림',
};
export const listingStatus = (s) => LISTING_STATUS[s] || s;

// 진행중 / 완료 / 문의 구분
export const orderGroup = (s) => {
  if (s === 'disputed') return '진행중';
  if (['settled', 'rated', 'cancelled', 'returned'].includes(s)) return '완료';
  return '진행중';
};

export const materialName = (m) => (/^[a-z]+$/i.test(m || '') ? m.toUpperCase() : m || '');
