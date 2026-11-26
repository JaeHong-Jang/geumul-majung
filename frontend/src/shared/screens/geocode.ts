export interface PostcodeData {
  roadAddress: string;
  address: string;
  bcode?: string;
  sigunguCode?: string;
  roadnameCode?: string;
}
/** Only a trailing building number after a road name is a building identifier. */
export function parseBuildingNumber(address: string) {
  const match = address.trim().match(/(?:로|길)\s+(?:(지하)\s*)?(\d+)(?:-(\d+))?\s*$/u);
  return match ? { udrt_yn: match[1] ? '1' : '0', buld_mnnm: match[2]!, buld_slno: match[3] ?? '0' } : {};
}
export function geocodeBody(roadAddress: string, data?: PostcodeData) {
  return {
    road_address: roadAddress,
    ...(data?.bcode ? { adm_cd: data.bcode } : {}),
    ...(data?.sigunguCode && data.roadnameCode ? { rn_mgt_sn: data.sigunguCode + data.roadnameCode } : {}),
    ...parseBuildingNumber(data ? data.roadAddress : roadAddress),
  };
}

type Postcode = { open: () => void };
declare global { interface Window { daum?: { Postcode: new (options: { oncomplete: (data: PostcodeData) => void }) => Postcode } } }
let postcodeLoad: Promise<void> | undefined;
export function loadPostcode() {
  if (window.daum?.Postcode) return Promise.resolve();
  if (!postcodeLoad) postcodeLoad = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
    script.onload = () => resolve();
    script.onerror = () => { postcodeLoad = undefined; script.remove(); reject(new Error('주소 검색 불러오기 실패, 주소 직접 입력 필요')); };
    document.head.append(script);
  });
  return postcodeLoad;
}
