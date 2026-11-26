import { describe, expect, it } from 'vitest';
import { geocodeBody, parseBuildingNumber } from './geocode';
describe('도로명주소 건물번호', () => {
  it.each([
    ['광주 북구 첨단기업1로 17', {udrt_yn:'0',buld_mnnm:'17',buld_slno:'0'}],
    ['서울 강남구 테헤란로 12-3', {udrt_yn:'0',buld_mnnm:'12',buld_slno:'3'}],
    ['서울 종로구 종로 지하 5', {udrt_yn:'1',buld_mnnm:'5',buld_slno:'0'}],
    ['부산 해운대구 센텀1길 지하 12-3 ', {udrt_yn:'1',buld_mnnm:'12',buld_slno:'3'}],
    ['', {}], ['첨단기업1로', {}], ['구미시 공단동 12-3', {}],
  ])('%s', (address, expected) => expect(parseBuildingNumber(address)).toEqual(expected));
  it('위젯 코드와 건물번호를 요청에 연결한다', () => {
    expect(geocodeBody('첨단기업1로 17', {roadAddress:'첨단기업1로 17',address:'',bcode:'2920012300',sigunguCode:'29200',roadnameCode:'1234567'})).toEqual({road_address:'첨단기업1로 17',adm_cd:'2920012300',rn_mgt_sn:'292001234567',udrt_yn:'0',buld_mnnm:'17',buld_slno:'0'});
  });
  it('직접 입력은 건물번호만 추가하고 빠진 코드를 생략한다', () => {
    expect(geocodeBody('공단로 12-3')).toEqual({road_address:'공단로 12-3',udrt_yn:'0',buld_mnnm:'12',buld_slno:'3'});
    expect(geocodeBody('공단동', {roadAddress:'',address:'공단동',sigunguCode:'12345'})).toEqual({road_address:'공단동'});
  });
});
