import { OrderEmpty as Empty } from '../../../shared/ui/OrderEmpty';
import Screen from './Screen';
import { useNav } from '../lib/nav';
export default function OrderEmpty({id,title,error,loading}) {const nav=useNav();return <Screen id={id}><div className="shared-seller-content"><Empty title={title} error={error?.message || error} loading={loading} back={nav.back} onOrders={()=>nav.go('orders')} /></div></Screen>;}
