import { api, useAction } from '../api/client';
import { Feedback, Ic } from '../ui';
import { settlementCsv } from '../api/settlements';
import type { Order } from '../../types';
export function ImpactExport() {
 const a = useAction();
 return <><button className="impact-export" disabled={a.busy} onClick={() => void a.run(async () => {
  const orders = await api<Order[]>('buyer','/me/orders');
  const settled = await Promise.all(orders.filter(o => ['settled','rated'].includes(o.status)).map(o => api<Order>('buyer',`/orders/${o.id}`)));
  const url = URL.createObjectURL(new Blob([settlementCsv(settled)],{type:'text/csv;charset=utf-8'}));
  const link = document.createElement('a'); link.href=url;link.download='잔재미-정산거래.csv';link.click();setTimeout(() => URL.revokeObjectURL(url),1000);
 })}><Ic name="tab_history_off"/><span>정산 거래 내려받기</span><span aria-hidden="true">›</span></button><Feedback {...a} /></>;
}
