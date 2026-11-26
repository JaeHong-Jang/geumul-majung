import { TabTitle } from '../ui/Navigation';
import { ImpactExport } from './ImpactExport';
import { useResource } from '../api/client';
import { Feedback, Ic } from '../ui';
import { fmt, roleName, type Company, type Go, type Role } from '../../types';
import '../ui/shell/my.css';
import { buyerMenus, type MyMenu } from './myMenus';
export function My({appRole:role,go,logout,menus=buyerMenus}:{appRole:Role;go:Go;logout:()=>void;menus?:readonly MyMenu[]}) {
 const p=useResource<Company>(role,'/me/profile',true);
 const impact=useResource<{month:string;role:string;kg:number;order_count:number;carbon_kg:number|null}>(role,'/me/impact',true);
 const c=p.data;const i=impact.data;
 return <section className="shared-my shell-my" data-shared-screen="my"><TabTitle title="내 정보" right={<button className="account-logout" onClick={logout}>로그아웃</button>} /><div className="my-content"><Feedback {...p}/><Feedback error={impact.error}/>
 {c&&<div className="my-profile"><div className="profile-avatar"><div className="profile-icon"><Ic name={`role_${role}`}/></div><button className="profile-edit" onClick={()=>go({name:role==='seller'?'company':'profile'})}>수정</button></div><div className="my-company"><h2>{c.name}</h2>{c.biz_no&&<p className="my-biz-no">사업자번호 {c.biz_no}</p>}<span className="my-verification">{c.verified&&<span aria-hidden="true">✓ </span>}{roleName[role]} 인증 {c.verified?'완료':'대기'}</span></div></div>}
 {i&&<section className="my-impact"><b>이번 달 자원순환 성과</b><small className="my-impact-period">{i.month}, 완료 거래 {fmt(i.order_count)}건</small><span>{role==='buyer'?'원료 구매':'자원 순환'} {fmt(i.kg)} kg{i.carbon_kg!=null?`, 탄소 감축 ${fmt(i.carbon_kg)} kgCO₂e`:''}</span></section>}
 <section className="my-menu-section" aria-label="메뉴"><h2>메뉴</h2><div className="my-menu menu">{role==='buyer'&&i&&<ImpactExport/>}{menus.map(([name,label,icon])=><button key={name} onClick={()=>go({name})}><Ic name={icon}/><span>{label}</span><span className="menu-chevron" aria-hidden="true">›</span></button>)}</div></section>
 </div></section>;
}
