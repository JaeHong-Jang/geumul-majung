import { Support } from '../../../shared/screens/account';
import { useNav } from '../lib/nav';
import Screen from '../components/Screen';
export default function Screen23Dispute() { const nav=useNav(); return <Screen id="Screen23Dispute"><div className="page-body shared-seller-content"><Support id={nav.params.id ? Number(nav.params.id) : undefined} appRole="seller" back={nav.back} go={r => nav.go(r.name, {id:r.id})} /></div></Screen>; }
