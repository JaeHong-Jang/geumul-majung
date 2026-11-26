import { Notifications } from '../../../shared/screens/account';
import { useNav } from '../lib/nav';
import Screen from '../components/Screen';
export default function Screen25Notifications() { const nav=useNav(); return <Screen id="Screen25Notifications"><div className="page-body shared-seller-content"><Notifications appRole="seller" back={nav.back} go={r => nav.go(r.name, {id:r.id})} /></div></Screen>; }
