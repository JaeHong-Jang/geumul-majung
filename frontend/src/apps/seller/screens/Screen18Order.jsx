import { OrderChecklist } from '../../../shared/screens/OrderChecklist';
import { ListCard } from '../../../shared/ui/ListCard';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import ScrollBody from '../components/ScrollBody';
import BottomActions from '../components/BottomActions';
import Button from '../components/Button';
import Notice from '../components/Notice';
import OrderEmpty from '../components/OrderEmpty';
import { useNav } from '../lib/nav';
import useOrder from '../lib/useOrder';
import { kg, perKg, won, orderStatus, orderNextStep, materialName } from '../lib/format';
import './Screen18Order.css';

const LINKS = [
  { title: '출고, 운송', desc: '출고 무게 입력, 운송 상태', to: 'pickup' },
  { title: '인계서', desc: '배출자, 운반자 칸 입력, 인계서 번호', to: 'handover' },
  { title: '도착 검사 결과', desc: '인수 무게, 검사 상태', to: 'inspection' },
  { title: '정산 상세', desc: '도착 검사 무게 기준 정산', to: 'settlement' },
  { title: '문의, 분쟁', desc: '운영자에게 확인 요청', to: 'dispute' },
];

// 피그마 4043:1440 · 18 · 거래 상세 [order]
export default function Screen18Order() {
  const nav = useNav();
  const { id, order, listing, error, loading, empty } = useOrder();
  if (!order) return <OrderEmpty id="order" title="거래 상세" error={empty ? null : error} loading={loading && !empty} />;

  const next = orderNextStep(order);
  const mat = order.bags && order.bags[0] ? `, ${materialName(order.bags[0].target_material)}` : '';
  const saleInfo = [
    `품목   ${order.waste_name}${mat}`,
    `등록 무게   ${kg(order.total_kg)}`,
    ...(listing ? [`입력 단가   ${perKg(listing.price_krw_per_kg)}`] : []),
    `등록 시 예상 금액   ${won(order.goods_krw)}`,
  ];

  return (
    <Screen id="order">
      <ScreenHeader title="거래 상세" back />
      <ScrollBody>
        <Notice title={orderStatus(order.status)}>{`주문 ${order.id}${order.recycler_name ? `, ${order.recycler_name}` : ''}`}</Notice>

        <ListCard as="section" className="list-card s18-card">
          <h2 className="s18-card__title">판매 정보</h2>
          {saleInfo.map((row) => (
            <p key={row} className="s18-card__row">
              {row}
            </p>
          ))}
        </ListCard>

        <OrderChecklist appRole="seller" id={id} />

        {LINKS.map((l) => (
          <ListCard as="button"
            key={l.title}
            type="button"
            className="list-card s18-card s18-card--link"
            onClick={() => nav.go(l.to, { id })}
          >
            <span className="s18-card__title">{l.title}</span>
            <span className="s18-card__desc">{l.desc}</span>
          </ListCard>
        ))}
      </ScrollBody>
      <BottomActions height={96}>
        {next && <Button onClick={() => nav.go(next.to, { id })}>{next.label}</Button>}
        <div className="bottom-row">
          <Button variant={next ? 'secondary' : 'primary'} width onClick={() => nav.go('chat', { id })}>거래 대화</Button>
          <Button variant="secondary" width onClick={() => nav.go('home')}>홈으로</Button>
        </div>
      </BottomActions>
    </Screen>
  );
}
