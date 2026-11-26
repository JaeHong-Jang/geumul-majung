import { ListCard } from '../../../shared/ui/ListCard';
import { useEffect, useState } from 'react';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import ScrollBody from '../components/ScrollBody';
import Button from '../components/Button';
import Notice from '../components/Notice';
import { ErrorNote } from '../../../shared/ui/Note';
import { useNav } from '../lib/nav';
import { api, errorText } from '../../../shared/api/seller';
import useResource from '../lib/useResource';
import './Screen16Buyer.css';

// 피그마 4043:1348 · 16 · 재활용업체 상세 [buyer]
export default function Screen16Buyer() {
  const nav = useNav();
  const { id } = nav.params;
  const { data: buyer, loading } = useResource(id ? `/recyclers/${id}` : null, { poll: false });
  const inquiries = useResource('/inquiries');
  const [threads, setThreads] = useState([]);
  useEffect(() => {
    let active = true;
    async function match() {
      if (!inquiries.data) return;
      try {
        const matches = await Promise.all(inquiries.data.map(async i => {
          const messages = await api(`/inquiries/${i.id}/messages`);
          return messages.some(m => String(m.sender_id) === String(id)) ? i : null;
        }));
        if (active) setThreads(matches.filter(Boolean));
      } catch (e) { if (active) setError(errorText(e)); }
    }
    match(); return () => { active = false; };
  }, [id, inquiries.data]);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState(null);
  const isSaved = saved != null ? saved : !!(buyer && buyer.favorite);

  const toggle = async () => {
    setError(null);
    try {
      await api(`/me/favorite-recyclers/${id}`, { method: isSaved ? 'DELETE' : 'PUT', ...(isSaved ? {} : { body: {} }) });
      setSaved(!isSaved);
    } catch (e) {
      setError(errorText(e));
    }
  };

  if (!buyer) {
    return (
      <Screen id="buyer">
        <ScreenHeader title="재활용업체 상세" back />
        <ScrollBody>
          <Notice empty title="업체 정보를 찾을 수 없음">{loading ? '불러오는 중…' : '재활용업체 목록에서 업체 선택'}</Notice>
          <Button variant="secondary" onClick={() => nav.go('buyers')}>재활용업체 목록</Button>
        </ScrollBody>
      </Screen>
    );
  }

  const rows = [
    buyer.pickup_method && `수거 방식   ${buyer.pickup_method}`,
    buyer.terms && `매입 조건   ${buyer.terms}`,
  ].filter(Boolean);

  return (
    <Screen id="buyer">
      <ScreenHeader title="재활용업체 상세" back />
      <ScrollBody>
        <Notice title="업체 정보">{buyer.name}</Notice>
        <Notice title="취급 품목, 거리">
          {[buyer.materials, buyer.distance_km != null ? `${buyer.distance_km}km` : null].filter(Boolean).join(', ')}
        </Notice>

        {rows.length > 0 && (
          <ListCard as="section" className="list-card s16-card">
            <h2 className="s16-card__title">거래 참고 정보</h2>
            {rows.map((row) => (
              <p key={row} className="s16-card__row">
                {row}
              </p>
            ))}
          </ListCard>
        )}

        <ListCard as="button" type="button" className="list-card s16-card s16-card--action" aria-pressed={isSaved} onClick={toggle}>
          {isSaved && <span>관심 업체로 저장 완료</span>}<span className="s16-card__title">{isSaved ? '관심 해제' : '관심 업체 저장'}</span>
          <span className="s16-card__desc">선택한 업체를 관심 목록에 저장</span>
        </ListCard>
        <ErrorNote error={error || inquiries.error} />

        {threads.map(t => <Button key={t.id} onClick={() => nav.go('chat', {id:t.id, inquiry:'1'})}>채팅으로 문의, {t.listing_name}</Button>)}
        {!threads.length && (buyer.phone ? <a href={`tel:${buyer.phone}`}>업체 전화, {buyer.phone}</a> : <p>등록된 연락 수단 없음, 구매 업체 문의 시 답변 가능</p>)}
      </ScrollBody>
    </Screen>
  );
}
