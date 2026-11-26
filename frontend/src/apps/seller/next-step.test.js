import { expect, it } from 'vitest';
import { orderNextStep } from './lib/format';
import { fromPriceItem } from './screens/Screen07Register';

// 계약 31절: 판매자가 지금 할 일 버튼, 시세 제안에서 판매 등록 품목 미리 고르기
it('거래 상태별로 판매자가 할 다음 일을 고른다', () => {
  expect(orderNextStep({ status: 'dispatched' })).toEqual({ label: '출고 처리', to: 'pickup' });
  expect(orderNextStep({ status: 'picked_up' })).toBeNull();                          // 도착 확인과 입고 검사는 구매자 차례
  expect(orderNextStep({ status: 'arrived', allbaro_no: null })).toEqual({ label: '인계서 입력', to: 'handover' });
  expect(orderNextStep({ status: 'arrived', allbaro_no: 'A-1' })).toBeNull();          // 구매자 입고 검사 차례
  expect(orderNextStep({ status: 'settled', handover: { allbaro_no: 'A-1' } })).toEqual({ label: '정산 상세', to: 'settlement' });
  expect(orderNextStep({ status: 'payment_held' })).toBeNull();
  expect(orderNextStep(null)).toBeNull();
});

it('시세 품목 이름에서 품목 코드와 주 재질을 찾는다', () => {
  expect(fromPriceItem('폐골판지')).toEqual({ code: '51-28-02', material: '골판지' });
  expect(fromPriceItem('ABS 펠렛')).toEqual({ code: '51-03-01', material: 'ABS' });
  expect(fromPriceItem('PET 플레이크')).toEqual({ code: '51-03-01', material: 'PET' });   // PE보다 긴 PET
  expect(fromPriceItem('알루미늄캔 압축')).toEqual({ code: '51-29-03', material: '알루미늄캔' });
  expect(fromPriceItem('유리병')).toEqual({});
  expect(fromPriceItem(undefined)).toEqual({});
});
