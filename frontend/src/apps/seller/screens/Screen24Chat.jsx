import { useEffect, useState } from 'react';
import { useNav } from '../lib/nav';
import useResource from '../lib/useResource';
import { api, errorText } from '../../../shared/api/seller';
import { session } from '../../../shared/api/client';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import ScrollBody from '../components/ScrollBody';
import Button from '../components/Button';
import { FormField } from '../components/Field';
import { ErrorNote } from '../../../shared/ui/Note';
import InquiryList from '../components/InquiryList';
import { dateText } from '../lib/format';
import './SellerMessages.css';
export default function Screen24Chat() {
  const nav = useNav();
  const {id, inquiry} = nav.params;
  const base = id ? `/${inquiry === '1' ? 'inquiries' : 'orders'}/${id}` : null;
  const r = useResource(base ? `${base}/messages` : null);
  const [body, setBody] = useState('');
  const [reason, setReason] = useState('');
  const [reporting, setReporting] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const myId = session('seller')?.company.id;
  useEffect(() => { if (base && inquiry === '1') api(`${base}/read`, {method:'POST', body:{}}).catch(e => setError(errorText(e))); }, [base, inquiry, r.data?.length]);
  async function submit(e) {
    e.preventDefault(); if (!body.trim() || busy) return;
    setBusy(true); setError(null);
    try { await api(`${base}/messages`, {method:'POST', body:{body:body.trim()}}); setBody(''); await r.reload(); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  async function report(e) {
    e.preventDefault(); setBusy(true); setError(null);
    try { await api(`${base}/report`, {method:'POST', body:{reason:reason.trim()}}); setNotice('신고 접수 완료'); setReporting(false); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  return <Screen id="chat"><ScreenHeader title={!id || inquiry === '1' ? '매물 문의' : '거래 대화'} back /><ScrollBody>
    {!id ? <InquiryList /> : <>
      <ErrorNote error={error || r.error} />
      {inquiry !== '1' && <Button variant="secondary" onClick={() => nav.go('order', {id})}>연결된 거래 확인</Button>}
      {r.data?.length === 0 && <p>주고받은 메시지 없음</p>}
      {r.data?.map(m => <article key={`${!!m.from_inquiry}-${m.id}`} className={`seller-message ${m.sender_id === myId ? 'seller-message--mine' : 'seller-message--other'}`}><strong>{m.sender_id === myId ? '나' : m.sender_name}</strong>{m.from_inquiry && <small>매물 문의에서 이어진 메시지</small>}<p>{m.body}</p>{m.masked && <small>연락처를 가려 표시</small>}<small>{dateText(m.created_at)}</small></article>)}
      {notice && <p role="status">{notice}</p>}
      {inquiry === '1' && <Button variant="secondary" onClick={() => setReporting(v => !v)}>신고</Button>}
      {reporting && <form onSubmit={report}><FormField label="신고 사유" required maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /><Button type="submit" disabled={busy || !reason.trim()}>신고 제출</Button></form>}
      <form onSubmit={submit}><FormField label="메시지" required maxLength={500} value={body} onChange={e => setBody(e.target.value)} /><Button type="submit" disabled={busy || !body.trim()}>메시지 전송</Button></form>
    </>}
  </ScrollBody></Screen>;
}
