import { useState } from 'react';
import { fmt } from '../../../types';
import './byproduct-recommendations.css';

// 시세 흐름: 오르면 빨강, 내리면 파랑(국내 시세 표기 관례). 이유 문장은 머리말(우리 공장 맞춤)과 겹치지 않게 짧게 쓴다
function trendOf(row) {
  const change = row.market?.change_pct;
  if (!row.market || change == null) return null;
  if (change > 0) return { dir: 'up', text: `▲ ${change}%` };
  if (change < 0) return { dir: 'down', text: `▼ ${Math.abs(change)}%` };
  return { dir: 'flat', text: '변동 없음' };
}

// 서버 판단(verdict)에 맞춘 짧은 한 줄. 긴 근거는 아래 '시세 기준과 추천 근거'에 그대로 둔다
function shortReason(row) {
  if (row.verdict === 'bundle') return '단가 낮음, 공동판매로 모으기';
  if (row.verdict === 'quote') return '공개 시세 없음, 매입 견적 확인';
  const wants = row.wants ? `구매 희망 ${row.wants}곳, ` : '';
  if (row.top) return `${wants}우리 공장 품목 중 가장 비쌈`;
  if (row.reference) return `${wants}고가 품목, 견적 비교 후 판매`;
  return `${wants}판매 추천`;
}

export default function ByproductRecommendations({ items = [], suggestions = [], go }) {
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState([]);
  const factory = items.map(row => ({
    id: `factory-${row.code}-${row.material}`, title: row.material,
    meta: row.market ? `${row.market.intl ? '국제 ' : ''}${fmt(row.market.price)} ${row.market.unit}` : row.reference ? `${row.reference.metal} 가격 연동` : null,
    trend: trendOf(row), tone: row.verdict === 'sell' ? 'flat' : 'none',
    reason: shortReason(row),
    ...(row.verdict === 'bundle'
      ? { accept: `${row.material} 공동판매 찾기`, action: '공동판매', onAccept: () => go('poolFind') }
      : { accept: `${row.material} 판매 등록`, action: '판매', onAccept: () => go('register', { code: row.code, material: row.material }) }),
  }));
  const urgent = suggestions.filter(row => /^(ship|handover)-/.test(row.id));
  const others = suggestions.filter(row => !/^(ship|handover)-/.test(row.id));
  const all = [...urgent, ...factory.slice(0, 2), ...others, ...factory.slice(2)].filter(row => !dismissed.includes(row.id));
  const visible = expanded ? all : all.slice(0, 3);
  // 업무 제안(출고, 인계서 등)은 회색 막대, 판매 추천은 시세 흐름 색 막대로 줄마다 구분한다
  return <section className="shell-section factory-recommendations" aria-label="AI 제안">
    <div className="factory-suggestions-head"><h2>AI 제안 <small>우리 공장 맞춤</small></h2><button type="button" onClick={() => go('company')}>품목 수정</button></div>
    {!items.length && <div className="factory-suggestions-setup"><span>발생 품목을 등록하면 판매 추천 표시</span><button type="button" onClick={() => go('company')}>발생 품목 등록</button></div>}
    {visible.length ? <ul>{visible.map(row => <li key={row.id} className={`factory-suggestion tone-${row.tone || 'task'}`}>
      <button type="button" className="factory-suggestion-copy" aria-label={row.accept} onClick={row.onAccept} title={`${row.title}, ${row.reason}`}>
        <span className="factory-suggestion-text">
        <span className="factory-suggestion-title"><strong>{row.title}</strong>{row.meta && <small>{row.meta}</small>}{row.trend && <em className={`factory-suggestion-trend trend-${row.trend.dir}`}>{row.trend.text}</em>}</span>
        <span className="factory-suggestion-reason">{row.reason}</span>
        </span>
        <span className="factory-suggestion-action" aria-hidden="true">{row.action || '보기'}</span>
      </button>
      <button type="button" className="factory-suggestion-dismiss" aria-label="제안 닫기" onClick={() => setDismissed(ids => [...ids, row.id])}><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></button>
    </li>)}</ul> : <p className="factory-recommendations-note">새 제안 없음</p>}
    {(all.length > 3 || (expanded && all.length > 0)) && <button type="button" className="factory-recommendations-more" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? '접기' : `제안 ${all.length - 3}개 더 보기`}</button>}
    {items.some(row => row.market || row.reference) && <details className="factory-suggestions-basis"><summary>시세 기준과 추천 근거</summary>
      {items.map(row => { const m = row.market || row.reference; return <p key={`${row.code}:${row.material}`}><strong>{row.material}</strong> <span>{m ? (m.basis || `${m.item}, ${m.date} 공개 시세`) : '공개 시세 없음'}</span><br />{row.reason}</p>; })}
      <p>시세는 참고 단가이며, 실제 판매 금액은 품질과 운송 조건에 따라 달라짐</p>
    </details>}
  </section>;
}
