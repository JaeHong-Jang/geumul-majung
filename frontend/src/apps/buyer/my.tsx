import { My } from '../../shared/screens/My';
import { buyerMenus } from '../../shared/screens/myMenus';
import type { Go } from '../../types';
export function BuyerMy({go,logout}:{go:Go;logout:()=>void}) {
 return <My appRole="buyer" menus={buyerMenus} go={go} logout={logout}/>;
}
