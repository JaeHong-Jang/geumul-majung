import type { ReactNode } from 'react';
import { GradeBadge, Ic } from './index';
export function ItemCard({title,description,grade,icon='tab_list_on',image,right,onClick,children}:{title:ReactNode;description?:ReactNode;grade?:string|null|undefined;icon?:string;image?:string|undefined;right?:ReactNode;onClick?:()=>void;children?:ReactNode}) {
 const content=<><span className="item-card-badge">{grade ? <GradeBadge grade={grade} size={48}/> : image ? <img className="item-card-img" src={image} alt=""/> : <Ic name={icon} size={24}/>}</span><span className="item-card-copy"><strong>{title}</strong><span>{description}</span></span></>;
 return <article className="item-card"><div className="item-card-row">{onClick?<button type="button" className="item-card-open" onClick={onClick}>{content}</button>:<div className="item-card-open">{content}</div>}{right&&<div className="item-card-right">{right}</div>}</div>{children}</article>;
}
