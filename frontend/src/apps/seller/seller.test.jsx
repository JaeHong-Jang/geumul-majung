import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import Screen07Register from './screens/Screen07Register';
import Screen08Confirm from './screens/Screen08Confirm';
import Screen05Home from './screens/Screen05Home';
import Screen09Bag from './screens/Screen09Bag';
import { NavContext } from './lib/nav';
import { setDraft, getDraft } from './lib/draft';
const go = vi.fn();
let handler;
let requests;
const bag = {id:30,waste_code:'51-03-01',target_material:'pp',total_kg:105};
const grade = {bag_id:30,grade:{grade:'A',purity:.98,hazard:false,reasons:[]},pass_id:'P30',qr:'QR30'};
const form = {mode:'now',weight:'100',price:'150',material:'pp',code:'51-03-01',extra:[],note:'',availableFrom:'2026-12-01',pickupNote:'정문'};
function view(Component,params={}) { return render(<NavContext.Provider value={{current:'register',params,go,back:vi.fn()}}><Component /></NavContext.Provider>); }
const enter = (label,value) => fireEvent.change(screen.getByLabelText(label),{target:{value}});
beforeEach(() => {setDraft(null);sessionStorage.clear();localStorage.clear();requests=[];go.mockReset();handler=()=>[];vi.stubGlobal('fetch',vi.fn(async (url,options={}) => {const p=url.replace('/v1','');const body=JSON.parse(options.body||'{}');requests.push({p,method:options.method,body});return {ok:true,status:200,json:async()=>handler(p,options.method,body)};}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('홈 판매 추천은 공장 발생 품목만 표시하고 정확한 코드와 재질로 판매 등록 이동',async()=>{
 handler=p=>p==='/seller/home'?{company:{name:'가상 공장',verified:true},prices:[{item:'관계없는 시세',price:999,change_pct:50}],byproduct_recommendations:[{code:'51-03-01',material:'PP',waste_name:'폐합성수지',market:{item:'PP 압축',price:300,unit:'원/kg',date:'2026-10',change_pct:5},reason:'등록한 발생 품목, 직전 공개 시세 대비 5% 상승해 판매 검토'},{code:'51-99-00',material:'공정 부산물',waste_name:'기타',market:null,reason:'공개 시세가 없어 매입 견적 확인 필요'}]}:[];
 view(Screen05Home);
 expect(await screen.findByRole('heading',{name:/AI 제안/})).toBeVisible();
 expect(screen.queryByRole('heading',{name:'우리 공장 판매 추천'})).toBeNull();
 fireEvent.click(screen.getByText('시세 기준과 추천 근거'));
 expect(screen.getByText('PP 압축, 2026-10 공개 시세')).toBeVisible();
 expect(screen.getAllByText('공개 시세 없음')[0]).toBeVisible();
 expect(screen.queryByRole('button',{name:'관계없는 시세 판매 등록'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'PP 판매 등록'}));
 expect(go).toHaveBeenCalledWith('register',{code:'51-03-01',material:'PP'});
 fireEvent.click(screen.getByRole('button',{name:'품목 수정'}));expect(go).toHaveBeenLastCalledWith('company');
});
it('비싼 품목은 판매 추천, 싸고 사려는 곳 없는 품목은 공동판매로 안내',async()=>{
 handler=p=>p==='/seller/home'?{company:{name:'가상 공장'},byproduct_recommendations:[
  {code:'51-29-01',material:'철',market:{item:'철스크랩',price:358.9,unit:'원/kg',date:'2026-09',change_pct:-4.7},wants:0,verdict:'sell',top:true,reason:'우리 공장 품목 중 kg당 가장 비싼 품목, 시세 기준 판매 추천'},
  {code:'51-03-01',material:'PP',market:{item:'PP 압축',price:377.6,unit:'원/kg',date:'2026-09',change_pct:1},wants:2,verdict:'sell',reason:'구매 희망 2곳, 판매 추천'},
  {code:'51-28-02',material:'골판지',market:{item:'폐골판지',price:92.9,unit:'원/kg',date:'2026-09',change_pct:1.9},wants:0,verdict:'bundle',reason:'kg당 단가가 낮아 단독 판매 어려움, 근처 공장과 공동판매로 모으기'}]}:[];
 view(Screen05Home);
 expect(await screen.findByText('우리 공장 품목 중 가장 비쌈')).toBeVisible();
 expect(screen.getAllByText('구매 희망 2곳, 판매 추천')[0]).toBeVisible();
 expect(screen.getByText('단가 낮음, 공동판매로 모으기')).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'골판지 공동판매 찾기'}));
 expect(go).toHaveBeenLastCalledWith('poolFind');
 fireEvent.click(screen.getByRole('button',{name:'철 판매 등록'}));
 expect(go).toHaveBeenLastCalledWith('register',{code:'51-29-01',material:'철'});
});
it('비철금속은 국제 가격 표시, 합금은 숫자 없이 기준 금속과 근거만',async()=>{
 handler=p=>p==='/seller/home'?{company:{name:'가상 공장'},byproduct_recommendations:[
  {code:'51-29-02',material:'구리',market:{item:'국제 구리 가격',price:19407,unit:'원/kg',date:'2026-10',change_pct:0.2,intl:true,basis:'국제 구리 가격 2026-10 월평균, 스크랩 매입가는 이보다 낮음'},wants:0,verdict:'sell',top:true,reason:'우리 공장 품목 중 kg당 가장 비싼 품목, 국제 금속 가격 기준 판매 추천'},
  {code:'51-29-02',material:'황동',market:null,reference:{metal:'구리',alloy:true,basis:'황동은 구리 약 60~70% 합금이라 매입가는 구리 가격보다 크게 낮음'},wants:0,verdict:'sell',reason:'구리 가격 연동 고가 품목, 매입 견적 비교 후 판매'}]}:[];
 view(Screen05Home);
 expect(await screen.findByText(/국제 19,407/)).toBeVisible();
 expect(screen.getByText('구리 가격 연동')).toBeVisible();
 expect(screen.getByText('고가 품목, 견적 비교 후 판매')).toBeVisible();
 fireEvent.click(screen.getByText('시세 기준과 추천 근거'));
 expect(screen.getByText(/스크랩 매입가는 이보다 낮음/)).toBeVisible();
 expect(screen.getByText(/구리 가격보다 크게 낮음/)).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'황동 판매 등록'}));
 expect(go).toHaveBeenLastCalledWith('register',{code:'51-29-02',material:'황동'});
});
it('판매 추천과 업무 제안을 한 목록으로 합쳐 기본 3개, 더보기와 닫기 지원',async()=>{
 handler=p=>p==='/seller/home'?{company:{name:'가상 공장'},orders:[{id:7,status:'dispatched'},{id:8,status:'arrived'}],byproduct_recommendations:[{code:'51-03-01',material:'PP',market:null},{code:'51-29-01',material:'철',market:null}],recommended_recyclers:[{id:9,name:'재활용 회사'}]}:[];
 const {container}=view(Screen05Home);
 await screen.findByRole('heading',{name:/AI 제안/});
 expect(container.querySelectorAll('.factory-recommendations')).toHaveLength(1);
 expect(container.querySelectorAll('.factory-recommendations li')).toHaveLength(3);
 expect(screen.getByRole('button',{name:'출고 처리'})).toBeVisible();
 expect(screen.getByRole('button',{name:'PP 판매 등록'})).toBeVisible();
 expect(screen.queryByRole('button',{name:'철 판매 등록'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'제안 2개 더 보기'}));
 expect(screen.getByRole('button',{name:'철 판매 등록'})).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'재활용 회사 보기'}));expect(go).toHaveBeenCalledWith('buyer',{id:9});
 fireEvent.click(screen.getAllByRole('button',{name:'제안 닫기'})[0]);
 expect(container.querySelectorAll('.factory-recommendations li')).toHaveLength(4);
 fireEvent.click(screen.getByRole('button',{name:'접기'}));
 expect(container.querySelectorAll('.factory-recommendations li')).toHaveLength(3);
});
it('발생 품목이 없는 기존 회원에게 품목 등록 경로 제공',async()=>{
 handler=p=>p==='/seller/home'?{company:{name:'가상 공장'},byproduct_recommendations:[]}:[];
 view(Screen05Home);fireEvent.click(await screen.findByRole('button',{name:'발생 품목 등록'}));
 expect(go).toHaveBeenCalledWith('company');
});
it('다른 품목의 작성 초안이 있어도 추천한 품목과 재질로 새 판매 등록 시작',async()=>{
 setDraft({bag,form,sig:'old-signature',grade});
 view(Screen07Register,{code:'51-29-01',material:'철'});
 expect(screen.getAllByRole('combobox')[0]).toHaveValue('51-29-01');
 expect(screen.getByLabelText('주 재질 *')).toHaveValue('철');
 expect(screen.getByLabelText('무게 (kg) *')).toHaveValue('');
});
it('품목과 주 재질을 골라 등록 요청, 바로 판매하기 한 번으로 확인 화면',async()=>{
 handler=p=>p==='/bags'?bag:p.endsWith('/grade')?grade:[];
 view(Screen07Register);
 enter('무게 (kg) *','100');fireEvent.change(screen.getAllByRole('combobox')[0],{target:{value:'51-03-01'}});enter('주 재질 *','PP');enter('kg당 판매 가격 *','150');expect(screen.queryByText('+ 다른 재질 추가')).toBeNull();
 enter('메모 (선택)','분리 보관');fireEvent.click(screen.getByText('바로 판매하기'));
 await waitFor(()=>expect(go).toHaveBeenCalledWith('confirm'));expect(getDraft().form.mode).toBe('now');
 expect(requests.find(r=>r.p==='/bags').body).toEqual({waste_code:'51-03-01',target_material:'PP',items:[{material:'PP',kg:100}],note:'분리 보관'});
 expect(requests.find(r=>r.p==='/bags/30/grade').body).toEqual({});expect(getDraft().bag.id).toBe(30);
});
it('보류 시 판매 차단, 위험 재질 확인 재요청 뒤 판매 확정 가능, 영수증에 QR 없음',async()=>{
 setDraft({bag,form,grade:{...grade,grade:{...grade.grade,grade:null,hazard:true,reasons:['메모 위험 재질 확인 필요']},pass_id:null,qr:null}});
 handler=()=>grade;view(Screen08Confirm);
 expect(screen.getByText('판매 전 확인 필요')).toBeVisible();expect(screen.getByText('바로 판매 확정')).toBeDisabled();
 fireEvent.click(screen.getByText('위험 재질 없음 확인하고 다시 확인'));
 await waitFor(()=>expect(screen.getByText('바로 판매 확정')).toBeEnabled());expect(requests.find(r=>r.p==='/bags/30/grade').body).toEqual({confirm_no_hazard:true});expect(getDraft().grade.pass_id).toBe('P30');
 expect(screen.getByText('No. R-000030')).toBeVisible();expect(document.body.textContent).not.toMatch(/마대|A등급|통과증/);
});
it('확정된 등록 물품만 매물 요청, 출고 조건과 AI 조언 보존',async()=>{
 setDraft({bag,form,grade});handler=p=>p==='/listings'?{id:55,advice:{summary:'공동판매 검토',public_claims:[{text:'동일 등급',level:'info'}]}}:[];
 const rendered=view(Screen08Confirm);fireEvent.click(screen.getByText('바로 판매 확정'));
 await waitFor(()=>expect(go).toHaveBeenCalledWith('bag',{listing:55}));
 expect(requests.find(r=>r.p==='/listings').body).toEqual({bag_ids:[30],mode:'now',price_krw_per_kg:150,available_from:'2026-12-01',pickup_note:'정문',transport:'own',unload_forklift:false,unload_crane:false});
 expect(JSON.parse(sessionStorage.getItem('advice_55')).summary).toBe('공동판매 검토');
 rendered.unmount();handler=p=>p==='/me/listings'?[{id:55,bag_ids:[30],total_kg:105,price_krw_per_kg:150,status:'posted'}]:p==='/me/bags'?[{...bag,grade:'A',pass_id:'P30',qr:'QR30'}]:[];
 view(Screen09Bag,{listing:55});expect(await screen.findByText('공동판매 검토')).toBeVisible();
});
it('판매자 홈 인계서 수는 목록 handover로 계산, 개별 주문 재조회 없음',async()=>{
 handler=p=>p==='/seller/home'?{company:{name:'가상 공장',verified:true},prices:[],listings:[],orders:[{id:100,status:'picked_up',handover:{emitter:false,carrier:false,processor:false,allbaro_no:null}}]}:[];
 view(Screen05Home);expect(await screen.findByText('1건')).toBeVisible();expect(requests.some(r=>/\/orders\/\d/.test(r.p))).toBe(false);
});
it('확인 화면에서 돌아와도 같은 등록 물품을 재사용하며 재시도도 중복 생성하지 않음',async()=>{
 let fail=true;
 handler=p=>{if(p==='/bags')return bag;if(p.endsWith('/grade')){if(fail)throw new Error('등급 처리 실패');return grade;}return [];};
 setDraft({form});let v=view(Screen07Register);fireEvent.click(screen.getByText('바로 판매하기'));await screen.findByRole('alert');expect(getDraft().bag.id).toBe(30);v.unmount();
 fail=false;v=view(Screen07Register);fireEvent.click(screen.getByText('바로 판매하기'));await waitFor(()=>expect(go).toHaveBeenCalledWith('confirm'));v.unmount();
 go.mockReset();view(Screen07Register);enter('kg당 판매 가격 *','200');fireEvent.click(screen.getByText('바로 판매하기'));await waitFor(()=>expect(go).toHaveBeenCalledWith('confirm'));expect(requests.filter(r=>r.p==='/bags')).toHaveLength(1);expect(getDraft().bag.id).toBe(30);
});
