import { useState } from 'react';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import ScrollBody from '../components/ScrollBody';
import BottomActions from '../components/BottomActions';
import Button from '../components/Button';
import Notice from '../components/Notice';
import { ErrorNote } from '../../../shared/ui/Note';
import { FormField } from '../components/Field';
import { useNav } from '../lib/nav';
import { api, errorText } from '../../../shared/api/seller';
import useResource from '../lib/useResource';
import { perKg } from '../lib/format';
import './Screen11PoolConfig.css';

// 피그마 4043:1130 · 11 · 공동판매 조건 입력 [poolConfig]
export default function Screen11PoolConfig() {
  const nav = useNav();
  const listings = useResource('/me/listings', { poll: false });
  const mine = (listings.data || []).filter((l) => l.status === 'bundle_wait' || l.status === 'posted');
  const pools = useResource(nav.params.id ? `/pools/${nav.params.id}` : null);
  const pool = pools.data;
  const mineRow = pool?.members?.find(m => m.mine);
  const [selected, setSelected] = useState(nav.params.listing || '');
  const listing = mine.find(l => String(l.id) === String(selected));
  const [target, setTarget] = useState(null);
  const [deadline, setDeadline] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!nav.params.id && !listing) return setError(mine.length ? '공동판매할 판매 선택 필요' : '공동판매에 올릴 판매 없음, 판매 먼저 등록 필요');
    const targetKg = Number(String(target ?? pool?.target_kg ?? '').replace(/,/g, ''));
    if (!(targetKg > 0)) return setError('목표 물량은 0보다 큰 숫자로 입력 필요');
    if (!(deadline ?? pool?.deadline)) return setError('모집 기한 선택 필요');
    setBusy(true);
    setError(null);
    try {
      const p = await api(nav.params.id ? `/pools/${nav.params.id}` : '/pools', { method: nav.params.id ? 'PATCH' : 'POST', body: { ...(!nav.params.id ? {listing_id: listing.id} : {}), target_kg: targetKg, deadline: deadline ?? pool?.deadline } });
      nav.go('poolStatus', { id: p.id });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen id="poolConfig">
      <ScreenHeader title={nav.params.id ? "공동판매 조건 수정" : "공동판매 조건 입력"} back />
      <ScrollBody>
        {!nav.params.id && <label className="form-field">공동판매할 판매<select value={selected} onChange={e => setSelected(e.target.value)}><option value="">판매 선택</option>{mine.map(l => <option key={l.id} value={l.id}>{l.waste_name}, {l.total_kg}kg, 판매 {l.id}</option>)}</select></label>}
        <FormField label="품목" placeholder={nav.params.id ? "품목 확인 중" : "판매 선택"} value={listing?.waste_name || pool?.waste_name || ''} readOnly />
        <FormField label="내 공장 물량" placeholder="kg" value={listing ? `${listing.total_kg} kg` : mineRow ? `${mineRow.kg} kg` : ''} readOnly />
        <FormField label="내 공장 입력 단가" placeholder="원/kg" value={listing ? perKg(listing.price_krw_per_kg) : mineRow ? perKg(mineRow.price_krw_per_kg) : ''} readOnly />
        <FormField label="목표 물량 *" placeholder="목표 물량 (kg)" inputMode="decimal" required value={target ?? pool?.target_kg ?? ''} onChange={(e) => setTarget(e.target.value)} />
        <FormField label="모집 기한 *" type="date" required value={deadline ?? pool?.deadline ?? ''} onChange={(e) => setDeadline(e.target.value)} />
        <Notice subtle title="공동판매 가격 적용">참여 공장 중 최저 단가 적용</Notice>
        <ErrorNote error={error || pools.error || listings.error} />
      </ScrollBody>
      <BottomActions height={148}>
        <Button onClick={save} disabled={busy || (!!nav.params.id && (!pool?.is_owner || !['open','closed'].includes(pool.status)))}>조건 저장, 판매 내용 확인</Button>
        {!nav.params.id && <Button variant="secondary" onClick={() => nav.go('poolFind')}>
          참여할 공동판매 찾기
        </Button>}
      </BottomActions>
    </Screen>
  );
}
