import { useEffect, useRef } from 'react';
import './auth.css';

export function AuthBackdrop() {
  const header = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    const page = header.current?.parentElement;
    if (!viewport || !page) return;
    const resize = () => {
      page.style.maxHeight = `${viewport.height}px`;
      const focused = document.activeElement;
      if (focused instanceof HTMLInputElement && page.contains(focused)) {
        focused.scrollIntoView({ block: 'nearest' });
      }
    };
    resize();
    viewport.addEventListener('resize', resize);
    return () => { viewport.removeEventListener('resize', resize); page.style.maxHeight = ''; };
  }, []);
  return <div ref={header} className="auth-backdrop" aria-hidden="true">
    <div className="auth-glow" /><i className="auth-circle large" /><i className="auth-circle small" />
    <svg viewBox="0 0 393 110" preserveAspectRatio="none">
      <path opacity=".08" d="M0 35 Q90 0 195 40 T393 20 V110 H0Z" />
      <path opacity=".14" d="M0 65 Q100 20 215 65 T393 45 V110 H0Z" />
      <path opacity=".22" d="M0 85 Q110 50 235 85 T393 70 V110 H0Z" />
    </svg>
  </div>;
}
