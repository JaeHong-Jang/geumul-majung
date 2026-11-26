import { SellerSettings, SellerSupport } from './SharedAccount';
import SharedMarket, { SellerAssistant } from "./SharedMarket";
// 피그마 섹션 '01 · 판매자 핵심 화면 27개' 순서 그대로
import Screen01Login from './Screen01Login.jsx';
import Screen02Signup from './Screen02Signup.jsx';
import Screen03Company from './Screen03Company.jsx';
import Screen04Approval from './Screen04Approval.jsx';
import Screen05Home from './Screen05Home.jsx';
import Screen06Resources from './Screen06Resources.jsx';
import Screen07Register from './Screen07Register.jsx';
import Screen08Confirm from './Screen08Confirm.jsx';
import Screen09Bag from './Screen09Bag.jsx';
import Screen10PoolFind from './Screen10PoolFind.jsx';
import Screen11PoolConfig from './Screen11PoolConfig.jsx';
import Screen12PoolStatus from './Screen12PoolStatus.jsx';
import Screen13PoolDeadline from './Screen13PoolDeadline.jsx';
import Screen15Buyers from './Screen15Buyers.jsx';
import Screen16Buyer from './Screen16Buyer.jsx';
import Screen17Orders from './Screen17Orders.jsx';
import Screen18Order from './Screen18Order.jsx';
import Screen19Pickup from './Screen19Pickup.jsx';
import Screen20Handover from './Screen20Handover.jsx';
import Screen21Inspection from './Screen21Inspection.jsx';
import Screen22Settlement from './Screen22Settlement.jsx';
import Screen23Dispute from './Screen23Dispute.jsx';
import Screen24Chat from './Screen24Chat.jsx';
import Screen25Notifications from './Screen25Notifications.jsx';
import Screen26Coupons from './Screen26Coupons.jsx';
import Screen27MyPage from './Screen27MyPage.jsx';

export const screens = [
  {id: "settings", Component: SellerSettings},
  {id: "support", Component: SellerSupport},
  { id: "market", title: "시세", Component: SharedMarket },
  { id: "assistant", title: "AI 도우미", Component: SellerAssistant },
  { no: '01', id: 'login', title: '로그인', nodeId: '4043:630', Component: Screen01Login },
  { no: '02', id: 'signup', title: '공장 회원가입', nodeId: '4043:661', Component: Screen02Signup },
  { no: '03', id: 'company', title: '공장 정보, 증빙', nodeId: '4043:694', Component: Screen03Company },
  { no: '04', id: 'approval', title: '가입 승인, 보완', nodeId: '4043:749', Component: Screen04Approval },
  { no: '05', id: 'home', title: '홈', nodeId: '4043:783', Component: Screen05Home },
  { no: '06', id: 'resources', title: '내 판매', nodeId: '4043:919', Component: Screen06Resources },
  { no: '07', id: 'register', title: '판매 등록', nodeId: '4043:983', Component: Screen07Register },
  { no: '08', id: 'confirm', title: '판매 내용 확인', nodeId: '4043:1031', Component: Screen08Confirm },
  { no: '09', id: 'bag', title: '판매 상세', nodeId: '4043:1063', Component: Screen09Bag },
  { no: '10', id: 'poolFind', title: '공동판매 찾기', nodeId: '4043:1102', Component: Screen10PoolFind },
  { no: '11', id: 'poolConfig', title: '공동판매 조건 입력', nodeId: '4043:1130', Component: Screen11PoolConfig },
  { no: '12', id: 'poolStatus', title: '공동판매 현황', nodeId: '4043:1172', Component: Screen12PoolStatus },
  { no: '13', id: 'poolDeadline', title: '모집 기한 도착', nodeId: '4043:1210', Component: Screen13PoolDeadline },
  { no: '15', id: 'buyers', title: '재활용업체', nodeId: '4043:1289', Component: Screen15Buyers },
  { no: '16', id: 'buyer', title: '재활용업체 상세', nodeId: '4043:1348', Component: Screen16Buyer },
  { no: '17', id: 'orders', title: '거래내역', nodeId: '4043:1378', Component: Screen17Orders },
  { no: '18', id: 'order', title: '거래 상세', nodeId: '4043:1440', Component: Screen18Order },
  { no: '19', id: 'pickup', title: '출고, 운송', nodeId: '4043:1481', Component: Screen19Pickup },
  { no: '20', id: 'handover', title: '배출자 인계, 번호 입력', nodeId: '4043:1515', Component: Screen20Handover },
  { no: '21', id: 'inspection', title: '도착 검사 결과', nodeId: '4043:1547', Component: Screen21Inspection },
  { no: '22', id: 'settlement', title: '정산 상세', nodeId: '4043:1582', Component: Screen22Settlement },
  { no: '23', id: 'dispute', title: '문의, 분쟁 현황', nodeId: '4043:1616', Component: Screen23Dispute },
  { no: '24', id: 'chat', title: '거래 대화', nodeId: '4043:1653', Component: Screen24Chat },
  { no: '25', id: 'notifications', title: '알림', nodeId: '4043:1683', Component: Screen25Notifications },
  { no: '26', id: 'coupons', title: '쿠폰함', nodeId: '4043:1712', Component: Screen26Coupons },
  { no: '27', id: 'mypage', title: '내 정보', nodeId: '4043:1736', Component: Screen27MyPage },
];

export const screenById = Object.fromEntries(screens.map((s) => [s.id, s]));
