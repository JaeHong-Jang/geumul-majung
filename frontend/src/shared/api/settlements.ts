import { isoDate } from '../format';
import type { Order } from '../../types';
export function settlementCsv(orders: Order[]) {
 const cell = (s: unknown) => '"' + String(s ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"','""') + '"';
 return '\uFEFF' + [['주문','정산일','판매자','품목','중량(kg)','원료비(원)','환불(원)'], ...orders.map(o => [o.id,isoDate(o.updated_at),o.factory_name,o.waste_name,o.total_kg,o.settlement?.factory_krw,o.settlement?.refund_krw])].map(row => row.map(cell).join(',')).join('\r\n');
}
