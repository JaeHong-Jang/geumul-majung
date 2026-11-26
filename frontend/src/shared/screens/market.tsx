import { FilterChips } from '../ui/FilterChips';
import { dateText } from "../format";
import { useId, useState } from "react";
import { useResource } from "../api/client";
import './market.css';
import { RangeBar, StockChart, type ChartPoint } from '../ui/StockChart';
import {
  AppCard,
  Empty,
  Feedback,
  InfoRow,
  PriceText,
  Section,
  TopBar,
} from "../ui/index";
import {
  fmt,
  material,
  shortName,
  type Price,
  type Role,
  type Volume,
} from "../../types";
export function PriceChart({
  appRole: role,
  item,
  months,
  trend,
}: {
  appRole: Role;
  item: string;
  months?: number;
  compact?: boolean;
  trend?: number | null | undefined;
}) {
  const gid = `spark${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const r = useResource<{ date: string; price: number }[]>(
    role,
    `/market/prices/${encodeURIComponent(item)}/history`,
  );
  const all = r.data ?? [];
  const latest = all.at(-1)?.date;
  const cutoff = latest
    ? new Date(latest.length === 4 ? `${latest}-12-31` : latest)
    : null;
  if (cutoff && months) cutoff.setMonth(cutoff.getMonth() - months);
  const d =
    months && cutoff
      ? all.filter(
          (x) =>
            new Date(x.date.length === 4 ? `${x.date}-12-31` : x.date) >=
            cutoff,
        )
      : all;
  // 월별이 2개 이상이면 월별, 아니면 연평균, 둘 다 모자라면 전체를 한 줄로. 색은 직전 대비 등락(국내 표기: 상승 빨강, 하락 파랑).
  const monthly = d.filter(x => x.date.includes('-'));
  const yearly = d.filter(x => !x.date.includes('-'));
  const rows = monthly.length > 1 ? monthly : yearly.length > 1 ? yearly : d;
  if (r.error) return <Feedback error={r.error} />;
  if (rows.length < 2) return <small className="muted">{r.loading ? '시세 조회 중' : '시세 이력 없음'}</small>;
  const prices = rows.map(x => x.price);
  const lo = Math.min(...prices), span = Math.max(...prices) - lo || 1;
  const y = (v: number) => 4 + (1 - (v - lo) / span) * 40;
  const line = rows.map((x, i) => `${i ? 'L' : 'M'}${(i / (rows.length - 1) * 100).toFixed(2)},${y(x.price).toFixed(2)}`).join('');
  const dir = Math.sign(trend ?? prices.at(-1)! - prices.at(-2)!);
  return <svg className={`chart spark ${dir > 0 ? 'up' : dir < 0 ? 'down' : 'flat'}`} viewBox="0 0 100 48" preserveAspectRatio="none" role="img" aria-label={`${item} 실제 시세 추이 ${rows.map(x => `${x.date} ${fmt(x.price)}`).join(', ')}`}>
    <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".2" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
    <line className="spark-base" x1="0" x2="100" y1={y(prices[0]!)} y2={y(prices[0]!)} vectorEffect="non-scaling-stroke" />
    <path d={`${line}L100,48L0,48Z`} fill={`url(#${gid})`} />
    <path className="spark-line" d={line} vectorEffect="non-scaling-stroke" />
  </svg>;
}
export function Prices({
  appRole: role,
  prices,
  more,
}: {
  appRole: Role;
  prices: Price[];
  more: () => void;
}) {
  return (
    <Section title="오늘의 시세" more={more}>
      <div className="prices-grid">
        {prices.slice(0, 3).map((p) => (
          <AppCard key={p.item}>
            <button className="stack" onClick={more}>
              <small className="muted">{p.item}</small>
              <PriceText price={p.price} size={15} unit={p.unit} />
            </button>
            <PriceChart appRole={role} item={p.item} />
          </AppCard>
        ))}
      </div>
      {!prices.length && <Empty>등록된 시세 없음</Empty>}
    </Section>
  );
}
export function Volumes({ volumes }: { volumes: Volume[] }) {
  return (
    <Section title="지금 거래 가능한 물량">
      {volumes.map((v) => (
        <AppCard key={`${v.waste_code}:${v.target_material}`}>
          <div className="stack">
            <b>
              {material(v.target_material)}, {shortName(v.waste_name)}
            </b>
            <InfoRow label="전체 물량" value={`${fmt(v.total_kg)} kg`} />
            <InfoRow
              label="판매 기업, 매물"
              value={`${fmt(v.seller_count)}곳, ${fmt(v.listing_count)}건`}
            />
            <InfoRow
              label="단가"
              value={`${fmt(v.min_price)} ~ ${fmt(v.max_price)}원/kg`}
            />
            {v.market && (
              <InfoRow
                label={`참고 시세, ${dateText(v.market.date)}`}
                value={`${fmt(v.market.price)} ${v.market.unit}`}
              />
            )}
          </div>
        </AppCard>
      ))}
      {!volumes.length && <Empty>현재 거래 가능한 물량 없음</Empty>}
    </Section>
  );
}
type LiveQuote = {
  symbol: string; item: string; unit?: string; name?: string; exchange?: string; currency?: string;
  price?: number | null; prev_close?: number | null; change?: number | null; change_pct?: number | null;
  open?: number | null; day_high?: number | null; day_low?: number | null; week52_high?: number | null; week52_low?: number | null;
  market_time?: string | null; krw_per_kg?: number | null; stale?: boolean; error?: string;
};
type LiveChart = LiveQuote & { range: string; points: ChartPoint[]; range_change_pct?: number | null };
const RANGES = [['1d', '1일'], ['5d', '1주'], ['1mo', '1달'], ['3mo', '3달'], ['6mo', '6달'], ['1y', '1년'], ['5y', '5년']] as const;
const pad = (n: number) => String(n).padStart(2, '0');
function liveTime(range: string) {
  return (t: string) => {
    const d = new Date(t);
    if (range === '1d') return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (range === '5d') return `${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}시`;
    if (range === '5y') return `${String(d.getFullYear()).slice(2)}.${pad(d.getMonth() + 1)}`;
    return `${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
  };
}
const monthText = (t: string) => `${t.slice(2, 4)}.${t.slice(5, 7)}`;
/** 등락 표시. 값이 없으면 아무것도 지어내지 않는다. */
function Change({ value, pct, big = false }: { value?: number | null | undefined; pct?: number | null | undefined; big?: boolean }) {
  if (pct == null) return null;
  const dir = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
  return <span className={`change ${dir} ${big ? 'big' : ''}`}>{value != null && `${value > 0 ? '+' : ''}${fmt(value)} `}({pct > 0 ? '+' : ''}{fmt(pct)}%){dir !== 'flat' && (dir === 'up' ? ' ▲' : ' ▼')}</span>;
}

/** 국제 실시간 시세: 품목 줄 → 큰 현재가·등락 → 기간 탭 → 그래프 → 상세 수치. 5초마다 다시 부르며 서버가 1분 캐시한다. */
function LiveMarket({ appRole: role }: { appRole: Role }) {
  const quotes = useResource<{ quotes: LiveQuote[]; fx: { krw_per_usd: number | null }; source: string }>(role, '/market/live', true);
  const [symbol, setSymbol] = useState('ALI=F');
  const [range, setRange] = useState('1d');
  const chart = useResource<LiveChart>(role, `/market/live/${encodeURIComponent(symbol)}?range=${range}`, range === '1d' || range === '5d');
  const list = Array.isArray(quotes.data?.quotes) ? quotes.data.quotes : [];
  const q = list.find(x => x.symbol === symbol);
  const c = chart.data?.symbol === symbol && chart.data.range === range ? chart.data : undefined;
  const time = q?.market_time ? new Date(q.market_time) : null;
  const closed = time ? Date.now() - time.getTime() > 30 * 60 * 1000 : false;
  return (
    <section className="live-market" aria-label="국제 실시간 시세">
      <div className="section-title"><h2>국제 원자재 시세</h2>{q && !q.error && <span className={`live-dot ${closed ? 'closed' : ''}`}>{closed ? '장 마감' : '실시간'}</span>}</div>
      <Feedback error={quotes.error} />
      <div className="quote-strip" role="tablist" aria-label="품목">
        {list.map(x => (
          <button key={x.symbol} role="tab" aria-selected={x.symbol === symbol} onClick={() => setSymbol(x.symbol)}>
            <small>{x.item}</small>
            {x.error ? <small className="muted">불러오지 못함</small> : <><b>{fmt(x.price)}</b><Change pct={x.change_pct} /></>}
          </button>
        ))}
      </div>
      {q && !q.error && (
        <div className="quote-card">
          <div className="quote-head">
            <h3>{q.item} <small>{q.symbol}, {q.exchange}, {q.unit}</small></h3>
            <div className="quote-price"><b>{fmt(q.price)}</b><Change value={q.change} pct={q.change_pct} big /></div>
            <small className="muted">
              {time ? `${closed ? '닫음' : '실시간'}, ${time.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 기준` : ''}
              {q.stale ? ', 연결이 끊겨 직전 값 표시' : ''}
            </small>
            {q.krw_per_kg != null && <p className="krw">≈ {fmt(q.krw_per_kg)}원/kg <small>(환율 {fmt(quotes.data?.fx.krw_per_usd)}원/달러 환산)</small></p>}
          </div>
          <div className="quote-ranges">
            <RangeBar label="금일 변동" low={q.day_low} high={q.day_high} value={q.price} />
            <RangeBar label="52주 변동폭" low={q.week52_low} high={q.week52_high} value={q.price} />
          </div>
          <div className="range-tabs" role="tablist" aria-label="기간">
            {RANGES.map(([v, name]) => <button key={v} role="tab" aria-selected={range === v} onClick={() => setRange(v)}>{name}</button>)}
          </div>
          {c ? <>
            {c.range_change_pct != null && <p className="range-change">{RANGES.find(([v]) => v === range)?.[1]} 등락률 <Change pct={c.range_change_pct} /></p>}
            <StockChart points={c.points} baseline={range === '1d' ? c.prev_close : null} label={`${q.item} ${range}`} timeText={liveTime(range)} unit={q.currency ?? ''} />
          </> : <p className="muted stock-empty">{chart.error ?? '그래프 불러오는 중…'}</p>}
          <dl className="quote-stats">
            <div><dt>전일 종가</dt><dd>{fmt(q.prev_close)}</dd></div>
            <div><dt>금일 시가</dt><dd>{fmt(q.open)}</dd></div>
            <div><dt>금일 변동</dt><dd>{q.day_low != null ? `${fmt(q.day_low)} - ${fmt(q.day_high)}` : '—'}</dd></div>
            <div><dt>52주 변동폭</dt><dd>{q.week52_low != null ? `${fmt(q.week52_low)} - ${fmt(q.week52_high)}` : '—'}</dd></div>
          </dl>
          <small className="muted">출처: Yahoo Finance, 거래소 선물 시세로 몇 분 지연 가능, 국제 가격으로 국내 재활용 원료 매입가와 차이 있음</small>
        </div>
      )}
    </section>
  );
}

export function MarketScreen({
  appRole: role,
  back,
}: {
  appRole: Role;
  back: () => void;
}) {
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState("");
  const [months, setMonths] = useState(12);
  const r = useResource<Price[]>(
    role,
    `/market/prices?category=${encodeURIComponent(category)}`,
  );
  const current = r.data?.find((p) => p.item === selected) ?? r.data?.[0];
  const history = useResource<{ date: string; price: number }[]>(role, current ? `/market/prices/${encodeURIComponent(current.item)}/history` : null);
  const monthly = (history.data ?? []).filter(x => x.date.includes('-')).map(x => ({ t: x.date, price: x.price }));
  const shown = months ? monthly.slice(-months - 1) : monthly;
  return (
    <>
      <TopBar title="시세" back={back} />
      <LiveMarket appRole={role} />
      <section className="domestic-market" aria-label="국내 재활용 원료 시세">
      <div className="section-title"><h2>국내 재활용 원료 시세</h2><span className="live-dot closed">월간</span></div>
      <FilterChips value={category} onChange={setCategory} options={["", "폐금속", "폐유리병", "폐지", "폐타이어", "폐플라스틱"].map(c=>[c,c||'전체'])}/>
      <Feedback {...r} />
      {current && (
        <div className="quote-card">
          <div className="quote-head">
            <h3>{current.item} <small>{current.category}, {current.unit}</small></h3>
            <div className="quote-price"><b>{fmt(current.price)}</b>{current.change_pct != null && <span className="muted">직전 대비</span>}<Change pct={current.change_pct} big /></div>
          </div>
          <div className="range-tabs" role="tablist" aria-label="기간">
            {([[6, '6달'], [12, '1년'], [0, '전체']] as const).map(([v, name]) => <button key={v} role="tab" aria-selected={months === v} onClick={() => setMonths(v)}>{name}</button>)}
          </div>
          <Feedback error={history.error} />
          {history.data && <StockChart points={shown} label={`${current.item} 월별`} timeText={monthText} unit={current.unit} />}
          <small className="muted">
            {current.source_id === "D2-PRICE" ? "출처: 한국환경공단 재활용가능자원 가격조사, " : ""} {dateText(current.date)} 기준
            실제 이력
          </small>
        </div>
      )}
      </section>
      <Section title="품목별 시세">
        <div className="market-list">
          {r.data?.map((p) => (
            <button
              key={p.item}
              className="market-row"
              aria-pressed={p.item === current?.item}
              onClick={() => setSelected(p.item)}
            >
              <span className="listing-copy">
                <b>{p.item}</b>
                <small>
                  {p.source_id === "D2-PRICE" ? "한국환경공단 재활용가능자원 가격조사" : p.category}, {dateText(p.date)}
                </small>
              </span>
              <span className="mini-chart">
                <PriceChart appRole={role} item={p.item} trend={p.change_pct} />
              </span>
              <span className="market-value">
                <b>{fmt(p.price)}</b>
                <small>{p.unit}</small>
                <Change pct={p.change_pct} />
              </span>
            </button>
          ))}
        </div>
        {!r.loading && !r.error && !r.data?.length && <Empty>등록된 시세 없음</Empty>}
      </Section>
    </>
  );
}
