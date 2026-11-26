import type { ReactNode } from 'react';
export function CompanyCard({name, children}: {name: string; children?: ReactNode}) {
 return <section className="company-card"><h2>{name}</h2>{children}</section>;
}
export function AccountMenu({items, logout}: {items: {label: string; icon?: ReactNode; action: () => void}[]; logout: () => void}) {
 return <><div className="menu">{items.map(item => <button key={item.label} onClick={item.action}>{item.icon}<span className="menu-label">{item.label}</span><span className="menu-chevron" aria-hidden="true">›</span></button>)}</div><button className="text-button account-logout" onClick={logout}>로그아웃</button></>;
}
