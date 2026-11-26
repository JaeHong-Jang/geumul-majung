import { HandoverScreen } from '../../../shared/screens/orders';
import { useNav } from '../lib/nav';
import Screen from '../components/Screen';
import OrderEmpty from '../components/OrderEmpty';
export default function Screen20Handover() {const nav=useNav();return nav.params.id ? <Screen id="handover"><div className="page-body shared-seller-content"><HandoverScreen appRole="seller" id={Number(nav.params.id)} back={nav.back} home={() => nav.go('home')} /></div></Screen> : <OrderEmpty id="handover" title="폐기물 인계서" />;}
