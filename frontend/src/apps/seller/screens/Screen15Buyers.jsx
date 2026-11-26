import { ListCard } from '../../../shared/ui/ListCard';
import { ErrorNote } from '../../../shared/ui/Note';
import { useState } from 'react';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import ScrollBody from '../components/ScrollBody';
import Notice from '../components/Notice';
import BottomNav from '../components/BottomNav';
import { FormField } from '../components/Field';
import { useNav } from '../lib/nav';
import useResource from '../lib/useResource';
import './Screen15Buyers.css';

// 피그마 4043:1289 · 15 · 재활용업체 [buyers]
// 하단 탐색은 어느 탭도 선택되지 않은 상태입니다.
export default function Screen15Buyers() {
  const nav = useNav();
  const [q, setQ] = useState('');
  const { data, error } = useResource(`/recyclers?q=${encodeURIComponent(q.trim())}`);
  const favorites = useResource('/me/favorite-recyclers');
  const buyers = Array.isArray(data) ? data : [];
  return (
    <Screen id="buyers">
      <ScreenHeader title="재활용업체" back />
      <ScrollBody>
        <FormField label="품목, 업체 검색" placeholder="품목이나 업체 이름 입력" value={q} onChange={(e) => setQ(e.target.value)} />
        {buyers.map((b) => (
          <ListCard as="button" key={b.id} type="button" className="list-card notice buyers__item" onClick={() => nav.go('buyer', { id: b.id })}>
            <span className="notice__title">{b.name}</span>
            <span className="notice__desc">
              {[b.materials, b.distance_km != null ? `${b.distance_km}km` : null].filter(Boolean).join(', ')}
            </span>
          </ListCard>
        ))}
        {buyers.length === 0 && (
          <Notice empty title="찾은 재활용업체 없음">
            {error && error.status !== 404 ? error.message : '등록된 업체 없음'}
          </Notice>
        )}
        <h2>관심 업체</h2><ErrorNote error={favorites.error} />
        {favorites.data?.map(b => <ListCard as="button" type="button" className="list-card notice" key={b.id} onClick={() => nav.go('buyer', {id:b.id})}><strong>{b.name}</strong><span>{b.materials}</span></ListCard>)}
        {favorites.data?.length === 0 && <Notice empty title="저장한 관심 업체 없음">업체 상세에서 관심 업체 저장</Notice>}
      </ScrollBody>
      <BottomNav active={null} />
    </Screen>
  );
}
