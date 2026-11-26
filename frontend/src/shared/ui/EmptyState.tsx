import type { ReactNode } from 'react';
export function EmptyState({title='아직 등록된 항목 없음',description,children,action,onAction}:{title?:ReactNode;description?:ReactNode;children?:ReactNode;action?:string;onAction?:()=>void}) {
 return <section className="empty-state app-card"><strong>{title}</strong>{(description||children)&&<p>{description||children}</p>}{action&&onAction&&<button type="button" className="app-button" onClick={onAction}>{action}</button>}</section>;
}
