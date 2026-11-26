import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BuyerHome } from '../apps/buyer/home';
import SellerHome from '../apps/seller/screens/Screen05Home';
import SellerMy from '../apps/seller/screens/Screen27MyPage';
import { My } from './screens/My';
import { NavContext } from '../apps/seller/lib/nav';
const go=vi.fn(), logout=vi.fn();
let requests=[];
const prices=[{item:'폐철',price:389,unit:'원/kg',date:'2026-10',change_pct:2}];
const homes={
 '/seller/home':{company:{name:'판매 회사',verified:true},orders:[{id:42,status:'dispatched'}],listings:[{status:'bundle_wait'}],prices,recommended_recyclers:[{id:7,name:'재활용 회사',region:'부산'}]},
 '/buyer/home':{company:{name:'구매 회사'},prices,bundles:[{target_material:'PP',waste_name:'폐플라스틱',grade:'A',seller_count:5,total_kg:1234,avg_distance_km:7.8,meets_min_lot:true,listing_ids:[21,22]}],listings:[]},
};
beforeEach(()=>{requests=[];go.mockReset();logout.mockReset();sessionStorage.clear();vi.stubGlobal('fetch',vi.fn(async(url,options={})=>{const path=url.replace('/v1','');requests.push({path,...options});return {ok:true,status:200,json:async()=>homes[path]??(path.includes('/history')?[{date:'2026-09',price:380},{date:'2026-10',price:389}]:path==='/me/profile'?{name:'시험 회사',verified:true}:path==='/me/impact'?{month:'2026-10',kg:4321,order_count:8,carbon_kg:123}:[])};}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const seller=child=><NavContext.Provider value={{go,back:go,params:{}}}>{child}</NavContext.Provider>;
it('판매자 홈 공통 틀과 서버 통계·시세 및 기존 이동',async()=>{
 const {container}=render(seller(<SellerHome/>));await screen.findByText('판매 회사');expect(container.querySelector('[data-shell=home] .shell-header')).toBeTruthy();expect(screen.getAllByText('1건')).toHaveLength(2);expect(screen.getByText('389')).toBeVisible();expect(screen.queryByText('다음 수거')).toBeNull();fireEvent.click(screen.getByText('다음 출고'));expect(go).toHaveBeenCalledWith('order',{id:42});fireEvent.click(screen.getByText('＋ 판매 등록'));expect(go).toHaveBeenCalledWith('register');fireEvent.click(screen.getByRole('button',{name:'재활용 회사 보기'}));expect(go).toHaveBeenCalledWith('buyer',{id:7});
});
it('구매자 홈 서버 공동판매·검색·시세와 오른쪽 상태 배지',async()=>{
 const {container}=render(<BuyerHome go={go}/>);await screen.findByText('구매 회사');expect(container.querySelector('.shell-hero-badge')).toHaveTextContent('최소 구매량 충족');expect(screen.getByText('389')).toBeVisible();fireEvent.click(screen.getByText('구매 요청하기'));expect(go).toHaveBeenCalledWith({name:'purchase',ids:[21,22]});fireEvent.change(screen.getByRole('textbox'),{target:{value:'폐철'}});fireEvent.click(screen.getByText('검색'));expect(sessionStorage.getItem('buyer:search')).toBe('폐철');expect(go).toHaveBeenCalledWith({name:'explore'});
});
for(const role of ['seller','buyer']) it(`${role} 마이의 모든 메뉴·로그아웃 동작 유지`,async()=>{
 if(role==='seller') sessionStorage.setItem('janjaemi:seller',JSON.stringify({access_token:'test',company:{role:'seller'}}));
 const {container}=render(role==='seller'?seller(<SellerMy/>):<My appRole={role} go={go} logout={logout}/>);await screen.findByText('시험 회사');const rows=[...container.querySelectorAll('.my-menu button:not(.impact-export)')];const routes=role==='seller'?['company','approval','coupons','buyers','chat','settings','support']:['wants','interests','favorites','frequent','addresses','settings','support'];expect(rows).toHaveLength(routes.length);expect(new Set(rows.map(r=>r.querySelector('img').src)).size).toBe(rows.length);rows.forEach((row,i)=>{fireEvent.click(row);expect(go).toHaveBeenLastCalledWith(role==='seller'?routes[i]:{name:routes[i]});});fireEvent.click(screen.getByText('로그아웃'));if(role==='seller')expect(go).toHaveBeenLastCalledWith('login');else expect(logout).toHaveBeenCalledOnce();
 expect(within(container.querySelector('.tab-heading')).getByRole('button',{name:'로그아웃'})).toBeVisible();
 if(role==='seller') expect(sessionStorage.getItem('janjaemi:seller')).toBeNull();
 expect(screen.getByText('이번 달 자원순환 성과')).toBeVisible();
 expect(screen.getByText('2026-10, 완료 거래 8건')).toBeVisible();
 expect(screen.getByText(`${role==='buyer'?'원료 구매':'자원 순환'} 4,321 kg, 탄소 감축 123 kgCO₂e`)).toBeVisible();
 expect(screen.queryByText('차량 정보')).toBeNull();
});
it('구매자 마이에서 정산 거래 내보내기 실행',async()=>{
 const create=vi.fn(()=> 'blob:my-export');
 vi.stubGlobal('URL',class extends URL {static createObjectURL=create;static revokeObjectURL=vi.fn();});
 const download=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
 try {
  render(<My appRole="buyer" go={go} logout={logout}/>);
  fireEvent.click(await screen.findByRole('button',{name:'정산 거래 내려받기'}));
  await waitFor(()=>expect(download).toHaveBeenCalledOnce());
  expect(requests.some(r=>r.path==='/me/orders')).toBe(true);
  expect(create).toHaveBeenCalledWith(expect.any(Blob));
  expect(download.mock.instances[0].download).toBe('잔재미-정산거래.csv');
 } finally {download.mockRestore();}
});
it('빈 공동판매도 탐색 버튼이 있는 초록 카드이고 시세는 월별 그래프 하나만 표시한다', async()=>{
 const original=homes['/buyer/home'];
 homes['/buyer/home']={...original,bundles:[],company:{name:'구매 회사',verified:true,region:'구미시'}};
 try {
  const {container}=render(<BuyerHome go={go}/>);
  expect(await screen.findByText('현재 참여 가능한 묶음 없음')).toBeVisible();
  expect(screen.queryByText('승인 완료')).toBeNull();expect(screen.getByText('구미시')).toBeVisible();
  await waitFor(()=>expect(container.querySelectorAll('.shell-market svg')).toHaveLength(1));
  expect(container.querySelector('.shell-market')).not.toHaveTextContent('2026-10');
  expect(container.querySelector('.shell-market')).not.toHaveTextContent('연평균');
  fireEvent.click(screen.getByRole('button',{name:'매물 보기'}));expect(go).toHaveBeenCalledWith({name:'explore'});
 } finally {homes['/buyer/home']=original;}
});
it('AI 제안 닫기·수락과 탭바 AI 버튼은 도우미 화면으로 이동',async()=>{
 const {AiSuggestions,BottomTabs}=await import('./ui/shell');const accept=vi.fn();
 render(<><AiSuggestions items={[{id:'a',title:'제안 A',reason:'이유',accept:'수락',onAccept:accept}]}/><BottomTabs appRole="seller" active="home" go={go}/></>);
 fireEvent.click(screen.getByRole('button',{name:'수락'}));expect(accept).toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'제안 닫기'}));await waitFor(()=>expect(screen.queryByText('제안 A')).toBeNull());expect(screen.getByText('새 제안 없음')).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'AI 도우미'}));expect(go).toHaveBeenCalledWith({name:'assistant'});
});
it('밀어서 실행: 끝까지 끌면 실행, 중간에 놓으면 원위치, 탭도 실행',async()=>{
 const {SlideAction}=await import('./ui/shell');const done=vi.fn();
 render(<SlideAction label="판매 등록" onDone={done}/>);const btn=screen.getByRole('button',{name:'판매 등록'});Object.defineProperty(btn,'clientWidth',{value:300});
 fireEvent.pointerDown(btn,{button:0,clientX:10});fireEvent.pointerMove(window,{clientX:110});fireEvent.pointerUp(window);fireEvent.click(btn);
 expect(done).not.toHaveBeenCalled();expect(btn.style.getPropertyValue('--slide-x')).toBe('0px');
 fireEvent.pointerDown(btn,{button:0,clientX:10});fireEvent.pointerMove(window,{clientX:400});fireEvent.pointerUp(window);fireEvent.click(btn);
 await waitFor(()=>expect(done).toHaveBeenCalledTimes(1));
 fireEvent.click(btn);expect(done).toHaveBeenCalledTimes(2);
});
