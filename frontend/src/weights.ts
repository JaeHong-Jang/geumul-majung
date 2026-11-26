import type { Order } from "./types";
export function weightBody(order: Order, values: Record<number, string>) {
  return (order.bags?.map((x) => x.id) ?? order.bag_ids ?? []).map(
    (bag_id) => ({ bag_id, kg: Number(values[bag_id]) }),
  );
}
/** 받은 전체 무게를 물품별 신고 무게 비율로 나눈다(마지막 물품이 반올림 나머지). 신고 무게가 없으면 똑같이 나눈다. */
export function splitTotal(order: Order, total: number) {
  const bags = order.bags?.length ? order.bags.map((b) => ({ id: b.id, kg: b.total_kg ?? 0 })) : (order.bag_ids ?? []).map((id) => ({ id, kg: 0 }));
  const declared = bags.reduce((s, b) => s + b.kg, 0);
  let left = Math.round(total * 1000);
  return bags.map((b, i) => {
    const share = i === bags.length - 1 ? left : Math.round((declared > 0 ? (b.kg / declared) : 1 / bags.length) * total * 1000);
    left -= share;
    return { bag_id: b.id, kg: share / 1000 };
  });
}
export function validTotal(order: Order, total: number) {
  const rows = splitTotal(order, total);
  return Number.isFinite(total) && total > 0 && rows.length > 0 && rows.every((x) => x.kg > 0 && x.kg <= 2000);
}
export function validWeights(order: Order, values: Record<number, string>) {
  const rows = weightBody(order, values);
  return (
    rows.length > 0 &&
    rows.every((x) => x.kg > 0 && x.kg <= 2000 && Number.isFinite(x.kg))
  );
}
