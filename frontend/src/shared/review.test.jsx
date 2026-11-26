import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { My } from './screens/My';
import { BuyerMy } from '../apps/buyer/my';
import SellerMy from '../apps/seller/screens/Screen27MyPage';
import SellerHome from '../apps/seller/screens/Screen05Home';
import BottomNav from '../apps/seller/components/BottomNav';
import { NavContext } from '../apps/seller/lib/nav';
import { Login } from './screens/Login';
import { Cart } from '../apps/buyer/cart';
const go = vi.fn();
let handle, requests;
beforeEach(() => {
 sessionStorage.clear(); localStorage.clear(); go.mockReset(); requests=[];
 handle = p => p === '/me/profile' ? {id:1,name:'시험 업체',biz_no:'000-00-00001',verified:true} : p === '/me/impact' ? null : [];
 vi.stubGlobal('fetch',vi.fn(async (url, options={}) => {const path=url.replace('/v1','');requests.push({path,method:options.method || 'GET',body:options.body});return {ok:true,status:200,json:async()=>handle(path)};}));
});
afterEach(() => {cleanup();vi.unstubAllGlobals();});
function seller(child) {return <NavContext.Provider value={{go,back:go,params:{}}}>{child}</NavContext.Provider>;}
for(const role of ['buyer','seller']) {
 it(`${role}: 실제 마이 진입점이 공통 화면·프로필·아이콘 메뉴 사용`,async()=>{
  const {container}=render(role==='seller' ? seller(<SellerMy />) : <BuyerMy go={go} logout={go} />);
  await screen.findByText('시험 업체');
  expect(container.querySelectorAll('[data-shared-screen="my"]')).toHaveLength(1);
  expect(within(container.querySelector('.tab-heading')).getByRole('heading',{name:'내 정보'})).toBeVisible();
  expect(container.querySelector('.my-profile .profile-icon img')).toHaveAttribute('src',`/icons/role_${role}.svg`);
  expect(container.querySelectorAll('.menu button')).toHaveLength(7);
  expect(screen.getByRole('button',{name:'고객센터'})).toBeVisible();
  const heading=container.querySelector('.tab-heading');
  expect(within(heading).getByRole('button',{name:'로그아웃'})).toBeVisible();
  expect(heading.nextElementSibling).toHaveClass('my-content');
  expect(screen.getByRole('heading',{name:'메뉴'})).toBeVisible();
  expect(screen.getByText('사업자번호 000-00-00001')).toBeVisible();
  expect(container.querySelector('.my-verification')).toHaveTextContent(`${role==='seller'?'판매자':'구매자'} 인증 완료`);
  fireEvent.click(within(container.querySelector('.my-profile')).getByRole('button',{name:'수정'}));
  expect(go).toHaveBeenLastCalledWith(role==='seller'?'company':{name:'profile'});
  for(const row of container.querySelectorAll('.menu button')) {expect(row.querySelector('img')).not.toBeNull();expect(row.lastElementChild).toHaveClass('menu-chevron');}
  fireEvent.click(screen.getByRole('button',{name:'알림 설정'}));
  expect(go).toHaveBeenCalledWith(role==='seller'?'settings':{name:'settings'});
  // 운송기사 역할이 없어져 차량 정보 칸도 없다
  expect(screen.queryByText('차량 정보')).toBeNull();expect(container.querySelector('.my-vehicle')).toBeNull();
 });
 it(`${role}: 로그인 빈칸 안내와 첫 미입력 칸 초점, 서버 요청 없음`,async()=>{
  render(<Login appRole={role} onLogin={go} />);
  const submit=screen.getByRole('button',{name:/로 로그인$/});expect(submit).toBeEnabled();
  fireEvent.click(submit);expect(screen.getByLabelText('사업자 계정')).toHaveFocus();expect(screen.getByText('사업자 계정 입력 필요')).toBeVisible();
  fireEvent.change(screen.getByLabelText('사업자 계정'),{target:{value:'   '}});fireEvent.click(submit);expect(screen.getByLabelText('사업자 계정')).toHaveFocus();
  fireEvent.change(screen.getByLabelText('사업자 계정'),{target:{value:'test@example.com'}});fireEvent.click(submit);expect(screen.getByLabelText('비밀번호')).toHaveFocus();expect(screen.getByText('비밀번호 입력 필요')).toBeVisible();
  await waitFor(()=>expect(requests.some(r=>r.path==='/auth/providers')).toBe(true));expect(requests.some(r=>r.path==='/auth/login')).toBe(false);
 });
}
it('빈 장바구니에서 탐색으로 이동',()=>{render(<Cart go={go} />);fireEvent.click(screen.getByRole('button',{name:'매물 보러 가기'}));expect(go).toHaveBeenCalledWith({name:'explore'});expect(screen.getByRole('button',{name:'구매 요청하기 (0건)'})).toBeDisabled();});
it('판매자 공통 BottomTabs의 다섯 탭과 공동판매 이동',()=>{const {container}=render(seller(<BottomNav />));const nav=screen.getByRole('navigation');expect(within(nav).getAllByRole('button').filter(b=>!b.classList.contains('shell-fab')).map(b=>b.textContent)).toEqual(['홈','내 판매','공동판매','거래내역']);fireEvent.click(screen.getByRole('button',{name:'공동판매'}));expect(go).toHaveBeenCalledWith('poolStatus');expect(container.querySelectorAll('nav')).toHaveLength(1);});
it('판매자 추천은 recommended_recyclers 필드 값과 상세 id 사용',async()=>{
 handle=()=>({company:{name:'공장'},recommended_recyclers:[{id:9,name:'추천 업체',region:'구미',distance_km:3,pickup_method:'직접 수거',terms:'검수 후 정산'}]});render(seller(<SellerHome />));const button=await screen.findByRole('button',{name:/추천 업체/});expect(button.closest('li')).toHaveTextContent('구미');expect(button.closest('li')).toHaveTextContent('근처 재활용업체, 3 km');expect(screen.queryByText('추천 재활용업체')).toBeNull();fireEvent.click(button);expect(go).toHaveBeenCalledWith('buyer',{id:9});
});
it('판매자 추천이 비어도 홈 검색창으로 재활용업체 찾기 이동',async()=>{
 handle=()=>({company:{name:'공장'},recommended_recyclers:[]});render(seller(<SellerHome />));fireEvent.click(await screen.findByRole('button',{name:'재활용업체 찾기'}));expect(go).toHaveBeenCalledWith('buyers');expect(screen.queryByText('등록 업체 없음')).not.toBeInTheDocument();
});

it('마이 스크롤 영역은 메뉴 터치 영역과 하단 여백을 유지한다', async () => {
 const css = readFileSync("src/shared/ui/shell/my.css", "utf8");
 expect(css).toContain(".my-content > * {flex-shrink:0;}");
 expect(css).toContain("overflow:auto");
 expect(css).toContain("min-height:52px");
 expect(css).toContain("padding:12px 20px 24px");
 expect(css).toContain("overflow-wrap:anywhere");
});
for(const role of ['buyer','seller']) it(`${role}: 사업자번호가 없으면 생략하고 미인증 상태 표시`,async()=>{
 handle=p=>p==='/me/profile'?{name:'미인증 회사',verified:false}:null;
 const {container}=render(role==='seller'?seller(<SellerMy/>):<My appRole={role} go={go} logout={go}/>);
 await screen.findByText('미인증 회사');
 expect(screen.queryByText(/사업자번호/)).not.toBeInTheDocument();
 expect(container.querySelector('.my-verification')).toHaveTextContent(`${role==='seller'?'판매자':'구매자'} 인증 대기`);
 expect(container.querySelector('.my-verification')).not.toHaveTextContent('✓');
});
for (const [title, path] of [['내 판매','Screen06Resources'],['공동판매 현황','Screen12PoolStatus'],['거래내역','Screen17Orders']]) {
 it(`판매자 ${title} 탭은 뒤로 버튼 없는 공통 제목`, async () => {
  handle = p => p === '/inquiries' ? [{id:20,listing_name:'철 문의',other_name:'업체',last_message:'재고 확인'}] : [];
  const modules = import.meta.glob('../apps/seller/screens/*.jsx');
  const {default: Component} = await modules[`../apps/seller/screens/${path}.jsx`]();
  const {container} = render(seller(<Component />));
  await waitFor(() => expect(requests.length).toBeGreaterThan(0));
  expect(within(container.querySelector('.tab-heading')).getByRole('heading',{name:title})).toBeVisible();
  expect(screen.queryByRole('button',{name:'뒤로'})).not.toBeInTheDocument();
  if(title==='거래내역') { fireEvent.click(screen.getByRole('tab',{name:'문의'})); expect(await screen.findByText('철 문의, 업체')).toBeVisible(); expect(screen.getByText('재고 확인')).toBeVisible(); fireEvent.click(screen.getByText('철 문의, 업체')); expect(go).toHaveBeenCalledWith('chat',{id:20,inquiry:'1'}); }
 });
}

it('공통 표시 크기와 가로 정렬은 후속 앱 규칙에도 유지된다', async () => {
 const css = readFileSync("src/shared/ui/review.css", "utf8");
 const auth = readFileSync("src/shared/screens/auth.css", "utf8");
 const base = readFileSync("src/shared/../apps/seller/styles/base.css", "utf8");
 expect(css).toMatch(/\.checkbox-mark \{width:24px;height:24px;/);
 expect(css).toMatch(/\.touch-checkbox \{[^}]*width:44px;height:44px;/);
 expect(css).toMatch(/\.order-summary > span \{white-space:nowrap;/);
 expect(auth).toContain('.login-links {display:flex;align-items:center;');
 expect(base).not.toMatch(/(?:^|\n)button\s*\{/);
});
it('판매자 알림 점은 공통 벨 아이콘 안에 위치한다', async () => {
 handle=()=>({company:{name:'공장',verified:true},unread:2});
 render(seller(<SellerHome />));
 const bell=await screen.findByRole('button',{name:/알림/});
 await waitFor(()=>expect(bell.querySelector('.notification-bell-icon .notification-bell-dot')).not.toBeNull());
 fireEvent.click(bell);expect(go).toHaveBeenCalledWith('notifications');
});
it('공동판매 상세로 들어가면 뒤로 가기는 유지한다', async () => {
 const {default: Component}=await import('../apps/seller/screens/Screen12PoolStatus');
 render(<NavContext.Provider value={{go,back:go,params:{id:1}}}><Component /></NavContext.Provider>);
 fireEvent.click(screen.getByRole('button',{name:'뒤로'}));expect(go).toHaveBeenCalled();
 await waitFor(()=>expect(requests.length).toBeGreaterThan(0));
});
