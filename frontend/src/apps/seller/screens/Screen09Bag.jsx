import { ListCard } from '../../../shared/ui/ListCard';
import ListingForm from './ListingForm';
import { listingBags, rememberWithdrawal } from '../lib/listingHistory';
import { useState } from 'react';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import ScrollBody from '../components/ScrollBody';
import BottomActions from '../components/BottomActions';
import Button from '../components/Button';
import Notice from '../components/Notice';
import { ErrorNote } from '../../../shared/ui/Note';
import { useNav } from '../lib/nav';
import { api, errorText } from '../../../shared/api/seller';
import useResource from '../lib/useResource';
import { dateText, perKg, won, listingStatus, materialName, orderStatus, orderNextStep } from '../lib/format';
import { AdviceCard, PhotoStrip, Receipt, TRANSPORTS, tradeNo, unloadText, weightText } from '../components/SaleParts';
import './Screen09Bag.css';

function savedAdvice(listingId) {
  try {
    return JSON.parse(sessionStorage.getItem(`advice_${listingId}`) || 'null');
  } catch {
    return null;
  }
}

// 판매 상세: 상태, 판매 내역(영수증), 첨부 사진, AI 조언, 연결된 거래
export default function Screen09Bag() {
  const nav = useNav();
  const { listing: listingId, bag: bagId } = nav.params;
  const bags = useResource('/me/bags');
  const listings = useResource('/me/listings');
  const detail = useResource(listingId ? `/listings/${listingId}` : null, { poll: false });
  const loosePhotos = useResource(!listingId && bagId ? `/bags/${bagId}/photos` : null, { poll: false });
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const listing = listings.data && listings.data.find((l) => String(l.id) === String(listingId));
  const myBags = listing ? listingBags({ ...listing, ...detail.data }, bags.data || []) : (bags.data || []).filter((b) => String(b.id) === String(bagId));
  const ready = bags.data && listings.data;
  const advice = listingId ? savedAdvice(listingId) : null;
  const d = detail.data || {};
  const first = myBags[0];
  const order = useResource(listing?.order_id ? `/orders/${listing.order_id}` : null);
  const canWithdraw = listing && ['posted', 'bundle_wait'].includes(listing.status);
  const next = listing?.order_id ? orderNextStep(order.data) : null;   // 주문이 붙으면 판매자가 할 다음 일
  const photoIds = (d.bags || []).flatMap((b) => b.photo_ids || []).slice(0, 5);
  const shownPhotos = photoIds.length ? photoIds : (loosePhotos.data || []).map((p) => p.id);

  const withdraw = async () => {
    if (!window.confirm('판매 내리기 확인')) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/listings/${listing.id}/withdraw`, { method: 'POST', body: {} });
      rememberWithdrawal(listing, myBags);
      nav.go('resources');
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  const totalKg = listing && (listing.status !== 'withdrawn' || !(listing.former_bags || d.former_bags)) ? listing.total_kg : myBags.reduce((a, b) => a + b.total_kg, 0);
  const status = listing ? (order.data ? orderStatus(order.data.status) : listingStatus(listing.status)) : '판매 전';
  const terms = d.terms;
  const rows = [
    ['품목', (first?.waste_name || listing?.waste_name || '품목 정보 없음').replace(/\(.*\)$/, '').trim()],
    ['주 재질', materialName(first?.target_material) || '재질 정보 없음'],
    ['무게', weightText(totalKg || 0)],
    listing && ['판매 방식', listing.mode === 'bundle' ? '모아서 판매' : '바로 판매'],
    listing && ['판매 단가', perKg(listing.price_krw_per_kg)],
    d.market && ['현재 시세', `${d.market.item} ${perKg(d.market.price)}`],
    'line',
    listing && ['출고 가능일', d.available_from ? `${dateText(d.available_from)}부터` : '바로 출고'],
    terms && ['출고 시간', terms.ship_hours || '구매자와 조율'],
    terms && ['운송', (TRANSPORTS[terms.transport] || TRANSPORTS.own).title, { sub: '운임 판매자 부담' }],
    terms && ['하차 지원', unloadText(terms)],
    d.pickup_note && ['현장 안내', d.pickup_note],
    first?.note && ['메모', first.note],
  ];

  const canRelist = myBags.length > 0 && myBags.every((b) => b.available === true || !b.listing_id) && (!listing || listing.status === 'withdrawn');
  if (editing) return <ListingForm listing={listing} detail={d} bags={myBags} relist={canRelist} back={() => setEditing(false)} onSaved={async () => { await Promise.all([listings.reload(), detail.reload()]); setEditing(false); }} />;

  return (
    <Screen id="bag">
      <ScreenHeader title="판매 상세" back />
      <ScrollBody>
        <ErrorNote error={bags.error || listings.error || detail.error} />
        {ready && !first && !listing && <Notice empty title="판매 정보를 찾을 수 없음">내 판매에서 다시 선택</Notice>}
        {(first || listing) && (
          <>
            <div className="sale-status">
              <div>
                <small>판매 상태</small>
                <b>{materialName(first?.target_material) || listing?.waste_name}</b>
              </div>
              <span>{status}</span>
            </div>

            {listing?.status === 'withdrawn' && (listing.former_bags || d.former_bags)?.some((b) => !b.available) && (
              <Notice title={myBags.length ? '일부 물품만 다시 등록 가능' : '다시 등록할 수 있는 물품 없음'}>다른 판매에 연결됐거나 쓸 수 없는 물품은 빼고 표시</Notice>
            )}

            <Receipt
              title="판매 내역"
              no={listing ? tradeNo('S', listing.id) : tradeNo('R', first.id)}
              date={listing?.created_at ? `${dateText(listing.created_at)} 등록` : undefined}
              rows={rows}
              total={listing ? ['예상 판매금액', won(totalKg * listing.price_krw_per_kg)] : undefined}
              footnote={listing ? '최종 대금은 입고지 도착 검사 무게로 정산' : undefined}
            >
              <PhotoStrip ids={shownPhotos} />
            </Receipt>

            {advice && advice.summary && <AdviceCard summary={advice.summary} />}

            {listing && listing.status === 'bundle_wait' && (
              <ListCard as="button" type="button" className="list-card bag-card" onClick={() => nav.go('poolStatus')}>
                <span className="bag-card__title">공동판매 진행 현황</span>
                <span className="bag-card__desc">모집 물량, 참여 공장, 최저 단가 확인</span>
              </ListCard>
            )}
            {listing && listing.order_id && (
              <ListCard as="button" type="button" className="list-card bag-card" onClick={() => nav.go('order', { id: listing.order_id })}>
                <span className="bag-card__title">연결된 거래</span>
                <span className="bag-card__desc">출고, 인계, 정산 정보</span>
              </ListCard>
            )}
            <ErrorNote error={error} />
          </>
        )}
      </ScrollBody>
      <BottomActions height={148}>
        {next && <Button onClick={() => nav.go(next.to, { id: listing.order_id })}>{next.label}</Button>}
        {(canWithdraw || canRelist) && <Button disabled={detail.loading} onClick={() => setEditing(true)}>{canRelist ? '다시 판매 등록' : '판매 정보 수정'}</Button>}
        <div className="bottom-row">
          {canWithdraw && <Button variant="secondary" width onClick={withdraw} disabled={busy}>판매 내리기</Button>}
          {listing?.order_id && !next && <Button variant="secondary" width onClick={() => nav.go('order', { id: listing.order_id })}>거래 상세</Button>}
          <Button variant="secondary" width onClick={() => nav.go('home')}>홈으로</Button>
        </div>
      </BottomActions>
    </Screen>
  );
}
