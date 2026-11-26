import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HandoverScreen } from './screens/Handover';

// 계약 32절: 인계서는 지금 할 일과 담당을 보이고, 차례가 아닌 칸은 입력 대신 이유를 보인다
const response = (data: unknown) => ({ ok: true, status: 200, json: async () => data });
let order: Record<string, unknown>;
let handover: Record<string, unknown>;
let posts: { url: string; body: unknown }[];
beforeEach(() => {
  posts = [];
  order = { id: 6, status: 'arrived', transport: 'seller', total_kg: 500 };
  handover = { emitter: { company_name: '가상사출A' }, carrier: { vehicle_no: '89바1234' }, processor: null, allbaro_no: null };
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === 'POST') posts.push({ url, body: JSON.parse(String(options.body)) });
    return response(url.endsWith('/handover') ? handover : order);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const nextCard = async () => (await screen.findByText(/지금 할 일|기다리는 중|인계서 완료/)).closest('.handover-next') as HTMLElement;

it('판매자: 처리자 칸은 구매자 검사 확정을 기다리고 번호 입력칸은 아직 없다', async () => {
  const home = vi.fn();
  render(<HandoverScreen appRole="seller" id={6} back={() => undefined} home={home} />);
  const card = await nextCard();
  expect(within(card).getByText('기다리는 중')).toBeVisible();
  expect(within(card).getByText('구매자 처리자 인계서 작성 뒤 입력')).toBeVisible();   // 내 남은 칸(번호)이 무엇을 기다리는지
  expect(screen.queryByLabelText('올바로 번호')).toBeNull();
  expect(screen.getByText('구매자 입고 검사 확정 뒤 작성')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '홈으로' }));
  expect(home).toHaveBeenCalled();
});

it('구매자: 도착했으면 판매자 칸이 남아도 내 차례인 입고 검사를 먼저 알린다', async () => {
  handover = { ...handover, carrier: null };
  render(<HandoverScreen appRole="buyer" id={6} back={() => undefined} />);
  const card = await nextCard();
  expect(within(card).getByText('입고 검사 확정 뒤 처리자 인계서 작성')).toBeVisible();
  expect(screen.getByText('판매자 작성 차례')).toBeVisible();                       // 운반자 칸
  expect(screen.queryByRole('button', { name: '처리자 인계서 작성' })).toBeNull();
});

it('구매자: 검사 확정 뒤 처리 방법을 골라 처리자 칸 작성, 직접 입력도 가능', async () => {
  order = { ...order, status: 'confirmed' };
  render(<HandoverScreen appRole="buyer" id={6} back={() => undefined} />);
  const card = await nextCard();
  expect(within(card).getByText('처리 방법 고르고 처리자 인계서 작성')).toBeVisible();
  const write = screen.getByRole('button', { name: '처리자 인계서 작성' });
  expect(write).toBeDisabled();
  expect(screen.getByText('처리 방법 선택 필요')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '직접 입력' }));
  fireEvent.change(screen.getByLabelText('처리 방법 직접 입력'), { target: { value: '세척 후 펠릿 생산' } });
  fireEvent.click(screen.getByRole('button', { name: '파쇄 후 재활용' }));
  fireEvent.click(write);
  await waitFor(() => expect(posts).toEqual([{ url: '/v1/orders/6/handover/processor', body: { method: '파쇄 후 재활용' } }]));
});

it('판매자 운반자 칸은 지난번 차량 번호를 미리 채운다', async () => {
  order = { ...order, status: 'picked_up' };
  handover = { emitter: { company_name: '가상사출A' }, carrier: null, processor: null, allbaro_no: null, vehicle_hint: '89바1234' };
  render(<HandoverScreen appRole="seller" id={6} back={() => undefined} />);
  expect(await screen.findByLabelText('운송 차량 번호')).toHaveValue('89바1234');
  expect(screen.getByText('지난번 쓴 차량 번호 자동 입력')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '운반자 인계서 작성' }));
  await waitFor(() => expect(posts[0]).toEqual({ url: '/v1/orders/6/handover/carrier', body: { vehicle_no: '89바1234' } }));
});
