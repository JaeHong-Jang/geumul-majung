import { ItemCard } from '../../../shared/ui/ItemCard';
import { FilterChips } from '../../../shared/ui/FilterChips';
import { EmptyState } from '../../../shared/ui/EmptyState';
import InquiryList from '../components/InquiryList';
import { useState } from 'react';
import Screen from '../components/Screen';
import { TabHeading } from "../../../shared/ui/Navigation";
import ScrollBody from '../components/ScrollBody';
import BottomNav from '../components/BottomNav';
import { ErrorNote } from '../../../shared/ui/Note';
import { useNav } from '../lib/nav';
import useResource from '../lib/useResource';
import { kg, won, dateText, orderStatus, orderGroup } from '../lib/format';
import './Screen17Orders.css';

const FILTERS = ['진행중', '완료', '문의'];

// 피그마 4043:1378 · 17 · 거래내역 [orders]
export default function Screen17Orders() {
  const nav = useNav();
  const [filter, setFilter] = useState(FILTERS[0]);
  const { data, error } = useResource('/me/orders');
  const orders = (data || []).filter((o) => orderGroup(o.status) === filter);
  return (
    <Screen id="orders">
      <TabHeading title="거래내역" />
      <ScrollBody>

        <FilterChips tabs value={filter} onChange={setFilter} options={FILTERS.map(f=>[f,f==='진행중'?`진행중 ${(data||[]).filter(o=>orderGroup(o.status)==='진행중').length}`:f])}/>

        {filter === '문의' && <InquiryList />}
        <ErrorNote error={error} />
        {filter !== '문의' && data && orders.length === 0 && (
          <EmptyState title={`${filter} 거래 없음`} description="거래 발생 시 출고, 정산 상태 표시" action="내 판매 보기" onAction={()=>nav.go('resources')}/>
        )}
        {(filter==='문의'?[]:orders).map((o) => (
          <ItemCard key={o.id} title={o.waste_name} grade={o.grade} description={`${kg(o.total_kg)}, ${won(o.goods_krw)}, ${(o.counterparty_names||[]).join(', ')}, ${dateText(o.updated_at)}`} right={<span className="status-tag">{orderStatus(o.status)}</span>} onClick={()=>nav.go('order',{id:o.id})}/>
        ))}
      </ScrollBody>
      <BottomNav active="orders" />
    </Screen>
  );
}
