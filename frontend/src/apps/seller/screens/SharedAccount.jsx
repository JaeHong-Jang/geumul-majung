import { NotificationSettings } from '../../../shared/screens/NotificationSettings';
import { Support } from '../../../shared/screens/Support';
import Screen from '../components/Screen';
import { useNav } from '../lib/nav';
export function SellerSettings() {const nav=useNav();return <Screen id="settings"><div className="page-body shared-seller-content"><NotificationSettings appRole="seller" back={nav.back} /></div></Screen>;}
export function SellerSupport() {const nav=useNav();return <Screen id="support"><div className="page-body shared-seller-content"><Support appRole="seller" back={nav.back} /></div></Screen>;}
