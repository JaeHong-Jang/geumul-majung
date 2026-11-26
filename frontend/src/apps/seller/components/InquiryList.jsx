import { ItemCard } from '../../../shared/ui/ItemCard';
import { EmptyState } from '../../../shared/ui/EmptyState';
import useResource from '../lib/useResource';
import { useNav } from '../lib/nav';
import { ErrorNote } from '../../../shared/ui/Note';
import { dateText } from '../lib/format';
export default function InquiryList() {
  const nav = useNav();
  const r = useResource('/inquiries');
  return <><ErrorNote error={r.error}/>{r.loading&&<p>불러오는 중</p>}{r.data?.length===0&&<EmptyState title="매물 문의 없음" description="구매 업체가 보낸 문의 표시" action="내 판매 보기" onAction={()=>nav.go('resources')}/>} {r.data?.map(i=><ItemCard key={i.id} title={`${i.listing_name}, ${i.other_name}`} description={<>{i.last_message}<br/>{dateText(i.updated_at)}</>} right={<span className="status-tag">읽지 않음 {i.unread}건</span>} onClick={()=>nav.go('chat',{id:i.id,inquiry:'1'})}/>)}</>;
}
