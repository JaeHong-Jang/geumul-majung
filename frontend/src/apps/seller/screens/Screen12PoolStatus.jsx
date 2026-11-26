import { EmptyState } from '../../../shared/ui/EmptyState';
import { ListCard } from '../../../shared/ui/ListCard';
import { useState } from 'react';
import ScreenHeader from '../components/ScreenHeader';
import BottomNav from '../components/BottomNav';
import Screen from '../components/Screen';
import { TabHeading } from '../../../shared/ui/Navigation';
import ScrollBody from '../components/ScrollBody';
import Button from '../components/Button';
import Notice from '../components/Notice';
import { ErrorNote } from '../../../shared/ui/Note';
import { useNav } from '../lib/nav';
import useResource from '../lib/useResource';
import { api, errorText } from '../../../shared/api/seller';
import { dateText, kg, perKg } from '../lib/format';
import './Screen12PoolStatus.css';

const STATUS = { open: '모집 중', closed: '모집 마감', sold: '판매 진행', cancelled: '취소됨' };
export default function Screen12PoolStatus() {
  const nav = useNav();
  const mine = useResource(nav.params.id ? null : '/pools?mine=1');
  const detail = useResource(nav.params.id ? `/pools/${nav.params.id}` : null);
  const [selected, setSelected] = useState('');
  const [joined, setJoined] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const pools = mine.data || [];
  const pool = joined || detail.data;
  const member = pool?.joined;
  const eligible = pool?.joinable_listings || [];
  async function join() {
    if (!selected) return setError('참여할 판매 선택 필요');
    setBusy(true); setError(null);
    try {
      const result = await api(`/pools/${pool.id}/join`, { method: 'POST', body: { listing_id: Number(selected) } });
      setJoined(result); await mine.reload();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  return <Screen id="poolStatus">
    {nav.params.id ? <ScreenHeader title="공동판매 현황" back /> : <TabHeading title="공동판매 현황" />}
    <ScrollBody>
      <ErrorNote error={error || mine.error || detail.error} />
      {!nav.params.id && <>
        {pools.map(p => <ListCard as="button" type="button" className="list-card notice" key={p.id} onClick={() => nav.go('poolStatus', {id:p.id})}><strong>{p.title}</strong><span>{STATUS[p.status]}, {kg(p.current_kg)} / {kg(p.target_kg)}</span></ListCard>)}
        {!mine.loading && !pools.length && <EmptyState title="진행 중인 공동판매 없음" description="공동판매 찾기 또는 새로 만들기" action="공동판매 찾기" onAction={()=>nav.go("poolFind")}/>}
        {!!pools.length && <Button onClick={() => nav.go('poolFind')}>공동판매 찾기</Button>}
      </>}
      {nav.params.id && !pool && <Notice title={detail.loading ? '불러오는 중' : '공동판매 정보를 찾을 수 없음'}>공동판매 목록에서 다시 선택</Notice>}
      {pool && <>
        <Notice title={pool.title}>{STATUS[pool.status]}</Notice>
        <Notice title="모집 현황">현재 {kg(pool.current_kg)} / 목표 {kg(pool.target_kg)}, {pool.factory_count}개 공장</Notice>
        <Notice title="남은 모집 물량">{kg(pool.remaining_kg)}</Notice>
        {pool.min_join_price_krw_per_kg != null && <Notice title="참여 단가 하한">{perKg(pool.min_join_price_krw_per_kg)}</Notice>}
        <Notice title="모집 기한">{dateText(pool.deadline)}</Notice>
        {pool.applied_price_krw_per_kg != null && <Notice title="공동 적용 단가">{perKg(pool.applied_price_krw_per_kg)}</Notice>}
        {pool.members?.map((m,i) => <Notice key={i} title={m.mine ? '내 공장' : m.name}>{kg(m.kg)}, {perKg(m.price_krw_per_kg)}</Notice>)}
        {!member && !pool.mine && pool.status === 'open' && <>
          <label className="form-field">참여할 판매<select value={selected} onChange={e => setSelected(e.target.value)}><option value="">판매 선택</option>{eligible.map(l => <option key={l.id} value={l.id}>{kg(l.total_kg)}, {perKg(l.price_krw_per_kg)}, 판매 {l.id}</option>)}</select></label>
          {!eligible.length && <Notice empty title="참여 가능한 판매 없음">같은 품목, 등급이며 다른 공동판매에 참여하지 않은 판매 중인 물량 필요</Notice>}
          <Button onClick={join} disabled={busy || !eligible.length}>참여</Button>
        </>}
        {['open','closed'].includes(pool.status) && <>
          {pool.is_owner && <Button onClick={() => nav.go('poolConfig', {id:pool.id})}>공동판매 조건 수정</Button>}
          {pool.mine && <Button variant="secondary" onClick={() => nav.go('poolDeadline', {id:pool.id})}>공동판매 진행 방법 선택</Button>}
        </>}
      </>}
    </ScrollBody><BottomNav active="poolStatus" />
  </Screen>;
}
