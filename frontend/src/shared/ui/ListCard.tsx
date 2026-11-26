import type { HTMLAttributes, ReactNode } from 'react';
type Props = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  title?: ReactNode;
  description?: ReactNode;
  as?: 'div' | 'section' | 'button';
  type?: 'button' | 'submit' | 'reset';
};
export function ListCard({title, description, children, onClick, as, className='', ...props}: Props) {
  const Tag = as ?? (onClick ? 'button' : 'div');
  return <Tag {...props} onClick={onClick} className={`list-card shell-list ${className}`}>
    {title && <strong className="shell-list-title">{title}</strong>}
    {description && <span className="shell-list-description">{description}</span>}
    {children}
  </Tag>;
}
