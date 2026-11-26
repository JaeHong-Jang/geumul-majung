import { useEffect, useState, type ReactNode } from 'react';
import { readCart } from '../../../apps/buyer/cartStore';
import type { Go, Role } from '../../../types';
const tabs: Record<Role, string[][]> = {
  buyer: [
    ["home", "홈", "home"],
    ["explore", "매물", "explore"],
    ["cart", "장바구니", "cart"],
    ["orders", "거래내역", "history"],
  ],
  seller: [
    ["home", "홈", "home"],
    ["resources", "내 판매", "list"],
    ["poolStatus", "공동판매", "explore"],
    ["orders", "거래내역", "history"],
  ],
};
type TabItem = {id:string;label:string;icon:ReactNode};
type TabProps = {active:string|null;className?:string;label?:string} & (
 {items:TabItem[];onSelect:(id:string)=>void;appRole?:never;go?:never} |
 {appRole:Role;go:Go;items?:never;onSelect?:never}
);
export function BottomTabs(props:TabProps) {
 const [count, setCount] = useState(() => readCart().length);
 useEffect(() => { const changed = () => setCount(readCart().length); window.addEventListener("janjaemi-cart", changed); return () => window.removeEventListener("janjaemi-cart", changed); }, []);
 const {active,className='bottom-tabs',label='주요 메뉴'}=props;
 const items = props.items ?? tabs[props.appRole].map(([id,label,icon])=>({id:id!,label:label!,icon:<span className="tab-icon" style={{maskImage:`url(/icons/tab_${icon}_on.svg)`}} />}));
 const select = (id:string) => {if(props.onSelect) props.onSelect(id);else props.go({name:id});};
 const fab = props.appRole && <button key="assistant" type="button" className="shell-fab" aria-label="AI 도우미" onClick={()=>select('assistant')}><img src="/icons/sparkle_16.svg" alt=""/></button>;
 return <nav className={`shell-tabs ${className}`} aria-label={label}>{items.flatMap((item,i)=>[i===2?fab:null,<button key={item.id} type="button" className={className==='bottom-nav'?`bottom-nav__tab bottom-nav__tab--${item.id} ${active===item.id?'is-active':''}`:undefined} aria-current={active===item.id?'page':undefined} onClick={()=>select(item.id)}>{item.icon}<span className={className==='bottom-nav'?'bottom-nav__label':undefined}>{item.label}{props.appRole === "buyer" && item.id === "cart" && count > 0 && <span className="cart-count" aria-label={`담긴 매물 ${count}개`}>{count}</span>}</span></button>])}</nav>;
}

import './shell.css';
