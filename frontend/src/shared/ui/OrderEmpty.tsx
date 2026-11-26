import { EmptyState, Feedback, TopBar } from './index';
export function OrderEmpty({title,error,loading,back,onOrders}: {title:string;error?: string | null;loading?: boolean;back:()=>void;onOrders:()=>void}) {
 return <div className="page-body"><TopBar title={title} back={back} /><Feedback {...(error ? {error} : {})} {...(loading != null ? {loading} : {})} />{!loading && !error && <EmptyState title="연결된 거래 없음" description="거래내역에서 주문 확인" action="거래내역" onAction={onOrders}/>}</div>;
}
