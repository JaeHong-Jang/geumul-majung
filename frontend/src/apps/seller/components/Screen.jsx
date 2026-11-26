export default function Screen({ id, className = '', children }) {
  return <div className={`screen route-view s-${id} ${className}`} data-screen={id}>{children}</div>;
}
