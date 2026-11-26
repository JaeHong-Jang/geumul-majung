import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { useState } from 'react';
import { Purchase, RequestDone } from '../apps/buyer/purchase';
import { ListingDetail, ListingRow } from '../apps/buyer/listing';
import { BuyerHome } from '../apps/buyer/home';
import { Explore } from '../apps/buyer/explore';
import { BundleDetail } from '../apps/buyer/bundle';
import { OrderDetail } from './screens/OrderDetail';
import { Orders } from './screens/OrderList';
import { HandoverScreen } from './screens/Handover';
import { Review } from './screens/Review';
import { Support } from './screens/Support';
import { AddressInput } from './screens/AddressInput';
import { Login } from './screens/Login';
import { Signup } from './screens/Signup';
import { ImpactExport } from './screens/ImpactExport';
import { MarketScreen, PriceChart } from './screens/market';
import { BottomTabs } from './ui';
import { validateAttachments } from './supportFiles';
import { validateForm } from './formValidation';
import { tileUrl } from './ui/mapTiles';
import { dateTimeText, money, weightText } from './format';
import { settlementCsv } from './api/settlements';
import { api } from './api/client';
vi.mock('leaflet',()=>({default:{map:()=>({attributionControl:{setPrefix:vi.fn()},setView(){return this;},remove:vi.fn()}),tileLayer:()=>({addTo:vi.fn()}),marker:()=>({addTo(){return this;},on:vi.fn(),setLatLng:vi.fn()}),divIcon:vi.fn()}}));
const go=vi.fn();
const listing={id:1,status:'posted',waste_name:'폐철',waste_code:'51',grade:'A',total_kg:1950,price_krw_per_kg:100,bag_count:1,factory_name:'판매 공장',bags:[{id:1,total_kg:1950,pass_issued:true}]};
const order={id:6,status:'dispatched',waste_name:'폐철',total_kg:100,goods_krw:10000,held_krw:30500,freight_cap_krw:20000,transport:'seller',bags:[{id:1,total_kg:100,qr:'bag-one'}]};
let handle, requests;
beforeEach(()=>{go.mockReset();requests=[];sessionStorage.clear();localStorage.clear();handle=p=>p==='/auth/providers'?[]:p==='/regions'?[{name:'구미시',lat:36,lon:128}]:p==='/me/addresses'?[{address:'구미',is_default:true}]:p==='/listings'?[listing]:p.startsWith('/listings/')?listing:p.startsWith('/orders/')?order:[];
 vi.stubGlobal('fetch',vi.fn(async(url,options={})=>{const path=url.replace('/v1',''),method=options.method||'GET',body=JSON.parse(options.body||'{}');requests.push({path,method,body});const data=handle(path,method,body);return {ok:true,status:200,json:async()=>data,blob:async()=>new Blob(['proof'])};}));vi.spyOn(window,'confirm').mockReturnValue(true);
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
const click=name=>fireEvent.click(screen.getByRole('button',{name}));
const enter=(label,value)=>fireEvent.change(screen.getByLabelText(label),{target:{value}});
it('QA 1 운송 방식 선택 없이 판매자 운송으로 preview와 구매, 운임 상한 표시 없음',async()=>{
 // 판매자 운송이면 서버가 운임을 보류액에 넣지 않는다
 handle=(p,m,b)=>p==='/orders/preview'?{goods_krw:10000,held_krw:10500+(b.transport==='seller'?0:80000),fee_krw:0,items:[{freight_cap_krw:80000,freight_payer:'seller'}]}:p==='/me/addresses'?[{address:'구미',is_default:true}]:p==='/listings'?[listing]:order;
 render(<Purchase id={1} go={go} back={go} />);expect(screen.queryByRole('radio',{name:'직접 수거'})).toBeNull();await screen.findByText('10,500원');expect(screen.queryByText(/운임 상한/)).toBeNull();expect(screen.getByText('판매자 부담')).toBeVisible();fireEvent.click(screen.getByRole('checkbox',{name:'세금계산서 발행 요청'}));fireEvent.click(screen.getByRole('checkbox',{name:'검수 결과에 따른 정산 금액 조정 동의'}));click('구매 요청 보내기');await waitFor(()=>expect(requests.find(r=>r.path==='/orders')?.body.transport).toBe('seller'));expect(requests.find(r=>r.path==='/orders').body).not.toHaveProperty('freight_payer');const previewBody=requests.filter(r=>r.path==='/orders/preview').at(-1).body;expect(previewBody.transport).toBe('seller');expect(previewBody).not.toHaveProperty('freight_payer');
});
it('QA 2 구매자 매물 상세에 통과증 발급 정보를 보이지 않음',async()=>{render(<ListingDetail id={1} go={go} back={go} />);expect(await screen.findByText(/^전체 [0-9.,]+(kg|t), /)).toBeVisible();expect(screen.queryByText(/발급|통과증|마대/)).toBeNull();});
it('QA 3 추천 매물 구역과 상세 이동, 빈 추천 숨김',async()=>{handle=p=>p==='/me/orders'?[]:({company:{name:'구매'},recommended:[listing],listings:[]});const view=render(<BuyerHome go={go} />);fireEvent.click((await screen.findAllByText('폐철'))[0].closest('button'));expect(go).toHaveBeenCalledWith({name:'listing',id:1});expect(screen.getByText('추천 매물')).toBeVisible();view.unmount();handle=p=>p==='/me/orders'?[]:({company:{name:'구매'},recommended:[]});render(<BuyerHome go={go} />);await screen.findByText('구매');expect(screen.queryByText('추천 매물')).toBeNull();});
it('QA 4 찜 뒤로와 판매 종료 매물 담기 방지',async()=>{handle=()=>[{...listing,status:'sold'}];render(<Explore favorites go={go} />);expect(await screen.findByText('판매 종료')).toBeVisible();click('뒤로');expect(go).toHaveBeenCalledWith({name:'my'});});
it('QA 5 첨부 등록 업로드 목록과 인증 내려받기',async()=>{
 let attached=false;handle=(p,m)=>p==='/support/faq'?[]:p==='/support/tickets'&&m==='POST'?{id:2}:p==='/support/tickets'?[{id:2,subject:'기존 문의',body:'내용',status:'open',attachments:attached?[{id:4,content_type:'application/pdf'}]:[]}]:p.endsWith('/attachments')?(attached=true,{id:4}):{};
 vi.stubGlobal('URL',class extends URL { static createObjectURL(){return 'blob:proof';} static revokeObjectURL(){} });vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
 render(<Support appRole="buyer" back={go} />);enter('문의 제목','배송');enter('문의 내용','증빙');fireEvent.change(screen.getByLabelText('문의 첨부'),{target:{files:[new File(['%PDF-test'],'test.pdf',{type:'application/pdf'})]}});click('문의 보내기');await screen.findByText('첨부 4 내려받기');expect(requests.find(r=>r.path.endsWith('/attachments')).body).toMatchObject({content_type:'application/pdf',data_base64:expect.any(String)});click('첨부 4 내려받기');await waitFor(()=>expect(requests.some(r=>r.path.endsWith('/attachments/4'))).toBe(true));
 expect(()=>validateAttachments(Array(6).fill(new File(['x'],'x.pdf',{type:'application/pdf'})))).toThrow('5개');expect(()=>validateAttachments([new File(['x'],'x.txt',{type:'text/plain'})])).toThrow('PDF');expect(()=>validateAttachments([new File([new Uint8Array(2*1024*1024+1)],'x.pdf',{type:'application/pdf'})])).toThrow('2MB');expect(()=>validateAttachments(Array(4).fill(new File([new Uint8Array(2*1024*1024)],'x.pdf',{type:'application/pdf'})))).toThrow('6MB');
});
it('QA 6 주문 취소도 확인 후 실행',async()=>{handle=()=>({...order,status:'payment_held'});render(<OrderDetail appRole="buyer" id={6} go={go} back={go} />);await screen.findByText('주문 취소');window.confirm.mockReturnValueOnce(false);click('주문 취소');expect(requests.some(r=>r.path.endsWith('/cancel'))).toBe(false);click('주문 취소');await waitFor(()=>expect(requests.some(r=>r.path.endsWith('/cancel'))).toBe(true));});
it('QA 9 좌표 성공 후에도 지역 목록과 자동 선택, 좌표 결과 글자',async()=>{handle=p=>p==='/regions'?[{name:'구미시',lat:36,lon:128}]:{lat:36.1,lon:128.1,region:'구미시'};function Host(){const [value,setValue]=useState({address:'경북 구미시 공단로',region:''});return <AddressInput appRole="buyer" value={value} onChange={setValue}/>;}render(<Host />);click('주소 좌표 확인');await waitFor(()=>expect(screen.getByLabelText('시, 군 선택')).toHaveValue('구미시'));expect(await screen.findByText(/좌표 확인 완료/)).toBeVisible();expect(screen.getByRole('option',{name:'구미시'})).toBeInTheDocument();enter('도로명주소','');expect(screen.getByText('주소 좌표 확인')).toBeDisabled();});
it('QA 10 없는 금액에 원을 붙이지 않고 없는 정산 줄 생략',async()=>{expect(money(undefined)).toBe('확인 중');handle=()=>({...order,held_krw:undefined,settlement:{platform_krw:0}});render(<OrderDetail appRole="seller" id={6} go={go} back={go} />);await screen.findByText('플랫폼 수수료');expect(screen.queryByText('보류액')).toBeNull();expect(screen.queryByText('판매자 정산')).toBeNull();expect(screen.queryByText('환불')).toBeNull();expect(screen.queryByText('운송기사 정산')).toBeNull();expect(screen.queryByText('확인 중원')).toBeNull();});
it('QA 11 지난 거래 반송 취소 상태 한국어',async()=>{handle=()=>[{...order,status:'returned'},{...order,id:7,status:'cancelled'}];render(<Orders appRole="buyer" go={go} />);fireEvent.click(screen.getByRole('tab',{name:'완료'}));expect(await screen.findByText('반송')).toBeVisible();expect(screen.getByText('취소')).toBeVisible();expect(screen.queryByText('returned')).toBeNull();});
it('QA 12 판매자 운송 인계서 차량 번호 입력과 작성 후 시각 무게 읽기 표시',async()=>{
 // 판매자 운송 주문은 판매자가 운반자 칸을 쓰고, 예전 운송기사 프로필 차량은 쓰지 않는다(지난번 쓴 번호는 vehicle_hint로만)
 let saved=false;handle=(p,m)=>p==='/me/profile'?{vehicle_no:'00가0000'}:p.endsWith('/carrier')&&m==='POST'?(saved=true,{}):p.endsWith('/handover')?{carrier:saved?{vehicle_no:'89바1234',picked_up_at:'2026-11-04T18:09:00Z',total_kg:1950}:null}:({...order,status:'picked_up'});
 const view=render(<HandoverScreen appRole="seller" id={6} back={go} />);
 expect(await screen.findByLabelText('운송 차량 번호')).toHaveValue('');expect(screen.getByRole('button',{name:'운반자 인계서 작성'})).toBeDisabled();
 enter('운송 차량 번호','89바1234');click('운반자 인계서 작성');
 await waitFor(()=>expect(requests.find(r=>r.path==='/orders/6/handover/carrier')?.body).toEqual({vehicle_no:'89바1234'}));
 expect(await screen.findByText('11.05 (목) 03:09')).toBeVisible();expect(screen.getByText('1,950 kg')).toBeVisible();expect(screen.queryByLabelText('운송 차량 번호')).toBeNull();expect(dateTimeText('2026-11-04T18:09:00Z')).toBe('11.05 (목) 03:09');
 view.unmount();
 // 판매자 운송이면 구매자는 운반자 칸을 쓰지 않고, 직접 수거면 구매자가 쓴다
 saved=false;render(<HandoverScreen appRole="buyer" id={6} back={go} />);await screen.findByRole('heading',{name:/처리자/});expect(screen.queryByLabelText('운송 차량 번호')).toBeNull();cleanup();
 const base=handle;handle=(p,m)=>p.startsWith('/orders/')&&!p.includes('/handover')?{...order,status:'picked_up',transport:'self'}:base(p,m);
 render(<HandoverScreen appRole="buyer" id={6} back={go} />);expect(await screen.findByLabelText('운송 차량 번호')).toHaveValue('');
});
it('QA 13 판매자 후기 역할과 별점 필수 선택',async()=>{handle=()=>({...order,status:'settled',allbaro_no:'ABC'});render(<Review appRole="seller" id={6} go={go} back={go} />);await screen.findByText('구매자 평가');expect(screen.getByRole('heading',{name:'거래 후기'})).toBeVisible();expect(screen.queryByText('처리자 인계서')).toBeNull();expect(screen.queryByText('분류 상태 양호')).toBeNull();expect(screen.getByRole('button',{name:'후기 등록'})).toBeDisabled();click('구매자 3점');expect(screen.getByRole('button',{name:'후기 등록'})).toBeEnabled();expect(screen.queryByText('운송 평가')).toBeNull();expect(screen.queryByRole('button',{name:'운송 후기 등록'})).toBeNull();});
it('QA 14 서버 차액 5% 표시와 판매자 부담 운임',async()=>{handle=p=>p==='/orders/preview'?{goods_krw:10000,held_krw:90500,fee_krw:0,items:[{freight_cap_krw:80000}]}:p==='/me/addresses'?[{address:'구미'}]:p==='/listings'?[listing]:order;const view=render(<Purchase id={1} go={go} back={go} />);expect(await screen.findByText('무게 오차 대비 5%')).toBeVisible();expect(screen.getByText('500원')).toBeVisible();view.unmount();render(<OrderDetail appRole="buyer" id={6} go={go} back={go} />);const freight=(await screen.findByText('운임')).closest('.receipt-line');expect(freight).toHaveTextContent('판매자 부담');expect(screen.queryByText('운임 상한')).toBeNull();/* 판매자 부담 주문은 운임 대신 안내, 영수증 QR 없음 */expect(screen.queryByLabelText('주문 QR')).toBeNull();});
it('QA 15 담김과 탭 수량 배지, 찜 접근성 상태',async()=>{render(<><ListingRow l={listing} go={go} add/><BottomTabs appRole="buyer" active="home" go={go}/></>);expect(screen.queryByRole('button',{name:'폐철 담기'})).toBeNull();expect(screen.getByRole('button',{name:'폐철 찜하기'})).toBeVisible();cleanup();handle=(p,m)=>m==='PUT'?{}:{...listing,favorite:requests.some(r=>r.method==='PUT')};render(<ListingDetail id={1} go={go} back={go}/>);await screen.findByText(/^전체 [0-9.,]+(kg|t), /);click('찜하기');expect(await screen.findByRole('button',{name:'찜 해제'})).toHaveAttribute('aria-pressed','true');expect(screen.getByText('♥')).toBeVisible();});
it('QA 16 정산 내려받기 명칭과 ISO 날짜',()=>{render(<ImpactExport/>);expect(screen.getByRole('button',{name:/정산 거래 내려받기/})).toBeVisible();expect(settlementCsv([{...order,updated_at:'2026-11-05'}])).toContain('2026-11-05');});
it('QA 17 출처 이름과 월별 미니 그래프는 상승이면 빨강',async()=>{handle=p=>p.includes('/history')?[{date:'2024',price:90},{date:'2025',price:95},{date:'2026-10',price:100},{date:'2026-11',price:110}]:[{item:'폐철',price:110,date:'2026-11',source_id:'D2-PRICE'}];const view=render(<PriceChart appRole="buyer" item="폐철"/>);expect(await screen.findByRole('img',{name:'폐철 실제 시세 추이 2026-10 100, 2026-11 110'})).toHaveClass('spark','up');expect(screen.queryByText('연평균')).toBeNull();view.unmount();render(<MarketScreen appRole="buyer" back={go}/>);expect(await screen.findByText(/출처: 한국환경공단 재활용가능자원 가격조사/)).toBeVisible();expect(screen.queryByText(/D2-PRICE/)).toBeNull();});
it('QA 18 묶음 중량과 평균 거리 소수 한자리',()=>{render(<BundleDetail bundle={{total_kg:1950,avg_distance_km:4.94,seller_count:2,min_lot_kg:1000,reasons:["합계 1950kg, 최소 묶음 1000kg 충족"],listings:[],listing_ids:[1],avg_price:100}} go={go} back={go}/>);expect(screen.getAllByText(weightText(1950))).toHaveLength(2);expect(screen.getByText('4.9 km')).toBeVisible();expect(screen.getByText('합계 1,950 kg, 최소 묶음 1,000 kg 충족')).toBeVisible();});
it('QA 19 만료 안내와 조회 오류에 빈 목록 문구 없음',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,status:401,json:async()=>({detail:'인증 만료'})})));await expect(api('buyer','/me/profile')).rejects.toThrow();render(<Login appRole="buyer" onLogin={go}/>);expect(screen.getByText('로그인 만료')).toBeVisible();cleanup();render(<Explore go={go}/>);await screen.findByRole('alert');expect(screen.queryByText(/0개|조건에 맞는 매물 없음/)).toBeNull();});
it('QA 20 가입 찾기 재설정 한국어 검증과 초점, 음수 톤수 칸 이름',async()=>{const view=render(<Signup appRole="buyer" back={go}/>);click('사업장 정보 입력');expect(screen.getByLabelText('이메일')).toHaveFocus();expect(screen.getByText(/이메일.*입력값 확인 필요/)).toBeVisible();expect(screen.getByRole('button',{name:'사업장 정보 입력'}).closest('form')).toHaveAttribute('novalidate');view.unmount();render(<Login appRole="buyer" onLogin={go}/>);click('아이디, 비밀번호 찾기');click('재설정 메일 요청');expect(screen.getByLabelText('이메일')).toHaveFocus();cleanup();render(<Login appRole="buyer" onLogin={go} initialFragment={{reset:'token',signup:null,token:null}}/>);enter('새 비밀번호','short');click('비밀번호 변경');expect(screen.getByLabelText('새 비밀번호')).toHaveFocus();const form=document.createElement('form');form.innerHTML='<label>톤수<input type="number" value="-1"></label>';document.body.append(form);expect(validateForm(form)).toContain('톤수');form.remove();await act(async()=>{});});
it('QA 21 존재하는 평면 타일만 로컬 요청, 다른 좌표는 외부 타일',()=>{expect(tileUrl(10,873,396)).toBe('/map_tiles/10_873_396.png');expect(tileUrl(19,1,1)).toBe('https://tile.openstreetmap.org/19/1/1.png');});
it('QA 23 헤더 이름과 칩 줄바꿈 방지, 구어체 제거',()=>{const css=readFileSync('src/shared/ui/qa-layout.css','utf8');expect(css).toContain('.top-bar h1 { white-space:nowrap');expect(css).toContain('word-break:keep-all');expect(css).toContain('padding-block:4px');for(const file of ['src/apps/buyer/purchase.tsx','src/shared/screens/Review.tsx'])expect(readFileSync(file,'utf8')).not.toMatch(/가져가요|부탁드려요|빨라요/);});
it('QA 24 보조 인증 화면에서만 배경 원 제거',()=>{const css=readFileSync('src/shared/screens/auth.css','utf8');expect(css).toContain('.auth-secondary .auth-circle { display:none; }');expect(css).not.toMatch(/\.shared-login \.auth-circle\s*\{\s*display:none/);});
it('최종 QA 직접 수거 상세는 해제와 운행 버튼 없이 직접 수거로 표시하고 취소 정산 줄을 숨깁니다',async()=>{
 handle=()=>({...order,transport:'self'});const v=render(<OrderDetail appRole="buyer" id={6} go={go} back={go}/>);expect((await screen.findByText('운송 방식')).closest('.receipt-line')).toHaveTextContent('직접 수거');expect(screen.queryByText('배차 해제')).toBeNull();expect(screen.queryByText('운행 진행')).toBeNull();expect(screen.queryByText('운임')).toBeNull();v.unmount();
 handle=()=>({...order,status:'cancelled',transport:'self',settlement:{refund_krw:10000}});render(<OrderDetail appRole="buyer" id={6} go={go} back={go}/>);await screen.findByText('환불');expect(screen.queryByText('운임 상한')).toBeNull();expect(screen.queryByText('운송기사 정산')).toBeNull();
});
it('최종 QA 주문 문의 제목과 전송 후 파일명 초기화',async()=>{
 handle=(p,m)=>p==='/support/tickets'&&m==='POST'?{id:2}:[];
 render(<Support appRole="buyer" id={6} back={go}/>);expect(screen.getByLabelText('문의 제목')).toHaveValue('주문 #6 문의, 분쟁');enter('문의 내용','확인을 요청합니다.');fireEvent.change(screen.getByLabelText('문의 첨부'),{target:{files:[new File(['x'],'evidence.png',{type:'image/png'})]}});click('문의 보내기');await screen.findByText('문의 등록 완료');expect(screen.queryByText('evidence.png')).toBeNull();expect(screen.getByText('선택한 파일 없음')).toBeVisible();
});
it('최종 QA 검사 사진을 실제 검사 단계 API로 올립니다',async()=>{
 handle=()=>({...order,status:'arrived'});render(<Review appRole="buyer" id={6} go={go} back={go}/>);const input=await screen.findByLabelText('검사 사진 첨부');fireEvent.change(input,{target:{files:[new File(['photo'],'inspect.png',{type:'image/png'})]}});await screen.findByText('검사 사진 등록 완료');expect(requests.find(r=>r.path==='/orders/6/photos').body).toEqual({stage:'inspect',content_type:'image/png',data_base64:'cGhvdG8='});
});

it('최종 QA 직접 수거 완료 안내에 기사 배정을 표시하지 않습니다',()=>{
 render(<RequestDone orders={[{...order,transport:'self'}]} go={go}/>);expect(screen.getByText(/직접 수거 주문 접수 완료/)).toBeVisible();expect(screen.queryByText('운송기사 배정')).toBeNull();expect(screen.getByText('직접 수거 준비')).toBeVisible();
});
