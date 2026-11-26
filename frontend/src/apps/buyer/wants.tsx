import './explore.css';
import './wants.css';
import { useEffect, useMemo, useState } from "react";
import { api, useAction, useResource } from "../../shared/api/client";
import { dateText } from "../../shared/format";
import { AppButton, AppCard, BottomBar, Feedback, Field, InfoRow, Section, SearchBox, StatusTag, TopBar } from "../../shared/ui/index";
import { AddressPicker } from "./addressBook";
import "./addressBook.css";
import { EmptyState } from '../../shared/ui/EmptyState';
import { fmt, type Go, type Listing } from "../../types";
import { ListingList, ListingRow, MaterialPicture } from './listing';
import { useVoiceIntake } from '../../shared/useVoiceIntake';
import { VoiceInput } from '../../shared/ui/VoiceInput';
import { AgentSteps, type AgentStep } from '../../shared/ui/AgentSteps';
import { CATALOG, CATEGORIES, catalogOf, keyOf, priceParts, weight } from './catalog';

/** 서버의 구매 희망 한 건. 가격은 늘 원/kg로 저장하고 price_unit은 먼저 보여 줄 단위. */
export interface BuyRequest {
  id: number; material: string; item: string; waste_code: string | null; qty_kg: number;
  price_krw_per_kg: number | null; price_min_krw_per_kg?: number | null; price_max_krw_per_kg?: number | null; negotiable?: boolean;
  price_unit: 'kg' | 'ton'; need_by: string | null; repeat: 'once' | 'monthly';
  delivery_address: string | null; note: string | null; status: 'open' | 'closed'; created_at: string;
}

/** 희망 가격 한 줄: 하한가~상한가(같으면 한 값). 예전 요청은 한 가격만 있을 수 있음. */
const priceRange = (lo: number | null | undefined, hi: number | null | undefined, unit: 'kg' | 'ton') => {
  const top = hi ?? lo;
  if (top == null) return null;
  const b = priceParts(top, unit);
  if (lo == null || lo === top) return `${b.value}${b.suffix}`;
  return `${priceParts(lo, unit).value}~${b.value}${b.suffix}`;
};
const priceLine = (w: BuyRequest) =>
  priceRange(w.price_min_krw_per_kg ?? w.price_krw_per_kg, w.price_max_krw_per_kg ?? w.price_krw_per_kg, w.price_unit);

/** 구매 희망 카드: 주 재질 크게, 품목 작게, 수량, 희망 가격 범위와 협상 여부. */
export function WantCard({ w, go, actions = false, onChanged }: { w: BuyRequest; go: Go; actions?: boolean; onChanged?: () => void }) {
  const a = useAction();
  const price = priceLine(w);
  const key = catalogOf(w.material)?.key ?? CATALOG.find(c => c.material === w.material)?.key ?? w.material.toLowerCase();
  const setStatus = (status: 'open' | 'closed') => void a.run(() => api('buyer', `/buy-requests/${w.id}/status`, 'POST', { status }), () => onChanged?.());
  return (
    <article className={`want-card ${w.status}`}>
      <button className="want-card-open" onClick={() => go({ name: 'want-new', id: w.id })} aria-label={`${w.material} 구매 희망 수정`}>
        <MaterialPicture k={key} />
        <span className="want-copy">
          <strong>{w.material}</strong>
          <small>{w.item}</small>
          <span>{[weight(w.qty_kg) + (w.repeat === 'monthly' ? ' 매월' : ''), w.need_by ? `${dateText(w.need_by)}까지` : ''].filter(Boolean).join(', ')}</span>
        </span>
        <span className="want-price">
          <small>희망 가격</small>
          <b className={price ? '' : 'none'}>{price ?? '미입력'}</b>
          {price && <em className={w.negotiable === false ? 'fixed' : 'nego'}>{w.negotiable === false ? '협상 불가' : '협상 가능'}</em>}
        </span>
      </button>
      {(actions || w.status === 'closed') && <div className="want-foot">
        {w.status === 'closed' && <StatusTag>마감</StatusTag>}
        {actions && <span className="want-actions">
          <button className="text-button" onClick={() => { sessionStorage.setItem('buyer:material', key); go({ name: 'explore' }); }}>맞는 매물 보기</button>
          <button className="text-button" disabled={a.busy} onClick={() => setStatus(w.status === 'open' ? 'closed' : 'open')}>{w.status === 'open' ? '마감' : '다시 열기'}</button>
        </span>}
      </div>}
      <Feedback error={a.error} />
    </article>
  );
}

/** 내 구매 희망 목록. */
export function Wants({ go, back }: { go: Go; back: () => void }) {
  const r = useResource<BuyRequest[]>('buyer', '/me/buy-requests', true);
  const rows = Array.isArray(r.data) ? r.data : [];
  const open = rows.filter(w => w.status === 'open'), closed = rows.filter(w => w.status === 'closed');
  return (
    <>
      <TopBar title="내 구매 희망" back={back} />
      <p className="muted want-lead">사고 싶은 원료를 올려 두면 근처 판매 공장이 보고 매물로 응할 수 있음</p>
      <Feedback {...r} />
      {open.length > 0 && <Section title={`올린 희망 ${open.length}건`}><div className="want-list">{open.map(w => <WantCard key={w.id} w={w} go={go} actions onChanged={() => void r.refresh()} />)}</div></Section>}
      {closed.length > 0 && <Section title="마감"><div className="want-list">{closed.map(w => <WantCard key={w.id} w={w} go={go} actions onChanged={() => void r.refresh()} />)}</div></Section>}
      {!r.loading && !r.error && !rows.length && <EmptyState title="올린 구매 희망 없음" description="품목, 수량, 희망 가격을 올려 판매자를 찾기" action="구매 희망 올리기" onAction={() => go({ name: 'want-new' })} />}
      <BottomBar><AppButton onClick={() => go({ name: 'want-new' })}>구매 희망 올리기</AppButton></BottomBar>
    </>
  );
}

const QTY_PRESETS = [500, 1000, 5000, 10000];

/** 구매 희망 올리기·수정. 품목은 검색 또는 대표 품목에서 고르고, 직접 입력도 된다. */
export function WantForm({ id, go, back }: { id?: number | undefined; go: Go; back: () => void }) {
  const mine = useResource<BuyRequest[]>('buyer', '/me/buy-requests', true);
  const editing = id && Array.isArray(mine.data) ? mine.data.find(w => w.id === id) : undefined;
  if (id && !editing) return <><TopBar title="구매 희망 수정" back={back} /><Feedback {...mine} /></>;
  return <WantEditor key={editing?.id ?? 'new'} initial={editing} go={go} back={back} />;
}

/** 서버 구매 희망 정리 에이전트가 채운 칸(계약 29절). 가격은 원/kg. */
interface WantFields {
  material?: string; item?: string; qty_kg?: number; repeat?: 'once' | 'monthly'; negotiable?: boolean; need_by?: string; note?: string;
  price_min_krw_per_kg?: number; price_max_krw_per_kg?: number; price_unit?: 'kg' | 'ton';
}
interface PriceView { auto: { min: number; max: number } | null; market: { item: string; date: string; low: number; high: number } | null; listings: { count: number; cheapest: number } | null }
interface WantIntake { transcript: string; fields: WantFields; price: PriceView; steps: AgentStep[] }
/** 판매 매물 맞추기(에이전트 13): 같은 재질 판매 중 매물을 상한가, 수량, 거리로 맞춘 결과 */
interface WantMatch { count: number; fit_all: number; matches: { listing: Listing; price_fit: 'in' | 'over' | null; qty_fit: 'enough' | 'part' | null; reasons: string[] }[] }
const errText = (e: unknown) => (e instanceof Error ? e.message : '요청 실패');
const AiTag = ({ on }: { on: boolean | undefined }) => (on ? <span className="ai-tag">AI 입력</span> : null);

function WantEditor({ initial, go, back }: { initial: BuyRequest | undefined; go: Go; back: () => void }) {
  const draftKey = useMemo(() => { const k = sessionStorage.getItem('buyer:wantDraft') ?? ''; sessionStorage.removeItem('buyer:wantDraft'); return k; }, []);
  const start = initial ? (CATALOG.find(c => c.material === initial.material) ?? null) : (draftKey ? catalogOf(draftKey) ?? null : null);
  const [find, setFind] = useState('');
  const [cat, setCat] = useState('');
  const [key, setKey] = useState(start?.key ?? (initial ? 'custom' : ''));
  const [materialText, setMaterialText] = useState(initial?.material ?? start?.material ?? '');
  const [itemText, setItemText] = useState(initial?.item ?? start?.item ?? '');
  const [qtyUnit, setQtyUnit] = useState<'kg' | 'ton'>(initial && initial.qty_kg >= 1000 ? 'ton' : 'kg');
  const [qty, setQty] = useState(initial ? String(initial.qty_kg >= 1000 ? initial.qty_kg / 1000 : initial.qty_kg) : '');
  const [priceUnit, setPriceUnit] = useState<'kg' | 'ton'>(initial?.price_unit ?? 'kg');
  const shownPrice = (perKg: number | null | undefined) => perKg == null ? '' : String(initial?.price_unit === 'ton' ? perKg * 1000 : perKg);
  const [priceMin, setPriceMin] = useState(shownPrice(initial?.price_min_krw_per_kg ?? initial?.price_krw_per_kg));
  const [priceMax, setPriceMax] = useState(shownPrice(initial?.price_max_krw_per_kg ?? initial?.price_krw_per_kg));
  const [negotiable, setNegotiable] = useState(initial?.negotiable !== false);
  const [needBy, setNeedBy] = useState(initial?.need_by ?? '');
  const [repeat, setRepeat] = useState<'once' | 'monthly'>(initial?.repeat ?? 'once');
  const [address, setAddress] = useState(initial?.delivery_address ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const a = useAction();
  const listings = useResource<Listing[]>('buyer', '/listings');
  // 말로 입력과 희망가 추천(서버 에이전트). ai = AI가 채운 칸, 사람이 고치면 표시를 뗀다
  const [ai, setAi] = useState<Record<string, boolean>>({});
  const [steps, setSteps] = useState<AgentStep[] | null>(null);
  const [heard, setHeard] = useState('');
  const [priceWhy, setPriceWhy] = useState('');
  const off = (k: string) => setAi(x => (x[k] ? { ...x, [k]: false } : x));
  const shownIn = (u: 'kg' | 'ton', perKg: number) => String(Math.round(perKg * (u === 'ton' ? 1000 : 1) * 100) / 100);
  const putMaterial = (m: string) => {
    const c = catalogOf(m.toLowerCase());
    if (c) { setKey(c.key); setMaterialText(c.material); setItemText(t => t || c.item); }
    else { setKey('custom'); setMaterialText(m); }
  };
  // 희망가 추천 결과: 말로 가격을 정하지 않았거나 지금 칸이 비었거나 AI가 채운 값이면 범위를 넣는다
  const applyPrice = (p: PriceView | undefined, force: boolean) => {
    const why = [p?.market && `시세 ${p.market.item} ${fmt(p.market.low)}~${fmt(p.market.high)}원/kg`, p?.listings && `판매 중 최저 ${fmt(p.listings.cheapest)}원/kg`].filter(Boolean).join(', ');
    setPriceWhy(why ? `희망가 추천 근거: ${why}` : '');
    if (!p?.auto || !force) return;
    setPriceMin(shownIn(priceUnit, p.auto.min)); setPriceMax(shownIn(priceUnit, p.auto.max));
    setAi(x => ({ ...x, price: true }));
  };
  const applyIntake = (r: WantIntake) => {
    const f = r.fields || {};
    const filled: Record<string, boolean> = {};
    if (f.material) { putMaterial(f.material); filled.material = true; }
    if (f.item) { setItemText(f.item); filled.item = true; }
    if (f.qty_kg) { const t = f.qty_kg >= 1000; setQtyUnit(t ? 'ton' : 'kg'); setQty(String(t ? f.qty_kg / 1000 : f.qty_kg)); filled.qty = true; }
    if (f.repeat) { setRepeat(f.repeat); filled.repeat = true; }
    if (f.price_min_krw_per_kg != null && f.price_max_krw_per_kg != null) {
      const u = f.price_unit ?? 'kg';
      setPriceUnit(u); setPriceMin(shownIn(u, f.price_min_krw_per_kg)); setPriceMax(shownIn(u, f.price_max_krw_per_kg));
      filled.price = true;
    }
    if (f.negotiable != null) { setNegotiable(f.negotiable); filled.negotiable = true; }
    if (f.need_by) { setNeedBy(f.need_by); filled.needBy = true; }
    if (f.note) { setNote(f.note); filled.note = true; }
    setAi(filled);
    applyPrice(r.price, !filled.price);
    setSteps(r.steps || null);
    setHeard(r.transcript || '');
  };
  const v = useVoiceIntake<WantIntake>({
    status: () => api('buyer', '/buy-requests/intake/status'),
    send: body => api<WantIntake>('buyer', '/buy-requests/intake', 'POST', body),
    onResult: applyIntake,
    errorText: errText,
  });
  // 대표 품목을 고르면 희망가 추천 에이전트를 부른다. 사람이 쓴 가격은 덮지 않는다
  const suggestPrice = (material: string) => {
    void api<PriceView & { steps: AgentStep[] }>('buyer', `/buy-requests/price-suggest?material=${encodeURIComponent(material)}`)
      .then(p => { applyPrice(p, (!priceMin && !priceMax) || !!ai.price); setSteps(p.steps); setHeard(''); })
      .catch(() => setPriceWhy(''));
  };
  const delivery = address;

  const picked = key && key !== 'custom' ? catalogOf(key) : undefined;
  const shown = CATALOG.filter(c => (!cat || c.category === CATEGORIES.find(([code]) => code === cat)?.[1]) &&
    (!find.trim() || `${c.material} ${c.item}`.toLowerCase().includes(find.trim().toLowerCase())));
  const pick = (k: string) => {
    const c = catalogOf(k)!;
    setKey(k); setMaterialText(c.material); setItemText(c.item);
    off('material'); off('item');
    suggestPrice(c.material);
  };
  const qtyKg = Number(qty) * (qtyUnit === 'ton' ? 1000 : 1);
  const toKg = (v: string) => (!v ? null : Number(v) / (priceUnit === 'ton' ? 1000 : 1));
  const minKg = toKg(priceMin), maxKg = toKg(priceMax);
  const okPrice = (v: number | null): v is number => v != null && v > 0 && v <= 100000;
  const setUnit = (u: 'kg' | 'ton') => {
    if (u === priceUnit) return;
    const f = u === 'ton' ? 1000 : 1 / 1000;
    const conv = (v: string) => (v ? String(Math.round(Number(v) * f * 100) / 100) : v);
    setPriceMin(conv(priceMin)); setPriceMax(conv(priceMax)); setPriceUnit(u);
  };
  const rangeOk = okPrice(minKg) && okPrice(maxKg) && minKg <= maxKg;
  // 재질, 수량, 상한가가 바뀌면 판매 중인 매물과 맞춰 본다(입력이 멈춘 뒤 한 번)
  const [match, setMatch] = useState<WantMatch | null>(null);
  const matchKey = `${materialText.trim()}|${qtyKg > 0 ? qtyKg : ''}|${okPrice(maxKg) ? maxKg : ''}`;
  useEffect(() => {
    const [m, q, hi] = matchKey.split('|');
    if (!m) { setMatch(null); return undefined; }
    let alive = true;
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ material: m!, ...(q ? { qty_kg: q } : {}), ...(hi ? { price_max: hi } : {}) });
      void api<WantMatch>('buyer', `/buy-requests/match?${qs}`).then(r => { if (alive) setMatch(Array.isArray(r?.matches) ? r : null); }).catch(() => { if (alive) setMatch(null); });
    }, 400);
    return () => { alive = false; clearTimeout(t); };
  }, [matchKey]);
  const market = (listings.data ?? []).filter(l => picked && keyOf(l) === picked.key);
  const cheapest = market.length ? Math.min(...market.map(l => l.price_krw_per_kg)) : null;
  const today = new Date().toISOString().slice(0, 10);
  const errors = [
    !materialText.trim() && '품목 선택 필요',
    !itemText.trim() && '품목 설명 입력 필요',
    !(qtyKg > 0 && qtyKg <= 1_000_000) && '희망 수량 입력 필요 (최대 1,000t)',
    !okPrice(minKg) && '희망 하한가 입력 필요',
    !okPrice(maxKg) && '희망 상한가 입력 필요',
    okPrice(minKg) && okPrice(maxKg) && minKg > maxKg && '하한가는 상한가 이하로',
    needBy && needBy < today && '희망 시기는 오늘 이후',
  ].filter(Boolean) as string[];

  const body = {
    material: materialText.trim(), item: itemText.trim(), waste_code: picked?.code ?? null,
    qty_kg: Math.round(qtyKg * 1000) / 1000,
    price_min_krw_per_kg: minKg == null ? null : Math.round(minKg * 100) / 100,
    price_max_krw_per_kg: maxKg == null ? null : Math.round(maxKg * 100) / 100,
    price_krw_per_kg: maxKg == null ? null : Math.round(maxKg * 100) / 100,
    negotiable, price_unit: priceUnit, need_by: needBy || null, repeat, delivery_address: delivery || null, note,
  };
  const submit = () => void a.run(
    () => api('buyer', initial ? `/buy-requests/${initial.id}` : '/buy-requests', initial ? 'PUT' : 'POST', body),
    () => go({ name: 'wants' }),
  );
  const remove = () => {
    if (!initial || !window.confirm('이 구매 희망 삭제 확인')) return;
    void a.run(() => api('buyer', `/buy-requests/${initial.id}`, 'DELETE'), () => go({ name: 'wants' }));
  };

  return (
    <>
      <TopBar title={initial ? '구매 희망 수정' : '구매 희망 올리기'} back={back} />
      <div className="want-ai">
        <VoiceInput v={v} example="예: PP 사출 스크랩 5톤, kg당 300에서 350원, 매달, 협상 가능" />
        <AgentSteps steps={steps} heard={heard} footer="AI 입력 칸은 확인 후 올리기, 자동 제출 없음" />
      </div>
      <Section title="1. 구매할 원료">
        <SearchBox value={find} placeholder="품목, 재질로 찾기 (예: PP, 구리)" onChange={e => setFind(e.target.value)} />
        <div className="segmented" role="tablist" aria-label="분류">
          {CATEGORIES.map(([c, name]) => <button key={c} role="tab" aria-selected={cat === c} onClick={() => setCat(c)}>{name}</button>)}
        </div>
        <div className="material-grid" role="group" aria-label="대표 품목">
          {shown.map(c => (
            <button key={c.key} aria-pressed={key === c.key} onClick={() => pick(c.key)}>
              <MaterialPicture k={c.key} size={36} /><strong>{c.material}</strong><small>{c.category}</small>
            </button>
          ))}
          <button aria-pressed={key === 'custom'} onClick={() => { setKey('custom'); if (picked) { setMaterialText(find.trim()); setItemText(''); } }}>
            <span className="buyer-listing-picture" style={{ width: 36, height: 36 }} aria-hidden="true">+</span><strong>직접 입력</strong><small>목록에 없음</small>
          </button>
        </div>
        {key && (
          <AppCard className="card16 want-picked">
            <Field label={<>주 재질 (크게 표시)<AiTag on={ai.material} /></>} value={materialText} maxLength={100} disabled={key !== 'custom'} placeholder="예) PP, 스테인리스" onChange={e => { setMaterialText(e.target.value); off('material'); }} />
            <Field label={<>품목 설명 (작게 표시)<AiTag on={ai.item} /></>} value={itemText} maxLength={100} placeholder="예) 사출 스크랩, 분쇄품" onChange={e => { setItemText(e.target.value); off('item'); }} />
            {picked && <p className="muted tiny">{cheapest != null ? `지금 판매 중 ${market.length}건, 최저 ${priceParts(cheapest, 'kg').value}원/kg (${priceParts(cheapest, 'ton').value}원/t)` : '지금 판매 중인 매물 없음'}</p>}
          </AppCard>
        )}
      </Section>

      <Section title="2. 필요 수량">
        <div className="want-row">
          <Field label={<>희망 수량<AiTag on={ai.qty} /></>} type="number" inputMode="decimal" min="0" step="any" value={qty} onChange={e => { setQty(e.target.value); off('qty'); }} placeholder={qtyUnit === 'ton' ? '예) 5' : '예) 800'} />
          <div className="segmented want-unit" role="group" aria-label="수량 단위">
            <button aria-pressed={qtyUnit === 'kg'} onClick={() => setQtyUnit('kg')}>kg</button>
            <button aria-pressed={qtyUnit === 'ton'} onClick={() => setQtyUnit('ton')}>t</button>
          </div>
        </div>
        <div className="want-presets">
          {QTY_PRESETS.map(kg => <button key={kg} onClick={() => { setQtyUnit(kg >= 1000 ? 'ton' : 'kg'); setQty(String(kg >= 1000 ? kg / 1000 : kg)); }}>{weight(kg)}</button>)}
        </div>
        <div className="segmented" role="group" aria-label="구매 주기">
          <button aria-pressed={repeat === 'once'} onClick={() => { setRepeat('once'); off('repeat'); }}>한 번만</button>
          <button aria-pressed={repeat === 'monthly'} onClick={() => { setRepeat('monthly'); off('repeat'); }}>매월 정기 구매</button>
        </div>
      </Section>

      <Section title="3. 희망 가격">
        <div className="segmented want-unit-toggle" role="group" aria-label="가격 단위">
          <button aria-pressed={priceUnit === 'kg'} onClick={() => setUnit('kg')}>원/kg</button>
          <button aria-pressed={priceUnit === 'ton'} onClick={() => setUnit('ton')}>원/t</button>
        </div>
        <div className="want-range">
          <Field label={<>{`하한가 (원/${priceUnit === 'ton' ? 't' : 'kg'})`}<AiTag on={ai.price} /></>} type="number" inputMode="decimal" min="0" step="any" value={priceMin}
            placeholder={priceUnit === 'ton' ? '예) 300000' : '예) 300'} onChange={e => { setPriceMin(e.target.value); off('price'); }} />
          <span className="want-range-dash" aria-hidden="true">~</span>
          <Field label={<>{`상한가 (원/${priceUnit === 'ton' ? 't' : 'kg'})`}<AiTag on={ai.price} /></>} type="number" inputMode="decimal" min="0" step="any" value={priceMax}
            placeholder={priceUnit === 'ton' ? '예) 350000' : '예) 350'} onChange={e => { setPriceMax(e.target.value); off('price'); }} />
        </div>
        <div className="segmented want-nego" role="group" aria-label="가격 협상">
          <button aria-pressed={negotiable} onClick={() => { setNegotiable(true); off('negotiable'); }}>협상 가능</button>
          <button aria-pressed={!negotiable} onClick={() => { setNegotiable(false); off('negotiable'); }}>협상 불가</button>
        </div>
        {(ai.negotiable || ai.repeat) && <p className="muted tiny"><span className="ai-tag">AI 입력</span> {[ai.repeat && '구매 주기', ai.negotiable && '협상 여부'].filter(Boolean).join(', ')}</p>}
        {priceWhy && <p className="ai-why">{priceWhy}</p>}
        <p className="muted tiny want-nego-help">{negotiable ? '판매자가 범위 밖 가격도 제안할 수 있음' : '범위 안의 가격으로만 거래'}</p>
        {rangeOk && (
          <AppCard className="card16"><div className="stack">
            <InfoRow label="희망 가격" value={priceRange(minKg, maxKg, priceUnit) ?? ''} />
            <InfoRow label="환산" value={priceRange(minKg, maxKg, priceUnit === 'ton' ? 'kg' : 'ton') ?? ''} />
            {qtyKg > 0 && <InfoRow label={`${weight(qtyKg)} 예상 원료비`} value={minKg === maxKg ? `${fmt(Math.round(maxKg * qtyKg))}원` : `${fmt(Math.round(minKg * qtyKg))}~${fmt(Math.round(maxKg * qtyKg))}원`} />}
            {cheapest != null && <InfoRow label="현재 최저 판매가" value={`${priceParts(cheapest, priceUnit).value}${priceParts(cheapest, priceUnit).suffix}${cheapest <= maxKg ? ', 범위 안 매물 있음' : ''}`} />}
          </div></AppCard>
        )}
      </Section>

      {match && (
        <Section title="판매 중 맞는 매물">
          <p className="muted tiny want-match-head"><span className="ai-tag">AI 맞춤</span>
            {match.count ? `같은 재질 판매 중 ${match.count}건, 가격과 수량 모두 맞음 ${match.fit_all}건` : '지금 판매 중인 같은 재질 매물 없음'}</p>
          {match.matches.length > 0 && (
            <ListingList>{match.matches.map(m => (
              <div key={m.listing.id} className={`want-match${m.price_fit === 'over' || m.qty_fit === 'part' ? ' is-partial' : ''}`}>
                <ListingRow l={m.listing} go={go} />
                <p className="want-match-why">{m.reasons.join(', ')}</p>
              </div>
            ))}</ListingList>
          )}
        </Section>
      )}

      <Section title="4. 받는 곳과 시기">
        <AddressPicker value={delivery} onChange={setAddress} />
        <Field label={<>희망 시기 (선택)<AiTag on={ai.needBy} /></>} type="date" min={today} value={needBy} onChange={e => { setNeedBy(e.target.value); off('needBy'); }} />
        <label className="field">
          <span>판매자에게 전할 조건 (선택)<AiTag on={ai.note} /></span>
          <textarea maxLength={500} value={note} onChange={e => { setNote(e.target.value); off('note'); }} placeholder="예) 분쇄품 우선, 세척 여부, 포장 형태" />
        </label>
      </Section>

      {errors.length > 0 && <p className="muted tiny want-errors">{errors[0]}</p>}
      <Feedback {...a} />
      <BottomBar>
        {initial && <AppButton outlined disabled={a.busy} onClick={remove}>삭제</AppButton>}
        <AppButton disabled={a.busy || errors.length > 0} onClick={submit}>{initial ? '수정 저장' : '구매 희망 올리기'}</AppButton>
      </BottomBar>
    </>
  );
}
