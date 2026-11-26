import { ListCard } from '../../../shared/ui/ListCard';
import { useState } from 'react';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import ScrollBody from '../components/ScrollBody';
import Notice from '../components/Notice';
import { ErrorNote } from '../../../shared/ui/Note';
import { FormField } from '../components/Field';
import { useNav } from '../lib/nav';
import { api, errorText } from '../../../shared/api/seller';
import useResource from '../lib/useResource';
import { kg, perKg } from '../lib/format';
import './Screen13PoolDeadline.css';

// 피그마 4043:1210 · 13 · 모집 기한 도착 [poolDeadline]
export default function Screen13PoolDeadline() {
  const nav = useNav();
  const { data } = useResource(nav.params.id ? `/pools/${nav.params.id}` : '/pools?mine=1', { poll: false });
  const pools = Array.isArray(data) ? data : [];
  const pool = nav.params.id ? data : pools[0];
  const [newDeadline, setNewDeadline] = useState('');
  const [error, setError] = useState(null);

  if (!pool) {
    return (
      <Screen id="poolDeadline">
        <ScreenHeader title={pool?.status === 'closed' ? '모집 기한 도착' : '공동판매 진행 방법'} back />
        <ScrollBody>
          <Notice empty title="진행 중인 공동판매 없음">공동판매 목록에서 다시 선택</Notice>
        </ScrollBody>
      </Screen>
    );
  }

  const choose = async (action, to) => {
    setError(null);
    try {
      await api(`/pools/${pool.id}/deadline`, {
        method: 'POST',
        body: { action, ...(action === 'extend' ? { new_deadline: newDeadline } : {}) },
      });
      nav.go(to, to === 'poolStatus' ? { id: pool.id } : undefined);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const short = pool.remaining_kg;
  const choices = [
    { title: '모집 연장', desc: '목표 물량을 유지하고 새 기한으로 연장', run: () => (newDeadline ? choose('extend', 'poolStatus') : setError('연장할 새 기한 먼저 선택 필요')) },
    {
      title: '현재 물량으로 판매',
      desc: `${kg(pool.current_kg)}${pool.applied_price_krw_per_kg != null ? `, 최저 단가 ${perKg(pool.applied_price_krw_per_kg)}로` : ''} 판매`,
      run: () => choose('sell_now', 'resources'),
    },
    { title: '공동판매 참여 취소', desc: '내 공장의 참여 물량 취소', run: () => choose('cancel', 'resources') },
  ];

  return (
    <Screen id="poolDeadline">
      <ScreenHeader title={pool?.status === 'closed' ? '모집 기한 도착' : '공동판매 진행 방법'} back />
      <ScrollBody>
        <h2 className="t-headline pool-deadline__headline">{short > 0 ? '목표 물량보다 부족' : '목표 물량 달성'}</h2>
        <Notice className="pool-deadline__shortfall" title={`현재 ${kg(pool.current_kg)} / ${kg(pool.target_kg)}`}>
          {short > 0 ? `목표보다 ${kg(short)} 부족` : ''}
        </Notice>
        {pool.is_owner && ['open','closed'].includes(pool.status) && <FormField label="연장할 새 기한" type="date" value={newDeadline} onChange={(e) => setNewDeadline(e.target.value)} />}
        {choices.filter((c, i) => ['open','closed'].includes(pool.status) && (pool.is_owner || (i === 2 && pool.joined))).map((c) => (
          <ListCard as="button" key={c.title} type="button" className="list-card notice pool-deadline__option" onClick={c.run}>
            <span className="notice__title">{c.title}</span>
            <span className="notice__desc">{c.desc}</span>
          </ListCard>
        ))}
        <ErrorNote error={error} />
      </ScrollBody>
    </Screen>
  );
}
