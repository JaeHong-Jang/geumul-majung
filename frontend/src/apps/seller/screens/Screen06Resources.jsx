import { ItemCard } from '../../../shared/ui/ItemCard';
import { FilterChips } from '../../../shared/ui/FilterChips';
import { listingBags } from '../lib/listingHistory';
import { useState } from 'react';
import Screen from '../components/Screen';
import { TabHeading} from "../../../shared/ui/Navigation";
import ScrollBody from '../components/ScrollBody';
import Button from '../components/Button';
import Notice from '../components/Notice';
import BottomNav from '../components/BottomNav';
import { ErrorNote } from '../../../shared/ui/Note';
import { useNav } from '../lib/nav';
import useResource from '../lib/useResource';
import { kg, perKg, won, listingStatus, materialName, orderStatus } from '../lib/format';
import './Screen06Resources.css';

const FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'selling', label: '판매중' },
  { key: 'pool', label: '공동판매' },
];

// 재질별 그림(등급 대신)
const MAT_ICON = [[/^(pp|ps|abs)$/i, 'mat_pp.png'], [/^pe$/i, 'mat_pe.png'], [/^pet$|플라스틱/i, 'vol_plastic.png'], [/알루미늄/, 'mat_aluminum.png'],
  [/철|주물|스크랩/, 'mat_iron.png'], [/구리|황동|스테인리스/, 'vol_metal.png'], [/골판지|신문|종이|폐지|백상지/, 'vol_paper.png']];
// 긴 법정 품목 이름은 괄호 앞까지만(예: 폐합성수지류(…) → 폐합성수지류)
const shortWaste = (n) => (n || '').replace(/\(.*\)$/, '').trim();
const matIcon = (m) => { const hit = MAT_ICON.find(([re]) => re.test(m || '')); return hit ? `/icons/${hit[1]}` : undefined; };

// 판매(listing) 한 건 = 한 줄, 판매에 묶이지 않은 등록 물품 = 한 줄
function buildItems(bags, listings, orders) {
  const items = listings.map((l) => {
    const linkedBags = listingBags(l, bags);
    const bag = linkedBags[0];
    const weight = l.status === 'withdrawn' && l.former_bags ? linkedBags.reduce((sum, b) => sum + b.total_kg, 0) : l.total_kg;
    const material = bag?.target_material || l.target_material;
    const mat = material ? `, ${materialName(material)}` : ', 재질 정보 없음';
    return {
      key: `l${l.id}`,
      kind: l.status === 'bundle_wait' ? 'pool' : l.status === 'posted' ? 'selling' : 'other',
      title: `${shortWaste(l.waste_name)}${mat}`,
      icon: matIcon(material),
      desc: <span className="summary-lines"><span>{kg(weight)}, <span className="nowrap">{perKg(l.price_krw_per_kg)}</span></span><span>{orders.find(o => o.id === l.order_id) ? orderStatus(orders.find(o => o.id === l.order_id).status) : listingStatus(l.status)}, <span className="nowrap">예상 {won(weight * l.price_krw_per_kg)}</span></span></span>,
      to: ['bag', { listing: l.id }],
    };
  });
  const loose = bags
    .filter((b) => !b.listing_id && !listings.some(l => listingBags(l, bags).some(lb => lb.id === b.id)))
    .map((b) => ({
      key: `b${b.id}`,
      kind: 'other',
      title: `${shortWaste(b.waste_name)}, ${materialName(b.target_material)}`,
      icon: matIcon(b.target_material),
      desc: `${kg(b.total_kg)}, 판매 전`,
      to: ['bag', { bag: b.id }],
    }));
  return [...items, ...loose];
}

// 내 판매 [resources]
export default function Screen06Resources() {
  const nav = useNav();
  const [filter, setFilter] = useState('all');
  const bags = useResource('/me/bags');
  const listings = useResource('/me/listings');
  const orders = useResource('/me/orders');
  const current = FILTERS.find((f) => f.key === filter);
  const all = bags.data && listings.data ? buildItems(bags.data, listings.data, orders.data || []) : [];
  const items = all.filter((r) => filter === 'all' || r.kind === filter);
  const ready = bags.data && listings.data;

  return (
    <Screen id="resources">
      <TabHeading title="내 판매" />
      <ScrollBody>
        <FilterChips value={filter} onChange={setFilter} options={FILTERS.map(f=>[f.key,f.label])}/>


        <ErrorNote error={bags.error || listings.error} />
        {ready && items.length === 0 && (
          <Notice empty title="등록한 판매 없음">
            {filter === 'all' ? '판매 등록 필요' : `${current.label} 중인 판매 없음`}
          </Notice>
        )}

        {items.length > 0 && (
          <div className="rs-list">
            {items.map((r) => (
              <ItemCard key={r.key} title={r.title} description={r.desc} image={r.icon} onClick={()=>nav.go(...r.to)}/>
            ))}
          </div>
        )}

        <Button variant="secondary" onClick={() => nav.go('register')}>
          + 판매 등록하기
        </Button>
      </ScrollBody>
      <BottomNav active="resources" />
    </Screen>
  );
}
