import { ListCard } from '../../../shared/ui/ListCard';
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
import './Screen21Inspection.css';

// 피그마 4043:1547 · 21 · 도착 검사 결과 [inspection]
export default function Screen21Inspection() {
  const nav = useNav();
  const { id, order, listing, error, loading, empty } = useOrder();
  if (!order) return <OrderEmpty id="inspection" title="도착 검사 결과" error={empty ? null : error} loading={loading && !empty} />;

  const inspected = order.inspect_weights && order.inspect_weights.length > 0;
  const got = inspected ? sumKg(order.inspect_weights) : null;
  const diff = inspected ? got - order.total_kg : null;
  const pct = inspected ? (diff / order.total_kg) * 100 : null;
  const sign = (n, unit) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${unit(Math.abs(n))}`;

  let title = '검사 대기';
  let desc = '도착 후 재활용업체 검사 시 결과 표시';
  if (order.status === 'disputed') {
    title = '운영자 확인 중';
    desc = order.dispute_reason || '운영자가 검사 결과 확인 중';
  } else if (inspected) {
    title = '검사 합격';
    desc = `등록 무게 대비 ${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
  }

  const info = inspected
    ? [
        `등록 무게   ${kg(order.total_kg)}`,
        `검사 무게   ${kg(got)}`,
        `무게 차이   ${sign(diff, kg)} (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%)`,
        ...(listing ? [`정산 단가   ${perKg(listing.price_krw_per_kg)}`] : []),
      ]
    : [`등록 무게   ${kg(order.total_kg)}`];

  const expected = order.settlement
    ? { value: order.settlement.factory_krw, text: won(order.settlement.factory_krw) }
    : inspected && listing
      ? { text: `${kg(got)} × ${perKg(listing.price_krw_per_kg)} = ${won(got * listing.price_krw_per_kg)}` }
      : null;

  return (
    <Screen id="inspection">
      <ScreenHeader title="도착 검사 결과" back />
      <ScrollBody>
        <Notice title={title}>{desc}</Notice>

        <ListCard as="section" className="list-card s21-card">
          <h2 className="s21-card__title">검사 정보</h2>
          {info.map((row) => (
            <p key={row} className="s21-card__row">
              {row}
            </p>
          ))}
        </ListCard>

        {expected && <Notice title="예상 정산 금액">{expected.text}</Notice>}

        <ListCard as="button"
          type="button"
          className="list-card s21-card s21-card--action"
          onClick={() => nav.go('dispute', { id })}
        >
          <span className="s21-card__title">검사 결과 문의</span>
          <span className="s21-card__desc">차이 초과, 불합격 등은 운영자에게 확인 요청</span>
        </ListCard>
      </ScrollBody>
      <BottomActions height={96}>
        <Button onClick={() => nav.go('settlement', { id })}>정산 상세 확인</Button>
      </BottomActions>
    </Screen>
  );
}
