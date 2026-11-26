import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Assistant } from './ui/shell/ai';
import { OrderChecklist } from './screens/OrderChecklist';
import { OrderDetail } from './screens/OrderDetail';
import { RequestDone } from '../apps/buyer/purchase';
import SellerOrder from '../apps/seller/screens/Screen18Order';
import SellerHome from '../apps/seller/screens/Screen05Home';
import { NavContext } from '../apps/seller/lib/nav';
const go=vi.fn();
const checklist={items:[
 {item:'recycler_permit',ok:true,text:'구매 허가 확인',laws:[{ref:'law1',label:'법 제1조'}]},
 {item:'seller_transport',ok:false,text:'판매자 운송 확인',laws:[]},
 {item:'handover_entry',ok:null,text:'인계 정보 확인',laws:[]},
],legal_note:'사람이 최종 확인합니다.'};
const order={id:8,status:'payment_held',waste_name:'폐철',total_kg:100,legal_note:checklist.legal_note};
const response=value=>({ok:true,status:200,json:async()=>value});
const seller=child=><NavContext.Provider value={{go,back:go,params:{id:8}}}>{child}</NavContext.Provider>;
beforeEach(()=>{go.mockReset();sessionStorage.clear();vi.stubGlobal('fetch',vi.fn(async url=>response(url.endsWith('/checklist')?checklist:order)));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('업체 앞 2곳은 AI 제안에 포함되고 공장 품목과 무관한 시세 추천은 제외',async()=>{
 const home={prices:[1,2,3].map(n=>({item:`품목${n}`,price:100,change_pct:1})),volumes:[1,2].map(n=>({waste_code:`${n}`,waste_name:`폐기물${n}`,seller_count:2})),orders:[{id:8,status:'arrived'},{id:9,status:'arrived'}],recommended_recyclers:[{id:1,name:'업체 하나',region:'구미',distance_km:0},{id:2,name:'업체 둘'},{id:3,name:'업체 셋'}]};
 fetch.mockImplementation(async url=>response(url.endsWith('/seller/home')?home:[]));
 render(seller(<SellerHome/>));
 const suggestions=await screen.findByRole('region',{name:'AI 제안'});
 expect(within(suggestions).getAllByRole('listitem')).toHaveLength(3);
 fireEvent.click(within(suggestions).getByRole('button',{name:'제안 1개 더 보기'}));
 expect(within(suggestions).getAllByRole('listitem')).toHaveLength(4);
 expect(within(suggestions).queryByText('품목1')).toBeNull();
 expect(within(suggestions).getByText('업체 하나')).toBeVisible();expect(within(suggestions).getByText('업체 둘')).toBeVisible();
 expect(screen.queryByText('업체 셋')).toBeNull();expect(screen.queryByText('추천 재활용업체')).toBeNull();
 expect(within(suggestions).getByText('근처 재활용업체, 0 km')).toBeVisible();
 expect(screen.getByText('사진, 무게만 올리면 시세 추천가 확인')).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'업체 하나 보기'}));expect(go).toHaveBeenCalledWith('buyer',{id:1});
});
it('체크리스트 세 상태와 법 근거·주의 문구 표시',async()=>{
 render(<OrderChecklist appRole="buyer" id={8}/>);
 // 처음에는 접혀 있고 요약에 확인할 항목 수를 보인다
 expect(await screen.findByText('확인 필요 2건')).toBeVisible();
 expect(screen.getByText('맞음')).not.toBeVisible();
 fireEvent.click(screen.getByText('AI 규제 점검'));
 expect(screen.getByText('법 제1조')).not.toBeVisible();
 fireEvent.click(screen.getByText('조문 보기'));
 expect(screen.getByText('법 제1조')).toBeVisible();
 for(const text of ['맞음','확인 필요','사람 확인 필요',checklist.legal_note]) expect(await screen.findByText(text)).toBeVisible();
});
it('실패하면 체크리스트를 조용히 숨긴다',async()=>{
 fetch.mockRejectedValue(new Error('offline'));
 const {container}=render(<OrderChecklist appRole="seller" id={8}/>);
 await act(async()=>{});expect(fetch).toHaveBeenCalledOnce();expect(container).toBeEmptyDOMElement();
});
it('구매 완료의 각 주문에 요청하고 같은 legal_note는 한 번만 표시',async()=>{
 render(<RequestDone orders={[order,{...order,id:9,legal_note:'다른 주문 안내'}]} go={go}/>);
 await waitFor(()=>expect(screen.getAllByText('AI 규제 점검')).toHaveLength(2));
 const firstCard=screen.getAllByRole('button',{name:'주문 상세 보기'})[0].closest('.app-card');
 expect(within(firstCard).getAllByText(checklist.legal_note)).toHaveLength(1);
 expect(fetch.mock.calls.map(c=>c[0])).toEqual(expect.arrayContaining(['/v1/orders/8/checklist','/v1/orders/9/checklist']));
});
for(const role of ['buyer','seller']) it(`${role} 공유 상세의 체크리스트 표시`,async()=>{
 render(<OrderDetail appRole={role} id={8} go={go} back={go}/>);
 await screen.findByText('폐철');
 expect(await screen.findByText('AI 규제 점검')).toBeVisible();
});
it('판매자 전용 주문 상세에도 체크리스트 표시',async()=>{
 render(seller(<SellerOrder/>));expect(await screen.findByText('AI 규제 점검')).toBeVisible();
});
for(const source of ['llm','template','none']) it(`대화 전송과 ${source} 표시·근거 및 안내 카드 전환`,async()=>{
 let resolve;fetch.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 render(<Assistant appRole="seller" go={go} back={go}/>);
 const input=screen.getByRole('textbox');expect(input).toHaveAttribute('maxlength','300');
 expect(screen.getByText('사진, 품목, 무게로 시세 기준 추천가 확인')).toBeVisible();
 fireEvent.change(input,{target:{value:'  등급 질문  '}});fireEvent.submit(input.closest('form'));
 expect(input).toHaveValue('');expect(screen.getByRole('button',{name:'보내기'})).toBeDisabled();expect(screen.getByText('확인 중…')).toBeVisible();
 expect(screen.queryByText('자주 찾는 메뉴')).toBeNull();
 expect(fetch).toHaveBeenCalledWith('/v1/assistant/chat',expect.objectContaining({method:'POST',body:JSON.stringify({message:'등급 질문'})}));
 resolve(response({answer:'<b>답변</b>',source,facts:[{text:'데이터 근거',level:'info',evidence:[{kind:'law',ref:'1',label:'법 근거'}]}]}));
 expect(await screen.findByText(source==='template'?'데이터 근거':'<b>답변</b>')).toBeVisible();
 if(source==='none') {expect(screen.queryByText('AI 설명')).toBeNull();expect(screen.queryByText('데이터에서 확인')).toBeNull();expect(screen.queryByText('데이터 근거')).toBeNull();}
 else if(source==='llm') {expect(screen.getByText('AI 설명')).toBeVisible();expect(screen.getByText('<b>답변</b>')).toBeVisible();expect(screen.getByText('근거 1개 보기')).toBeVisible();expect(screen.getByText('데이터 근거')).not.toBeVisible();fireEvent.click(screen.getByText('근거 1개 보기'));expect(screen.getByText('데이터 근거')).toBeVisible();expect(screen.getByText('출처: 법 근거')).toBeVisible();}
 else {expect(screen.getByText('데이터에서 확인')).toBeVisible();expect(screen.queryByText('<b>답변</b>')).toBeNull();expect(screen.getByText('데이터 근거')).toBeVisible();expect(screen.getByText('출처: 법 근거')).toBeVisible();}
});
it('공백은 보내지 않고 오류 후 다시 질문할 수 있다',async()=>{
 fetch.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(response({answer:'다시 답변',source:'none',facts:[]}));
 render(<Assistant appRole="buyer" go={go} back={go}/>);const input=screen.getByRole('textbox');
 fireEvent.change(input,{target:{value:'   '}});fireEvent.submit(input.closest('form'));expect(fetch).not.toHaveBeenCalled();
 fireEvent.change(input,{target:{value:'첫 질문'}});fireEvent.submit(input.closest('form'));
 expect(await screen.findByText('답변 불러오기 실패, 잠시 후 다시 질문 필요')).toBeVisible();
 fireEvent.change(input,{target:{value:'두 번째 질문'}});fireEvent.click(screen.getByRole('button',{name:'보내기'}));
 expect(await screen.findByText('다시 답변')).toBeVisible();expect(screen.getByText('첫 질문')).toBeVisible();
});

it('대화가 추가될 때 목록 하단으로 스크롤하고 긴 답변도 텍스트로 유지',async()=>{
 const answer='긴답변'.repeat(300);
 fetch.mockResolvedValue(response({answer,source:'none',facts:[]}));
 const {container}=render(<Assistant appRole="buyer" go={go} back={go}/>);
 const body=container.querySelector('.shell-assistant-body');Object.defineProperty(body,'scrollHeight',{value:2000});
 const input=screen.getByRole('textbox');fireEvent.change(input,{target:{value:'질문'}});fireEvent.submit(input.closest('form'));
 expect(await screen.findByText(answer)).toBeVisible();expect(body.scrollTop).toBe(2000);
});
it('체크리스트 실패해도 구매 완료의 기존 안내와 상세 버튼 유지',async()=>{
 fetch.mockResolvedValue({ok:false,status:500,json:async()=>({})});
 render(<RequestDone orders={[order]} go={go}/>);await act(async()=>{});
 expect(screen.queryByText('AI 규제 점검')).toBeNull();expect(screen.getByText(checklist.legal_note)).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'주문 상세 보기'}));expect(go).not.toHaveBeenCalled();
 // 화면을 옮기지 않고 아래로 영수증을 펼친다
 await waitFor(()=>expect(fetch.mock.calls.some(c=>c[0]==='/v1/orders/8')).toBe(true));
 expect(screen.getByRole('button',{name:'주문 상세 접기'})).toHaveAttribute('aria-expanded','true');
});
