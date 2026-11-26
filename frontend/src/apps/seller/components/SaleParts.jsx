// 판매 등록, 확인, 상세 화면이 함께 쓰는 조각: 진행 단계, 영수증, 사진 줄, AI 조언 카드, 판매 조건 글.
import { useEffect, useState } from 'react';
import { getToken } from '../../../shared/api/seller';
import { kg } from '../lib/format';
import './sale.css';

export const MAX_PHOTOS = 5;
export const MIN_LOT_KG = 1000;   // 최소 묶음(팀 가정, 서버 assumptions.min_lot_kg와 같게)
export const SHIP_HOURS = ['평일 09:00~18:00', '평일 08:00~17:00', '평일 07:00~19:00'];
// 전국화물자동차운송사업연합회 대표전화(연합회 공제조합 누리집 truck.or.kr 표기)
export const FREIGHT_ASSOCIATION = { name: '전국화물자동차운송사업연합회', phone: '02-3483-3700' };

export const TRANSPORTS = {
  own: { title: '우리 회사 차로 운송', desc: '회사 차량으로 입고지까지 직접 보냄' },
  matched: { title: '화물차 따로 구하기', desc: '판매가 정해지면 화물차를 불러 입고지까지 보냄' },
};

/** 무게 글: 1,000kg 이상이면 t도 함께. */
export const weightText = (n) => (n >= 1000 ? `${kg(n)} (${(n / 1000).toLocaleString('ko-KR', { maximumFractionDigits: 3 })}t)` : kg(n));

/** 하차 지원 글. */
export const unloadText = (t) => {
  const on = [t?.unload_forklift && '지게차', t?.unload_crane && '크레인'].filter(Boolean);
  return on.length ? `${on.join(', ')} 지원` : '지원 없음, 입고지 장비로 하차';
};

/** 거래를 알아볼 번호: R-000102(등록), S-000045(판매). */
export const tradeNo = (prefix, id) => `${prefix}-${String(id).padStart(6, '0')}`;

export function SaleSteps({ at }) {
  const steps = ['1. 판매 정보', '2. 내용 확인', '3. 판매 완료'];
  return (
    <ol className="sale-steps" aria-label="진행 단계">
      {steps.map((label, i) => (
        <li key={label} className={i <= at ? 'on' : ''} aria-current={i === at ? 'step' : undefined}>
          <span className="sale-steps__bar" />
          <span className="sale-steps__label">{label}</span>
        </li>
      ))}
    </ol>
  );
}

/** 영수증 카드. rows: [label, value, {strong, sub}] 또는 'line'(구분선). */
export function Receipt({ title, no, date, rows, total, footnote, children }) {
  return (
    <section className="sale-receipt" aria-label={title}>
      <header className="sale-receipt__head">
        <div>
          <b>{title}</b>
          {date && <small>{date}</small>}
        </div>
        {no && <span className="sale-receipt__no">No. {no}</span>}
      </header>
      {children}
      <dl className="sale-receipt__rows">
        {rows.filter(Boolean).map((r, i) =>
          r === 'line' ? <hr key={`l${i}`} /> : (
            <div key={r[0]} className={r[2]?.strong ? 'strong' : ''}>
              <dt>{r[0]}</dt>
              <dd>{r[1]}{r[2]?.sub && <small>{r[2].sub}</small>}</dd>
            </div>
          ))}
      </dl>
      {total && (
        <div className="sale-receipt__total">
          <span>{total[0]}</span>
          <b>{total[1]}</b>
        </div>
      )}
      {footnote && <p className="sale-receipt__foot">{footnote}</p>}
    </section>
  );
}

/** 서버에 올린 사진(번호)을 토큰과 함께 받아 보인다. */
function ServerPhoto({ id }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true, made = null;
    fetch(`/v1/bag-photos/${id}`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => { if (alive && b) { made = URL.createObjectURL(b); setUrl(made); } })
      .catch(() => {});
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [id]);
  return url ? <img src={url} alt="" /> : <span className="sale-photos__wait" aria-hidden="true" />;
}

/** 사진 줄: urls(브라우저에서 고른 사진) 또는 ids(서버 사진). */
export function PhotoStrip({ urls = [], ids = [], label = '첨부 사진' }) {
  const count = urls.length || ids.length;
  if (!count) return null;
  return (
    <div className="sale-photos" aria-label={`${label} ${count}장`}>
      <small>{label} {count}장</small>
      <div className="sale-photos__row">
        {urls.map((u) => <span key={u} className="sale-photos__item"><img src={u} alt="" /></span>)}
        {ids.map((id) => <span key={id} className="sale-photos__item"><ServerPhoto id={id} /></span>)}
      </div>
    </div>
  );
}

// AI 조언 한 줄을 주제별 제목과 본문, 괄호 속 근거로 나눈다
const TOPICS = [
  [/최근 시세|전국 .*원\/kg/, '최근 시세', '📈'],
  [/올리려는 단가|입력 단가/, '내 단가 위치', '🏷️'],
  [/대기 판매|반경/, '근처 판매', '📍'],
  [/최소 묶음/, '판매 물량', '⚖️'],
  [/소각/, '처리비 절감', '♻️'],
  [/판매 참고액|참고액/, '예상 판매액', '💰'],
  [/모아서|바로 팔/, '판매 방법', '✅'],
];
function splitAdvice(summary) {
  return summary.split(/\s-\s|\n/).map((s) => s.replace(/^-\s*/, '').trim()).filter(Boolean).map((line) => {
    const m = line.match(/^(.*?)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*$/);
    const body = m ? m[1] : line;
    const note = m ? m[2] : '';
    const t = TOPICS.find(([re]) => re.test(line));
    return { title: t ? t[1] : null, icon: t ? t[2] : '💡', body, note };
  });
}

export function AdviceCard({ summary }) {
  if (!summary) return null;
  const items = splitAdvice(summary);
  const head = items[0] && !items[0].title && items[0].body.length <= 16 ? items.shift() : null;
  return (
    <section className="sale-advice" aria-label="AI 조언">
      <header>
        <span aria-hidden="true">✦</span>
        <b>AI 조언</b>
        {head && <em>{head.body}</em>}
      </header>
      <ul>
        {items.map((it, i) => (
          <li key={i}>
            <span className="sale-advice__icon" aria-hidden="true">{it.icon}</span>
            <div>
              {it.title && <small>{it.title}</small>}
              <p>{it.body}</p>
              {it.note && <span className="sale-advice__note">{it.note}</span>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
