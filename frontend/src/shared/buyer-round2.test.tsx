import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AddressPicker, ListingDetail, SellerProfile, WantCard, WantForm } from '../apps/buyer/index';
import { examplePhoto } from '../apps/buyer/photos';

vi.mock('leaflet', () => {
  const chain = { addTo: () => chain, bindTooltip: () => chain, setView: () => chain, remove: () => undefined, attributionControl: { setPrefix: () => undefined } };
  const TileLayer = { extend: () => function Local() { return chain; } };
  return { default: { map: () => chain, marker: () => chain, divIcon: () => ({}), TileLayer } };
});

const go = vi.fn();
const response = (data: unknown) => ({ ok: true, status: 200, json: async () => data });
const seller = {
  id: 2, name: '가상사출B', ceo_name: '이가상', intro: '가전 외장 사출', biz_no: '000-00-00002', phone: '054-000-0002', industry: '플라스틱 사출',
  region: '경북 구미', address: '경북 구미시 가상로 2', lat: 36.1, lon: 128.4, verified: true, distance_km: 4, completed_deals: 3,
  rating: 4.7, rating_count: 3, listings: [],
};
const listing = { id: 1, status: 'posted', waste_code: '51-03-01', waste_name: '폐합성수지류', target_material: 'pp', grade: 'B', total_kg: 300,
  price_krw_per_kg: 340, factory_id: 2, factory_name: '가상사출B', region: '경북 구미', distance_km: 4, factory_rating: 4.7, factory_rating_count: 3, bag_count: 1, bags: [], favorite: false };
let requests: { url: string; method: string; body: unknown }[] = [];
let routes: Record<string, unknown> = {};
beforeEach(() => {
  requests = []; go.mockReset(); localStorage.clear(); sessionStorage.clear();
  routes = {
    '/v1/sellers/2': seller,
    '/v1/sellers/2/reviews': [{ id: 1, score: 5, comment: '분류 상태 좋음', writer: '가상*****', item: '폐합성수지류' }],
    '/v1/me/addresses': [{ id: 1, label: '본사 공장', address: '경북 구미시 가상산단로 10', is_default: true }, { id: 2, label: '제2공장', address: '경북 구미시 3공단로 7, 2동', is_default: false }],
    '/v1/me/profile': { name: '가상리사이클', address: '경북 구미시 가상산단로 10' },
    '/v1/listings/1': listing, '/v1/listings': [listing], '/v1/me/buy-requests': [],
  };
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    requests.push({ url, method: options?.method ?? 'GET', body: options?.body ? JSON.parse(String(options.body)) : null });
    return response(routes[url] ?? {});
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('판매 공장 정보: 대표, 사업자번호, 전화, 주소, 지도, 별점과 후기', async () => {
  render(<SellerProfile id={2} go={go} back={go} />);
  expect(await screen.findByRole('heading', { name: /가상사출B/ })).toBeVisible();
  for (const text of ['이가상', '000-00-00002', '경북 구미시 가상로 2', '플라스틱 사출']) expect(screen.getByText(text)).toBeVisible();
  expect(screen.getByRole('link', { name: '054-000-0002' })).toHaveAttribute('href', 'tel:054-000-0002');
  expect(screen.getByRole('img', { name: '가상사출B 위치 지도' })).toBeInTheDocument();
  expect(screen.getByLabelText('평점 4.7, 후기 3개')).toBeVisible();
  fireEvent.click(screen.getByRole('tab', { name: '후기 3' }));
  expect(await screen.findByText('분류 상태 좋음')).toBeVisible();
  expect(screen.getByText('가상*****')).toBeVisible();
});

it('매물 상세: 판매 공장 줄(별점)을 누르면 회사 정보, 아래 막대에 찜과 가격', async () => {
  render(<ListingDetail id={1} go={go} back={go} />);
  const row = await screen.findByRole('button', { name: '가상사출B 판매 공장 정보 보기' });
  expect(within(row).getByLabelText('평점 4.7, 후기 3개')).toBeVisible();
  fireEvent.click(row);
  expect(go).toHaveBeenCalledWith({ name: 'seller', id: 2 });
  expect(screen.getByText('340원/kg')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '찜하기' }));
  await waitFor(() => expect(requests.some((r) => r.url === '/v1/favorites/1' && r.method === 'PUT')).toBe(true));
});

it('입고지 고르기: 기본 입고지가 먼저, 변경으로 다른 공장 선택, 새 입고지는 이름과 도로명 주소', async () => {
  const onChange = vi.fn();
  const { rerender } = render(<AddressPicker value="" onChange={onChange} />);
  await waitFor(() => expect(onChange).toHaveBeenCalledWith('경북 구미시 가상산단로 10'));
  rerender(<AddressPicker value="경북 구미시 가상산단로 10" onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: '변경' }));
  const sheet = screen.getByRole('dialog', { name: '입고지 선택' });
  fireEvent.click(within(sheet).getByText('제2공장'));
  expect(onChange).toHaveBeenLastCalledWith('경북 구미시 3공단로 7, 2동');
  fireEvent.click(screen.getByRole('button', { name: '변경' }));
  fireEvent.click(screen.getByRole('button', { name: '+ 새 입고지 추가' }));
  const save = screen.getByRole('button', { name: '입고지 저장' });
  expect(save).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '제3공장' }));
  fireEvent.click(await screen.findByRole('button', { name: '가입할 때 등록한 사업장 주소 불러오기' }));
  fireEvent.change(screen.getByLabelText('상세 주소'), { target: { value: '3동' } });
  fireEvent.click(save);
  await waitFor(() => expect(requests.find((r) => r.url === '/v1/me/addresses' && r.method === 'POST')?.body)
    .toEqual({ label: '제3공장', address: '경북 구미시 가상산단로 10, 3동' }));
});

it('구매 희망: 하한가~상한가 범위와 협상 여부로 올림', async () => {
  render(<WantForm go={go} back={go} />);
  expect(await screen.findByText('1. 구매할 원료')).toBeVisible();
  expect(screen.queryByText(/가격 협의/)).not.toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('button', { name: /PP/ })[0]!);
  fireEvent.change(screen.getByLabelText('희망 수량'), { target: { value: '500' } });
  expect(screen.getByText('희망 하한가 입력 필요')).toBeVisible();
  fireEvent.change(screen.getByLabelText('하한가 (원/kg)'), { target: { value: '400' } });
  fireEvent.change(screen.getByLabelText('상한가 (원/kg)'), { target: { value: '350' } });
  expect(screen.getByText('하한가는 상한가 이하로')).toBeVisible();
  fireEvent.change(screen.getByLabelText('하한가 (원/kg)'), { target: { value: '300' } });
  await waitFor(() => expect(screen.queryByText('하한가는 상한가 이하로')).not.toBeInTheDocument());
  expect(screen.getByText('300~350원/kg')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '협상 불가' }));
  expect(screen.getByRole('button', { name: '협상 불가' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: '원/t' }));
  expect(screen.getByLabelText('하한가 (원/t)')).toHaveValue(300000);
});

it('구매 희망 카드: 모집 중 표시 없이 희망 가격 범위와 협상 여부', async () => {
  const w = { id: 7, material: 'PET', item: '분쇄품', waste_code: null, qty_kg: 1000, price_krw_per_kg: 350, price_min_krw_per_kg: 300,
    price_max_krw_per_kg: 350, negotiable: false, price_unit: 'kg' as const, need_by: null, repeat: 'once' as const,
    delivery_address: null, note: null, status: 'open' as const, created_at: '2026-11-01T00:00:00Z' };
  render(<WantCard w={w} go={go} />);
  expect(screen.getByText('300~350원/kg')).toBeVisible();
  expect(screen.getByText('협상 불가')).toBeVisible();
  expect(screen.queryByText(/모집/)).not.toBeInTheDocument();
  expect(screen.getByText('1t')).toBeVisible();
});

it('매물 상세에서 장바구니 담기: 완료 시트에서 장바구니 보기 또는 다른 매물 더 보기', async () => {
  render(<ListingDetail id={1} go={go} back={go} />);
  fireEvent.click(await screen.findByRole('button', { name: '장바구니 담기' }));
  const sheet = screen.getByRole('dialog', { name: '장바구니 담기 완료' });
  expect(within(sheet).getByText('PP')).toBeVisible();
  expect(JSON.parse(localStorage.getItem('janjaemi:cart:guest') ?? '[]')).toHaveLength(1);
  fireEvent.click(within(sheet).getByRole('button', { name: '다른 매물 더 보기' }));
  expect(go).toHaveBeenLastCalledWith({ name: 'explore' });
  fireEvent.click(screen.getByRole('button', { name: '장바구니 보기' }));   // 이미 담겼으면 바로 장바구니로
  expect(go).toHaveBeenLastCalledWith({ name: 'cart' });
});

it('판매자 사진이 없으면 품목 예시 사진과 출처(작성자, 라이선스)를 보인다', async () => {
  render(<ListingDetail id={1} go={go} back={go} />);
  const img = await screen.findByRole('img', { name: 'PP 예시 사진' });
  expect(img).toHaveAttribute('src', '/photos/pp_1.jpg');
  expect(screen.getByText('예시 사진')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Wikimedia Commons' })).toHaveAttribute('href', expect.stringContaining('commons.wikimedia.org'));
  expect(screen.getByRole('link', { name: 'CC BY-SA 3.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-sa/3.0/');
  expect(screen.queryByText('등록된 사진 없음')).not.toBeInTheDocument();
});

it('같은 품목이라도 매물(회사)마다 다른 예시 사진: 품목마다 매물 수 이상 준비', () => {
  const need: Record<string, number> = { pp: 5, pe: 4, pet: 4, abs: 4, '철': 5, '알루미늄': 5, '구리': 4, '골판지': 6 };
  for (const [key, n] of Object.entries(need)) {
    const srcs = Array.from({ length: n }, (_, i) => examplePhoto(key, i)!.src);
    expect(new Set(srcs).size, key).toBe(n);
  }
  expect(examplePhoto('pp', 0)!.license).toMatch(/CC|Public domain/);
});
