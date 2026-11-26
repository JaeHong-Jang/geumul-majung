import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import ScrollBody from '../components/ScrollBody';
import Notice from '../components/Notice';
import useResource from '../lib/useResource';
import './Screen26Coupons.css';

// 피그마 4043:1712 · 26 · 쿠폰함 [coupons]
// 쿠폰 제도와 GET /v1/me/coupons 는 서버에 없습니다. 근거 없는 할인 값을 만들지 않고 빈 목록으로 둡니다.
export default function Screen26Coupons() {
  const { data } = useResource('/me/coupons', { poll: false });
  const coupons = Array.isArray(data) ? data : [];
  return (
    <Screen id="coupons">
      <ScreenHeader title="쿠폰함" back />
      <ScrollBody>
        {coupons.map((c) => (
          <Notice key={c.id} className="coupon-card" title={c.title}>
            {c.description}
          </Notice>
        ))}
        {coupons.length === 0 && <Notice empty title="받은 쿠폰 없음" />}
      </ScrollBody>
    </Screen>
  );
}
