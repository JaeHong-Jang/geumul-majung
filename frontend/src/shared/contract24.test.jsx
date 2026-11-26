import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ListingList, ListingRow } from '../apps/buyer/listing';
import { BuyerHome } from '../apps/buyer/home';
import SellerHome from '../apps/seller/screens/Screen05Home';
import { NavContext } from '../apps/seller/lib/nav';
import { readCart } from '../apps/buyer/cartStore';
import { Assistant } from './ui/shell/ai';
import { readFileSync } from 'node:fs';
import { priceParts, weight } from '../apps/buyer/catalog';

const go = vi.fn();
const listing = { id: 1, waste_name: '폐합성수지류', target_material: 'pp', grade: 'B', region: '경북 구미', distance_km: 4, total_kg: 300, price_krw_per_kg: 340, status: 'posted' };
const response = data => ({ ok: true, status: 200, json: async () => data });
beforeEach(() => { go.mockReset(); localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('매물 표시: 주 재질 크게, 품목 작게, kg당 가격만, 등급 없음, 상세 열기와 찜은 독립된 버튼, 담기는 상세에서', () => {
 const { container } = render(<ListingList><ListingRow l={listing} go={go} add/></ListingList>);
 expect(container.querySelector('.buyer-listing-material')).toHaveTextContent('PP');
 expect(container.querySelector('.buyer-listing-item')).toHaveTextContent('폐합성수지류');
 for (const text of ['경북 구미', '300kg']) expect(screen.getByText(text)).toBeVisible();
 expect(container.textContent).not.toMatch(/등급|통과증|마대|순도/);
 expect(container.querySelector('.buyer-listing-price')).toHaveTextContent('340원/kg');
 expect(container.querySelector('.buyer-listing-other')).toBeNull();
 expect(container.textContent).not.toMatch(/원\/t|후기 없음/);
 expect(container.querySelector('img')).toHaveAttribute('src', '/icons/mat_pp.png');
 expect(screen.queryByRole('button', { name: /담기/ })).toBeNull();
 vi.stubGlobal('fetch', vi.fn(async () => response({})));
 const heart = screen.getByRole('button', { name: 'PP 찜하기' });
 expect(heart.parentElement.closest('button')).toBeNull();
 fireEvent.click(heart); expect(go).not.toHaveBeenCalled(); expect(readCart()).toHaveLength(0);
 expect(screen.getByRole('button', { name: 'PP 찜 해제' })).toHaveAttribute('aria-pressed', 'true');
 expect(fetch).toHaveBeenCalledWith('/v1/favorites/1', expect.objectContaining({ method: 'PUT' }));
 fireEvent.click(screen.getByRole('button', { name: /^PP 폐합성수지류/ }));
 expect(go).toHaveBeenCalledExactlyOnceWith({ name: 'listing', id: 1 });
});

it('t 단위 표기: 1,000kg 이상 무게는 t, 톤당 가격은 원/t', () => {
 expect(weight(2500)).toBe('2.5t');
 expect(priceParts(340, 'ton')).toMatchObject({ value: '34만', suffix: '원/t' });
});

it('거리 없음, 기본 아이콘, 구매 요청용 담기 없음과 판매 종료', () => {
 const { container, rerender } = render(<ListingRow l={{ ...listing, grade: null, distance_km: null, target_material: '긴 재질 이름' }} go={go}/>);
 expect(container.querySelector('.buyer-listing-material')).toHaveTextContent('긴 재질 이름');
 expect(screen.getByText('경북 구미')).toBeVisible();
 expect(screen.getAllByRole('button')).toHaveLength(1);
 expect(container.querySelector('.buyer-listing-picture img')).toHaveAttribute('src', '/icons/tab_list_on.svg');
 rerender(<ListingRow l={{ ...listing, status: 'sold' }} go={go} add/>);
 expect(screen.getByText('판매 종료')).toBeVisible();
});

it.each([['pe', 'mat_pe'], ['철', 'mat_iron'], ['알루미늄', 'mat_aluminum']])('%s 재질 그림과 큰 가격 표시', (target_material, picture) => {
 const { container } = render(<ListingRow l={{ ...listing, target_material, price_krw_per_kg: 2800 }} go={go}/>);
 expect(container.querySelector('img')).toHaveAttribute('src', `/icons/${picture}.png`);
 expect(container.querySelector('.buyer-listing-price')).toHaveTextContent('2,800원/kg');
});

it('구매자 홈 추천과 판매 중인 원료 목록을 각각 묶고 빈 매물 표시', async () => {
 vi.stubGlobal('fetch', vi.fn(async url => response(url.endsWith('/buyer/home') ? { company: {}, listings: [listing], recommended: [{ ...listing, id: 2 }] } : url.endsWith('/orders') ? [] : {})));
 const { container, unmount } = render(<BuyerHome go={go}/>);
 await screen.findByText('판매 중인 원료');
 expect(container.querySelectorAll('.buyer-listing-list')).toHaveLength(2);
 expect(container.querySelectorAll('.buyer-listing-row')).toHaveLength(2);
 unmount(); fetch.mockImplementation(async url => response(url.endsWith('/buyer/home') ? { company: {}, listings: [] } : url.endsWith('/orders') ? [] : {}));
 render(<BuyerHome go={go}/>); expect(await screen.findByText('등록 매물 없음')).toBeVisible();
});

it('판매자 등록 물량은 앞 세 품목, 전체 개수, 괄호 설명과 시세를 표시', async () => {
 const volumes = [
  { waste_code: '1', waste_name: '폐합성수지류(폐염화비닐수지류 제외)', target_material: 'pp', total_kg: 1500, seller_count: 3, min_price: 340, market: { price: 377.6 } },
  { waste_code: '2', waste_name: '고철', target_material: '철', total_kg: 1400, seller_count: 1, min_price: 360 },
  { waste_code: '3', waste_name: '폐종이류', target_material: '골판지', total_kg: 900, seller_count: 1, min_price: 90 },
  { waste_code: '4', waste_name: '숨긴 품목' },
 ];
 vi.stubGlobal('fetch', vi.fn(async () => response({ volumes })));
 render(<NavContext.Provider value={{ go }}><SellerHome/></NavContext.Provider>);
 await screen.findByText('4개 품목');
 const region = screen.getByRole('region', { name: '등록 물량' });
 const rows = within(region).getAllByRole('listitem'); expect(rows).toHaveLength(3);
 for (const text of ['폐합성수지류, PP', '폐염화비닐수지류 제외', '1,500 kg, 판매자 3곳', '시세 377.6원/kg', '고철, 철']) expect(within(region).getByText(text)).toBeVisible();
 expect(rows[0].querySelector('.seller-volume-price strong')).toHaveTextContent('340원/kg');
 expect(within(rows[1]).queryByText(/시세/)).toBeNull();
 expect(screen.queryByText('숨긴 품목')).toBeNull();
 expect(screen.getByText('현재 시세')).toBeVisible();
 expect(rows.map(row => row.querySelector('img').getAttribute('src'))).toEqual(['/icons/vol_plastic.png', '/icons/vol_metal.png', '/icons/vol_paper.png']);
 expect(within(region).queryByRole('button')).toBeNull(); fireEvent.click(rows[0]); expect(go).not.toHaveBeenCalled();
});

it('판매자 재질 없는 이름과 빈 등록 물량', async () => {
 vi.stubGlobal('fetch', vi.fn(async () => response({ volumes: [{ waste_code: '1', waste_name: '기타(설명)', total_kg: 1, seller_count: 1, min_price: 0 }] })));
 const { unmount } = render(<NavContext.Provider value={{ go }}><SellerHome/></NavContext.Provider>);
 expect(await screen.findByText('기타')).toBeVisible(); expect(screen.getByText('설명')).toBeVisible();
 unmount(); fetch.mockResolvedValue(response({ volumes: [] }));
 render(<NavContext.Provider value={{ go }}><SellerHome/></NavContext.Provider>);
 expect(await screen.findByText('등록 물량 없음')).toBeVisible(); expect(screen.getByText('0개 품목')).toBeVisible();
});

it.each(['llm', 'none'])('AI %s 답 문단은 서버 줄바꿈을 pre-line으로 표시', async source => {
 const answer = '첫 줄\n둘째 줄';
 vi.stubGlobal('fetch', vi.fn(async () => response({ answer, source, facts: [] })));
 const { container } = render(<Assistant appRole="buyer" go={go} back={go}/>);
 fireEvent.change(screen.getByRole('textbox'), { target: { value: '질문' } });
 fireEvent.click(screen.getByRole('button', { name: '보내기' }));
 await screen.findByText('첫 줄 둘째 줄');
 const paragraph = container.querySelector('.shell-assistant-answer');
 expect(paragraph.textContent).toBe(answer);
 expect(readFileSync('src/shared/ui/shell/ai.css', 'utf8')).toMatch(/\.shell-assistant-answer\s*\{\s*white-space:\s*pre-line\s*;?\s*\}/);
});
