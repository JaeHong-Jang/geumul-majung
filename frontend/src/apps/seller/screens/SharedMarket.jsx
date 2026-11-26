import { MarketScreen } from '../../../shared/screens/market';
import { Assistant } from '../../../shared/ui/shell';
import { useNav } from '../lib/nav';
import Screen from '../components/Screen';
export default function SharedMarket(){const nav=useNav();return <Screen id="market"><div className="page-body shared-seller-content"><MarketScreen appRole="seller" back={nav.back} /></div></Screen>;}
export function SellerAssistant(){const nav=useNav();return <Screen id="assistant"><Assistant appRole="seller" go={n=>nav.go(n)} back={nav.back}/></Screen>;}
