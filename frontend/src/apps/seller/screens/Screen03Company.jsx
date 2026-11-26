import { useState } from 'react';
import { Signup } from '../../../shared/screens/Signup';
import { AddressInput } from '../../../shared/screens/AddressInput';
import { api, errorText, getToken } from '../../../shared/api/seller';
import { ErrorNote } from '../../../shared/ui/Note';
import { useNav } from '../lib/nav';
import useResource from '../lib/useResource';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import ScrollBody from '../components/ScrollBody';
import { FormField } from '../components/Field';
import Button from '../components/Button';
import Documents from '../components/Documents';
import { ByproductPicker } from '../../../shared/ui/ByproductPicker';
const LABELS = {name:'회사명',phone:'전화',industry:'업종',address_detail:'상세 주소',emitter_report:'배출자 신고 대상 여부'};
function ByproductForm({ initial }) {
  const [rows, setRows] = useState(initial.byproducts || []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState('');
  return <form className="stack factory-byproduct-editor" onSubmit={async e => {
    e.preventDefault(); setBusy(true); setError(null); setMessage('');
    try {
      const updated = await api('/me/profile', { method: 'PATCH', body: { byproducts: rows } });
      setRows(updated.byproducts || []); setMessage('발생 품목 저장 완료, 홈 판매 추천에 반영');
    } catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  }}>
    <h2>우리 공장 발생 품목</h2>
    <p>판매 추천에 사용할 품목과 주 재질 등록</p>
    <ByproductPicker value={rows} onChange={next => { setRows(next); setMessage(''); }} />
    <ErrorNote error={error} />{message && <p role="status">{message}</p>}
    <Button type="submit" disabled={busy}>발생 품목 저장</Button>
  </form>;
}
function CompanyForm({initial}) {
  const [fields, setFields] = useState(Object.fromEntries(Object.keys(LABELS).map(k => [k, initial[k] || ''])));
  const [location, setLocation] = useState({address:initial.address || '',region:initial.region || '',...(initial.lat != null && initial.lon != null ? {lat:initial.lat,lon:initial.lon} : {})});
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState(null); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  async function save(e) {
    e.preventDefault(); setError(null); setMessage('');
    const body = Object.fromEntries(Object.entries({...fields,...location}).filter(([k,v]) => v !== (saved[k] ?? '')));
    for (const [key,value] of Object.entries(body)) {
      if (typeof value === 'string' && !value.trim()) return setError(`${LABELS[key] || '주소, 지역'} 값 입력 필요`);
    }
    if ('lat' in body || 'lon' in body) {body.lat=location.lat;body.lon=location.lon;}
    setBusy(true);
    try { const updated = await api('/me/profile', {method:'PATCH',body}); setSaved(updated); setMessage('회사 정보 저장 완료'); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  return <form className="stack" onSubmit={save}>
    {Object.entries(LABELS).map(([key,label]) => <FormField key={key} label={label} maxLength={100} value={fields[key]} onChange={e => setFields({...fields,[key]:e.target.value})} />)}
    <FormField label="사업자등록번호" value={initial.biz_no || ''} readOnly />
    <AddressInput appRole="seller" value={location} onChange={setLocation} />
    <ErrorNote error={error} />{message && <p role="status">{message}</p>}<Button type="submit" disabled={busy}>정보 저장</Button>
  </form>;
}
export default function Screen03Company() {
  const nav = useNav(); const token = getToken(); const profile = useResource(token ? '/me/profile' : null, {poll:false});
  if (!token) return <Signup appRole="seller" back={() => nav.go('login')} />;
  return <Screen id="company"><ScreenHeader title="회사 정보, 증빙" back /><ScrollBody><ErrorNote error={profile.error} />{profile.data && <><ByproductForm initial={profile.data} /><CompanyForm initial={profile.data} /></>}<Documents /></ScrollBody></Screen>;
}
