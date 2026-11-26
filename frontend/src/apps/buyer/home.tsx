import { readCart } from './cartStore';
const subscribeCart = (listener:()=>void) => {window.addEventListener('janjaemi-cart',listener);return ()=>window.removeEventListener('janjaemi-cart',listener);};
import type { BuyerHomeData } from "../../shared/contracts";
import { HomeLayout, HomeHeader, Badge, HeroCard, SearchLink, StatTiles, SectionHead, MarketTiles, SlideAction, AiSuggestions, type Suggestion } from "../../shared/ui/shell";
import './home.css';
import { useRef, useState, useSyncExternalStore } from "react";
import { useResource } from "../../shared/api/client";
import { Empty, Feedback } from "../../shared/ui/index";
import { type Bundle, type Company, type Go, type Order } from "../../types";
import { Volumes } from "../../shared/screens/market";
import { ListingList, ListingRow } from './listing';
import { BundleCard } from './bundle';
import { WantCard, type BuyRequest } from './wants';
import { AppButton } from "../../shared/ui/index";
/** 품목마다 가장 큰 묶음 하나만(서버는 무게 큰 순으로 준다). */
const onePerMaterial = (bundles: Bundle[]) => bundles.filter((b, i) => bundles.findIndex((x) => (x.target_material ?? x.waste_code) === (b.target_material ?? b.waste_code)) === i);

/** 공동판매 묶음을 옆으로 넘겨 보는 카드(PP, PE, PET, 철 등 품목마다 한 장). 아래 점으로 몇 번째인지 보인다. */
const GAP = 12;   // 카드 사이 간격(px), home.css의 .buyer-bundles-track gap과 같게

function BundleCarousel({ bundles, go }: { bundles: Bundle[]; go: Go }) {
  const track = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const drag = useRef<{ x: number; at: number } | null>(null);
  const step = () => { const t = track.current; return t ? t.clientWidth + GAP : 1; };
  const onScroll = () => { const t = track.current; if (t) setAt(Math.round(t.scrollLeft / step())); };
  const goTo = (i: number) => {
    const t = track.current;
    if (!t) return;
    const n = Math.max(0, Math.min(bundles.length - 1, i));
    t.scrollTo({ left: n * step(), behavior: "smooth" });
  };
  // 마우스로 끌어도 넘어가게(터치는 기본 가로 스크롤이 맡음)
  const onDown = (e: React.PointerEvent) => { if (e.pointerType === "mouse") drag.current = { x: e.clientX, at }; };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current; drag.current = null;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 40) goTo(d.at + (dx < 0 ? 1 : -1));
  };
  return (
    <section className="buyer-bundles" aria-label={`공동판매 묶음 ${bundles.length}개`}>
      <div className="buyer-bundles-track" ref={track} onScroll={onScroll} onPointerDown={onDown} onPointerUp={onUp} onPointerLeave={() => { drag.current = null; }}>
        {bundles.map((b) => <div key={b.id} className="buyer-hero-compact"><BundleCard bundle={b} go={go} /></div>)}
      </div>
      {bundles.length > 1 && (
        <div className="buyer-bundles-dots" role="tablist" aria-label="공동판매 묶음 넘기기">
          {bundles.map((b, i) => <button key={b.id} type="button" role="tab" aria-label={`${i + 1}번째 묶음`} aria-selected={at === i} aria-current={at === i} onClick={() => goTo(i)} />)}
        </div>
      )}
    </section>
  );
}

export function BuyerHome({ go }: { go: Go }) {
  const r = useResource<BuyerHomeData>("buyer", "/buyer/home", true);
  const profile = useResource<Company>("buyer", "/me/profile", true);
  const orders = useResource<Order[]>("buyer", "/me/orders", true);
  const wants = useResource<BuyRequest[]>("buyer", "/me/buy-requests", true);
  const openWants = (Array.isArray(wants.data) ? wants.data : []).filter(w => w.status === 'open');
  const cartCount = useSyncExternalStore(subscribeCart, ()=>readCart().length);
  const [q, setQ] = useState("");
  const h = r.data;
  const activeCount = orders.data?.filter(o=>!['settled','rated','cancelled','canceled','returned'].includes(o.status)).length;
  return (
    <HomeLayout>
      <Feedback {...r} /><Feedback error={profile.error} /><Feedback error={orders.error} />
      {h && (
        <>
          <HomeHeader company={h.company.name} detail={profile.data?.region || h.company.region || '지역 미등록'} unread={!!h.unread} onProfile={()=>go({name:'my'})} onNotifications={()=>go({name:'notifications'})} search={<SearchLink placeholder="품목, 재질, 지역으로 찾기" value={q} onChange={setQ} onSubmit={()=>{sessionStorage.setItem('buyer:search',q);go({name:'explore'});}}/>}>{!(profile.data?.verified ?? h.company.verified)&&<Badge>승인 대기</Badge>}</HomeHeader>
          <StatTiles items={[{label:'거래중',value:activeCount == null ? '—' : activeCount ? `${activeCount}건` : '진행 없음',onClick:()=>go({name:'orders'})},{label:'장바구니',value:cartCount ? `${cartCount}건` : '없음',onClick:()=>go({name:'cart'})},{label:'구매 희망',value:openWants.length ? `${openWants.length}건` : '없음',onClick:()=>go({name:'wants'})}]}/>
          <section className="shell-section"><SectionHead title="오늘의 시세" more={()=>go({name:'market'})}/><MarketTiles appRole="buyer" prices={(h.prices??[]).slice(0,3)} more={()=>go({name:'market'})}/>{!h.prices?.length&&<Empty>등록된 시세 없음</Empty>}</section>
          {h.bundles?.length ? (
            <BundleCarousel bundles={onePerMaterial(h.bundles)} go={go} />
          ) : (
            <div className="buyer-hero-compact"><HeroCard eyebrow="공동판매 묶음" title="현재 참여 가능한 묶음 없음" side={{label:'관심 품목',onClick:()=>go({name:'interests'})}} actions={<SlideAction label="매물 보기" onDone={()=>go({name:"explore"})}/>}/></div>
          )}
          {!!h.volumes?.length && !h.bundles?.length && <Volumes volumes={h.volumes.slice(0, 1)} />}
          {!!h.recommended?.length && <section className="shell-section"><SectionHead title="추천 매물"/><ListingList>{h.recommended.map(l => <ListingRow key={l.id} l={l} go={go} add shell />)}</ListingList></section>}
          <AiSuggestions items={[
            ...(h.prices??[]).filter(p=>(p.change_pct??0)<0).slice(0,2).map((p):Suggestion=>({id:`price-${p.item}`,icon:'chart_main',title:p.item,meta:`${p.price.toLocaleString()}${p.unit||'원/kg'}`,reason:`시세 ${Math.abs(p.change_pct!)}% 하락, 지금 구매 추천`,accept:'매물 보기',onAccept:()=>go({name:'explore'})})),
            ...(h.recommended??[]).slice(0,1).map((l):Suggestion=>({id:`listing-${l.id}`,icon:'check_verified',title:'새 추천 매물',reason:'조건에 맞는 새 매물',accept:'매물 보기',onAccept:()=>go({name:'listing',id:l.id})})),
            ...(cartCount?[{id:'cart',icon:'tab_cart_on',title:'장바구니 확인',reason:'담아 둔 매물로 구매 요청 가능',accept:'장바구니 보기',onAccept:()=>go({name:'cart'})}]:[]),
          ]} more={()=>go({name:'market'})}/>
          <section className="shell-section"><SectionHead title="내 구매 희망" more={() => go({name:"wants"})}/>
            {openWants.slice(0, 2).map(w => <WantCard key={w.id} w={w} go={go} />)}
            {!openWants.length && <p className="muted tiny" style={{wordBreak:'keep-all'}}>올린 구매 희망 없음<br/>사고 싶은 원료를 올리면 근처 판매 공장이 연락</p>}
            <AppButton outlined onClick={() => go({name:"want-new"})}>구매 희망 올리기</AppButton>
          </section>
          <section className="shell-section"><SectionHead title="판매 중인 원료" more={() => go({name:"explore"})}/>
            <ListingList>{h.listings
              ?.map((l) => (
                <ListingRow key={l.id} l={l} go={go} add shell />
              ))}</ListingList>
            {!h.listings?.length && <Empty>등록 매물 없음</Empty>}
          </section>
        </>
      )}
    </HomeLayout>
  );
}
