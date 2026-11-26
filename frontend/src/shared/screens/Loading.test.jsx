import { readFileSync } from "node:fs";
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../../App';
import SellerApp from '../../apps/seller/App';

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  localStorage.clear();
  history.replaceState({}, '', '/');
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  // Pending data must not hold the splash open.
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const view = (role) => render(role === 'seller' ? <SellerApp /> : <App appRole={role} />);
for (const role of ['seller', 'buyer']) {
  it(`${role}: 로딩 먼저 표시, 뒤에 로그인 준비, 4.3초 후 공개 (데이터 지연)`, async () => {
    const { container } = view(role);
    expect(screen.getByRole('status', { name: '잔재미 앱을 불러오는 중' })).toBeInTheDocument();
    expect(container.querySelector('.truck-loading__eyebrow')).toHaveTextContent('잔재미');
    expect(container.querySelector('.truck-loading__title')).toHaveTextContent('산업 부산물 거래');
    expect(container.querySelector('.truck-loading__sub')).toHaveTextContent('불러오는 중');
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(container.querySelector('[inert]')).toHaveTextContent('사업자 계정');
    expect(screen.queryByRole('textbox', { name: '사업자 계정' })).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(3800); });
    expect(container.querySelector('.splash')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(container.querySelector('.splash')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '사업자 계정' })).toBeVisible();
  });
  it(`${role}: 움직임 줄이기에서 100ms 후 로그인`, async () => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    const { container } = view(role);
    expect(container.querySelector('.splash')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(container.querySelector('.splash')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '사업자 계정' })).toBeVisible();
  });
  it(`${role}: 저장 세션은 같은 전환 뒤 홈 (데이터 지연)`, async () => {
    sessionStorage.setItem(`janjaemi:${role}`, JSON.stringify({ access_token: 'saved', company: { id: 1, name: '테스트', role: {seller:'factory',buyer:'recycler'}[role] } }));
    const { container } = view(role);
    expect(container.querySelector('.splash')).toBeInTheDocument();
    expect(container.querySelector('[inert]')).not.toHaveTextContent('사업자 계정');
    await act(async () => { await vi.advanceTimersByTimeAsync(4300); });
    expect(container.querySelector('.splash')).not.toBeInTheDocument();
    expect(container.querySelector('[inert]')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: '사업자 계정' })).not.toBeInTheDocument();
  });
}

it('일반 모션은 500ms 동안 전체 화면을 위로 이동하고 투명도는 유지한다', async () => {
 const css = readFileSync("src/shared/screens/loading.css", "utf8");
 const exit = css.match(/@keyframes splash-exit\s*\{([\s\S]*?)\n@media/)[1];
 expect(exit).toContain('from { transform: translateY(0); }');
 expect(exit).toContain('to { transform: translateY(-100%); }');
 expect(exit).not.toMatch(/opacity|visibility/);
 expect(css).toMatch(/\.splash\s*\{[^}]*opacity: 1;[^}]*animation: splash-exit 500ms 3800ms cubic-bezier/);
 expect(css).toContain('@media (prefers-reduced-motion: reduce)');
 expect(css.match(/animation: none/g)).toHaveLength(1);
});
