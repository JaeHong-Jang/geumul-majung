import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BuyerHome } from '../apps/buyer/home';
import { Orders } from './screens/OrderList';
const go=vi.fn();
const orders=[{id:1,waste_name:'진행 품목',status:'dispatched',total_kg:60,goods_krw:12000},{id:2,waste_name:'완료 품목',status:'settled',total_kg:100,goods_krw:20000}];
function mockApi() {
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>({ok:true,status:200,json:async()=>url.endsWith('/me/orders')?orders:url.endsWith('/inquiries')?[{id:3,listing_name:'문의 품목',other_name:'판매 업체',last_message:'재고를 확인합니다.',unread:2}]:url.endsWith('/buyer/home')?{company:{name:'구매 업체'},unread:7,listings:[]}:url.endsWith('/me/profile')?{name:'구매 업체'}:[]})));
}
afterEach(()=>{cleanup();vi.unstubAllGlobals();localStorage.clear();go.mockReset();});
it('구매자 홈의 세 통계는 서버 주문(거래중), 장바구니, 구매 희망에서 계산하고 각각 이동합니다',async()=>{
 mockApi();const {container}=render(<BuyerHome go={go}/>);await screen.findByRole('heading',{name:'구매 업체'});
 const stats=container.querySelector('.shell-stats') as HTMLElement;
 await waitFor(()=>expect(within(stats).getByRole('button',{name:/거래중/})).toHaveTextContent('1건'));
 expect(within(stats).getByRole('button',{name:/장바구니/})).toHaveTextContent('없음');
 expect(within(stats).getByRole('button',{name:/구매 희망/})).toHaveTextContent('없음');
 expect(stats.previousElementSibling).toHaveClass('shell-header');expect(stats.previousElementSibling?.querySelector('.shell-search-form')).not.toBeNull();expect(stats.nextElementSibling).toHaveTextContent('오늘의 시세');expect(stats.nextElementSibling?.nextElementSibling).toHaveClass('buyer-hero-compact');
 expect(container.querySelector('.filter-chips')).toBeNull();
 for(const [label,name] of [['거래중','orders'],['장바구니','cart'],['구매 희망','wants']]){fireEvent.click(within(stats).getByRole('button',{name:new RegExp(label!)}));expect(go).toHaveBeenLastCalledWith({name});}
});
it('거래내역은 선택한 탭만 표시하고 문의 탭에서 대화로 이동합니다',async()=>{
 mockApi();render(<Orders appRole="buyer" go={go}/>);
 expect(await screen.findByText('진행 품목')).toBeVisible();expect(screen.queryByText('완료 품목')).toBeNull();expect(screen.queryByRole('button',{name:'매물 문의'})).toBeNull();
 fireEvent.click(screen.getByRole('tab',{name:'완료'}));expect(screen.getByText('완료 품목')).toBeVisible();expect(screen.queryByText('진행 품목')).toBeNull();
 fireEvent.click(screen.getByRole('tab',{name:'문의'}));fireEvent.click(await screen.findByText('문의 품목, 판매 업체'));expect(go).toHaveBeenCalledWith({name:'inquiry',id:3});expect(screen.queryByText('완료 품목')).toBeNull();
});
