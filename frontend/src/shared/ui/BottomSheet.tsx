import './bottom-sheet.css';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

/** 화면 아래에서 올라오는 시트. 앱 칸(.app) 안에 띄우고 Esc·바깥 누르기로 닫는다. */
export function BottomSheet({ title, sub, onClose, children, footer }: { title: string; sub?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [host, setHost] = useState<Element | null>(null);
  useLayoutEffect(() => setHost(anchor.current?.closest('.app') ?? document.body), []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  const sheet = (
    <div className="sheet-backdrop">
      <button type="button" className="sheet-dismiss" aria-label="닫기" onClick={onClose} />
      <section className="bottom-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <span className="sheet-grip" aria-hidden="true" />
        <header><h2>{title}</h2>{sub && <p>{sub}</p>}</header>
        <div className="sheet-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </section>
    </div>
  );
  return <><span ref={anchor} hidden />{host && createPortal(sheet, host)}</>;
}
