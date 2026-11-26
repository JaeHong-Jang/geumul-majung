import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AddressInput, type LocationValue } from './AddressInput';
import type { PostcodeData } from './geocode';
afterEach(() => { cleanup(); delete window.daum; vi.unstubAllGlobals(); });
it('우편번호 선택과 좌표 재확인에 코드를 보내고 직접 수정하면 이전 코드를 제거한다', async () => {
  const bodies: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/geocode')) bodies.push(JSON.parse(String(init?.body)));
    return {ok:true,status:200,json:async()=>url.endsWith('/regions')?[]:{lat:null,lon:null,region:null}};
  }));
  const data: PostcodeData = {roadAddress:'광주 북구 첨단기업1로 17',address:'광주 북구',bcode:'2920012300',sigunguCode:'29200',roadnameCode:'1234567'};
  window.daum = {Postcode: class {
    constructor(private options: {oncomplete:(data:PostcodeData)=>void}) {}
    // The widget completes after its popup opens and the user selects an address.
    open() { setTimeout(() => this.options.oncomplete(data), 0); }
  }};
  function Host() {
    const [value,setValue]=useState<LocationValue>({address:'',region:''});
    return <AddressInput appRole="seller" value={value} onChange={setValue}/>;
  }
  render(<Host/>);
  fireEvent.click(screen.getByRole('button',{name:'주소 검색'}));
  await waitFor(()=>expect(bodies).toHaveLength(1));
  expect(bodies[0]).toEqual({road_address:data.roadAddress,adm_cd:data.bcode,rn_mgt_sn:'292001234567',udrt_yn:'0',buld_mnnm:'17',buld_slno:'0'});
  const confirm=screen.getByRole('button',{name:'주소 좌표 확인'});
  await waitFor(()=>expect(confirm).toBeEnabled());
  fireEvent.click(confirm);
  await waitFor(()=>expect(bodies).toHaveLength(2));
  expect(bodies[1]).toEqual(bodies[0]);
  await waitFor(()=>expect(confirm).toBeEnabled());
  fireEvent.change(screen.getByLabelText('도로명주소'),{target:{value:'테헤란로 지하 12-3'}});
  fireEvent.click(confirm);
  await waitFor(()=>expect(bodies).toHaveLength(3));
  expect(bodies[2]).toEqual({road_address:'테헤란로 지하 12-3',udrt_yn:'1',buld_mnnm:'12',buld_slno:'3'});
});
