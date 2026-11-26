import './seller.css';
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useResource } from "../../shared/api/client";
import { tileUrl } from "../../shared/ui/mapTiles";
import { Empty, Feedback, Ic, StatusTag, TopBar } from "../../shared/ui/index";
import { fmt, type Go, type Listing } from "../../types";
import { ListingList, ListingRow, Stars } from "./listing";

export interface SellerInfo {
  id: number; name: string; ceo_name: string | null; intro: string | null; biz_no: string; phone: string | null;
  industry: string | null; region: string | null; address: string | null; lat: number; lon: number; verified: boolean;
  distance_km: number; completed_deals: number; rating: number | null; rating_count: number; listings: Listing[];
}
export interface Review { id: number; score: number; comment: string | null; writer: string; item: string }

/** 판매 공장 위치 지도(내장 타일, 없으면 OpenStreetMap). */
function SellerMap({ lat, lon, name }: { lat: number; lon: number; name: string }) {
  const node = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!node.current) return;
    const map = L.map(node.current, { zoomControl: false, attributionControl: true, dragging: true, scrollWheelZoom: false }).setView([lat, lon], 14);
    map.attributionControl.setPrefix(false);
    const Local = L.TileLayer.extend({ getTileUrl: (c: L.Coords) => tileUrl(c.z, c.x, c.y) }) as unknown as new (url: string, options: L.TileLayerOptions) => L.TileLayer;
    new Local("", { attribution: "© OpenStreetMap", maxZoom: 17 }).addTo(map);
    L.marker([lat, lon], { icon: L.divIcon({ className: "seller-pin", html: "<span></span>", iconSize: [28, 28], iconAnchor: [14, 28] }) }).addTo(map).bindTooltip(name);
    return () => { map.remove(); };
  }, [lat, lon, name]);
  return <div className="seller-map" ref={node} role="img" aria-label={`${name} 위치 지도`} />;
}

/** 판매 공장 정보: 평점, 회사 정보, 위치, 판매 중인 원료, 후기. */
export function SellerProfile({ id, go, back }: { id: number; go: Go; back: () => void }) {
  const r = useResource<SellerInfo>("buyer", `/sellers/${id}`, true);
  const reviews = useResource<Review[]>("buyer", `/sellers/${id}/reviews`, true);
  const [tab, setTab] = useState<"listings" | "reviews">("listings");
  const s = r.data;
  const list = Array.isArray(reviews.data) ? reviews.data : [];
  return (
    <>
      <TopBar title="판매 공장 정보" back={back} />
      <Feedback {...r} />
      {s && (
        <>
          <section className="seller-head">
            <span className="seller-avatar" aria-hidden="true"><Ic name="menu_factory" size={28} /></span>
            <div>
              <h2>{s.name}{s.verified && <StatusTag>인증 업체</StatusTag>}</h2>
              <Stars rating={s.rating} count={s.rating_count} size={15} />
              <small>{[s.region, `거래 완료 ${fmt(s.completed_deals)}건`].filter(Boolean).join(", ")}</small>
            </div>
          </section>
          {s.intro && <p className="seller-intro">{s.intro}</p>}
          <section className="seller-info" aria-label="회사 정보">
            <dl>
              <div><dt>대표자</dt><dd>{s.ceo_name ?? "미등록"}</dd></div>
              <div><dt>사업자등록번호</dt><dd>{s.biz_no}</dd></div>
              <div><dt>전화번호</dt><dd>{s.phone ? <a href={`tel:${s.phone}`}>{s.phone}</a> : "미등록"}</dd></div>
              <div><dt>업종</dt><dd>{s.industry ?? "미등록"}</dd></div>
              <div><dt>주소</dt><dd>{s.address ?? s.region ?? "미등록"}</dd></div>
            </dl>
            <SellerMap lat={s.lat} lon={s.lon} name={s.name} />
          </section>
          <div className="seller-tabs" role="tablist" aria-label="판매 공장 내용">
            <button role="tab" aria-selected={tab === "listings"} onClick={() => setTab("listings")}>판매 중 {s.listings.length}</button>
            <button role="tab" aria-selected={tab === "reviews"} onClick={() => setTab("reviews")}>후기 {s.rating_count}</button>
          </div>
          {tab === "listings" ? (
            s.listings.length ? <ListingList>{s.listings.map((l) => <ListingRow key={l.id} l={l} go={go} add />)}</ListingList> : <Empty>판매 중인 원료 없음</Empty>
          ) : (
            <section className="seller-reviews">
              <Feedback {...reviews} />
              {list.map((v) => (
                <article key={v.id}>
                  <header><b>{v.writer}</b><span className="seller-review-stars" aria-label={`${v.score}점`}>{"★".repeat(v.score)}<i>{"★".repeat(5 - v.score)}</i></span></header>
                  <small>{v.item}</small>
                  {v.comment && <p>{v.comment}</p>}
                </article>
              ))}
              {!reviews.loading && !list.length && <Empty>아직 후기 없음</Empty>}
            </section>
          )}
        </>
      )}
    </>
  );
}
