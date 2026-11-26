import './listing.css';
import './seller.css';
import { dateText } from "../../shared/format";
import type { BuyerListing } from "../../shared/contracts";
import { addCart, useInCart } from "./cartStore";
import { useEffect, useState, type ReactNode } from "react";
import { api, session, useAction, useResource } from "../../shared/api/client";
import { BottomBar, AppButton, AppCard, Feedback, Ic, InfoRow, TopBar } from "../../shared/ui/index";
import { fmt, type Go, type Listing } from "../../types";
import { PriceChart } from "../../shared/screens/market";
import { BottomSheet } from "../../shared/ui/BottomSheet";
import { examplePhoto } from "./photos";
import { iconOf, itemName, keyOf, mainMaterial, priceParts, weight } from "./catalog";

export function ListingList({ children }: { children: ReactNode }) {
  return <div className="buyer-listing-list">{children}</div>;
}

export function MaterialPicture({ k, size = 48 }: { k: string; size?: number }) {
  const icon = iconOf(k);
  return <span className="buyer-listing-picture" style={{ width: size, height: size }} aria-hidden="true">
    {icon ? <img src={`/icons/${icon}`} alt="" /> : <Ic name="tab_list_on" size={24} />}
  </span>;
}

const TRANSPORT = {
  matched: { title: "판매자 화물차 운송", text: "판매자가 화물차를 구해 입고지까지 보냄" },
  own: { title: "판매자 회사 차량", text: "판매자 회사 차량으로 입고지까지 보냄" },
} as const;

/** 판매자가 매물에 적은 안내: 판매 수량, 출고일과 시간, 운송 방법, 메모. */
function SellerTerms({ l }: { l: Listing }) {
  const t = TRANSPORT[l.terms?.transport ?? "own"];
  const today = new Date().toISOString().slice(0, 10);
  const notes = [l.pickup_note?.trim(), ...(l.seller_notes ?? [])].filter((x, i, all): x is string => !!x && all.indexOf(x) === i);
  return (
    <AppCard className="card16 seller-terms">
      <h3>판매자 안내</h3>
      <div className="stack">
        <InfoRow label="판매 수량" value={weight(l.total_kg)} />
        <InfoRow label="출고 가능일" value={l.available_from && l.available_from > today ? `${dateText(l.available_from)}부터` : "바로 출고"} />
        <InfoRow label="출고 시간" value={l.terms?.ship_hours ?? "판매자와 조율"} />
        <InfoRow label="하차 지원" value={[l.terms?.unload_forklift && "지게차", l.terms?.unload_crane && "크레인"].filter(Boolean).join(", ") || "없음, 입고지 장비로 하차"} />
      </div>
      <div className="seller-terms-ship">
        <span className="seller-terms-ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20"><path d="M3 6h11v9H3zM14 9h4l3 3v3h-7z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><circle cx="7" cy="17" r="1.8" fill="currentColor" /><circle cx="17" cy="17" r="1.8" fill="currentColor" /></svg>
        </span>
        <span>
          <small>운송 방법</small>
          <b>{t.title}</b>
          <em>{t.text}, 운임은 판매자 부담</em>
        </span>
      </div>
      {notes.length > 0 && (
        <div className="seller-terms-note">
          <small>판매자 메모</small>
          {notes.map(n => <p key={n}>{n}</p>)}
        </div>
      )}
    </AppCard>
  );
}

/** 별점 한 줄: ★ 4.7 (12). 후기가 없으면 회색 빈 별(★ 0.0). */
export function Stars({ rating, count, size = 13 }: { rating: number | null | undefined; count?: number | undefined; size?: number }) {
  if (rating == null) return (
    <span className="seller-stars none" style={{ fontSize: size }} aria-label="후기 없음">
      <span aria-hidden="true">★</span><b aria-hidden="true">0.0</b>
    </span>
  );
  return (
    <span className="seller-stars" style={{ fontSize: size }} aria-label={`평점 ${rating.toFixed(1)}${count != null ? `, 후기 ${count}개` : ""}`}>
      <span aria-hidden="true">★</span><b>{rating.toFixed(1)}</b>{count != null && <small>({fmt(count)})</small>}
    </span>
  );
}

/** 수거 시작일을 '오늘부터', '11.12부터'처럼 짧게. */
function pickupText(from: string | null | undefined): string | null {
  if (!from) return null;
  const d = new Date(from);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return d <= today ? "바로 수거 가능" : `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}부터 수거`;
}

/**
 * 판매 매물 카드(쇼핑몰 목록 방식):
 * 그림 | 주 재질(크게) + 품목 | 판매 공장, 별점(후기 있을 때), 지역 | 무게, 시세 비교, 수거일 칩 | kg당 가격 + 전체 원료비
 * 오른쪽 위에는 찜 하트(카드 밖 버튼).
 */
export function ListingRow({ l, go, add = false }: { l: Listing; go: Go; add?: boolean; shell?: boolean }) {
  const p = priceParts(l.price_krw_per_kg, "kg");
  const ended = !["posted", "bundle_wait"].includes(l.status);
  const pct = l.price_vs_market_pct;
  const pickup = pickupText(l.available_from);
  const total = Math.round(l.total_kg * l.price_krw_per_kg);
  return <article className={`buyer-listing-row${ended ? " ended" : ""}`}>
    <button type="button" className="buyer-listing-open" onClick={() => go({ name: 'listing', id: l.id })}
      aria-label={`${mainMaterial(l)} ${itemName(l)}, ${weight(l.total_kg)}, ${p.value}${p.suffix}`}>
      <MaterialPicture k={keyOf(l)} size={64} />
      <span className="buyer-listing-copy">
        <span className="buyer-listing-title">
          <strong className="buyer-listing-material">{mainMaterial(l)}</strong>
          <span className="buyer-listing-item">{itemName(l)}</span>
        </span>
        {l.factory_name && <span className="buyer-listing-factory">{l.factory_name}</span>}
        {(l.factory_name || l.region) && (
          <span className="buyer-listing-seller">
            {l.factory_name && <Stars rating={l.factory_rating} count={l.factory_rating_count} size={12} />}
            {l.region && <span className="buyer-listing-region">{l.region}</span>}
          </span>
        )}
        <span className="buyer-listing-chips">
          <span className="bl-chip weight">{weight(l.total_kg)}</span>
          {pct != null && pct !== 0 && <span className={`bl-chip ${pct < 0 ? "good" : "bad"}`}>시세보다 {Math.abs(pct)}% {pct < 0 ? "저렴" : "비쌈"}</span>}
          {pickup && <span className="bl-chip">{pickup}</span>}
          {ended && <span className="bl-chip ended">판매 종료</span>}
        </span>
        <span className="buyer-listing-price">
          <span className="buyer-listing-main"><b>{p.value}</b><small>{p.suffix}</small></span>
          <small className="buyer-listing-total">전체 {fmt(total)}원</small>
        </span>
      </span>
    </button>
    {add && <div className="buyer-listing-cart"><FavoriteButton l={l} /></div>}
  </article>;
}

/** 목록에서 바로 찜하기(하트). 장바구니 담기는 상세에서 내용을 보고 한다. */
export function FavoriteButton({ l }: { l: Listing }) {
  const [on, setOn] = useState(!!l.favorite);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setOn(!!l.favorite); }, [l.favorite]);
  const toggle = () => {
    setBusy(true);
    const next = !on;
    setOn(next);
    void api("buyer", `/favorites/${l.id}`, next ? "PUT" : "DELETE")
      .catch(() => setOn(!next))
      .finally(() => setBusy(false));
  };
  return <button type="button" className={`row-heart${on ? " on" : ""}`} aria-label={`${mainMaterial(l)} ${on ? "찜 해제" : "찜하기"}`} aria-pressed={on} disabled={busy} onClick={toggle}>
    <span aria-hidden="true">{on ? "♥" : "♡"}</span>
  </button>;
}

export function CartButton({ l, plus = false }: { l: Listing; plus?: boolean }) {
  const added = useInCart(l.id);
  const label = !["posted", "bundle_wait"].includes(l.status) ? '판매 종료' : added ? '담김' : '담기';
  return <button className="add-button" disabled={label !== '담기'} aria-label={`${mainMaterial(l)} ${label}`} onClick={() => addCart(l)}>{plus && label === '담기' && <span aria-hidden="true">+</span>}{label}</button>;
}

/** 판매자가 올린 원료 사진. */
export function BagPhoto({ id, path }: { id: number; path?: string }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true, objectUrl = "";
    void fetch(path ?? `/v1/bags/${id}/photo`, { headers: { Authorization: `Bearer ${session("buyer")?.access_token}` } })
      .then(async (r) => {
        if (!r.ok) {
          if (r.status === 401) {
            sessionStorage.setItem("janjaemi:expired:buyer", "1");
            sessionStorage.removeItem("janjaemi:buyer");
            window.dispatchEvent(new CustomEvent("session-expired", { detail: "buyer" }));
          }
          throw new Error("사진 불러오기 실패");
        }
        return r.blob();
      })
      .then((b) => { if (active) { objectUrl = URL.createObjectURL(b); setUrl(objectUrl); } })
      .catch((e) => { if (active) setError((e as Error).message); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, path]);
  return url ? <img src={url} alt="판매 원료 사진" /> : <span>{error || "사진 불러오는 중…"}</span>;
}

/** 매물 상세(당근 방식): 사진 → 판매 공장 줄(별점, 문의) → 원료 정보 → 아래 고정 막대(찜, 가격, 담기, 구매 요청). */
export function ListingDetail({ id, go, back }: { id: number; go: Go; back: () => void }) {
  const r = useResource<BuyerListing>("buyer", `/listings/${id}`);
  const a = useAction();
  const l = r.data;
  const added = useInCart(id);
  const open = !!l && ["posted", "bundle_wait"].includes(l.status);
  const photo = l?.bags?.find((b) => b.has_photo);
  // 판매자가 올린 사진 여러 장(최대 5장)
  const photoIds = (l?.bags ?? []).flatMap((b) => (b as { photo_ids?: number[] }).photo_ids ?? []).slice(0, 5);
  // 판매자 사진이 없으면 품목 예시 사진(출처 표시)
  // 같은 품목 판매 매물 안에서 몇 번째인지로 사진을 고른다(회사마다 다른 사진)
  const all = useResource<Listing[]>("buyer", "/listings");
  const same = (Array.isArray(all.data) ? all.data : []).filter((x) => l && keyOf(x) === keyOf(l)).map((x) => x.id).sort((a, b) => a - b);
  const rank = l ? (same.includes(l.id) ? same.indexOf(l.id) : l.factory_id) : 0;
  const example = l ? examplePhoto(keyOf(l), rank) : undefined;
  const [cartSheet, setCartSheet] = useState(false);
  const toggleFavorite = () => void a.run(() => api("buyer", `/favorites/${id}`, l?.favorite ? "DELETE" : "PUT"), () => void r.refresh());
  return (
    <>
      <TopBar title="매물 상세" back={back} />
      <Feedback {...r} />
      <Feedback {...a} />
      {l && (
        <>
          {photoIds.length > 1 ? (
            <div className="photo photo-gallery" aria-label={`판매자 사진 ${photoIds.length}장`}>
              <div className="photo-gallery-track">
                {photoIds.map((pid) => <div key={pid} className="photo-gallery-slide"><BagPhoto id={pid} path={`/v1/bag-photos/${pid}`} /></div>)}
              </div>
              <span className="photo-gallery-count">사진 {photoIds.length}장, 옆으로 넘기기</span>
            </div>
          ) : photo || !example ? (
            <div className="photo">
              {photo ? <BagPhoto id={photo.id} /> : <><Ic name="photo_large" /><span>등록된 사진 없음</span></>}
            </div>
          ) : (
            <figure className="example-photo">
              <img src={example.src} alt={`${mainMaterial(l)} 예시 사진`} />
              <span className="example-badge">예시 사진</span>
              <figcaption>
                사진 {example.artist}, <a href={example.page} target="_blank" rel="noreferrer">{example.source}</a>, <a href={example.licenseUrl} target="_blank" rel="noreferrer">{example.license}</a>
              </figcaption>
            </figure>
          )}
          <div className="seller-row-wrap">
            <button type="button" className="seller-row" onClick={() => go({ name: "seller", id: l.factory_id })} aria-label={`${l.factory_name} 판매 공장 정보 보기`}>
              <span className="seller-avatar" aria-hidden="true"><Ic name="menu_factory" size={22} /></span>
              <span>
                <b>{l.factory_name}</b>
                <small>{l.region}</small>
              </span>
              <Stars rating={l.factory_rating} count={l.factory_rating_count} size={14} />
              <Ic name="chevron_right" size={16} />
            </button>
          </div>
          <div className="buyer-detail-head">
            <MaterialPicture k={keyOf(l)} size={56} />
            <div>
              <h2>{mainMaterial(l)}</h2>
              <p>{itemName(l)}</p>
            </div>
          </div>
          <AppCard className="card16 buyer-price-card">
            <div className="buyer-price-main">
              <span><b>{priceParts(l.price_krw_per_kg, "kg").value}</b>원/kg</span>
              <small>전체 {weight(l.total_kg)}, {fmt(Math.round(l.total_kg * l.price_krw_per_kg))}원</small>
            </div>
            {l.market && (
              <div className="buyer-market">
                <div className="buyer-market-head">
                  <span>{l.market.item} 시세</span>
                  <b>{fmt(l.market.price)}<small>{l.market.unit || "원/kg"}</small></b>
                </div>
                <div className="buyer-market-chart"><PriceChart appRole="buyer" item={l.market.item} /></div>
                {l.price_vs_market_pct != null && (
                  <small className={`buyer-market-diff ${l.price_vs_market_pct > 0 ? "up" : l.price_vs_market_pct < 0 ? "down" : ""}`}>
                    이 매물은 시세보다 {Math.abs(l.price_vs_market_pct)}% {l.price_vs_market_pct > 0 ? "비쌈" : l.price_vs_market_pct < 0 ? "저렴" : "같음"}
                  </small>
                )}
              </div>
            )}
          </AppCard>
          <SellerTerms l={l} />
          <button type="button" className="detail-ask" onClick={() => go({ name: "inquiry-new", id })}>판매자에게 문의하기</button>
          <BottomBar>
            <div className="detail-bar">
              <button type="button" className="detail-heart" aria-label={l.favorite ? "찜 해제" : "찜하기"} aria-pressed={!!l.favorite} disabled={a.busy} onClick={toggleFavorite}>
                <span aria-hidden="true">{l.favorite ? "♥" : "♡"}</span>
              </button>
              <span className="detail-divider" aria-hidden="true" />
              <span className="detail-price">
                <b>{priceParts(l.price_krw_per_kg, "kg").value}원/kg</b>
                <small>전체 {fmt(Math.round(l.total_kg * l.price_krw_per_kg))}원</small>
              </span>
              <span className="detail-actions">
                <AppButton outlined disabled={!open} onClick={() => { if (added) { go({ name: "cart" }); return; } addCart(l); setCartSheet(true); }}>
                  {!open ? "판매 종료" : added ? "장바구니 보기" : "장바구니 담기"}
                </AppButton>
                <AppButton disabled={!open} onClick={() => go({ name: "purchase", id })}>구매 요청</AppButton>
              </span>
            </div>
          </BottomBar>
          {cartSheet && (
            <BottomSheet title="장바구니 담기 완료" onClose={() => setCartSheet(false)}>
              <div className="cart-added">
                <MaterialPicture k={keyOf(l)} size={44} />
                <span><b>{mainMaterial(l)}</b><small>{itemName(l)}, {weight(l.total_kg)}, {priceParts(l.price_krw_per_kg, "kg").value}원/kg</small></span>
              </div>
              <div className="cart-added-actions">
                <AppButton outlined onClick={() => { setCartSheet(false); go({ name: "cart" }); }}>장바구니 보기</AppButton>
                <AppButton onClick={() => { setCartSheet(false); go({ name: "explore" }); }}>다른 매물 더 보기</AppButton>
              </div>
            </BottomSheet>
          )}
        </>
      )}
    </>
  );
}
