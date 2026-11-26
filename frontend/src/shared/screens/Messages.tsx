import { ItemCard } from '../ui/ItemCard';
import { EmptyState } from '../ui/EmptyState';
import { useEffect, useState } from 'react';
import { api, useAction, useResource } from '../api/client';
import { AppButton, Feedback, Field, TopBar } from '../ui';
import { dateText } from '../format';
import type { Go, Role } from '../../types';
import './messages.css';
interface Message { id: number; sender_name: string; body: string; masked?: boolean; from_inquiry?: boolean; created_at?: string }
interface Inquiry { id: number; listing_id: number; listing_name: string; other_name: string; last_message: string; unread: number; updated_at: string; reported: boolean }
export function Inquiries({ appRole, go, back, embedded=false }: { appRole: Role; go: Go; back: () => void; embedded?:boolean }) {
  const r = useResource<Inquiry[]>(appRole, '/inquiries', true);
  return <>{!embedded&&<TopBar title="매물 문의" back={back} />}<Feedback {...r} />{r.data?.map(i => <ItemCard key={i.id} title={`${i.listing_name}, ${i.other_name}`} description={<>{i.last_message}<br/>{dateText(i.updated_at)}{i.reported?', 신고 접수':''}</>} right={<span className="status-tag">읽지 않음 {i.unread}</span>} onClick={()=>go({name:'inquiry',id:i.id})}/>)}{!r.error && r.data?.length === 0 && <EmptyState title="매물 문의 없음" description="매물 상세에서 문의 시작" action="매물 탐색" onAction={()=>go({name:'explore'})}/>}</>;
}
export function Messages({ appRole, id, listingId, inquiry = false, back, go }: { appRole: Role; id?: number; listingId?: number; inquiry?: boolean; back: () => void; go: Go }) {
  const [created, setCreated] = useState<number>();
  const thread = created ?? id;
  const isInquiry = inquiry || listingId != null;
  const base = thread ? `/${isInquiry ? 'inquiries' : 'orders'}/${thread}` : null;
  const r = useResource<Message[]>(appRole, base ? `${base}/messages` : null, true);
  const [body, setBody] = useState('');
  const [reason, setReason] = useState('');
  const [reporting, setReporting] = useState(false);
  const a = useAction();
  useEffect(() => { if(base && isInquiry) void api(appRole, `${base}/read`, 'POST', {}).catch(() => {}); }, [appRole, base, isInquiry, r.data?.length]);
  return <section className="conversation"><TopBar title={isInquiry ? '매물 문의' : '거래 대화'} back={back} />
    <div className="conversation-body">
      {isInquiry && <div className="conversation-notice"><b>매물 문의</b>{listingId ? `매물 ${listingId}` : `문의 ${thread ?? ''}`}</div>}
      {!isInquiry && thread && <button className="conversation-notice" onClick={() => go({name:'order',id:thread})}>연결된 거래, 주문 {thread}</button>}
      <Feedback {...r} /><Feedback {...a} />
      {!r.error && r.data?.length === 0 && <div className="conversation-notice">대화 없음</div>}
      {r.data?.map(m => <article className="conversation-notice" key={`${m.from_inquiry ? 'inquiry' : 'order'}-${m.id}`}><b>{m.sender_name}</b>{m.from_inquiry && <small>매물 문의에서 이어진 메시지</small>}<p>{m.body}</p>{m.masked && <small>연락처는 가려 표시</small>}<small>{dateText(m.created_at)}</small></article>)}
      {isInquiry && thread && <><button className="text-button" onClick={() => setReporting(!reporting)}>신고</button>{reporting && <form className="stack" onSubmit={e => { e.preventDefault(); void a.run(() => api(appRole, `${base}/report`, 'POST', {reason:reason.trim()}), () => { a.setMessage('신고 접수 완료'); setReporting(false); setReason(''); }); }}><Field label="신고 사유" required maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /><AppButton disabled={a.busy || !reason.trim()}>신고 제출</AppButton></form>}</>}
    </div>
    <form className="conversation-compose" onSubmit={e => {
      e.preventDefault();
      void a.run(async () => {
        if (!body.trim()) return;
        if (!base && listingId) {
          const result = await api<{id: number; inquiry_id?: number}>(appRole, `/listings/${listingId}/inquiries`, 'POST', {body:body.trim()});
          setCreated(result.inquiry_id ?? result.id);
        } else if (base) { await api(appRole, `${base}/messages`, 'POST', {body:body.trim()}); await r.refresh(); }
        setBody('');
      });
    }}><Field label="메시지" placeholder="메시지 입력" maxLength={500} required value={body} onChange={e => setBody(e.target.value)} /><AppButton disabled={a.busy || !body.trim() || (!base && !listingId)}>메시지 전송</AppButton></form>
  </section>;
}
