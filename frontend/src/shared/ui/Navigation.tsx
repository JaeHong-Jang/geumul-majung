import type { ReactNode } from 'react';
export { BottomTabs } from './shell/BottomTabs';
export function ScreenHeading({title,back,icon,right}: {title:string;back?:()=>void;icon?:ReactNode;right?:ReactNode}) {
 return <header className="top-bar">{back ? <button type="button" className="round-icon" aria-label="뒤로" onClick={back}>{icon}</button> : <span className="round-space" />}<h1>{title}</h1><div className={right ? "top-bar-right" : "top-bar-right round-space"}>{right}</div></header>;
}

export function TabTitle({title, right, as: Tag = 'header'}: {title:string;right?:ReactNode;as?:'header'|'div'}) {
 return <Tag className="tab-heading"><h1>{title}</h1>{right}</Tag>;
}
export const TabHeading = TabTitle;
export function InquiryButton({onClick}: {onClick:()=>void}) {
 return <button type="button" className="inquiry-link small-outline" onClick={onClick}>매물 문의</button>;
}
