import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Signup } from './screens/Signup';
import { AddressInput } from './screens/AddressInput';
const go = vi.fn();
let handler, requests;
beforeEach(() => {
  requests=[];go.mockReset();sessionStorage.clear();
  handler=p=>p==='/regions'?[{name:'구미시',lat:36,lon:128}]:{id:1,status:'pending'};
  vi.stubGlobal('fetch',vi.fn(async(url,options={})=>{
    const p=url.replace('/v1',''); const body=JSON.parse(options.body||'{}');requests.push({p,body});
    return {ok:true,status:200,json:async()=>handler(p,body)};
  }));
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
const enter=(name,value)=>fireEvent.change(screen.getByLabelText(name),{target:{value}});
const click=name=>fireEvent.click(screen.getByRole('button',{name,exact:true}));
function signup() {
  render(<Signup appRole="seller" back={go}/>);
  for(const [label,value] of [['아이디','factory_one'],['비밀번호','valid-password8'],['비밀번호 확인','valid-password8'],['사업자명','공장'],['사업자등록번호','123'],['주소','경북 구미시 공장로 1']]) enter(label,value);
}
it('판매자는 한 화면에서 아이디와 주소로 제출, 이메일 및 지역 좌표 입력 없음',async()=>{
  signup();
  expect(screen.queryByLabelText('이메일')).toBeNull();
  expect(screen.queryByLabelText('시, 군 선택')).toBeNull();
  expect(screen.queryByRole('button',{name:'주소 좌표 확인'})).toBeNull();
  expect(screen.queryByText(/1\/2|2\/2/)).toBeNull();
  click('폐합성수지');click('PP');
  click('고철');click('철');
  click('가입 신청 제출');await screen.findByText('승인 대기');
  expect(requests).toEqual([{p:'/signup',body:{login_id:'factory_one',password:'valid-password8',name:'공장',biz_no:'123',address:'경북 구미시 공장로 1',role:'factory',byproducts:[{code:'51-03-01',material:'PP'},{code:'51-29-01',material:'철'}]}}]);
});
it('비밀번호가 다르면 제출하지 않고 확인 칸으로 초점 이동',()=>{
  signup();enter('비밀번호 확인','different-pass8');click('가입 신청 제출');
  expect(screen.getByText('비밀번호 불일치')).toBeVisible();
  expect(screen.getByLabelText('비밀번호 확인')).toHaveFocus();
  expect(requests).toHaveLength(0);
});
function Address() {const [value,setValue]=useState({address:'첫 주소',region:''});return <AddressInput appRole="seller" value={value} onChange={setValue}/>;}
it('조회 도중 주소를 고치면 이전 응답이 새 주소와 지역을 덮어쓰지 않음',async()=>{
  let resolve;const pending=new Promise(r=>{resolve=r;});
  handler=p=>p==='/geocode'?pending:[{name:'구미시',lat:36,lon:128}];render(<Address/>);
  click('주소 좌표 확인');enter('도로명주소','새 주소');
  await act(async()=>resolve({region:'구미시',lat:36,lon:128}));
  expect(screen.getByLabelText('도로명주소')).toHaveValue('새 주소');expect(screen.getByLabelText('시, 군 선택')).toHaveValue('');expect(screen.queryByText(/좌표 확인 완료/)).not.toBeInTheDocument();
});
