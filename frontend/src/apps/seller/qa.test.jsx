import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { NavContext } from './lib/nav';
import { setDraft } from './lib/draft';
import PoolFind from './screens/Screen10PoolFind';
import PoolStatus from './screens/Screen12PoolStatus';
import PoolConfig from './screens/Screen11PoolConfig';
import Deadline from './screens/Screen13PoolDeadline';
import Bag from './screens/Screen09Bag';
import Resources from './screens/Screen06Resources';
import Buyers from './screens/Screen15Buyers';
import Buyer from './screens/Screen16Buyer';
import Company from './screens/Screen03Company';
import Approval from './screens/Screen04Approval';
import Orders from './screens/Screen17Orders';
import Chat from './screens/Screen24Chat';
import Settlement from './screens/Screen22Settlement';
import Pickup from './screens/Screen19Pickup';
import Home from './screens/Screen05Home';
import Register from './screens/Screen07Register';
import Confirm from './screens/Screen08Confirm';
import My from './screens/Screen27MyPage';
import BottomNav from './components/BottomNav';
import { screens } from './screens';
const go = vi.fn(), back = vi.fn();
let handler, requests;
const bag = {id:30,waste_code:'51-03-01',waste_name:'폐합성수지',target_material:'pp',total_kg:520,grade:'A',purity:.98,listing_id:55};
const listing = {id:55,waste_code:bag.waste_code,waste_name:bag.waste_name,grade:'A',bag_ids:[30],total_kg:520,status:'posted',mode:'now',price_krw_per_kg:380};
const pool = {id:10,title:'PP 공동판매',waste_code:bag.waste_code,waste_name:bag.waste_name,grade:'A',status:'open',target_kg:2000,current_kg:600,deadline:'2099-12-01',factory_count:1,is_owner:false,joined:false,mine:false,remaining_kg:1400,min_join_price_krw_per_kg:400,joinable_listings:[{id:55,total_kg:520,price_krw_per_kg:380}],applied_price_krw_per_kg:400};
function view(C,params={}) { return render(<NavContext.Provider value={{params,go,back}}><C /></NavContext.Provider>); }
function enter(label,value) { fireEvent.change(screen.getByLabelText(label),{target:{value}}); }
function defaults(p) { return p==='/me/bags'?[bag]:p==='/me/listings'?[listing]:p==='/listings/55'?{...listing,available_from:'2099-11-01',pickup_note:'정문'}:[]; }
beforeEach(() => {
  requests=[];handler=defaults;go.mockReset();back.mockReset();sessionStorage.clear();localStorage.clear();setDraft(null);
  sessionStorage.setItem('janjaemi:seller',JSON.stringify({access_token:'test',company:{id:1,role:'factory'}}));
  vi.stubGlobal('fetch',vi.fn(async (url,options={}) => {
    const p=url.replace('/v1','');const method=options.method||'GET';const body=JSON.parse(options.body||'{}');requests.push({p,method,body});
    const data=await handler(p,method,body);return {ok:!data?._status,status:data?._status||200,json:async()=>data,blob:async()=>new Blob(['proof'],{type:'application/pdf'})};
  }));
});
afterEach(() => {cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('1 찾기 → 공개 상세 → 판매 선택 → 참여, 서버 단가 하한 거부 표시 후 성공',async()=>{
  let rejected=true, joined=false;
  handler=(p,m)=>p==='/pools'?[pool]:p==='/pools/10'?pool:p==='/pools?mine=1'?(joined?[{...pool,members:[{mine:true,kg:520,price_krw_per_kg:380}]}]:[]):p==='/pools/10/join'&&m==='POST'?(rejected?{_status:400,detail:'참여 단가는 400원/kg 이상이어야 합니다.'}:(joined=true,{...pool,joined:true,mine:true,members:[{mine:true,kg:520,price_krw_per_kg:380}]})):defaults(p);
  const v=view(PoolFind);fireEvent.click(await screen.findByText(pool.title));expect(go).toHaveBeenCalledWith('poolStatus',{id:10});v.unmount();
  view(PoolStatus,{id:10});await screen.findByText('모집 현황');enter('참여할 판매','55');fireEvent.click(screen.getByRole('button',{name:'참여',exact:true}));
  expect(await screen.findByText('참여 단가는 400원/kg 이상이어야 합니다.')).toBeVisible();expect(requests.find(r=>r.p.endsWith('/join')).body).toEqual({listing_id:55});
  rejected=false;fireEvent.click(screen.getByRole('button',{name:'참여',exact:true}));expect(await screen.findByText('내 공장')).toBeVisible();expect(screen.queryByRole('button',{name:'참여',exact:true})).not.toBeInTheDocument();
});
it('1 내 공동판매 탭은 만든 것과 참여한 것을 모두 표시',async()=>{
  handler=p=>p==='/pools?mine=1'?[{...pool,is_owner:true},{...pool,id:11,title:'참여한 공동판매'}]:[];
  view(PoolStatus);expect(await screen.findByText(pool.title)).toBeVisible();expect(screen.getByText('참여한 공동판매')).toBeVisible();
});
it('2 판매 정보 기존값 로드 및 PATCH 저장',async()=>{
  handler=(p,m)=>m==='PATCH'?{id:55}:defaults(p);view(Bag,{listing:55});await screen.findByText('판매 내역');await waitFor(()=>expect(screen.getByText('판매 정보 수정')).toBeEnabled());fireEvent.click(screen.getByText('판매 정보 수정'));
  expect(screen.getByLabelText('현장 안내')).toHaveValue('정문');enter('kg당 판매 가격','420');enter('현장 안내','후문');fireEvent.click(screen.getByText('수정 저장'));
  await screen.findByText('판매 내역');expect(screen.queryByText('수정 저장')).not.toBeInTheDocument();expect(requests.find(r=>r.method==='PATCH')).toMatchObject({p:'/listings/55',body:{price_krw_per_kg:420,pickup_note:'후문',available_from:'2099-11-01'}});
});
it('3 내린 마대 재등록은 같은 마대로, 재질·등급 표시 및 중복 제거',async()=>{
  const withdrawn={...listing,status:'withdrawn',bag_ids:[],former_bags:[{id:30,target_material:'pp',weight_kg:520,grade:'A',available:true}]};
  handler=(p,m)=>p==='/me/bags'?[{...bag,listing_id:null}]:p==='/me/listings'?[withdrawn]:p==='/listings'&&m==='POST'?{id:56}:p==='/listings/55'?withdrawn:[];
  const v=view(Resources);expect(await screen.findByText(/폐합성수지, PP/)).toBeVisible();expect(screen.getByText(/판매 내림/)).toBeVisible();expect(screen.queryByText(/판매에 연결되지/)).not.toBeInTheDocument();v.unmount();
  view(Bag,{listing:55});fireEvent.click(await screen.findByText('다시 판매 등록'));fireEvent.click(screen.getByRole('button',{name:'판매 등록',exact:true}));await waitFor(()=>expect(go).toHaveBeenCalledWith('bag',{listing:56}));expect(requests.find(r=>r.p==='/listings'&&r.method==='POST').body.bag_ids).toEqual([30]);expect(requests.some(r=>r.p==='/bags'&&r.method==='POST')).toBe(false);
});
it('3 서버가 과거 연결을 잃은 마대도 새 마대를 만들지 않고 판매 가능',async()=>{
  handler=p=>p==='/me/bags'?[{...bag,listing_id:null}]:p==='/me/listings'?[]:[];view(Bag,{bag:30});expect(await screen.findByText('다시 판매 등록')).toBeEnabled();
});
it('4 주문 진행 중 판매는 실제 주문 상태 표시',async()=>{
  handler=p=>p==='/me/listings'?[{...listing,status:'sold',order_id:90}]:p==='/me/orders'?[{id:90,status:'dispatched'}]:defaults(p);
  view(Resources);expect(await screen.findByText(/출고 준비/)).toBeVisible();expect(screen.queryByText(/판매 완료/)).not.toBeInTheDocument();
});
it('5 공동판매 만들기는 명시적 판매 선택, 수정은 기존값으로 PATCH',async()=>{
  handler=(p,m)=>p==='/pools/10'?{...pool,is_owner:true,mine:true,joined:true}:m==='PATCH'?pool:defaults(p);
  const v=view(PoolConfig);await screen.findByRole('option',{name:/판매 55/});expect(screen.getByLabelText('공동판매할 판매')).toHaveValue('');v.unmount();
  view(PoolConfig,{id:10});await waitFor(()=>expect(screen.getByLabelText('목표 물량 *')).toHaveValue('2000'));expect(screen.getByLabelText('모집 기한 *')).toHaveValue('2099-12-01');enter('목표 물량 *','2500');fireEvent.click(screen.getByText('조건 저장, 판매 내용 확인'));await waitFor(()=>expect(go).toHaveBeenCalled());expect(requests.find(r=>r.method==='PATCH')).toEqual({p:'/pools/10',method:'PATCH',body:{target_kg:2500,deadline:'2099-12-01'}});
});
it('5 sold 조건 수정 제거 및 아직 기한이 남은 제목',async()=>{
  handler=p=>p==='/pools/10'?{...pool,is_owner:true,mine:true,joined:true,status:'sold'}:[];const v=view(PoolStatus,{id:10});await screen.findByText(pool.title);expect(screen.queryByText('공동판매 조건 수정')).not.toBeInTheDocument();v.unmount();handler=p=>p==='/pools/10'?{...pool,is_owner:true,mine:true,joined:true}:[];view(Deadline,{id:10});await screen.findByText('목표 물량보다 부족');expect(screen.queryByText('모집 기한 도착')).not.toBeInTheDocument();
});
it('6 타 공장 null 단가는 비공개',async()=>{
  handler=p=>p==='/pools/10'?{...pool,mine:true,joined:true,members:[{name:'참여 공장 1',kg:600,price_krw_per_kg:null}]}:[];view(PoolStatus,{id:10});expect(await screen.findByText(/600kg, 비공개/)).toBeVisible();expect(screen.queryByText(/, 0원\/kg/)).not.toBeInTheDocument();
});
it('7 저장한 관심 업체 API 목록',async()=>{
  handler=p=>p==='/me/favorite-recyclers'?[{id:7,name:'저장한 업체',materials:'PP'}]:[];view(Buyers);fireEvent.click(await screen.findByText('저장한 업체'));expect(go).toHaveBeenCalledWith('buyer',{id:7});
});
it('8 업체 ID가 확인되는 기존 문의로만 이동',async()=>{
  handler=p=>p==='/recyclers/7'?{id:7,name:'업체'}:p==='/inquiries'?[{id:20,listing_name:'PP'}]:p==='/inquiries/20/messages'?[{sender_id:7}]:[];
  view(Buyer,{id:7});fireEvent.click(await screen.findByText('채팅으로 문의, PP'));expect(go).toHaveBeenCalledWith('chat',{id:20,inquiry:'1'});expect(requests.some(r=>r.method==='POST')).toBe(false);
});
it('8 기존 문의가 없으면 API 전화만 표시, 없으면 연락 수단을 만들지 않음',async()=>{
  handler=p=>p==='/recyclers/7'?{id:7,name:'업체',phone:'054-123-4567'}:[];const v=view(Buyer,{id:7});expect(await screen.findByRole('link',{name:/업체 전화/})).toHaveAttribute('href','tel:054-123-4567');expect(screen.queryByText(/채팅으로 문의/)).not.toBeInTheDocument();v.unmount();handler=p=>p==='/recyclers/7'?{id:7,name:'업체'}:[];view(Buyer,{id:7});expect(await screen.findByText(/등록된 연락 수단 없음/)).toBeVisible();expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
it('9 회사 전화·배출자 신고 저장과 증빙 업로드·확인',async()=>{
  let docs=[];handler=(p,m,b)=>p==='/me/profile'?{id:1,name:'공장',phone:'010-1234-5678',emitter_report:'대상',region:'구미',address:'구미',biz_no:'123',...b}:p==='/regions'?[{name:'구미',lat:36,lon:128}]:p==='/me/documents'?(m==='PUT'?(docs=[{id:2,kind:b.kind}],docs[0]):docs):[];
  view(Company);await screen.findByLabelText('전화');enter('전화','010-9999-9999');enter('배출자 신고 대상 여부','비대상');fireEvent.click(screen.getByText('정보 저장'));await waitFor(()=>expect(requests.find(r=>r.method==='PATCH').body).toEqual({phone:'010-9999-9999',emitter_report:'비대상'}));
  fireEvent.change(screen.getByLabelText('증빙 파일'),{target:{files:[new File(['pdf'],'proof.pdf',{type:'application/pdf'})]}});fireEvent.click(screen.getByText('증빙 업로드'));expect(await screen.findByText('사업자등록증 확인')).toBeVisible();expect(requests.find(r=>r.method==='PUT').body).toEqual({kind:'business_license',content_type:'application/pdf',data_base64:'cGRm'});
});
it('10 승인 완료는 로그인 유도 없이 뒤로 가기',async()=>{
  handler=p=>p==='/me/approval'?{status:'approved'}:[];view(Approval);expect(await screen.findByText('승인 완료')).toBeVisible();expect(screen.queryByText('로그인')).not.toBeInTheDocument();fireEvent.click(screen.getByText('뒤로 가기'));expect(back).toHaveBeenCalled();
});
it('10 보완 요청·증빙 제출 뒤 승인 대기로 갱신',async()=>{
  let status='needs_fix';handler=(p,m)=>p==='/me/approval'?{status,note:'신고 증빙을 보완하십시오.',missing:['배출자 신고 증빙']}:p==='/me/approval/resubmit'&&m==='POST'?(status='pending',{status}):[];
  view(Approval);await screen.findByText('보완 요청');enter('보완 내용','증빙을 교체했습니다.');fireEvent.click(screen.getByText('보완 제출'));expect(await screen.findByText('승인 대기')).toBeVisible();expect(screen.queryByText('보완 제출')).not.toBeInTheDocument();expect(requests.find(r=>r.p.endsWith('/resubmit')).body).toEqual({note:'증빙을 교체했습니다.'});
});
it('11 필터 높이는 버튼 높이를 수용하고 잘라내지 않음',()=>{
  for(const file of ['Screen06Resources','Screen17Orders']) {const css=readFileSync(`src/apps/seller/screens/${file}.css`,'utf8');const filter=css.slice(css.indexOf(' {')+2,css.indexOf('}'));expect(filter).toContain('min-height:36px');expect(filter).toContain('overflow: visible');}
});
it('12 정산 계산에 단위와 천 단위 구분',async()=>{
  handler=p=>p==='/orders/90'?{listing_id:55,inspect_weights:[{kg:1350}],settlement:{factory_krw:486000},goods_krw:486000}:p==='/listings/55'?{price_krw_per_kg:360}:[];view(Settlement,{id:90});expect(await screen.findByText('판매 대금 1,350 kg × 360원 = 486,000원')).toBeVisible();
});
it('13 탭 아이콘 구분·마이 아이콘 중복 제거·쿠폰함 이름',async()=>{
  const v=view(BottomNav);const resources=screen.getByRole('button',{name:'내 판매'}), pools=screen.getByRole('button',{name:'공동판매'});expect(resources.querySelector('.tab-icon').style.maskImage).not.toBe(pools.querySelector('.tab-icon').style.maskImage);v.unmount();handler=p=>p==='/me/profile'?{name:'공장',verified:true}:null;view(My);expect(screen.getByText('쿠폰함')).toBeVisible();expect(screen.queryByText('내 쿠폰')).not.toBeInTheDocument();const buttons=['회사 정보, 증빙','가입 승인, 보완','쿠폰함','관심, 재활용업체','매물 문의','알림 설정','고객센터'].map(name=>screen.getByRole('button',{name}));expect(new Set(buttons.map(b=>b.querySelector('img').src)).size).toBe(7);
});
it('14 문의 탭에 실제 목록, 중복 버튼 제거, 발신자 구분 및 답변 전송',async()=>{
  handler=(p,m)=>p==='/inquiries'?[{id:20,listing_name:'PP 문의',other_name:'업체',last_message:'문의합니다',unread:1}]:p==='/inquiries/20/messages'&&m==='GET'?[{id:1,sender_id:1,body:'내 글'},{id:2,sender_id:7,sender_name:'업체',body:'상대 글'}]:[];
  const v=view(Orders);fireEvent.click(screen.getByRole('tab',{name:'문의'}));fireEvent.click(await screen.findByText('PP 문의, 업체'));expect(go).toHaveBeenCalledWith('chat',{id:20,inquiry:'1'});expect(screen.queryByRole('button',{name:'매물 문의'})).not.toBeInTheDocument();v.unmount();view(Chat,{id:20,inquiry:'1'});expect(await screen.findByText('내 글')).toBeVisible();expect(screen.getByText('내 글').closest('article')).toHaveClass('seller-message--mine');expect(screen.getByText('상대 글').closest('article')).toHaveClass('seller-message--other');expect(screen.getAllByText('매물 문의')).toHaveLength(1);enter('메시지','답변합니다.');fireEvent.click(screen.getByText('메시지 전송'));await waitFor(()=>expect(requests.some(r=>r.p==='/inquiries/20/messages'&&r.method==='POST'&&r.body.body==='답변합니다.')).toBe(true));
});
it('15 업체 뒤로 아이콘 통일 및 다음 출고는 해당 주문 상세',async()=>{
  handler=p=>p==='/recyclers/7'?{id:7,name:'업체'}:p==='/seller/home'?{company:{name:'공장'},orders:[{id:90,status:'dispatched'}]}:[];const v=view(Buyer,{id:7});await screen.findByText('업체');expect(screen.getByRole('button',{name:/뒤로/}).querySelector('img')).toHaveAttribute('src','/icons/back.svg');v.unmount();view(Home);fireEvent.click(await screen.findByText('다음 출고'));expect(go).toHaveBeenCalledWith('order',{id:90});
});
it('16 홈 검색은 공통 검색 문구 사용',()=>{
  handler=()=>({company:{name:'공장'}});view(Home);expect(screen.getByText('재활용업체 찾기')).toBeVisible();expect(screen.queryByText(/받아줄/)).not.toBeInTheDocument();
});
it('17 미사용 판매자 장바구니 화면 등록 제거',()=>{expect(screens.some(s=>s.id==='cart')).toBe(false);});
it('18 등록과 확인 모두 520kg 기준 197,600원',async()=>{
  const form={mode:'now',weight:'520',price:'380',material:'PP',code:bag.waste_code,extra:[]};setDraft({form});const v=view(Register);expect(screen.getByText(/520kg × 380원/)).toBeVisible();expect(screen.getByText('예상 판매금액 197,600원')).toBeVisible();v.unmount();setDraft({form,bag,grade:{grade:{grade:'A',purity:.98,reasons:[]},pass_id:'P30',qr:'QR30'}});view(Confirm);const amount=screen.getByText('예상 판매금액').closest('.sale-receipt__total');expect(within(amount).getByText('197,600원')).toBeVisible();
});
it('5 새 공동판매는 선택한 두 번째 판매로 POST',async()=>{
  handler=(p,m)=>p==='/me/listings'?[listing,{...listing,id:56,total_kg:700}]:p==='/pools'&&m==='POST'?{id:12}:[];
  view(PoolConfig);await screen.findByRole('option',{name:/판매 56/});enter('공동판매할 판매','56');enter('목표 물량 *','2000');enter('모집 기한 *','2099-12-01');fireEvent.click(screen.getByText('조건 저장, 판매 내용 확인'));await waitFor(()=>expect(go).toHaveBeenCalledWith('poolStatus',{id:12}));expect(requests.find(r=>r.method==='POST').body).toEqual({listing_id:56,target_kg:2000,deadline:'2099-12-01'});
});
it('9 증빙 확인은 인증된 파일 요청, 허용되지 않은 파일 업로드 차단',async()=>{
  handler=p=>p==='/me/approval'?{status:'needs_fix',missing:[]}:p==='/me/documents'?[{id:2,kind:'business_license'}]:[];
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  vi.stubGlobal('URL', class extends URL {static createObjectURL() {return 'blob:proof';} static revokeObjectURL() {}});
  view(Approval);fireEvent.click(await screen.findByText('사업자등록증 확인'));await waitFor(()=>expect(fetch).toHaveBeenCalledWith('/v1/documents/2',{headers:{Authorization:'Bearer test'}}));await waitFor(()=>expect(click).toHaveBeenCalled());expect(click.mock.instances[0].download).toBe('사업자등록증.pdf');
  fireEvent.change(screen.getByLabelText('증빙 파일'),{target:{files:[new File(['x'],'proof.txt',{type:'text/plain'})]}});fireEvent.click(screen.getByText('증빙 업로드'));expect(await screen.findByText('JPEG, PNG, WebP, PDF 형식의 2MB 이하 파일 선택 필요')).toBeVisible();expect(requests.some(r=>r.method==='PUT')).toBe(false);
});
it('2 공동판매 중 단가 유지 시 수거 안내만 수정 요청',async()=>{
  handler=(p,m)=>p==='/me/listings'?[{...listing,status:'bundle_wait'}]:m==='PATCH'?{id:55}:defaults(p);view(Bag,{listing:55});await waitFor(()=>expect(screen.getByText('판매 정보 수정')).toBeEnabled());fireEvent.click(screen.getByText('판매 정보 수정'));enter('현장 안내','후문');fireEvent.click(screen.getByText('수정 저장'));await screen.findByText('판매 내역');expect(requests.find(r=>r.method==='PATCH').body).not.toHaveProperty('price_krw_per_kg');
});
it('18 참여 상세는 서버 후보만 표시하고 단가 하한과 남은 물량 안내',async()=>{
  handler=p=>p==='/pools/10'?{...pool,joinable_listings:[{id:88,total_kg:300,price_krw_per_kg:450}]}:defaults(p);
  view(PoolStatus,{id:10});expect(await screen.findByRole('option',{name:/판매 88/})).toBeVisible();expect(screen.queryByRole('option',{name:/판매 55/})).not.toBeInTheDocument();
  expect(screen.getByText('참여 단가 하한').closest('.notice')).toHaveTextContent('400원/kg');expect(screen.getByText('남은 모집 물량').closest('.notice')).toHaveTextContent('1,400kg');
  expect(requests.some(r=>r.p==='/pools'||r.p==='/me/listings'||r.p==='/pools?mine=1')).toBe(false);
});
it('18 참여 후보가 없으면 이유 표시와 참여 차단',async()=>{
  handler=p=>p==='/pools/10'?{...pool,joinable_listings:[]}:defaults(p);view(PoolStatus,{id:10});
  expect(await screen.findByText('참여 가능한 판매 없음')).toBeVisible();expect(screen.getByText(/다른 공동판매에 참여하지 않은/)).toBeVisible();expect(screen.getByRole('button',{name:'참여',exact:true})).toBeDisabled();
});
it('18 members가 없어도 joined와 mine이면 재참여하지 않음',async()=>{
  handler=()=>({...pool,joined:true,mine:true,joinable_listings:undefined});view(PoolStatus,{id:10});await screen.findByText('모집 현황');
  expect(screen.queryByLabelText('참여할 판매')).not.toBeInTheDocument();expect(screen.getByText('공동판매 진행 방법 선택')).toBeVisible();
});
it('18 관심 업체 저장과 해제는 계약 PUT DELETE 경로 사용',async()=>{
  let saved=false;handler=(p,m)=>p==='/recyclers/7'?{id:7,name:'업체',favorite:saved}:p==='/me/favorite-recyclers/7'?(saved=m==='PUT',{}):[];
  view(Buyer,{id:7});await screen.findByText('업체');
  fireEvent.click(screen.getByRole('button',{name:/관심 업체 저장/}));await waitFor(()=>expect(requests.some(r=>r.p==='/me/favorite-recyclers/7'&&r.method==='PUT')).toBe(true));
  fireEvent.click(await screen.findByRole('button',{name:/관심 해제/}));await waitFor(()=>expect(requests.some(r=>r.p==='/me/favorite-recyclers/7'&&r.method==='DELETE')).toBe(true));
});
for(const embedded of [true,false]) it(`18 내린 판매 서버 마대 ${embedded?'있음':'없음'}과 기타 재질 표시`,async()=>{
  const withdrawn={...listing,status:'withdrawn',bag_ids:[],...(embedded?{former_bags:[{id:30,target_material:'기타',weight_kg:520,grade:'A',available:true}]}:{})};
  handler=p=>p==='/me/listings'?[withdrawn]:p==='/listings/55'?withdrawn:[];
  const v=view(Resources);expect(await screen.findByText(embedded?/폐합성수지, 기타/:/재질 정보 없음/)).toBeVisible();v.unmount();
  view(Bag,{listing:55});expect((await screen.findAllByText(embedded?'기타':'재질 정보 없음'))[0]).toBeVisible();expect(screen.queryByText(/undefined|NaN/)).not.toBeInTheDocument();
});
it('최종 QA 일부만 복구 가능한 서버 마대와 가격 초점',async()=>{
 const withdrawn={...listing,status:'withdrawn',bag_ids:[],former_bags:[{id:30,target_material:'pp',weight_kg:520,grade:'A',available:true},{id:31,target_material:'pe',weight_kg:100,grade:'B',available:false}]};
 handler=(p,m)=>p==='/me/listings'?[withdrawn]:p==='/listings/55'?withdrawn:p==='/listings'&&m==='POST'?{id:56}:[];
 view(Bag,{listing:55});await screen.findByText('다시 판매 등록');expect(screen.getByText('일부 물품만 다시 등록 가능')).toBeVisible();expect(screen.queryByRole('button',{name:'판매 내리기'})).toBeNull();expect(screen.queryByText(/마대 번호.*31/)).toBeNull();
 fireEvent.click(screen.getByText('다시 판매 등록'));enter('kg당 판매 가격','');fireEvent.click(screen.getByRole('button',{name:'판매 등록',exact:true}));expect(screen.getByLabelText('kg당 판매 가격')).toHaveFocus();expect(screen.getByRole('alert')).toHaveTextContent('판매 가격');
 enter('kg당 판매 가격','400');fireEvent.click(screen.getByRole('button',{name:'판매 등록',exact:true}));await waitFor(()=>expect(go).toHaveBeenCalledWith('bag',{listing:56}));expect(requests.find(r=>r.method==='POST').body.bag_ids).toEqual([30]);
});
it('최종 QA 분쟁 주문은 진행중이고 정산 사유와 후기 잠금을 표시합니다',async()=>{
 const o={id:90,status:'disputed',waste_name:'분쟁 자원',dispute_reason:'무게 차이',bags:[bag],goods_krw:100};
 handler=p=>p==='/me/orders'?[o]:p==='/orders/90'?o:[];
 const v=view(Orders);expect(await screen.findByText('분쟁')).toBeVisible();fireEvent.click(screen.getByRole('tab',{name:'문의'}));expect(screen.queryByText('분쟁 자원')).toBeNull();v.unmount();
 view(Settlement,{id:90});expect(await screen.findByText('분쟁 처리 중')).toBeVisible();expect(screen.getByText('무게 차이')).toBeVisible();expect(screen.getByRole('button',{name:'거래 별점 남기기'})).toBeDisabled();
});
it('최종 QA 판매 내리기는 확인 후에만 요청합니다',async()=>{
 vi.spyOn(window,'confirm').mockReturnValue(false);view(Bag,{listing:55});await screen.findByText('판매 내역');fireEvent.click(screen.getByText('판매 내리기'));expect(requests.some(r=>r.p.endsWith('/withdraw'))).toBe(false);
 window.confirm.mockReturnValue(true);fireEvent.click(screen.getByText('판매 내리기'));await waitFor(()=>expect(requests.some(r=>r.p.endsWith('/withdraw'))).toBe(true));
});
it('19 출고, 운송: 출고 무게로 출고 완료, 도착 버튼 없이 구매자 확인 대기',async()=>{
  // 운송은 판매자가 맡는다: 출고 준비면 물품별 출고 무게, 도착 확인과 입고 검사는 구매자가 한 번에
  let status='dispatched';
  const order={id:90,listing_id:55,factory_name:'공장',recycler_name:'업체',bags:[{id:30,total_kg:520},{id:31,total_kg:100}]};
  handler=(p,m)=>p==='/orders/90/pickup'&&m==='POST'?(status='picked_up',{status:'picked_up'}):p==='/orders/90/handover'?{vehicle_hint:'89바1234'}:p==='/orders/90'?{...order,status}:defaults(p);
  view(Pickup,{id:90});
  expect(await screen.findByLabelText(/물품 30/)).toHaveValue('520');expect(screen.getByLabelText(/물품 31/)).toHaveValue('100');
  expect(screen.getByText('출고, 운송')).toBeVisible();expect(screen.queryByRole('button',{name:'입고지 도착'})).toBeNull();
  // 판매자가 대개 자기 차로 운송: 지난번 차량 번호를 미리 채우고, 비우면 출고 못 함
  expect(await screen.findByDisplayValue('89바1234')).toBeVisible();
  enter('운송 차량 번호','');expect(screen.getByRole('button',{name:'출고 완료'})).toBeDisabled();enter('운송 차량 번호','12가 3456');
  enter(/물품 31/,'');expect(screen.getByRole('button',{name:'출고 완료'})).toBeDisabled();
  enter(/물품 31/,'98');fireEvent.click(screen.getByRole('button',{name:'출고 완료'}));
  await waitFor(()=>expect(requests.find(r=>r.p==='/orders/90/pickup'&&r.method==='POST')?.body).toEqual({bag_weights:[{bag_id:30,kg:520},{bag_id:31,kg:98}],vehicle_no:'12가 3456'}));
  expect(await screen.findByText('출고 완료, 인계서 배출자와 운반자 칸 자동 작성')).toBeVisible();
  expect(await screen.findByText('운송 중, 구매자가 물건을 받으면 도착 확인과 입고 검사')).toBeVisible();
  expect(screen.queryByRole('button',{name:'입고지 도착'})).toBeNull();expect(requests.some(r=>r.p==='/orders/90/arrive')).toBe(false);
  expect(requests.filter(r=>r.p==='/orders/90/pickup')).toHaveLength(1);
  fireEvent.click(await screen.findByRole('button',{name:'인계서 보기'}));expect(go).toHaveBeenCalledWith('handover',{id:90});
});
