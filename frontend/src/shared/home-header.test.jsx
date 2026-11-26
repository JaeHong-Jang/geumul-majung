import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BuyerHome } from '../apps/buyer/home';
import SellerHome from '../apps/seller/screens/Screen05Home';
import { NavContext } from '../apps/seller/lib/nav';

const go = vi.fn();
function mockHome(path, company) {
  vi.stubGlobal('fetch', vi.fn(async (url) => ({ ok: true, status: 200, json: async () => (url.endsWith(path) ? { company, orders: [], listings: [], prices: [], bundles: [] } : []) })));
}
const seller = () => <NavContext.Provider value={{ go, back: go, params: {} }}><SellerHome /></NavContext.Provider>;
const apps = [
  ['판매자', '/seller/home', seller, '승인'],
  ['구매자', '/buyer/home', () => <BuyerHome go={go} />, '승인'],
];
afterEach(() => { cleanup(); vi.unstubAllGlobals(); go.mockReset(); });

it.each(apps)('%s 홈은 승인이 끝나면 칩을 숨긴다', async (_, path, view, word) => {
  mockHome(path, { name: '회사', verified: true });
  render(view());
  await screen.findByRole('heading', { name: '회사' });
  expect(screen.queryByText(`${word} 완료`)).toBeNull();
  expect(screen.queryByText(`${word} 대기`)).toBeNull();
});

it.each(apps)('%s 홈은 승인 전이면 대기 칩을 보여 준다', async (_, path, view, word) => {
  mockHome(path, { name: '회사', verified: false });
  render(view());
  expect(await screen.findByText(`${word} 대기`)).toBeVisible();
});

it('판매자의 대기 칩은 승인 화면으로 간다', async () => {
  mockHome('/seller/home', { name: '회사', verified: false });
  render(seller());
  fireEvent.click(await screen.findByText('승인 대기'));
  expect(go).toHaveBeenCalledWith('approval');
});
