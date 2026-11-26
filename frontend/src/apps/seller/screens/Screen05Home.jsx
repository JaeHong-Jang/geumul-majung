import './home-volumes.css';
import BottomNav from '../components/BottomNav';
import { HomeLayout, HomeHeader, Badge, SearchLink, StatTiles, HeroCard, SectionHead, MarketTiles } from '../../../shared/ui/shell';
import { useNav } from '../lib/nav';
import useResource from '../lib/useResource';
import { perKg, materialName } from '../lib/format';
import { fmt } from '../../../types';
import ByproductRecommendations from '../components/ByproductRecommendations';
const NEED_HANDOVER = ['picked_up', 'arrived', 'confirmed', 'settled', 'rated'];

// 홈 위쪽 세 칸: 서버의 주문·판매 목록에서 세어 만듭니다.
function buildStats(home) {
  const orders = home.orders || [];
  const listings = home.listings || [];
  const pickups = orders.filter((o) => o.status === 'dispatched');
  const pools = listings.filter((l) => l.status === 'bundle_wait');
  const todo = orders.filter(
    (o) => NEED_HANDOVER.includes(o.status) && !(o.handover && o.handover.allbaro_no),
  );
  return [
    {
      label: '다음 출고',
      value: pickups.length ? `${pickups.length}건` : '예정 없음',
      go: pickups.length ? ['order', { id: pickups[0].id }] : ['orders'],
      tone: 'mint',
    },
    {
      label: '공동판매',
      value: pools.length ? `${pools.length}건` : '진행 없음',
      go: ['poolStatus'],
    },
    {
      label: '확인할 일',
      value: todo.length ? `${todo.length}건` : '없음',
      go: todo.length ? ['handover', { id: todo[0].id }] : ['orders'],
    },
  ];
}

// 출고, 공동판매, 재활용업체, 인계 제안을 공장 품목 추천과 함께 표시한다.
function buildSuggestions(home, go) {
  const todo = (home.orders || []).filter((o) => NEED_HANDOVER.includes(o.status) && !(o.handover && o.handover.allbaro_no));
  const ship = (home.orders || []).filter((o) => o.status === 'dispatched');
  return [
    ...ship.slice(0, 1).map((o) => ({                         // 구매 요청이 들어오면 출고가 판매자 몫
      id: `ship-${o.id}`, icon: 'role_seller', title: '출고할 거래', meta: (o.counterparty_names || [])[0],
      reason: ship.length > 1 ? `출고 대기 ${ship.length}건, 출고 무게 입력 후 출고` : '출고 무게 입력 후 출고',
      accept: '출고 처리', onAccept: () => go('pickup', { id: o.id }),
    })),
    ...(home.volumes || []).filter((v) => v.seller_count > 1).slice(0, 1).map((v) => ({
      id: `pool-${v.waste_code}`, icon: 'role_seller', title: '공동판매 묶음', meta: v.waste_name,
      reason: `근처 판매자 ${v.seller_count}곳과 묶으면 운송비 절감`, accept: '공동판매 찾기', onAccept: () => go('poolFind'),
    })),
    ...(home.recommended_recyclers || []).slice(0, 2).map((b) => ({
      id: `buyer-${b.id}`, icon: 'role_buyer', title: b.name, meta: b.region,
      reason: b.distance_km != null ? `근처 재활용업체, ${b.distance_km} km` : '근처 재활용업체',
      accept: `${b.name} 보기`, onAccept: () => go('buyer', { id: b.id }),
    })),
    ...todo.slice(0, 1).map((o) => ({
      id: `handover-${o.id}`, icon: 'shield', title: '인계서 확인',
      reason: `올바로 인계번호 미입력 거래 ${todo.length}개`, accept: '인계서 입력', onAccept: () => go('handover', { id: o.id }),
    })),
  ];
}

function RegisteredVolume({ volume: v }) {
 const name = (v.waste_name || '').replace(/\([^)]*\)/g, '').trim();
 const detail = [...(v.waste_name || '').matchAll(/\(([^)]*)\)/g)].map(match => match[1]).join(', ');
 const material = materialName(v.target_material);
 const picture = ['철', '알루미늄'].includes(material) ? 'vol_metal' : /골판지|종이|폐지/.test(`${material} ${name}`) ? 'vol_paper' : 'vol_plastic';
 return <li className="seller-volume-row">
  <img className="seller-volume-picture" src={`/icons/${picture}.png`} alt=""/>
  <div className="seller-volume-copy"><strong>{name}{material ? `, ${material}` : ''}</strong>{detail&&<small>{detail}</small>}<span>{fmt(v.total_kg)} kg, 판매자 {v.seller_count}곳</span></div>
  <div className="seller-volume-price"><strong>{fmt(v.min_price)}<small>원/kg</small></strong>{v.market&&<span>시세 {perKg(v.market.price)}</span>}</div>
 </li>;
}

export default function Screen05Home() {
 const nav=useNav(); const {data:home,error}=useResource('/seller/home');
 return <div className="shell-seller"><HomeLayout>
 <HomeHeader company={home?.company?.name||''} detail={home?.company?.region || '지역 미등록'} unread={!!home?.unread} onProfile={()=>nav.go('mypage')} onNotifications={()=>nav.go('notifications')} search={<SearchLink placeholder="재활용업체 찾기" onClick={()=>nav.go('buyers')}/>}>
 {home?.company&&!home.company.verified&&<Badge onClick={()=>nav.go('approval')}>승인 대기</Badge>}
 </HomeHeader>
 {error&&<p role="alert">{error.message}</p>}
 {home&&<StatTiles items={buildStats(home).map(s=>({...s,onClick:()=>nav.go(...s.go)}))}/>}
 <div className="seller-hero-compact"><HeroCard eyebrow="판매" title="부산물 팔기" side={{label:'공동판매',onClick:()=>nav.go('poolFind')}} actions={<button type="button" onClick={()=>nav.go('register')}>＋ 판매 등록</button>}>사진, 무게만 올리면 시세 추천가 확인</HeroCard></div>
 {home&&<ByproductRecommendations items={home.byproduct_recommendations || []} suggestions={buildSuggestions(home,(...a)=>nav.go(...a))} go={(...args)=>nav.go(...args)}/>}
 <section className="shell-section"><SectionHead title="현재 시세" more={()=>nav.go('market')}/><MarketTiles appRole="seller" prices={(home?.prices||[]).slice(0,3)} more={()=>nav.go('market')}/></section>
 <section className="shell-section" aria-label="등록 물량"><div className="shell-section-head"><h2>등록 물량</h2><span className="seller-volume-count">{home?.volumes?.length||0}개 품목</span></div>
 {home?.volumes?.length ? <ul className="seller-volume-list">{home.volumes.slice(0,3).map(v=><RegisteredVolume key={`${v.waste_code}-${v.target_material}`} volume={v}/>)}</ul> : <p className="seller-volume-count">등록 물량 없음</p>}</section>
 </HomeLayout><BottomNav active="home"/></div>;
}
