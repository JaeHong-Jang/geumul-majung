import { ListCard } from '../../../shared/ui/ListCard';
import { Review } from "../../../shared/screens/orders";
import { useState } from 'react';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import ScrollBody from '../components/ScrollBody';
import BottomActions from '../components/BottomActions';
import Button from '../components/Button';
import Notice from '../components/Notice';
import OrderEmpty from '../components/OrderEmpty';
import { useNav } from '../lib/nav';
import useOrder, { sumKg } from '../lib/useOrder';
import { kg, perKg, won } from '../lib/format';
import './Screen22Settlement.css';

// 피그마 4043:1582 · 22 · 정산 상세 [settlement]
export default function Screen22Settlement() {
  const nav = useNav();
  const { id, order, listing, error, loading, empty } = useOrder();
  const [rating, setRating] = useState(false);
  if (!order) return <OrderEmpty id="settlement" title="정산 상세" error={empty ? null : error} loading={loading && !empty} />;

  const s = order.settlement;
  const got = order.inspect_weights && order.inspect_weights.length ? sumKg(order.inspect_weights) : null;
  const rows = [
    ...(got != null ? [`검사 무게   ${kg(got)}`] : []),
    ...(listing ? [`단가   ${perKg(listing.price_krw_per_kg)}`] : []),
    ...(s ? [`판매 대금   ${got != null && listing ? `${Number(got).toLocaleString('ko-KR')} kg × ${won(listing.price_krw_per_kg)} = ` : ''}${won(s.factory_krw)}`] : []),
    `등록 시 예상 금액   ${won(order.goods_krw)}`,
  ];

  if (rating) return <Screen id="review"><div className="page-body shared-seller-content"><Review appRole="seller" id={id} back={()=>setRating(false)} go={r=>nav.go(r.name,{id:r.id})} /></div></Screen>;

  return (
    <Screen id="settlement">
      <ScreenHeader title="정산 상세" back />
      <ScrollBody>
        <Notice className="settle-done" title={order.status === 'disputed' ? '분쟁 처리 중' : s ? '정산 완료' : '정산 대기'}>
          {order.status === 'disputed' ? order.dispute_reason || '분쟁 사유 확인 중' : s ? won(s.factory_krw) : '도착 검사 완료 후 정산'}
        </Notice>

        <ListCard as="section" className="list-card notice settle-calc" aria-label="정산 계산">
          <h2 className="notice__title">정산 계산</h2>
          {rows.map((row) => (
            <p key={row} className="settle-calc__row">
              {row}
            </p>
          ))}
        </ListCard>

        <ListCard as="button" type="button" className="list-card notice settle-link" onClick={() => nav.go('handover', { id })}>
          <span className="notice__title">인계서 확인</span>
          <span className="notice__desc">{order.allbaro_no || '인계서 번호 아직 미입력'}</span>
        </ListCard>
        <ListCard as="button" type="button" className="list-card notice settle-link" onClick={() => nav.go('dispute', { id })}>
          <span className="notice__title">정산 문의</span>
          <span className="notice__desc">운영자에게 확인 요청</span>
        </ListCard>

        <Button variant="secondary" disabled={!s || !["settled", "rated"].includes(order.status)} onClick={() => setRating((v) => !v)}>
          거래 별점 남기기
        </Button>
        {(!s || !["settled", "rated"].includes(order.status)) && <p>정산 완료 후 거래 별점 작성 가능</p>}
      </ScrollBody>
      <BottomActions height={96}>
        <Button onClick={() => nav.go('orders')}>거래내역으로</Button>
      </BottomActions>
    </Screen>
  );
}
