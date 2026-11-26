import { ListCard } from '../../../shared/ui/ListCard';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import ScrollBody from '../components/ScrollBody';
import BottomActions from '../components/BottomActions';
import Button from '../components/Button';
import Notice from '../components/Notice';
import { useNav } from '../lib/nav';
import useResource from '../lib/useResource';
import { dateText, kg, perKg } from '../lib/format';
import './Screen10PoolFind.css';

// 피그마 4043:1102 · 10 · 공동판매 찾기 [poolFind]
export default function Screen10PoolFind() {
  const nav = useNav();
  const { data, error } = useResource('/pools');
  const pools = Array.isArray(data) ? data : [];
  return (
    <Screen id="poolFind">
      <ScreenHeader title="공동판매 찾기" back />
      <ScrollBody>
        <h2 className="t-headline pool-find__headline">주변 공장 공동판매</h2>
        <p className="pool-find__lead">동일 품목 모집</p>

        {pools.map((p) => (
          <ListCard as="button" key={p.id} type="button" className="list-card notice pool-find__option" onClick={() => nav.go('poolStatus', { id: p.id })}>
            <span className="notice__title">{p.title}</span>
            <span className="notice__desc">
              {`현재 ${kg(p.current_kg)} / ${kg(p.target_kg)}, ${p.factory_count}개 공장`}
              <br />
              {`마감 ${dateText(p.deadline)}${p.min_join_price_krw_per_kg != null ? `, 참여 단가 하한 ${perKg(p.min_join_price_krw_per_kg)}` : ''}`}
            </span>
          </ListCard>
        ))}
        {pools.length === 0 && (
          <Notice empty title="참여할 수 있는 공동판매 없음">
            {error && error.status !== 404 ? error.message : '새 공동판매 등록'}
          </Notice>
        )}

        <ListCard as="button" type="button" className="list-card notice pool-find__option" onClick={() => nav.go('poolConfig')}>
          <span className="notice__title">새 공동판매 만들기</span>
          <span className="notice__desc">목표 물량과 모집 기한을 직접 설정</span>
        </ListCard>

        <Notice subtle title="공동판매 가격">참여 공장 중 가장 낮은 입력 단가로 통일</Notice>
      </ScrollBody>
      <BottomActions height={96}>
        <Button onClick={() => nav.go('poolConfig')}>새 공동판매 만들기</Button>
      </BottomActions>
    </Screen>
  );
}
