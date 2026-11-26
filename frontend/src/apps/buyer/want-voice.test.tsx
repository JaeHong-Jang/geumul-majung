import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WantForm } from './index';

// 계약 29절: 구매 희망 말로 입력 → 에이전트 단계 표시 → AI 입력 칸 표시, 품목을 고르면 희망가 추천
vi.mock('leaflet', () => {
  const chain = { addTo: () => chain, bindTooltip: () => chain, setView: () => chain, remove: () => undefined, attributionControl: { setPrefix: () => undefined } };
  const TileLayer = { extend: () => function Local() { return chain; } };
  return { default: { map: () => chain, marker: () => chain, divIcon: () => ({}), TileLayer } };
});

const go = vi.fn();
const response = (data: unknown) => ({ ok: true, status: 200, json: async () => data });
const intake = {
  transcript: '고철 20톤, 톤당 30만에서 35만 원, 매달, 협상 불가',
  fields: { material: '철', waste_code: '51-29-01', qty_kg: 20000, price_min_krw_per_kg: 300, price_max_krw_per_kg: 350, price_unit: 'ton',
    repeat: 'monthly', negotiable: false },
  price: { auto: null, market: { item: '철스크랩', date: '2026-09-10', low: 330, high: 380 }, listings: null },
  steps: [
    { id: 'stt', name: '음성 인식', ok: true, used_llm: false, lines: ['6초 음성을 글로 변환, 로컬 whisper-small'] },
    { id: 'want_intake', name: '구매 희망 정리', ok: true, used_llm: true, lines: ['희망 수량 20,000 kg'] },
    { id: 'want_price', name: '희망가 추천', ok: true, used_llm: false, lines: ['말한 희망 가격은 최근 시세 범위의 아래, 그대로 둠'] },
  ],
  run_id: 'r1',
};
const steel = { id: 41, factory_id: 1, factory_name: '가상사출A', region: '경북 구미', waste_code: '51-29-01', waste_name: '고철', target_material: '철',
  total_kg: 25000, price_krw_per_kg: 320, distance_km: 3, favorite: false, status: 'posted' };
const matched = { count: 2, fit_all: 1, steps: [], matches: [
  { listing: steel, price_fit: 'in', qty_fit: 'enough', reasons: ['희망 상한가 안', '희망 수량 충분', '3 km'] },
  { listing: { ...steel, id: 42, factory_name: '가상사출B', total_kg: 5000 }, price_fit: 'in', qty_fit: 'part', reasons: ['희망 상한가 안', '희망 수량의 25%', '8 km'] }] };
let requests: { url: string; method: string; body: unknown }[] = [];
let stt = true;
function fakeRecorder() {
  class Rec {
    state = 'inactive'; mimeType = 'audio/webm';
    ondataavailable?: (e: { data: Blob }) => void; onstop?: () => void;
    static isTypeSupported(t: string) { return t === 'audio/webm'; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['x'], { type: 'audio/webm' }) }); this.onstop?.(); }
  }
  vi.stubGlobal('MediaRecorder', Rec);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
}
beforeEach(() => {
  requests = []; stt = true; go.mockReset(); sessionStorage.clear(); localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    requests.push({ url, method: options?.method ?? 'GET', body: options?.body ? JSON.parse(String(options.body)) : null });
    if (url === '/v1/buy-requests/intake/status') return response({ stt });
    if (url === '/v1/buy-requests/intake') return response(intake);
    if (url.startsWith('/v1/buy-requests/match')) return response(url.includes('material=%EC%B2%A0') ? matched : { count: 0, fit_all: 0, matches: [], steps: [] });
    if (url.startsWith('/v1/buy-requests/price-suggest')) return response({ auto: { min: 350, max: 410 }, market: { item: 'PP 압축', date: '2026-09-10', low: 350, high: 410 },
      listings: { count: 1, cheapest: 340 }, steps: [{ id: 'want_price', name: '희망가 추천', ok: true, used_llm: false, lines: ['희망 가격 350~410원/kg 자동 입력, 시세 지역별 범위 기준'] }] });
    return response(url === '/v1/me/buy-requests' || url === '/v1/listings' || url === '/v1/me/addresses' ? [] : {});
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete (navigator as { mediaDevices?: unknown }).mediaDevices; });

it('말로 입력을 누르면 듣고, 끝나면 에이전트 단계와 AI 입력 칸이 보이고 자동 제출하지 않는다', async () => {
  fakeRecorder();
  render(<WantForm go={go} back={go} />);
  const mic = await screen.findByRole('button', { name: '말로 입력' });
  await waitFor(() => expect(mic).toBeEnabled());
  fireEvent.click(mic);                                                    // 들어와도 자동으로 듣지 않음, 누를 때만
  fireEvent.click(await screen.findByRole('button', { name: /듣는 중 0초, 누르면 바로 정리/ }));
  const card = await screen.findByRole('region', { name: 'AI 작업' });
  for (const name of ['음성 인식', '구매 희망 정리', '희망가 추천']) expect(within(card).getByText(name)).toBeVisible();
  expect(within(card).getByText(intake.transcript)).toBeVisible();
  expect(screen.getByLabelText(/주 재질/)).toHaveValue('철');
  expect(screen.getByLabelText(/희망 수량/)).toHaveValue(20);
  expect(screen.getByLabelText(/하한가 \(원\/t\)/)).toHaveValue(300000);          // 톤당 말이라 원/t로 보임
  expect(screen.getByLabelText(/상한가 \(원\/t\)/)).toHaveValue(350000);
  expect(screen.getByRole('button', { name: '매월 정기 구매' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: '협상 불가' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('희망가 추천 근거: 시세 철스크랩 330~380원/kg')).toBeVisible();
  const tags = screen.getAllByText('AI 입력').length;
  fireEvent.change(screen.getByLabelText(/희망 수량/), { target: { value: '15' } });
  expect(screen.getAllByText('AI 입력')).toHaveLength(tags - 1);                    // 사람이 고치면 표시를 뗀다
  // 판매 매물 맞추기: 말로 채운 재질, 수량, 상한가로 판매 중인 매물을 맞춰 보이고 바로 열 수 있다
  const section = (await screen.findByText('같은 재질 판매 중 2건, 가격과 수량 모두 맞음 1건')).closest('section') as HTMLElement;
  expect(within(section).getByText('희망 상한가 안, 희망 수량 충분, 3 km')).toBeVisible();
  expect(within(section).getByText('가상사출B')).toBeVisible();
  const asked = requests.filter((r) => r.url.startsWith('/v1/buy-requests/match')).at(-1)!.url;
  expect(Object.fromEntries(new URL(asked, 'http://x').searchParams)).toEqual({ material: '철', qty_kg: '15000', price_max: '350' });
  const [sent] = requests.filter((r) => r.url === '/v1/buy-requests/intake');
  expect((sent!.body as { content_type: string }).content_type).toBe('audio/webm');
  expect(requests.some((r) => r.url === '/v1/buy-requests' && r.method === 'POST')).toBe(false);
});

it('품목을 고르면 희망가 추천이 빈 가격 칸을 채우고, 사람이 쓴 가격은 덮지 않는다', async () => {
  stt = false;
  const view = render(<WantForm go={go} back={go} />);
  expect(await screen.findByText('1. 구매할 원료')).toBeVisible();
  await waitFor(() => expect(screen.queryByRole('region', { name: '말로 입력' })).toBeNull());
  fireEvent.click(screen.getAllByRole('button', { name: /PP/ })[0]!);
  await waitFor(() => expect(screen.getByLabelText(/하한가/)).toHaveValue(350));
  expect(screen.getByLabelText(/상한가/)).toHaveValue(410);
  expect(screen.getByText('희망가 추천 근거: 시세 PP 압축 350~410원/kg, 판매 중 최저 340원/kg')).toBeVisible();
  expect(within(screen.getByRole('region', { name: 'AI 작업' })).getByText('희망가 추천')).toBeVisible();
  view.unmount();

  render(<WantForm go={go} back={go} />);
  expect(await screen.findByText('1. 구매할 원료')).toBeVisible();
  fireEvent.change(screen.getAllByLabelText(/하한가/)[0]!, { target: { value: '200' } });
  fireEvent.change(screen.getAllByLabelText(/상한가/)[0]!, { target: { value: '250' } });
  fireEvent.click(screen.getAllByRole('button', { name: /PP/ })[0]!);
  await waitFor(() => expect(screen.getByText(/희망가 추천 근거/)).toBeVisible());
  expect(screen.getByLabelText(/하한가/)).toHaveValue(200);
});
