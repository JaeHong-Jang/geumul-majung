import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Login } from './screens/Login';
import { Signup } from './screens/Signup';
import { Messages } from './screens/Messages';
import { AddressInput } from './screens/AddressInput';
import { Explore } from '../apps/buyer/explore';
import { api } from './api/client';
import { takeAuthFragment } from './api/auth';
import { dateText } from './format';
import { settlementCsv } from './api/settlements';
import { roleName, serverRole, type Role } from '../types';
const go=vi.fn();
let requests: {path:string;method:string;body:Record<string,unknown>}[];
let handle:(path:string,method:string,body:Record<string,unknown>)=>unknown;
beforeEach(()=>{requests=[];go.mockReset();sessionStorage.clear();localStorage.clear();history.replaceState({},'','/');handle=p=>p==='/auth/providers'?[]:p==='/waste-codes'?[{code:'51-03-01',name:'폐합성수지'}]:[];vi.stubGlobal('fetch',vi.fn(async(url:string,options:RequestInit={})=>{const path=url.replace('/v1','');const method=options.method||'GET';const body=JSON.parse(String(options.body||'{}'));requests.push({path,method,body});return {ok:true,status:200,json:async()=>handle(path,method,body)};}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
const enter=(label:string,value:string)=>fireEvent.change(screen.getByLabelText(label),{target:{value}});
const click=(name:string)=>fireEvent.click(screen.getByRole('button',{name}));
describe('공통 로그인',()=>{
 for(const role of ['seller','buyer'] as Role[]) it(`${role} 첫 화면 역할 카드 2개와 초기 선택, 선택만으로 이동하지 않음`,async()=>{
  render(<Login appRole={role} onLogin={go} />);
  expect(screen.getAllByRole('radio')).toHaveLength(2);expect(screen.queryByRole('radio',{name:/운송기사/})).toBeNull();expect(screen.getByRole('radio',{name:new RegExp(roleName[role])})).toHaveAttribute('aria-checked','true');
  fireEvent.click(screen.getByRole('radio',{name:/판매자/}));expect(screen.getByRole('button',{name:'판매자로 로그인'})).toBeVisible();expect(go).not.toHaveBeenCalled();expect(requests.some(r=>r.path==='/auth/login')).toBe(false);
  await waitFor(()=>expect(requests.some(r=>r.path==='/auth/providers')).toBe(true));
 });
 for (const role of ['seller', 'buyer'] as Role[]) {
  it(`${role} 로그인 순서와 브랜드·역할 아이콘 표시`, async () => {
   const { container } = render(<Login appRole={role} onLogin={go} />);
   expect(screen.queryByText('이용 유형 선택')).not.toBeInTheDocument();
   const ordered = [screen.getByLabelText('사업자 계정'), screen.getByLabelText('비밀번호'),
    ...['판매자', '구매자'].map(name => screen.getByRole('radio', { name: new RegExp(name) })),
    screen.getByRole('button', { name: `${roleName[role]}로 로그인` }),
    screen.getByRole('button', { name: `${roleName[role]} 회원가입` }), screen.getByRole('button', { name: '아이디, 비밀번호 찾기' })];
   ordered.slice(1).forEach((element, index) => expect(ordered[index]!.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy());
   expect(Array.from(container.querySelectorAll('img')).map(img => img.getAttribute('src'))).toEqual(['/icons/logo_mark.svg', '/icons/role_seller.svg', '/icons/role_buyer.svg']);
   expect(container.querySelector('.login-group')).toContainElement(ordered[0]!);
   expect(container.querySelector('.login-group')).toContainElement(ordered[4]!);
   expect(container.querySelector('.login-group')).toContainElement(ordered[5]!);
   expect(container.querySelector('.login-footer')).toBeNull();
   await waitFor(() => expect(requests).toHaveLength(1));
  });
  it(`${role} 기본 가입 제목과 공통 배경, 역할 변경 후 가입 제목 일치`, async () => {
   const { container } = render(<Login appRole={role} onLogin={go} />);
   expect(container.querySelector('.auth-backdrop')).toBeInTheDocument();
   click(`${roleName[role]} 회원가입`);
   expect(screen.getByRole('heading', { name: `${roleName[role]} 회원가입` })).toBeVisible();
   expect(container.querySelector('.auth-backdrop')).toBeInTheDocument();
   fireEvent.click(screen.getByRole('button', { name: '뒤로' }));
   for (const selected of ['seller', 'buyer'] as Role[]) {
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(roleName[selected]) }));
    click(`${roleName[selected]} 회원가입`);
    expect(screen.getByRole('heading', { name: `${roleName[selected]} 회원가입` })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '뒤로' }));
   }
   click('아이디, 비밀번호 찾기');
   expect(container.querySelector('.auth-backdrop')).toBeInTheDocument();
   expect(screen.getByLabelText('이메일')).toBeVisible();
   await waitFor(() => expect(requests.length).toBeGreaterThan(0));
  });
 }
 it('키보드로 가시 영역이 줄면 폼 높이 제한과 입력 스크롤, 종료 시 구독 해제', async () => {
  const viewport = new EventTarget() as EventTarget & { height: number };
  viewport.height = 852;
  vi.stubGlobal('visualViewport', viewport);
  const remove = vi.spyOn(viewport, 'removeEventListener');
  const { container, unmount } = render(<Login appRole="buyer" onLogin={go} />);
  const page = container.querySelector('form')!;
  expect(page.style.maxHeight).toBe('852px');
  const input = screen.getByLabelText('비밀번호');
  const scroll = vi.fn();
  input.scrollIntoView = scroll;
  input.focus();
  act(() => { viewport.height = 360; viewport.dispatchEvent(new Event('resize')); });
  expect(page.style.maxHeight).toBe('360px');
  expect(scroll).toHaveBeenCalledWith({ block: 'nearest' });
  await waitFor(() => expect(requests).toHaveLength(1));
  unmount();
  expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
 });
 it('공급자 설정이 없으면 소셜 버튼 숨김',async()=>{render(<Login appRole="buyer" onLogin={go} />);await waitFor(()=>expect(requests).toHaveLength(1));expect(screen.queryByText('카카오 로그인')).not.toBeInTheDocument();expect(screen.queryByText('구글 로그인')).not.toBeInTheDocument();});
 it('설정된 소셜 공급자만 표시',async()=>{handle=()=>['kakao','google'];render(<Login appRole="seller" onLogin={go} />);expect(await screen.findByText('카카오 로그인')).toBeVisible();expect(screen.getByText('구글 로그인')).toBeVisible();});
 it('비밀번호 찾기 이메일 요청과 계정 비노출 안내',async()=>{render(<Login appRole="buyer" onLogin={go} />);click('아이디, 비밀번호 찾기');enter('이메일','member@example.com');click('재설정 메일 요청');await screen.findByText('비밀번호 재설정 안내 요청 완료, 이메일 확인 필요');expect(requests.find(r=>r.path==='/auth/password-reset')?.body).toEqual({email:'member@example.com'});});
 it('재설정 토큰 즉시 제거 후 새 비밀번호 제출',async()=>{history.replaceState({},'','/buyer/#/reset?token=one-time');render(<Login appRole="buyer" onLogin={go} />);expect(location.hash).toBe('');enter('새 비밀번호','new-password');click('비밀번호 변경');await screen.findByText('비밀번호 변경 완료, 새 비밀번호로 로그인 필요');expect(requests.find(r=>r.path.endsWith('/confirm'))?.body).toEqual({token:'one-time',new_password:'new-password'});});
 it('OAuth 토큰 제거와 로그인 세션 생성',async()=>{history.replaceState({},'','/buyer/#token=oauth-token');handle=p=>p==='/me/profile'?{id:1,name:'업체',role:'recycler',verified:true,permit_codes:[]}:[];render(<Login appRole="buyer" onLogin={go} />);expect(location.hash).toBe('');await waitFor(()=>expect(go).toHaveBeenCalledOnce());expect(JSON.parse(sessionStorage.getItem('janjaemi:buyer')!).access_token).toBe('oauth-token');});
 it('신규 소셜 가입 토큰은 주소에서 지우고 가입 화면 표시',()=>{history.replaceState({},'','/seller/#signup_token=signup-once');render(<Login appRole="seller" onLogin={go} />);expect(location.hash).toBe('');expect(screen.getByLabelText('아이디')).toBeVisible();expect(screen.queryByLabelText('비밀번호')).not.toBeInTheDocument();});
 it('일반 해시 경로는 보존',()=>{history.replaceState({},'','/seller/#/home');expect(takeAuthFragment()).toEqual({reset:null,token:null,signup:null});expect(location.hash).toBe('#/home');});
});
for(const role of ['seller','buyer'] as Role[]) it(`${role} 가입 역할별 본문과 승인 대기`,async()=>{
 handle=p=>p==='/regions'?[{name:'구미시',lat:36,lon:128}]:p==='/waste-codes'?[{code:'51-03-01',name:'폐합성수지'}]:p==='/signup'?{id:3,status:'pending'}:[];
 render(<Signup appRole={role} back={go} />);enter(role==='seller'?'아이디':'이메일',role==='seller'?'member_one':'member@example.com');enter('비밀번호','password8');enter('비밀번호 확인','password8');
 if(role==='seller'){enter('사업자명','자원회사');enter('사업자등록번호','123-45-67890');}
 else {click('사업장 정보 입력');enter('회사명','자원회사');enter('사업자등록번호','123-45-67890');}
 if(role==='seller'){enter('주소','경북 구미시 공장로 1');expect(screen.queryByLabelText('시, 군 선택')).toBeNull();expect(screen.queryByRole('button',{name:'주소 좌표 확인'})).toBeNull();}
 else {enter('도로명주소','구미 공장로 1');await screen.findByRole('option',{name:'구미시'});enter('시, 군 선택','구미시');}
 if(role!=='seller'){enter('전화','01012345678');enter('업종','재활용');enter('허가번호','permit-1');fireEvent.click(await screen.findByRole('checkbox',{name:/51-03-01/}));}
 else {expect(screen.queryByLabelText('전화')).toBeNull();expect(screen.queryByLabelText('업종')).toBeNull();click('폐합성수지');click('PP');click('고철');click('철');}
 // 운송기사 가입이 없어져 차량 칸도 없다
 expect(screen.queryByLabelText('차량 번호')).toBeNull();expect(screen.queryByLabelText('적재 용량 (t)')).toBeNull();
 await waitFor(()=>expect(screen.getByRole('button',{name:'가입 신청 제출'})).toBeEnabled());click('가입 신청 제출');await screen.findByText('승인 대기');const body=requests.find(r=>r.path==='/signup')!.body;
 expect(body).toEqual({password:'password8',name:'자원회사',biz_no:'123-45-67890',role:serverRole[role],...(role!=='seller'?{email:'member@example.com',address:'구미 공장로 1',region:'구미시',lat:36,lon:128,phone:'01012345678',industry:'재활용',permit_no:'permit-1',permit_codes:['51-03-01']}:{login_id:'member_one',address:'경북 구미시 공장로 1',byproducts:[{code:'51-03-01',material:'PP'},{code:'51-29-01',material:'철'}]})});expect(body).not.toHaveProperty('confirm');
});
it('구매자 탐색은 등급을 쿼리에 보내지 않고 필터에도 등급이 없음',async()=>{render(<Explore go={go} />);await waitFor(()=>expect(requests.some(r=>r.path.startsWith('/listings?'))).toBe(true));expect(new URL(requests.find(r=>r.path.startsWith('/listings?'))!.path,'http://local').searchParams.has('grade')).toBe(false);fireEvent.click(screen.getByRole('button',{name:/최신 순/}));expect(screen.queryByRole('button',{name:'A등급'})).toBeNull();expect(requests.some(r=>r.path.includes('grade='))).toBe(false);});
it('검증 detail 목록은 한국어 안내로 변환',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,status:400,json:async()=>({detail:['query.grade: invalid']})})));await expect(api('buyer','/listings')).rejects.toThrow('입력값 확인 필요');});
it('날짜 표시',()=>{expect(dateText('2026-11-04T05:00:00Z')).toBe('11.04 (수)');});
it('매물 문의 시작, 연락처 가림 안내와 신고',async()=>{handle=p=>p==='/listings/10/inquiries'?{id:7}:p.endsWith('/messages')?[{id:1,sender_name:'판매자',body:'***',masked:true}]:{};render(<Messages appRole="buyer" listingId={10} back={go} go={go} />);enter('메시지','재고 문의');click('메시지 전송');expect(await screen.findByText('연락처는 가려 표시')).toBeVisible();expect(requests.find(r=>r.path==='/listings/10/inquiries')?.body).toEqual({body:'재고 문의'});click('신고');enter('신고 사유','부적절한 거래 요청');click('신고 제출');await screen.findByText('신고 접수 완료');expect(requests.find(r=>r.path==='/inquiries/7/report')?.body).toEqual({reason:'부적절한 거래 요청'});expect(requests.some(r=>r.path==='/inquiries/7/read')).toBe(true);});
it('주문 대화에 매물 문의 출처 표시',async()=>{handle=()=>[{id:1,sender_name:'구매자',body:'기존 문의',from_inquiry:true}];render(<Messages appRole="buyer" id={1} back={go} go={go} />);expect(await screen.findByText('매물 문의에서 이어진 메시지')).toBeVisible();});
it('주소 좌표가 없으면 서버 지역 선택 제공',async()=>{handle=p=>p==='/geocode'?{lat:null,lon:null,region:null}:[{name:'구미시',lat:36,lon:128}];render(<AddressInput appRole="buyer" value={{address:'구미 공장로 1',region:''}} onChange={go} />);click('주소 좌표 확인');expect(await screen.findByRole('option',{name:'구미시'})).toBeVisible();await waitFor(()=>expect(screen.getByLabelText('시, 군 선택')).toBeEnabled());fireEvent.change(screen.getByLabelText('시, 군 선택'),{target:{value:'구미시'}});expect(go).toHaveBeenLastCalledWith({address:'구미 공장로 1',region:'구미시',lat:36,lon:128});});
it('실제 정산 CSV 금액과 날짜',()=>{const csv=settlementCsv([{id:1,status:'settled',listing_id:1,goods_krw:100,held_krw:120,freight_cap_krw:20,total_kg:10,updated_at:'2026-11-04',settlement:{factory_krw:100,platform_krw:0,refund_krw:5}}]);expect(csv).toContain('"2026-11-04"');expect(csv).toContain('"100","5"');expect(csv.split('\r\n')[0]).toBe('\uFEFF"주문","정산일","판매자","품목","중량(kg)","원료비(원)","환불(원)"');expect(csv).not.toContain('운임');expect(csv).not.toContain('carbon');});
it('앱 화면 소스에 구어체·감탄·대괄호 자리표시자 없음',()=>{
 const sources=import.meta.glob('../**/*.{tsx,jsx}',{query:'?raw',import:'default',eager:true}) as Record<string,string>;
 for(const [path,raw] of Object.entries(sources)){if(path.includes('.test.') || path.includes('/apps/seller/'))continue;// 팀원 원본의 미사용 기본 문구는 보존한다. 실제 props 문구는 Loading.test.jsx에서 검증한다.
 const copy=path.endsWith('/TruckLoading.jsx') ? raw.replace("subtitle = '잠시만 기다려 주세요'", "subtitle = ''") : raw;const source=copy.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');expect(source,path).not.toMatch(/어요|아요|네요|까요|할게요|주세요|에요|봐요|줘요|나요|[가-힣]!|\[(회사명|가격|무게|금액|거리|기사명)\]/);}
});
it('소셜 가입 본문에는 일회용 토큰과 역할을 포함하고 비밀번호는 제외',async()=>{
 handle=p=>p==='/regions'?[{name:'구미시',lat:36,lon:128}]:p==='/signup/social'?{id:7,status:'approved'}:[];
 render(<Signup appRole="seller" signupToken="one-use" back={go} />);
 enter('아이디','social_member');enter('사업자명','소셜 공장');enter('사업자등록번호','123-45-67890');enter('주소','경북 구미시 구미로 1');click('가입 신청 제출');
 expect(await screen.findByText('승인 완료')).toBeVisible();expect(screen.getByText('가입 완료, 로그인 가능')).toBeVisible();
 const body=requests.find(r=>r.path==='/signup/social')!.body;expect(body).toMatchObject({signup_token:'one-use',role:'factory',login_id:'social_member'});expect(body).not.toHaveProperty('password');expect(body).not.toHaveProperty('email');
});
it('만료된 재설정 토큰은 성공 안내 없이 오류 표시',async()=>{
 history.replaceState({},'','/buyer/#/reset?token=expired');
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>({ok:url.endsWith('/providers'),status:url.endsWith('/providers')?200:400,json:async()=>url.endsWith('/providers')?[]:{detail:'재설정 토큰이 만료되었습니다.'}})));
 render(<Login appRole="buyer" onLogin={go} />);expect(location.hash).toBe('');enter('새 비밀번호','new-password');click('비밀번호 변경');expect(await screen.findByRole('alert')).toHaveTextContent('재설정 토큰이 만료되었습니다.');expect(screen.queryByText('비밀번호 변경 완료, 새 비밀번호로 로그인 필요')).not.toBeInTheDocument();
});
it('서버 OAuth 경로의 access_token도 즉시 제거',()=>{history.replaceState({},'','/buyer/#/oauth?access_token=server-token');expect(takeAuthFragment()).toEqual({reset:null,token:'server-token',signup:null});expect(location.hash).toBe('');});
it('로그인 세션이 있어도 재설정 링크를 우선 처리',async()=>{
 const {default:App}=await import('../App');
 sessionStorage.setItem('janjaemi:buyer',JSON.stringify({access_token:'old-token',company:{id:1,role:'recycler'}}));history.replaceState({},'','/buyer/#/reset?token=reset-now');
 vi.stubGlobal('ResizeObserver',class {observe(){} disconnect(){}});
 render(<App appRole="buyer" />);expect(location.hash).toBe('');expect(await screen.findByLabelText('새 비밀번호',{}, {timeout:5000})).toBeVisible();
});
it('체험 계정 버튼은 서버가 demo를 줄 때만 보이고 한 번 누르면 바로 로그인',async()=>{
 render(<Login appRole="buyer" onLogin={go} />);await waitFor(()=>expect(requests).toHaveLength(1));expect(screen.queryByLabelText('체험용 계정')).toBeNull();cleanup();
 const company={id:4,name:'가상리사이클',role:'recycler'};const alert=vi.spyOn(window,'alert').mockImplementation(()=>{});
 handle=p=>p==='/auth/providers'?['demo']:p==='/auth/demo/buyer'?{access_token:'demo',company}:[];
 render(<Login appRole="buyer" onLogin={go} />);expect(await screen.findByRole('button',{name:'판매자 체험하기'})).toBeVisible();expect(screen.queryByRole('button',{name:'운송기사 체험하기'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'구매자 체험하기'}));
 await waitFor(()=>expect(go).toHaveBeenCalled());expect(requests.find(r=>r.path==='/auth/demo/buyer')?.method).toBe('POST');expect(JSON.parse(sessionStorage.getItem('janjaemi:buyer')!).access_token).toBe('demo');expect(alert).not.toHaveBeenCalled();
});
