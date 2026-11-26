import { orderStatusText } from '../orderStatus';
import { TabHeading, Feedback, StatusTag, AppButton } from '../ui';
import { FilterChips } from '../ui/FilterChips';
import { ItemCard } from '../ui/ItemCard';
import { EmptyState } from '../ui/EmptyState';
import { useState } from 'react';
import { useResource } from '../api/client';
import { dateText } from '../format';
import { fmt, won, type Go, type Order, type Role } from '../../types';
import { Steps } from './OrderSteps';
import { Inquiries } from './Messages';
export function Orders({appRole:role,go}:{appRole:Role;go:Go}) {
 const r=useResource<Order[]>(role,'/me/orders',true);
 const [tab,setTab]=useState('active');
 const terminal=['settled','rated','cancelled','canceled','returned'];
 const active=(r.data??[]).filter(o=>!terminal.includes(o.status));
 const past=(r.data??[]).filter(o=>terminal.includes(o.status));
 const orders=tab==='done'?past:active;
 return <><TabHeading title='거래내역'/><FilterChips tabs value={tab} onChange={setTab} options={[["active",`진행중 ${active.length}`],["done","완료"],["inquiries","문의"] as const]}/>
 {tab==='inquiries'?<Inquiries appRole={role} go={go} back={()=>setTab('active')} embedded/>:<><Feedback {...r}/>{orders.map(o=><ItemCard key={o.id} title={o.waste_name} grade={role==='buyer'?null:o.grade} description={<span className="summary-lines"><span>{fmt(o.total_kg)} kg, {won(o.goods_krw)}</span><span>{[o.counterparty_names?.join(', '), dateText(o.updated_at)].filter(Boolean).join(', ')}</span></span>} right={<StatusTag>{orderStatusText(o.status, o.transport)}</StatusTag>} onClick={()=>go({name:'order',id:o.id})}>
 {!terminal.includes(o.status)&&<><div className="order-stage"><Steps status={o.status} transport={o.transport}/></div>{o.desired_date&&<p>희망 도착일 {dateText(o.desired_date)}</p>}</>}
 {o.handover?.allbaro_no&&o.status==='settled'&&<AppButton outlined onClick={()=>go({name:'review',id:o.id})}>후기 쓰기</AppButton>}
 {role==='buyer'&&['picked_up','arrived'].includes(o.status)&&<AppButton onClick={()=>go({name:'review',id:o.id})}>도착 확인, 입고 검사</AppButton>}
 {role==='seller'&&['picked_up','arrived','confirmed'].includes(o.status)&&<AppButton onClick={()=>go({name:'handover',id:o.id})}>{o.handover?.emitter&&o.handover.carrier&&o.handover.processor?'번호 등록':'인계서 작성'}</AppButton>}
 </ItemCard>)}{!r.loading&&!r.error&&!orders.length&&<EmptyState title="해당 거래 없음" description="거래 발생 시 진행 상태 표시" action='홈으로' onAction={()=>go({name:'home'})}/>}</>}
 </>;
}
