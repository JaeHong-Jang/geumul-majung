import { statusName } from '../types';
export const orderStatus: Record<string,string> = {...statusName, disputed:'분쟁', returned:'반송', created:'주문 생성'};
const selfStatus: Record<string,string> = {dispatched:'직접 수거 예정', picked_up:'직접 운반 중'};
export const orderStatusText = (status: string, transport?: string | null) => (transport === 'self' && selfStatus[status]) || (orderStatus[status] ?? '상태 확인 중');
