import { expect, it } from 'vitest';
import { orderStatusText } from './orderStatus';

it('직접 수거 주문은 판매자 출고 문구를 쓰지 않는다', () => {
  expect(orderStatusText('dispatched', 'self')).toBe('직접 수거 예정');
  expect(orderStatusText('picked_up', 'self')).toBe('직접 운반 중');
  expect(orderStatusText('dispatched')).toBe('판매자 출고 준비');
  expect(orderStatusText('dispatched', 'seller')).toBe('판매자 출고 준비');
  expect(orderStatusText('payment_held')).toBe('결제 확인 중');
  expect(orderStatusText('released')).toBe('상태 확인 중');
  expect(orderStatusText('settled', 'self')).toBe('정산 완료');
});
