import './stock-chart.css';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { fmt } from '../../types';

export type ChartPoint = { t: string; price: number };

/** 주식 앱 모양의 면적 선 그래프. 누르거나 올리면 그 시점 가격을 보여준다. 오르면 빨강, 내리면 파랑(국내 표기). */
export function StockChart({ points, baseline, label, timeText, unit = '', height = 220 }: {
  points: ChartPoint[];
  baseline?: number | null | undefined;
  label: string;
  timeText: (t: string) => string;
  unit?: string;
  height?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(340);
  const [hover, setHover] = useState<number | null>(null);
  const gid = `fill${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth || 340);
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  if (points.length < 2) return <p className="muted stock-empty">{points.length ? '그래프를 그릴 값 부족' : '표시할 시세 없음'}</p>;

  const right = 52, top = 12, bottom = 26, W = width - right, H = height - top - bottom;
  const prices = points.map(p => p.price);
  const ref = baseline ?? prices[0]!;
  let lo = Math.min(...prices, baseline ?? Infinity), hi = Math.max(...prices, baseline ?? -Infinity);
  if (hi === lo) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * 0.08;
  lo -= pad; hi += pad;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => top + (1 - (v - lo) / (hi - lo)) * H;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.price).toFixed(1)}`).join('');
  const up = prices.at(-1)! >= ref;
  const ticks = Array.from({ length: 4 }, (_, i) => lo + ((hi - lo) * (i + 0.5)) / 4);
  const xTicks = [0, Math.floor((points.length - 1) / 3), Math.floor(((points.length - 1) * 2) / 3), points.length - 1];
  const move = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / W) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };
  const h = hover == null ? null : points[hover]!;
  const decimals = Math.abs(ref) < 50 ? 3 : Math.abs(ref) < 1000 ? 2 : 1;
  const num = (v: number) => v.toLocaleString('ko-KR', { maximumFractionDigits: decimals, minimumFractionDigits: decimals > 1 ? 2 : 0 });

  return (
    <div ref={box} className={`stock-chart ${up ? 'up' : 'down'}`}>
      <svg width={width} height={height} role="img" aria-label={`${label} ${timeText(points[0]!.t)}부터 ${timeText(points.at(-1)!.t)}까지, 마지막 ${fmt(prices.at(-1))}${unit}`}
        onPointerMove={move} onPointerDown={move} onPointerLeave={() => setHover(null)}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map(v => <g key={v}><line className="grid" x1={0} x2={W} y1={y(v)} y2={y(v)} /><text className="axis" x={W + 6} y={y(v) + 4}>{num(v)}</text></g>)}
        {xTicks.map((i, k) => <text key={k} className="axis" x={x(i)} y={height - 6} textAnchor={k === 0 ? 'start' : k === 3 ? 'end' : 'middle'}>{timeText(points[i]!.t)}</text>)}
        {baseline != null && <line className="baseline" x1={0} x2={W} y1={y(baseline)} y2={y(baseline)} />}
        <path d={`${line}L${W},${top + H}L0,${top + H}Z`} fill={`url(#${gid})`} />
        <path d={line} className="price-line" />
        <circle className="last-dot" cx={x(points.length - 1)} cy={y(prices.at(-1)!)} r={3.5} />
        <rect className="last-tag" x={W + 2} y={y(prices.at(-1)!) - 10} width={right - 4} height={20} rx={4} />
        <text className="last-text" x={W + right / 2} y={y(prices.at(-1)!) + 4} textAnchor="middle">{num(prices.at(-1)!)}</text>
        {h && hover != null && <g className="cross">
          <line x1={x(hover)} x2={x(hover)} y1={top} y2={top + H} />
          <circle cx={x(hover)} cy={y(h.price)} r={4.5} />
        </g>}
      </svg>
      {h && hover != null && (
        <div className="stock-tip" style={{ left: Math.min(Math.max(x(hover) - 60, 0), W - 120) }}>
          <b>{num(h.price)}{unit && ` ${unit}`}</b><small>{timeText(h.t)}</small>
        </div>
      )}
    </div>
  );
}

/** 낮음~높음 막대 위에 현재 위치 표시(금일 변동, 52주 변동폭). */
export function RangeBar({ label, low, high, value }: { label: string; low?: number | null | undefined; high?: number | null | undefined; value?: number | null | undefined }) {
  if (low == null || high == null) return null;
  const pos = value == null || high === low ? 50 : Math.min(100, Math.max(0, ((value - low) / (high - low)) * 100));
  return (
    <div className="range-bar">
      <small>{label}</small>
      <div><b>{fmt(low)}</b><span className="track"><i style={{ left: `${pos}%` }} /></span><b>{fmt(high)}</b></div>
    </div>
  );
}
