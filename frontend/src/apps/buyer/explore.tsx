import './explore.css';
import { useMemo, useState } from "react";
import { useResource } from "../../shared/api/client";
import { BottomSheet } from '../../shared/ui/BottomSheet';
import { Empty, Feedback, Ic, SearchBox, TopBar } from "../../shared/ui/index";
import { fmt, type Company, type Go, type Listing } from "../../types";
import { ListingList, ListingRow, MaterialPicture } from './listing';
import { CATALOG, CATEGORIES, categoryOf, itemName, keyOf, mainMaterial, priceParts, type PriceUnit } from './catalog';

const DISTANCES = [null, 5, 10, 30] as const;
const SORTS = [['recent', '최신 순'], ['distance', '가까운 순'], ['price', '가격 낮은 순']] as const;

export function Explore({ go, favorites = false }: { go: Go; favorites?: boolean }) {
  return favorites ? <Favorites go={go} /> : <Search go={go} />;
}

interface Chip { key: string; material: string; item: string; category: string; count: number; cheapest: number | null }

/** 매물: 검색 또는 대표 품목 선택 → 판매 중인 원료 목록(주 재질 크게, 품목 작게, kg당 가격). */
function Search({ go }: { go: Go }) {
  const [q, setQ] = useState(() => sessionStorage.getItem("buyer:search") ?? "");
  const [cat, setCat] = useState("");
  const [mat, setMat] = useState(() => { const m = sessionStorage.getItem("buyer:material") ?? ""; sessionStorage.removeItem("buyer:material"); return m; });
  const [region, setRegion] = useState("");
  const [maxKm, setMaxKm] = useState<number | null>(null);
  const [sellers, setSellers] = useState<number[]>([]);
  const [sort, setSort] = useState("recent");
  const unit: PriceUnit = 'kg';
  const [sheet, setSheet] = useState(false);
  const r = useResource<Listing[]>("buyer", `/listings?${new URLSearchParams({ sort })}`, true);
  const me = useResource<Company>("buyer", "/me/profile", true).data;
  const all = useMemo(() => r.data ?? [], [r.data]);

  const text = q.trim().toLowerCase();
  const haystack = (l: Listing) => `${mainMaterial(l)} ${itemName(l)} ${l.waste_name ?? ''} ${l.target_material ?? ''} ${l.factory_name ?? ''} ${l.region ?? ''} ${CATALOG.find(c => c.key === keyOf(l))?.item ?? ''}`.toLowerCase();
  const match = (l: Listing, skip?: 'material' | 'seller') =>
    (!cat || l.waste_code.startsWith(cat)) && (skip === 'material' || !mat || keyOf(l) === mat) &&
    (!text || haystack(l).includes(text)) && (!region || l.region === region) &&
    (maxKm == null || (l.distance_km ?? Infinity) <= maxKm) && (skip === 'seller' || !sellers.length || sellers.includes(l.factory_id));
  const rows = all.filter(l => match(l));

  // 대표 품목 + 매물에만 있는 품목. 매물 수와 최저가는 다른 조건(분류·검색·지역)을 반영한다.
  const chips: Chip[] = useMemo(() => {
    const base = all.filter(l => match(l, 'material'));
    const known = CATALOG.map(c => ({ key: c.key, material: c.material, item: c.item, category: c.category }));
    const extra = Array.from(new Map(all.filter(l => !CATALOG.some(c => c.key === keyOf(l)))
      .map(l => [keyOf(l), { key: keyOf(l), material: mainMaterial(l), item: itemName(l), category: categoryOf(l.waste_code) }])).values());
    return [...known, ...extra]
      .filter(c => !cat || c.category === CATEGORIES.find(([code]) => code === cat)?.[1])
      .filter(c => !text || `${c.material} ${c.item}`.toLowerCase().includes(text) || base.some(l => keyOf(l) === c.key))
      .map(c => {
        const same = base.filter(l => keyOf(l) === c.key);
        return { ...c, count: same.length, cheapest: same.length ? Math.min(...same.map(l => l.price_krw_per_kg)) : null };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, cat, text, region, maxKm, sellers]);

  const picked = chips.find(c => c.key === mat) ?? (mat ? { key: mat, material: mat.toUpperCase(), item: '', category: '', count: 0, cheapest: null } : null);
  const factories = Array.from(new Map(all.filter(l => match(l, 'seller')).map(l => [l.factory_id, l.factory_name ?? `공장 ${l.factory_id}`])));
  const regions = Array.from(new Set(all.map(l => l.region).filter((v): v is string => !!v)));
  const filterCount = [region, maxKm, sellers.length].filter(Boolean).length;
  const applied = [text && `‘${q.trim()}’`, picked?.material, region, maxKm && `${maxKm}km 이내`, sellers.length && `판매처 ${sellers.length}곳`].filter(Boolean);
  const reset = () => { setQ(''); sessionStorage.removeItem('buyer:search'); setCat(''); setMat(''); setRegion(''); setMaxKm(null); setSellers([]); };
  const wantFor = (key: string) => { sessionStorage.setItem('buyer:wantDraft', key); go({ name: 'want-new' }); };
  const cheapestText = (n: number | null) => n == null ? '판매 없음' : `${priceParts(n, unit).value}${priceParts(n, unit).suffix}부터`;

  return (
    <div className="explore">
      <header className="explore-hero">
        <small>{me ? `${me.name}님, 입고지 ${me.region ?? '확인 중'}` : '매물'}</small>
        <h1>원하는 원료 찾기</h1>
      </header>

      <section className="search-card" aria-label="매물 찾기">
        <SearchBox value={q} placeholder="품목, 재질, 판매처 찾기" onChange={e => { setQ(e.target.value); sessionStorage.setItem('buyer:search', e.target.value); }} />
        <div className="segmented" role="tablist" aria-label="분류">
          {CATEGORIES.map(([c, name]) => (
            <button key={c} role="tab" aria-selected={cat === c} onClick={() => { setCat(c); setMat(''); }}>{name}</button>
          ))}
        </div>
        <div className="material-grid" role="group" aria-label="대표 품목">
          {chips.map(c => (
            <button key={c.key} aria-pressed={mat === c.key} className={c.count ? '' : 'none'} onClick={() => setMat(mat === c.key ? '' : c.key)}
              aria-label={`${c.material}, ${c.count ? `매물 ${c.count}건` : '판매 없음'}`}>
              <MaterialPicture k={c.key} size={36} />
              <strong>{c.material}</strong>
              <small>{c.count ? `${c.count}건` : '없음'}</small>
            </button>
          ))}
        </div>
        {!chips.length && <p className="muted tiny">‘{q}’에 맞는 대표 품목 없음, 아래 결과 또는 구매 희망 등록</p>}
      </section>

      <div className="results-head">
        <h2>판매 중 {r.data && !r.error && <b>{fmt(rows.length)}건</b>}</h2>
        <div className="results-tools">
          <button className="chip-button" onClick={() => setSheet(true)}>
            {SORTS.find(([s]) => s === sort)?.[1]}{filterCount ? `, 필터 ${filterCount}` : ''}<Ic name="chevron_down" size={14} />
          </button>
        </div>
      </div>
      {applied.length > 0 && r.data && !r.error && (
        <p className="applied-bar">
          <span>{fmt(all.length)}건 중 {fmt(rows.length)}건, {applied.join(', ')}</span>
          <button className="text-button" onClick={reset}>초기화</button>
        </p>
      )}
      <Feedback {...r} />
      {rows.length > 0 && <ListingList>{rows.map(l => <ListingRow key={l.id} l={l} go={go} add />)}</ListingList>}
      {!r.loading && !r.error && !rows.length && (
        <div className="want-empty">
          <b>{picked ? `지금 판매 중인 ${picked.material} 없음` : '조건에 맞는 매물 없음'}</b>
          <p>구매 희망을 올리면 판매자가 보고 매물로 응할 수 있음</p>
          <button className="search-cta" onClick={() => wantFor(picked?.key ?? '')}><Ic name="plus_dark" size={18} />{picked ? `${picked.material} 구매 희망 올리기` : '구매 희망 올리기'}</button>
        </div>
      )}
      {rows.length > 0 && (
        <button className="want-banner" onClick={() => wantFor(mat)}>
          <span><b>원하는 조건 직접 올리기</b><small>품목, 수량, 희망 가격을 올려 두면 판매자가 먼저 연락</small></span>
          <Ic name="chevron_right" size={18} />
        </button>
      )}

      {sheet && (
        <BottomSheet
          title="정렬, 필터"
          sub={`${picked ? picked.material : '전체 품목'}, ${me?.region ?? ''} 입고`}
          onClose={() => setSheet(false)}
          footer={<>
            <button className="sheet-reset" onClick={() => { setRegion(''); setMaxKm(null); setSellers([]); }}>초기화</button>
            <button className="sheet-apply" onClick={() => setSheet(false)}>매물 {fmt(rows.length)}건 보기</button>
          </>}
        >
          <h3 className="sheet-label">정렬</h3>
          <div className="segmented">
            {SORTS.map(([s, name]) => <button key={s} aria-pressed={sort === s} onClick={() => setSort(s)}>{name}</button>)}
          </div>
          {regions.length > 1 && <>
            <h3 className="sheet-label">판매 공장 지역</h3>
            <div className="segmented">
              {['', ...regions].map(v => <button key={v} aria-pressed={region === v} onClick={() => setRegion(v)}>{v || '전체'}</button>)}
            </div>
          </>}
          <h3 className="sheet-label">내 공장까지 거리</h3>
          <div className="segmented">
            {DISTANCES.map(d => <button key={d ?? 0} aria-pressed={maxKm === d} onClick={() => setMaxKm(d)}>{d ? `${d}km` : '무관'}</button>)}
          </div>
          <h3 className="sheet-label">판매 공장</h3>
          <div className="pick-list">
            {factories.map(([id, name]) => {
              const on = sellers.includes(id);
              const own = all.filter(l => l.factory_id === id && match(l, 'seller'));
              return (
                <button key={id} aria-pressed={on} onClick={() => setSellers(on ? sellers.filter(s => s !== id) : [...sellers, id])}>
                  <Ic name="menu_factory" size={18} /><span>{name}</span>
                  <small>{cheapestText(Math.min(...own.map(l => l.price_krw_per_kg)))}</small>
                </button>
              );
            })}
            {!factories.length && <Empty>판매 공장 없음</Empty>}
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

/** 찜한 매물. */
function Favorites({ go }: { go: Go }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("recent");
  const r = useResource<Listing[]>("buyer", "/me/favorites", true);
  const rows = (r.data ?? []).filter(l => `${mainMaterial(l)} ${itemName(l)} ${l.factory_name} ${l.region}`.toLowerCase().includes(q.toLowerCase()));
  rows.sort((a, b) => sort === "price" ? a.price_krw_per_kg - b.price_krw_per_kg : sort === "recent" ? b.id - a.id : (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));
  return (
    <>
      <TopBar title="찜한 매물" back={() => go({ name: "my" })} />
      <SearchBox value={q} placeholder="품목, 재질, 판매처로 찾기" onChange={(e) => setQ(e.target.value)} />
      <div className="filter-row">
        <select aria-label="정렬" value={sort} onChange={(e) => setSort(e.target.value)}>
          {SORTS.map(([v, name]) => <option key={v} value={v}>{name}</option>)}
        </select>
      </div>
      <Feedback {...r} />
      <ListingList>{rows.map((l) => <ListingRow key={l.id} l={l} go={go} add />)}</ListingList>
      {!r.loading && !r.error && !rows.length && <Empty>조건에 맞는 매물 없음</Empty>}
    </>
  );
}
