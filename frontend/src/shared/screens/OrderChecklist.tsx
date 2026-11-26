import { useResource } from '../api/client';
import type { OrderChecklist as Checklist, Role } from '../../types';

export function OrderChecklist({ appRole, id, existingLegalNote }: { appRole: Role; id: number; existingLegalNote?: string | undefined }) {
  const { data, error } = useResource<Checklist>(appRole, `/orders/${id}/checklist`);
  if (error || !data?.items) return null;
  const check = data.items.filter(item => item.ok !== true).length;
  // 눌러서 펼쳐 보는 형식. 확인할 항목 수를 요약에 보인다
  return <details className="order-checklist" aria-label="AI 규제 점검">
    <summary><h2>AI 규제 점검</h2><span>{check ? `확인 필요 ${check}건` : '모두 맞음'}</span></summary>
    <div className="stack">
    {data.items.map(item => <div key={item.item} className={`check-item ${item.ok === true ? 'ok' : item.ok === false ? 'warn' : 'human'}`}>
      <b>{item.ok === true ? '맞음' : item.ok === false ? '확인 필요' : '사람 확인 필요'}</b>
      <p>{item.text}</p>
      {(item.detail || item.laws.length > 0) && <details>
        <summary>조문 보기</summary>
        {item.detail && <p>{item.detail}</p>}
        {item.laws.map(law => <small className="muted" key={law.ref}>{law.label} </small>)}
      </details>}
    </div>)}
    {data.legal_note && data.legal_note !== existingLegalNote && <p className="muted">{data.legal_note}</p>}
    </div>
  </details>;
}
