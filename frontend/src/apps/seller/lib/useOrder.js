import { useNav } from './nav';
import useResource from './useResource';

/**
 * 거래 화면(18~22)이 함께 쓰는 주문 불러오기.
 * 주소의 id가 없으면 내 가장 최근 주문을 씁니다. 주문이 하나도 없으면 empty=true.
 */
export default function useOrder() {
  const nav = useNav();
  const given = nav.params.id;
  const list = useResource(given ? null : '/me/orders', { poll: false });
  const id = given || (list.data && list.data[0] && list.data[0].id) || null;
  const order = useResource(id ? `/orders/${id}` : null);
  const listing = useResource(order.data ? `/listings/${order.data.listing_id}` : null, { poll: false });
  return {
    id,
    order: order.data,
    listing: listing.data,
    error: order.error || list.error,
    loading: !!(given ? order.loading : list.loading || order.loading),
    empty: !given && !!list.data && list.data.length === 0,
    reload: order.reload,
  };
}

export const sumKg = (weights) => (weights || []).reduce((a, w) => a + Number(w.kg), 0);
