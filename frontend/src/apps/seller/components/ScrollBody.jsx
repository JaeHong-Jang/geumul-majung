export default function ScrollBody({ gap = 14, className = '', contentClassName = '', children }) {
  return <main className={`page-body scroll-body ${className}`}><div className={`scroll-body__content ${contentClassName}`} style={{gap}}>{children}</div></main>;
}
