import { useState } from 'react';
import { useNav } from '../lib/nav';
import useResource from '../lib/useResource';
import { api, errorText } from '../../../shared/api/seller';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import ScrollBody from '../components/ScrollBody';
import Notice from '../components/Notice';
import Button from '../components/Button';
import Documents from '../components/Documents';
import { FormField } from '../components/Field';
import { ErrorNote } from '../../../shared/ui/Note';
export default function Screen04Approval() {
  const nav = useNav(); const r = useResource('/me/approval');
  const [note, setNote] = useState(''); const [error, setError] = useState(null); const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true); setError(null);
    try { await api('/me/approval/resubmit', {method:'POST', body:{note}}); await r.reload(); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  return <Screen id="approval"><ScreenHeader title="가입 승인, 보완" back /><ScrollBody><ErrorNote error={error || r.error} />
    {r.data?.status === 'approved' && <Notice title="승인 완료" />}
    {r.data?.status === 'pending' && <Notice subtle title="승인 대기">신청 내용 확인 중, 승인 후 거래 가능</Notice>}
    {r.data?.status === 'needs_fix' && <><Notice subtle title="보완 요청">{r.data.note}{r.data.missing?.map(m => <span key={m}><br />{m}</span>)}</Notice><Button variant="secondary" onClick={() => nav.go('company')}>회사 정보 수정</Button><Documents /><FormField label="보완 내용" value={note} onChange={e => setNote(e.target.value)} /><Button onClick={submit} disabled={busy}>보완 제출</Button></>}
    <Button variant="secondary" onClick={nav.back}>뒤로 가기</Button>
  </ScrollBody></Screen>;
}
