import "./qa-layout.css";
import "./inner.css";
import { ScreenHeading } from "./Navigation";
import { Button, Input } from "./primitives";
import { createPortal } from "react-dom";
import { useLayoutEffect, useRef, useState } from "react";
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  InputHTMLAttributes,
  ReactNode,
} from "react";
import { fmt } from "../../types";
export function Ic({ name, size }: { name: string; size?: number }) {
  return (
    <img
      className="ic"
      src={`/icons/${name}.svg`}
      alt=""
      style={size ? { width: size, height: size } : undefined}
    />
  );
}
export function Box({
  children,
  className = "",
  style,
}: {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`box ${className}`} style={style}>
      {children}
    </div>
  );
}
export function AppCard({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <Box className={`app-card ${className}`} {...(style ? { style } : {})}>
      {children}
    </Box>
  );
}
export function AppButton({
  children,
  outlined = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { outlined?: boolean }) {
  return (
    <Button
      {...props}
      className={`app-button ${outlined ? "outlined" : ""} ${props.className ?? ""}`}
    >
      {children}
    </Button>
  );
}
export function TopBar({
  title,
  back,
  children,
}: {
  title: string;
  back: () => void;
  children?: ReactNode;
}) {
  return <ScreenHeading title={title} back={back} icon={<Ic name="back" />} {...(children ? {right:children} : {})} />;
}
export function BottomBar({ children }: { children: ReactNode }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [host, setHost] = useState<Element | null>(null);
  useLayoutEffect(() => {
    setHost(anchor.current?.closest(".route-view") ?? null);
  }, []);
  const footer = <footer className="bottom-bar">{children}</footer>;
  return (
    <>
      <span ref={anchor} hidden />
      {host ? createPortal(footer, host) : footer}
    </>
  );
}
export function StatusTag({ children }: { children: ReactNode }) {
  return <span className="status-tag">{children}</span>;
}
export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="info-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
export { FilterChips as CategoryChips, FilterChips } from './FilterChips';
export function SearchBox(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="search-box">
      <Ic name="search" />
      <input
        aria-label="검색"
        placeholder="품목, 등급, 지역으로 찾기"
        {...props}
      />
    </label>
  );
}
export function GradeBadge({
  grade,
  size = 44,
}: {
  grade?: string | null;
  size?: number;
}) {
  return (
    <span
      className={`grade-badge grade-${grade}`}
      style={{ width: size, height: size }}
    >
      <b>{grade ?? "보류"}</b>
      <small>등급</small>
    </span>
  );
}
export function PriceText({
  price,
  size = 14,
  unit = "원/kg",
}: {
  price: number;
  size?: number;
  unit?: string;
}) {
  return (
    <span className="price-text">
      <b style={{ fontSize: size }}>{fmt(price)}</b><small>{unit}</small>
    </span>
  );
}
export function PageBody({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <main className={`page-body ${className}`}>{children}</main>;
}
export function SectionTitle({ title, more }: { title: ReactNode; more?: () => void }) {
  return <div className="section-title"><h2>{title}</h2>{more && <button type="button" className="text-button" onClick={more}>전체 보기</button>}</div>;
}
export function Section({
  title,
  children,
  more,
}: {
  title: string;
  children: ReactNode;
  more?: () => void;
}) {
  return (
    <section className="section">
      <SectionTitle title={title} {...(more ? {more} : {})} />
      {children}
    </section>
  );
}
export function AiNote({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="ai-note">
      <b className="row">
        <Ic name="sparkle_14" />
        {title}
      </b>
      <div>{children}</div>
    </div>
  );
}
export function Field({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      <Input {...props} />
    </label>
  );
}
export function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly (readonly [string, string])[];
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
export function Feedback({
  loading,
  error,
  message,
  refresh,
}: {
  loading?: boolean;
  error?: string | undefined;
  message?: string | undefined;
  refresh?: () => Promise<void>;
}) {
  return (
    <>
      {loading && <p role="status">불러오는 중…</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {error && refresh && (
        <button className="text-button" onClick={() => void refresh()}>
          다시 불러오기
        </button>
      )}
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
    </>
  );
}
export { EmptyState as Empty, EmptyState } from './EmptyState';
export { BottomTabs } from "./Navigation";

export function NotificationBell({onClick, unread=false, light=false}: {onClick:()=>void;unread?:boolean;light?:boolean}) {
 return <button type="button" className={`notification-bell${light ? ' notification-bell--light' : ''}`} aria-label="알림" onClick={onClick}><span className="notification-bell-icon"><Ic name="menu_bell" size={24} />{unread && <i className="notification-bell-dot" aria-label="새 알림" />}</span></button>;
}
export function TouchCheckbox(props: InputHTMLAttributes<HTMLInputElement>) {
 return <span className="touch-checkbox"><input {...props} type="checkbox" /><span className="checkbox-mark" aria-hidden="true" /></span>;
}

export { TabHeading } from "./Navigation";

export { ListCard } from "./ListCard";
