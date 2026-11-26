import { useState } from 'react';
import { QrCode } from '../../../shared/ui/QrCode';
import { ListCard } from '../../../shared/ui/ListCard';
import { ErrorNote } from '../../../shared/ui/Note';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import ScrollBody from '../components/ScrollBody';
import BottomActions from '../components/BottomActions';
import Button from '../components/Button';
import Notice from '../components/Notice';
import OrderEmpty from '../components/OrderEmpty';
import { FormField } from '../components/Field';
import { useNav } from '../lib/nav';
import useOrder from '../lib/useOrder';
import useResource from '../lib/useResource';
import { api, errorText } from '../../../shared/api/seller';
import { kg } from '../lib/format';
import './Screen19Pickup.css';

// 운송은 판매자가 맡는다: 출고 무게를 넣어 출고하면, 도착 확인과 입고 검사는 물건을 받은 구매자가 한 번에 한다
const STATE_TEXT = {
  payment_held: '결제 확인 중',
  dispatched: '출고 준비, 물품별 출고 무게 입력 후 출고',
  picked_up: '운송 중, 구매자가 물건을 받으면 도착 확인과 입고 검사',
  arrived: '입고지 도착, 구매자 입고 검사 대기',
};

// 피그마 4043:1481 19 출고, 운송 [pickup]
export default function Screen19Pickup() {
  const nav = useNav();
  const { id, order, error, loading, empty, reload } = useOrder();
  const [weights, setWeights] = useState({});
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [vehicle, setVehicle] = useState(null);       // null이면 지난번 쓴 차량 번호
  const [done, setDone] = useState(null);
  const handover = useResource(id ? `/orders/${id}/handover` : null, { poll: false });
  if (!order) return <OrderEmpty id="pickup" title="출고, 운송" error={empty ? null : error} loading={loading && !empty} />;

  const bags = order.bags || [];
  const shipped = order.pickup_weights || [];
  const value = (b) => weights[b.id] ?? String(b.total_kg);
  const vehicleNo = (vehicle ?? handover.data?.vehicle_hint ?? '').trim();
  const ready = bags.length > 0 && bags.every((b) => Number(value(b)) > 0) && !!vehicleNo;
  const run = async (path, body, after) => {
    setBusy(true);
    setActionError(null);
    try {
      const r = await api(`/orders/${order.id}/${path}`, { method: 'POST', body });
      if (after) after(r);
      await reload();
    } catch (e) {
      setActionError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  // 출고 완료와 함께 인계서 배출자 칸, 운반자 칸(차량 번호)을 서버가 쓴다
  const ship = () => run('pickup', { bag_weights: bags.map((b) => ({ bag_id: b.id, kg: Number(value(b)) })), vehicle_no: vehicleNo },
    () => setDone('출고 완료, 인계서 배출자와 운반자 칸 자동 작성'));

  return (
    <Screen id="pickup">
      <ScreenHeader title="출고, 운송" back />
      <ScrollBody>
        <Notice title="운송 상태">{STATE_TEXT[order.status] || '운송 완료'}</Notice>
        {order.weight_warning && <Notice subtle title="무게 확인">{order.weight_warning}</Notice>}

        <ListCard as="section" className="list-card s19-card">
          <h2 className="s19-card__title">운송</h2>
          <p className="s19-card__row">{`출발   ${order.factory_name}`}</p>
          <p className="s19-card__row">{`도착   ${order.recycler_name}`}</p>
          {order.delivery_address && <p className="s19-card__row">{`입고지   ${order.delivery_address}`}</p>}
          <p className="s19-card__desc">운임 판매자 부담</p>
        </ListCard>

        {done && <Notice title="완료">{done}</Notice>}
        {order.status === 'dispatched' && (
          <ListCard as="section" className="list-card s19-card">
            <h2 className="s19-card__title">운송 차량</h2>
            <FormField
              label="운송 차량 번호"
              placeholder="예: 12가 3456"
              value={vehicle ?? handover.data?.vehicle_hint ?? ''}
              onChange={(e) => setVehicle(e.target.value)}
            />
            <p className="s19-card__desc">인계서 운반자 칸에 들어감, 지난번 쓴 번호 자동 입력</p>
          </ListCard>
        )}
        {order.status === 'dispatched' ? (
          <ListCard as="section" className="list-card s19-card">
            <h2 className="s19-card__title">물품별 출고 무게</h2>
            {bags.map((b) => (
              <FormField
                key={b.id}
                label={`물품 ${b.id} (등록 ${kg(b.total_kg)})`}
                inputMode="decimal"
                placeholder="kg"
                value={value(b)}
                onChange={(e) => setWeights((w) => ({ ...w, [b.id]: e.target.value }))}
              />
            ))}
          </ListCard>
        ) : (
          shipped.length > 0 && (
            <ListCard as="section" className="list-card s19-card">
              <h2 className="s19-card__title">물품별 출고 기록</h2>
              {bags.map((b) => {
                const w = shipped.find((x) => x.bag_id === b.id);
                return <p key={b.id} className="s19-card__row">{`물품 ${b.id}   등록 ${kg(b.total_kg)}${w ? `, 출고 ${kg(w.kg)}` : ''}`}</p>;
              })}
            </ListCard>
          )
        )}
        {bags.map((b) => b.qr && <Notice key={b.id} title={`물품 ${b.id} 통과증 QR`}><QrCode value={b.qr} /></Notice>)}
        <ErrorNote error={actionError} />
      </ScrollBody>
      <BottomActions height={96}>
        {order.status === 'dispatched' ? (
          <Button onClick={ship} disabled={busy || !ready}>{busy ? '기록 중…' : '출고 완료'}</Button>
        ) : (
          <Button onClick={() => nav.go('handover', { id })}>인계서 보기</Button>
        )}
      </BottomActions>
    </Screen>
  );
}
