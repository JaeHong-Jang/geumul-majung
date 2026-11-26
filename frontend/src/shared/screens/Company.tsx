import { useState } from 'react';
import { api, useAction, useResource } from '../api/client';
import { AppButton, Feedback, Field, TopBar } from '../ui';
import { AddressInput, type LocationValue } from './AddressInput';
import type { Company, Role } from '../../types';
type Profile = Company & {phone?: string;industry?: string;address_detail?: string;emitter_report?: string};
function CompanyForm({appRole, initial}: {appRole: Role; initial: Profile}) {
 const [fields,setFields] = useState({name:initial.name,phone:initial.phone||'',industry:initial.industry||'',address_detail:initial.address_detail||'',emitter_report:initial.emitter_report||''});
 const [location,setLocation]=useState<LocationValue>({address:initial.address||'',region:initial.region||'',...(initial.lat!=null && initial.lon!=null ? {lat:initial.lat,lon:initial.lon}:{})});
 const a=useAction();
 return <form className="signup-form" onSubmit={e=>{e.preventDefault();void a.run(()=>api(appRole,'/me/profile','PATCH',{...fields,...location}),()=>a.setMessage('회사 정보 저장 완료'));}}>
 {Object.entries({name:'회사명',phone:'전화',industry:'업종',address_detail:'상세 주소',emitter_report:'배출자 신고 대상 여부'}).map(([key,label])=><Field key={key} label={label} value={fields[key as keyof typeof fields]} onChange={e=>setFields({...fields,[key]:e.target.value})} />)}
 <Field label="사업자등록번호" value={initial.biz_no||''} readOnly />
 <AddressInput appRole={appRole} value={location} onChange={setLocation} /><Feedback {...a} /><AppButton disabled={a.busy}>정보 저장</AppButton></form>;
}
export function CompanyScreen({appRole,back}: {appRole: Role;back:()=>void}) {
 const r=useResource<Profile>(appRole,'/me/profile');
 return <><TopBar title="회사 정보, 증빙" back={back} /><Feedback {...r} />{r.data && <CompanyForm appRole={appRole} initial={r.data} />}</>;
}
