import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Notifications } from './screens/Notifications';
import { Assistant } from './ui/shell/ai';
import { OrderChecklist } from './screens/OrderChecklist';
import { groupNotifications, notificationGroup, notificationIcon, notificationTime } from './screens/notification-format';
const now = new Date('2026-11-05T15:00:00Z'); // 서울 11월 6일 자정
const response = value => ({ ok: true, status: 200, json: async () => value });
beforeEach(() => { sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it.each([
 ['2026-11-05T14:59:59Z', '방금'],
 ['2026-11-05T14:59:00Z', '1분 전'],
 ['2026-11-05T14:01:00Z', '59분 전'],
 ['2026-11-05T14:00:00Z', '어제'],
 ['2026-11-05T00:00:00Z', '어제'],
 ['2026-11-04T14:59:59Z', '수'],
 ['2026-10-29T15:00:01Z', '금'],
 ['2026-10-29T15:00:00Z', '10.30'],
 ['2025-12-31T15:00:00Z', '01.01'],
 ['invalid', '날짜 미등록'],
])('시간 %s → %s', (date, expected) => expect(notificationTime(date, now)).toBe(expected));
it('오늘 시간과 미래 시각은 음수 없이 표시', () => {
 expect(notificationTime('2026-11-06T00:00:00Z', new Date('2026-11-06T04:00:00Z'))).toBe('4시간 전');
 expect(notificationTime('2026-11-06T16:00:00Z', now)).toBe('방금');
});
it('서울 자정·연도 경계와 최근 7일을 기준으로 묶고 최신순으로 정렬', () => {
 const dates = ['2026-10-29T15:00:00Z', '2026-11-04T14:59:59Z', '2026-11-05T14:59:59Z', '2026-11-05T15:00:00Z', '2026-11-05T15:00:01Z'];
 const items = dates.map((created_at, id) => ({ id, created_at }));
 expect(groupNotifications(items, now).map(g => [g.label, g.items.map(i => i.id)])).toEqual([['오늘',[4,3]],['어제',[2]],['이번 주',[1]],['이전',[0]]]);
 expect(items.map(i => i.id)).toEqual([0,1,2,3,4]);
 expect(notificationGroup('2025-12-31T14:59:59Z', new Date('2025-12-31T15:00:00Z'))).toBe('어제');
 expect(groupNotifications([], now)).toEqual([]);
});
it.each(Object.entries({
 '새 주문':'tab_cart_on','출고 완료':'tab_truck_on','입고지 도착':'tab_truck_on','검사 불일치':'shield','반송 처리':'shield','주문 취소':'shield','정산 완료':'tab_won_on','후기 완료':'star_small_on','새 메시지':'menu_help','새 문의 메시지':'menu_help','다른 제목':'menu_bell',
}))('제목 %s의 기존 아이콘 %s', (title, icon) => expect(notificationIcon(title)).toBe(icon));
it('중복 제목도 표시하고 읽지 않음 구분, 읽음 요청 성공 후 주문 이동', async () => {
 let finish;
 const item = {id:1,title:'새 주문',body:'새 주문 접수 완료',created_at:now.toISOString(),read:false,order_id:8};
 vi.stubGlobal('fetch',vi.fn(url => url.endsWith('/1/read') ? new Promise(resolve => {finish=resolve;}) : Promise.resolve(response({unread:1,items:[item,{...item,id:2,read:true}]}))));
 const go=vi.fn();const {container}=render(<Notifications appRole="buyer" go={go} back={()=>{}}/>);
 expect(await screen.findAllByText('새 주문')).toHaveLength(2);
 const cards=container.querySelectorAll('.notification-card');
 expect(cards[0]).toHaveClass('is-unread');expect(cards[1]).not.toHaveClass('is-unread');
 expect(screen.getByText('읽지 않은 알림 1개')).toBeVisible();
 expect(screen.queryByText('새 알림')).toBeNull();expect(screen.queryByText('›')).toBeNull();
 fireEvent.click(cards[0]);expect(go).not.toHaveBeenCalled();
 await waitFor(()=>expect(finish).toBeTypeOf('function'));
 finish(response({}));await waitFor(()=>expect(go).toHaveBeenCalledWith({name:'order',id:8}));
 expect(fetch).toHaveBeenCalledWith('/v1/notifications/1/read',expect.objectContaining({method:'POST'}));
});
it('읽음 실패 시 오류 표시하고 이동하지 않음',async()=>{
 vi.stubGlobal('fetch',vi.fn(async url=>url.endsWith('/read')?{ok:false,status:500,json:async()=>({detail:'읽음 처리 실패'})}:response({unread:1,items:[{id:1,title:'도착',body:'도착 완료',created_at:now.toISOString(),read:false,order_id:8}]})));
 const go=vi.fn();render(<Notifications appRole="buyer" go={go} back={()=>{}}/>);
 fireEvent.click(await screen.findByRole('button',{name:/도착 완료/}));
 expect(await screen.findByText('읽음 처리 실패')).toBeVisible();expect(go).not.toHaveBeenCalled();
});
it('법 headline과 일반 근거 혼합, 조문 기본 접힘, HTML은 텍스트',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>response({source:'template',answer:'데이터에서 확인한 내용입니다.',facts:[
 {headline:'<b>허가 확인</b>',text:'쉬운 설명',detail:'<script>법 제1조 원문</script>',level:'info',evidence:[{kind:'law',ref:'1',label:'법 제1조'}]},
 {text:'일반 근거',level:'info',evidence:[{kind:'data',ref:'2',label:'시세표'}]},
 ],legal_note:'최종 확인 안내'})));
 const {container}=render(<Assistant appRole="seller" go={()=>{}} back={()=>{}}/>);
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'법 질문'}});fireEvent.click(screen.getByRole('button',{name:'보내기'}));
 expect(await screen.findByText('법 쉬운 설명')).toBeVisible();expect(screen.queryByText('데이터에서 확인')).toBeNull();
 expect(screen.getByText('<b>허가 확인</b>').tagName).toBe('B');expect(screen.getByText('쉬운 설명')).toBeVisible();
 expect(screen.getByText('출처: 시세표')).toBeVisible();expect(screen.queryByText('출처: 법 제1조')).toBeNull();
 const detail=screen.getByText('<script>법 제1조 원문</script>');expect(detail).not.toBeVisible();expect(detail.closest('details')).not.toHaveAttribute('open');
 fireEvent.click(screen.getByText('조문 보기'));expect(detail).toBeVisible();expect(container.querySelector('script')).toBeNull();
 expect(container.querySelector('.shell-assistant-bubble.ai').lastElementChild).toHaveTextContent('최종 확인 안내');
});
it('체크리스트 조문과 근거는 기본 접힘, 선택 detail 없는 항목도 지원',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>response({items:[{item:'recycler_permit',ok:true,text:'구매 허가 확인',detail:'<b>원문</b>',laws:[{ref:'1',label:'법 제1조'}]},{item:'handover_entry',ok:null,text:'인계 확인',laws:[]}],legal_note:'안내'})));
 render(<OrderChecklist appRole="buyer" id={8}/>);
 fireEvent.click(await screen.findByText('AI 규제 점검'));
 expect(await screen.findByText('구매 허가 확인')).toBeVisible();expect(screen.getByText('인계 확인')).toBeVisible();
 expect(screen.getByText('<b>원문</b>')).not.toBeVisible();expect(screen.getByText('법 제1조')).not.toBeVisible();
 fireEvent.click(screen.getByText('조문 보기'));expect(screen.getByText('<b>원문</b>')).toBeVisible();expect(screen.getByText('법 제1조')).toBeVisible();
});
it('주문 없는 알림은 읽음만 처리하고 모두 읽음 이후 빈 안내 유지',async()=>{
 const item={id:3,title:'안내',body:'서비스 안내',created_at:now.toISOString(),read:false,order_id:null};
 let items=[item];
 vi.stubGlobal('fetch',vi.fn(async url=>{
  if(url.endsWith('/read-all')) {items=[];return response({});}
  return response({unread:items.length,items});
 }));
 const go=vi.fn();render(<Notifications appRole="seller" go={go} back={()=>{}}/>);
 fireEvent.click(await screen.findByRole('button',{name:/서비스 안내/}));
 await waitFor(()=>expect(fetch).toHaveBeenCalledWith('/v1/notifications/3/read',expect.objectContaining({method:'POST'})));
 await waitFor(()=>expect(screen.getByRole('button',{name:'모두 읽음'})).toBeEnabled());
 expect(go).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'모두 읽음'}));
 expect(await screen.findByText('도착한 알림 없음')).toBeVisible();
 expect(fetch).toHaveBeenCalledWith('/v1/notifications/read-all',expect.objectContaining({method:'POST'}));
});
