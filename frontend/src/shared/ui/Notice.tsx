import { EmptyState } from './EmptyState';
import type { ReactNode } from 'react';
export function Notice({title, children, className='', subtle=false, empty=false}: {title?:ReactNode;children?:ReactNode;className?:string;subtle?:boolean;empty?:boolean}) {
  if(empty) return <EmptyState title={title} description={children}/>;
  return <div className={`${subtle?'app-notice':'list-card'} notice ${empty?'empty-state':''} ${className}`}>
    {title && <p className="notice__title">{title}</p>}
    {children && <div className="notice__desc">{children}</div>}
  </div>;
}
