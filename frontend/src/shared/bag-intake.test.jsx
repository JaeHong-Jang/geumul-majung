import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Register from '../apps/seller/screens/Screen07Register';
import { NavContext } from '../apps/seller/lib/nav';
import { clearDraft, setDraft } from '../apps/seller/lib/draft';

// 계약 27절: 말로 입력 → 에이전트 단계 표시 → AI 입력 칸 표시, 품목을 고르면 재질 추천
const go = vi.fn();
const response = (value, status = 200) => ({ ok: status < 400, status, json: async () => value });
const intake = {
  transcript: 'PP 사출 자투리 300kg 다음 주 화요일부터 정문 지게차 앞',
  fields: { waste_code: '51-03-01', weight_kg: 300, available_from: '2026-11-10', pickup_note: '정문 지게차 앞' },
  sources: {},
  material: { auto: 'PP', candidates: [{ material: 'PP', reasons: ['지난 등록 6회'] }, { material: 'PE', reasons: ['이 품목에 해당하는 재질'] }] },
  steps: [
    { id: 'stt', name: '음성 인식', ok: true, used_llm: false, lines: ['8.7초 음성을 글로 변환, 로컬 whisper-small'] },
    { id: 'intake', name: '말 입력 정리', ok: true, used_llm: true, lines: ['무게 300 kg'] },
    { id: 'material', name: '재질 추천', ok: true, used_llm: false, lines: ['주 재질 PP 자동 입력, 다르면 후보에서 선택'] },
  ],
  run_id: 'r1',
};
let calls;
function fakeRecorder() {
  class Rec {
    constructor() { this.state = 'inactive'; this.mimeType = 'audio/webm'; }
    static isTypeSupported(t) { return t === 'audio/webm'; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['x'], { type: 'audio/webm' }) }); this.onstop?.(); }
  }
  vi.stubGlobal('MediaRecorder', Rec);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
}
beforeEach(() => {
  go.mockReset();
  clearDraft();
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    calls.push([url, init]);
    if (url.includes('/bags/intake/status')) return response({ stt: true });
    if (url.includes('/bags/intake')) return response(intake);
    if (url.includes('/bags/material-suggest')) return response({ auto: '철', candidates: [{ material: '철', reasons: ['이 품목의 유일한 재질'] }], steps: [], run_id: 'r2' });
    return response([]);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete navigator.mediaDevices; });
const boxes = () => screen.getAllByRole('combobox');                   // 품목, 주 재질, 출고 시간
const view = () => render(<NavContext.Provider value={{ go, back: go, params: {} }}><Register /></NavContext.Provider>);

it('말로 입력을 누르면 듣고, 끝나면 에이전트 단계가 보이고 AI가 채운 칸에 표시가 붙는다', async () => {
  fakeRecorder();
  view();
  const mic = await screen.findByRole('button', { name: '말로 입력' });
  await waitFor(() => expect(mic).toBeEnabled());
  fireEvent.click(mic);                                                    // 누를 때만 듣는다
  fireEvent.click(await screen.findByRole('button', { name: /듣는 중 0초, 누르면 바로 정리/ }));
  const card = await screen.findByRole('region', { name: 'AI 작업' });
  for (const name of ['음성 인식', '말 입력 정리', '재질 추천']) expect(within(card).getByText(name)).toBeVisible();
  expect(within(card).getByText(intake.transcript)).toBeVisible();
  expect(screen.getByPlaceholderText('예: 800')).toHaveValue('300');
  expect(boxes()[0]).toHaveValue('51-03-01');
  expect(boxes()[1]).toHaveValue('PP');
  expect(screen.getByDisplayValue('정문 지게차 앞')).toBeVisible();
  expect(screen.getAllByText('AI 입력')).toHaveLength(5);                 // 품목, 재질, 무게, 출고 가능일, 현장 안내
  expect(screen.getByText('재질 추천 근거: 지난 등록 6회')).toBeVisible();
  const [, init] = calls.find(([u, i]) => u.endsWith('/bags/intake') && i?.method === 'POST');
  expect(JSON.parse(init.body).content_type).toBe('audio/webm');
  fireEvent.change(screen.getByPlaceholderText('예: 800'), { target: { value: '280' } });
  expect(screen.getAllByText('AI 입력')).toHaveLength(4);                 // 사람이 고치면 표시를 뗀다
  expect(go).not.toHaveBeenCalled();                                      // 자동 제출 없음
});

it('직접 입력을 누르면 녹음을 버리고 음성을 보내지 않는다', async () => {
  fakeRecorder();
  view();
  const mic = await screen.findByRole('button', { name: '말로 입력' });
  await waitFor(() => expect(mic).toBeEnabled());
  fireEvent.click(mic);                                                    // 누를 때만 듣는다
  await screen.findByRole('button', { name: /듣는 중/ });
  fireEvent.click(screen.getByRole('button', { name: '직접 입력' }));
  expect(await screen.findByRole('button', { name: '말로 입력' })).toBeEnabled();
  expect(calls.some(([u, i]) => u.endsWith('/bags/intake') && i?.method === 'POST')).toBe(false);
});

it('화면에 들어와도 자동으로 듣지 않는다(해설하며 시연할 때 해설이 칸에 들어가지 않게)', async () => {
  fakeRecorder();
  view();
  const mic = await screen.findByRole('button', { name: '말로 입력' });
  await waitFor(() => expect(mic).toBeEnabled());
  expect(screen.queryByRole('button', { name: /듣는 중/ })).toBeNull();
});

it('품목을 고르면 재질 추천이 재질 칸을 채우고 후보 칩을 보인다', async () => {
  view();
  fireEvent.change(boxes()[0], { target: { value: '51-29-01' } });
  await waitFor(() => expect(boxes()[1]).toHaveValue('철'));
  expect(screen.getByRole('group', { name: '재질 후보' })).toBeVisible();
  expect(screen.getByText('재질 추천 근거: 이 품목의 유일한 재질')).toBeVisible();
  expect(screen.getAllByText('AI 입력')).toHaveLength(1);
  fireEvent.change(boxes()[1], { target: { value: '주물' } });             // 사람이 고르면 표시를 뗀다
  expect(screen.queryByText('AI 입력')).toBeNull();
});

it('품목 목록에 없는 재질 후보는 직접 입력 칸으로 들어간다', async () => {
  fetch.mockImplementation(async (url) => response(url.includes('/material-suggest')
    ? { auto: null, candidates: [{ material: '철', reasons: [] }, { material: '스크랩', reasons: [] }] } : url.includes('/status') ? { stt: false } : []));
  view();
  fireEvent.change(boxes()[0], { target: { value: '51-29-01' } });
  fireEvent.click(await screen.findByRole('button', { name: '스크랩' }));
  expect(screen.getByPlaceholderText('예: 스티로폼, 폐유리')).toHaveValue('스크랩');
});

it('음성 인식을 쓸 수 없으면 말로 입력 버튼을 숨긴다', async () => {
  fakeRecorder();
  fetch.mockImplementation(async (url) => response(url.includes('/status') ? { stt: false } : []));
  view();
  await waitFor(() => expect(screen.queryByRole('region', { name: '말로 입력' })).toBeNull());
});

// 판매 가격: 재질이 정해지면 시세로 자동 입력(AI 입력 표시), 말한 가격과 사람이 쓴 가격은 덮지 않는다
const market = { item: '철스크랩', material: '철', date: '2026-09-10', price: 358.9, region_low: 314, region_high: 390.5, suggest_low: 310, suggest_high: 390 };
const withMarket = (extra = {}) => fetch.mockImplementation(async (url, init) => {
  calls.push([url, init]);
  if (url.includes('/bags/intake/status')) return response({ stt: extra.stt ?? false });
  if (url.includes('/bags/intake')) return response(extra.intake ?? intake);
  if (url.includes('/bags/material-suggest')) return response({ auto: '철', candidates: [{ material: '철', reasons: ['이 품목의 유일한 재질'] }], steps: [], run_id: 'r2' });
  if (url.includes('/market/suggest')) return response(url.includes('%EC%B2%A0') ? market : { item: null });
  return response([]);
});

it('재질이 정해지면 판매 가격을 시세로 채우고, 버튼으로 바꾸면 AI 표시를 뗀다', async () => {
  withMarket();
  view();
  fireEvent.change(boxes()[0], { target: { value: '51-29-01' } });
  await waitFor(() => expect(screen.getByPlaceholderText('원/kg')).toHaveValue('359'));
  expect(screen.getByText(/현재 시세 철스크랩 기준 자동 입력/)).toBeVisible();
  expect(screen.getAllByText('AI 입력').length).toBeGreaterThanOrEqual(2);       // 재질, 판매 가격
  fireEvent.click(screen.getByRole('button', { name: '낮게 310원' }));
  expect(screen.getByPlaceholderText('원/kg')).toHaveValue('310');
  expect(screen.queryByText(/시세 기준 자동 입력/)).toBeNull();
});

it('사람이 쓴 판매 가격은 시세로 덮지 않는다', async () => {
  withMarket();
  view();
  fireEvent.change(screen.getByPlaceholderText('원/kg'), { target: { value: '500' } });
  fireEvent.change(boxes()[0], { target: { value: '51-29-01' } });
  await screen.findByRole('button', { name: '시세 359원' });
  expect(screen.getByPlaceholderText('원/kg')).toHaveValue('500');
});

it('말한 판매 가격은 시세보다 먼저 쓴다', async () => {
  fakeRecorder();
  withMarket({ stt: true, intake: { ...intake, fields: { waste_code: '51-29-01', material: '철', weight_kg: 500, price_krw_per_kg: 400 }, material: { auto: null, candidates: [] } } });
  view();
  const mic = await screen.findByRole('button', { name: '말로 입력' });
  await waitFor(() => expect(mic).toBeEnabled());
  fireEvent.click(mic);                                                    // 누를 때만 듣는다
  fireEvent.click(await screen.findByRole('button', { name: /듣는 중 0초/ }));
  await waitFor(() => expect(screen.getByPlaceholderText('원/kg')).toHaveValue('400'));
  await screen.findByRole('button', { name: '시세 359원' });
  expect(screen.getByPlaceholderText('원/kg')).toHaveValue('400');
  expect(screen.getByText('말한 가격으로 입력')).toBeVisible();
});
