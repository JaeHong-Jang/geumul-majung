import BottomNav from '../components/BottomNav';
import { useNav } from '../lib/nav';
import { clearSession } from '../../../shared/api/seller';
import { My } from '../../../shared/screens/My';
const MENUS = [['company','회사 정보, 증빙','menu_factory'],['approval','가입 승인, 보완','shield'],['coupons','쿠폰함','menu_star'],['buyers','관심, 재활용업체','heart'],['chat','매물 문의','tab_history_off'],['settings','알림 설정','menu_bell'],['support','고객센터','menu_help']];
export default function Screen27MyPage() {
 const nav=useNav();return <div className="shell-seller"><My appRole="seller" menus={MENUS} go={r=>nav.go(r.name)} logout={()=>{clearSession();nav.go('login');}}/><BottomNav active="mypage"/></div>;
}
