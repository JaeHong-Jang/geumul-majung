import { memo, useEffect, useId, useRef, useState } from 'react';
import './TruckLoading.css';

/**
 * 재활용 수거차 로딩 애니메이션 (iPhone 14 Pro 393 × 852 기준 SVG)
 *
 * 흐름: 화면 아래에서 진입(감속) → 가운데 정차(로딩 동안 경광등 깜빡임)
 *       → done=true 가 되면 출발해 지평선의 재활용 센터 쪽으로 사라짐 → onFinish 호출
 *
 * 원근: 소실점(HORIZON)을 기준으로 p = 1/거리. 화면 y = HORIZON + DEPTH·p,
 *       차·나무·차선 크기는 모두 p 배율 → 멀어질수록 작아지고 위로 올라감.
 *
 * @param done      true 가 되면(진입이 끝난 뒤) 차가 출발합니다
 * @param onFinish  출발 애니메이션이 끝나면 한 번 호출
 */
const W = 393;
const H = 852;
const CX = W / 2;
const HORIZON = 205;
const DEPTH = H - HORIZON;
const TRUCK_W = 250;
const TRUCK_H = 235;
const ROAD_HALF = 300;
const LANE = 150;
const ROOF_L = 0.12;

const P_IN = (H + 6 - HORIZON) / (DEPTH - TRUCK_H); // 화면 아래에 완전히 숨은 위치
const P_STOP = (465 - HORIZON) / (DEPTH - TRUCK_H / 2); // 정차 위치(차 중심 ≈ 화면 가운데)
const Z_STOP = 1 / P_STOP;
const Z_FAR = 34;

export const TRUCK_TIMING = { enter: 2.4, leave: 1.4 };

const yAt = (p) => HORIZON + DEPTH * p;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeOutCubic = (x) => 1 - (1 - x) ** 3;

function truckAt(t, leaveAt) {
  const { enter, leave } = TRUCK_TIMING;
  if (t < enter) {
    const u = t / enter;
    const p = P_IN + (P_STOP - P_IN) * easeOutCubic(u);
    return { p, z: 1 / p, braking: u > 0.55, opacity: 1, idle: false };
  }
  if (leaveAt == null || t < leaveAt) {
    return { p: P_STOP, z: Z_STOP, braking: true, opacity: 1, idle: true };
  }
  const u = (t - leaveAt) / leave;
  if (u >= 1) return { p: 1 / Z_FAR, z: Z_FAR, braking: false, opacity: 0, idle: false };
  const z = Z_STOP + (Z_FAR - Z_STOP) * u ** 2.2;
  const p = 1 / z;
  return { p, z, braking: false, opacity: clamp01((p - 0.03) / 0.04), idle: false };
}

function useReducedMotion() {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches,
  );
  useEffect(() => {
    const m = window.matchMedia?.(query);
    if (!m) return undefined;
    const onChange = () => setReduced(m.matches);
    m.addEventListener?.('change', onChange);
    return () => m.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}

/* ───────────────────────── 그림 조각 ───────────────────────── */

/** 재활용 마크(세 화살표) */
function RecycleMark({ cx, cy, r, color }) {
  const arrows = [0, 1, 2].map((i) => {
    const a0 = ((-90 + i * 120 + 14) * Math.PI) / 180;
    const a1 = ((-90 + i * 120 + 96) * Math.PI) / 180;
    const x0 = r * Math.cos(a0);
    const y0 = r * Math.sin(a0);
    const x1 = r * Math.cos(a1);
    const y1 = r * Math.sin(a1);
    const tx = -Math.sin(a1);
    const ty = Math.cos(a1);
    const nx = Math.cos(a1);
    const ny = Math.sin(a1);
    const L = r * 0.55;
    const w = r * 0.42;
    const hx = x1 + tx * L * 0.55;
    const hy = y1 + ty * L * 0.55;
    return (
      <g key={i}>
        <path
          d={`M${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`}
          fill="none"
          stroke={color}
          strokeWidth={r * 0.34}
          strokeLinecap="round"
        />
        <polygon
          points={`${hx + tx * L * 0.5},${hy + ty * L * 0.5} ${x1 + nx * w},${y1 + ny * w} ${x1 - nx * w},${y1 - ny * w}`}
          fill={color}
        />
      </g>
    );
  });
  return <g transform={`translate(${cx},${cy})`}>{arrows}</g>;
}

function Cloud({ x, y, s }) {
  return (
    <g transform={`translate(${x},${y}) scale(${s})`} fill="#ffffff" opacity={0.12}>
      <ellipse cx={0} cy={0} rx={26} ry={11} />
      <ellipse cx={-14} cy={-6} rx={13} ry={10} />
      <ellipse cx={6} cy={-10} rx={15} ry={12} />
    </g>
  );
}

function Tree({ X, z }) {
  const p = 1 / z;
  const s = 2.4; // 나무는 차보다 크게(실제 비율)
  return (
    <g transform={`translate(${CX + X * p},${yAt(p)}) scale(${p})`}>
      <ellipse cx={0} cy={0} rx={34 * s} ry={7 * s} fill="#0d2419" opacity={0.3} />
      <rect x={-6 * s} y={-58 * s} width={12 * s} height={58 * s} rx={4 * s} fill="#1a4331" />
      <circle cx={0} cy={-86 * s} r={38 * s} fill="#4f8f6d" />
      <circle cx={-16 * s} cy={-96 * s} r={22 * s} fill="#67a582" />
      <circle cx={18 * s} cy={-74 * s} r={20 * s} fill="#3f7f5f" />
    </g>
  );
}

function Bins({ X, z }) {
  const p = 1 / z;
  return (
    <g transform={`translate(${CX + X * p},${yAt(p)}) scale(${p})`}>
      <ellipse cx={0} cy={0} rx={54} ry={8} fill="#0d2419" opacity={0.3} />
      {['#8fc3a2', '#edf5ee', '#f4d879'].map((c, i) => {
        const bx = -45 + i * 31;
        return (
          <g key={c}>
            <rect x={bx} y={-52} width={28} height={52} rx={4} fill={c} />
            <rect x={bx - 2} y={-58} width={32} height={9} rx={3} fill={c} opacity={0.85} />
            <rect x={bx + 9} y={-36} width={10} height={3} rx={1.5} fill="#1B7F34" opacity={0.55} />
          </g>
        );
      })}
    </g>
  );
}

const ROADSIDE = [
  { X: -420, z: 11, kind: 'tree' },
  { X: 430, z: 8.5, kind: 'tree' },
  { X: 345, z: 6.0, kind: 'bins' },
  { X: -440, z: 5.6, kind: 'tree' },
  { X: 450, z: 4.2, kind: 'tree' },
  { X: -345, z: 3.6, kind: 'bins' },
  { X: -430, z: 2.9, kind: 'tree' },
  { X: 440, z: 2.25, kind: 'tree' },
  { X: -440, z: 1.75, kind: 'tree' },
];

/** 움직이지 않는 배경: 하늘·언덕·재활용 센터·3차선 도로·길가 */
const Scenery = memo(function Scenery({ ids }) {
  const pB = (H + 40 - HORIZON) / DEPTH;
  const yB = H + 40;

  const dashes = [];
  for (const side of [-1, 1]) {
    for (let z = 0.75; z < 16; z += 0.62) {
      const p1 = 1 / z;
      const p2 = 1 / (z + 0.3);
      const x1 = CX + side * LANE * p1;
      const x2 = CX + side * LANE * p2;
      const w1 = 4 * p1;
      const w2 = 4 * p2;
      dashes.push(
        <polygon
          key={`${side}-${z}`}
          points={`${x1 - w1},${yAt(p1)} ${x1 + w1},${yAt(p1)} ${x2 + w2},${yAt(p2)} ${x2 - w2},${yAt(p2)}`}
          fill="#cfe5d6"
          opacity={0.85}
        />,
      );
    }
  }

  return (
    <g>
      <rect x={0} y={0} width={W} height={HORIZON + 2} fill={`url(#${ids.sky})`} />
      <Cloud x={52} y={186} s={0.85} />
      <Cloud x={340} y={178} s={1} />
      <path
        d={`M0 ${HORIZON + 2} L0 ${HORIZON - 16} Q 60 ${HORIZON - 36} 130 ${HORIZON - 12} Q 172 ${HORIZON - 2} 196 ${HORIZON} Z`}
        fill="#235e43"
      />
      <path
        d={`M${W} ${HORIZON + 2} L${W} ${HORIZON - 22} Q 330 ${HORIZON - 42} 262 ${HORIZON - 14} Q 222 ${HORIZON - 2} 196 ${HORIZON} Z`}
        fill="#20573e"
      />

      {/* 목적지: 재활용 센터 */}
      <g transform={`translate(${CX},${HORIZON + 1})`}>
        <circle cx={31} cy={-45} r={3.5} fill="#ffffff" opacity={0.22} />
        <rect x={20} y={-41} width={9} height={13} rx={1.5} fill="#cfe5d6" />
        <path
          d="M-40 -28 L-28 -38 L-16 -28 L-4 -38 L8 -28 L20 -38 L32 -28 L40 -28 L40 -26 L-40 -26 Z"
          fill="#8fc3a2"
        />
        <rect x={-38} y={-28} width={76} height={28} rx={2} fill="#edf5ee" />
        <RecycleMark cx={-19} cy={-14} r={6.5} color="#1B7F34" />
        <rect x={2} y={-16} width={16} height={16} rx={1.5} fill="#8fc3a2" />
        <rect x={23} y={-20} width={9} height={7} rx={1} fill="#cfe5d6" />
      </g>

      <rect x={0} y={HORIZON} width={W} height={H - HORIZON} fill={`url(#${ids.ground})`} />

      {/* 3차선 도로 */}
      <polygon
        points={`${CX},${HORIZON} ${CX + ROAD_HALF * pB},${yB} ${CX - ROAD_HALF * pB},${yB}`}
        fill={`url(#${ids.road})`}
      />
      {[-1, 1].map((side) => (
        <polygon
          key={side}
          points={`${CX},${HORIZON} ${CX + side * ROAD_HALF * pB * 0.97},${yB} ${CX + side * ROAD_HALF * pB * 0.94},${yB}`}
          fill="#8fc3a2"
          opacity={0.9}
        />
      ))}
      {dashes}

      {ROADSIDE.map((it) =>
        it.kind === 'tree' ? (
          <Tree key={`${it.X}-${it.z}`} X={it.X} z={it.z} />
        ) : (
          <Bins key={`${it.X}-${it.z}`} X={it.X} z={it.z} />
        ),
      )}
    </g>
  );
});

/** 후면 적재식 재활용 수거차(뒷모습). 원점 = 바닥 가운데 */
function Truck({ p, z, blink, braking, ids }) {
  const hw = TRUCK_W / 2;
  const roofVis = ((yAt(p) - TRUCK_H * p - HORIZON) * (ROOF_L / (z + ROOF_L))) / p;
  const k = z / (z + ROOF_L);
  const rY = -TRUCK_H;
  const mouth = 'M-84 -62 L-84 -94 Q -84 -114 -64 -114 L64 -114 Q 84 -114 84 -94 L84 -62';

  return (
    <g>
      <ellipse cx={0} cy={2} rx={hw + 12} ry={13} fill="#0b2016" opacity={0.45} />

      {/* 뒷바퀴(복륜) */}
      {[-118, 76].map((x) => (
        <g key={x}>
          <rect x={x} y={-46} width={42} height={46} rx={9} fill="#1d2723" />
          {[-40, -30, -20].map((ty) => (
            <rect key={ty} x={x + 6} y={ty} width={30} height={3} rx={1.5} fill="#33413a" />
          ))}
        </g>
      ))}
      <rect x={-76} y={-46} width={152} height={18} fill="#24332c" />

      {/* 지붕 윗면: 카메라가 위에 있어 보이는 면, 멀어질수록 얇아짐 */}
      <path
        d={`M${-hw + 6} ${rY + 6} L${-hw * k + 8} ${rY - roofVis + 4} Q ${-hw * k + 8} ${rY - roofVis} ${-hw * k + 14} ${rY - roofVis}
            L${hw * k - 14} ${rY - roofVis} Q ${hw * k - 8} ${rY - roofVis} ${hw * k - 8} ${rY - roofVis + 4} L${hw - 6} ${rY + 6} Z`}
        fill="#ffffff"
      />

      {/* 경광등: 좌우 번갈아 */}
      {[-1, 1].map((s) => {
        const on = (s < 0) === (blink === 0);
        const bx = s * (hw * k - 30);
        const by = rY - roofVis * 0.5;
        return (
          <g key={s}>
            {on && <circle cx={bx} cy={by - 4} r={26} fill={`url(#${ids.glow})`} />}
            <rect x={bx - 11} y={by - 10} width={22} height={12} rx={5} fill={on ? '#ffc94a' : '#d8a234'} />
            <rect x={bx - 13} y={by} width={26} height={4} rx={2} fill="#2b3a33" />
          </g>
        );
      })}

      {/* 적재함 */}
      <rect x={-hw} y={-TRUCK_H} width={TRUCK_W} height={TRUCK_H - 56} rx={14} fill="#e9f1e6" />
      <rect x={-hw} y={-TRUCK_H + 10} width={9} height={TRUCK_H - 76} rx={4} fill="#f7fbf5" />
      <rect x={hw - 9} y={-TRUCK_H + 10} width={9} height={TRUCK_H - 76} rx={4} fill="#cddbc9" />
      <circle cx={0} cy={-194} r={30} fill="#1B7F34" />
      <RecycleMark cx={0} cy={-194} r={17} color="#ffffff" />

      {/* 테일게이트(압축 덮개) + 투입구 */}
      <path d="M-114 -52 L-114 -128 Q -114 -152 -90 -152 L90 -152 Q 114 -152 114 -128 L114 -52 Z" fill="#1B7F34" />
      <rect x={-96} y={-146} width={192} height={7} rx={3.5} fill="#33774f" />
      <path d={`${mouth} Z`} fill="#10241b" />
      <rect x={-58} y={-84} width={30} height={22} rx={3} fill="#f4d879" transform="rotate(-12 -43 -73)" />
      <rect x={-16} y={-92} width={14} height={30} rx={6} fill="#8fc3a2" transform="rotate(18 -9 -77)" />
      <rect x={14} y={-82} width={34} height={20} rx={2} fill="#eef1ea" transform="rotate(8 31 -72)" />
      <circle cx={58} cy={-72} r={9} fill="#c9d0c3" />
      <path d={mouth} fill="none" stroke="#8fc3a2" strokeWidth={5} strokeLinejoin="round" />
      <rect x={-114} y={-64} width={228} height={12} rx={4} fill="#1f5139" />

      {/* 유압 실린더 */}
      {[-1, 1].map((s) => (
        <g key={s}>
          <line x1={s * 111} y1={-200} x2={s * 106} y2={-138} stroke="#2b3a33" strokeWidth={11} strokeLinecap="round" />
          <line x1={s * 106} y1={-138} x2={s * 101} y2={-104} stroke="#dfe6db" strokeWidth={6} strokeLinecap="round" />
          <circle cx={s * 111} cy={-200} r={7} fill="#2b3a33" />
          <circle cx={s * 101} cy={-104} r={5.5} fill="#2b3a33" />
        </g>
      ))}

      {/* 후미등: 감속·정차 중 점등 */}
      {[-104, 90].map((lx) => (
        <g key={lx}>
          {braking && <circle cx={lx + 7} cy={-80} r={22} fill={`url(#${ids.red})`} />}
          <rect x={lx} y={-96} width={14} height={30} rx={4} fill={braking ? '#ff5a3c' : '#c8463a'} />
        </g>
      ))}

      {/* 발판·범퍼·번호판 */}
      <rect x={-126} y={-56} width={30} height={7} rx={3} fill="#a7b8a3" />
      <rect x={96} y={-56} width={30} height={7} rx={3} fill="#a7b8a3" />
      <rect x={-112} y={-50} width={224} height={12} rx={3} fill="#2b3a33" />
      <rect x={-108} y={-48} width={14} height={6} rx={2} fill="#f2a23a" />
      <rect x={94} y={-48} width={14} height={6} rx={2} fill="#f2a23a" />
      <rect x={-26} y={-53} width={52} height={15} rx={3} fill="#f6f4ea" stroke="#2b3a33" strokeWidth={2} />
    </g>
  );
}

/* ───────────────────────── 컴포넌트 ───────────────────────── */

export default function TruckLoading({
  done = false,
  onFinish,
  eyebrow = '공장 판매자',
  title = '자원을 센터로 옮기는 중',
  subtitle = '잠시 대기',
}) {
  const reduced = useReducedMotion();
  const uid = useId().replace(/:/g, '');
  const ids = {
    sky: `${uid}-sky`,
    ground: `${uid}-ground`,
    road: `${uid}-road`,
    glow: `${uid}-glow`,
    red: `${uid}-red`,
  };

  const [t, setT] = useState(0);
  const leaveAt = useRef(null);
  const finished = useRef(false);
  const doneRef = useRef(done);
  const onFinishRef = useRef(onFinish);
  doneRef.current = done;
  onFinishRef.current = onFinish;

  // 프레임 루프
  useEffect(() => {
    if (reduced) return undefined;
    let raf;
    let start;
    const tick = (ts) => {
      if (start === undefined) start = ts;
      const now = (ts - start) / 1000;
      if (leaveAt.current == null && doneRef.current && now >= TRUCK_TIMING.enter) {
        leaveAt.current = now;
      }
      setT(now);
      if (leaveAt.current != null && now >= leaveAt.current + TRUCK_TIMING.leave) {
        if (!finished.current) {
          finished.current = true;
          onFinishRef.current?.();
        }
        return; // 끝나면 루프 정지
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  // 움직임 줄이기 설정: 정차한 차만 보여주고, done 이면 바로 종료
  useEffect(() => {
    if (reduced && done && !finished.current) {
      finished.current = true;
      onFinishRef.current?.();
    }
  }, [reduced, done]);

  const st = reduced
    ? { p: P_STOP, z: Z_STOP, braking: true, opacity: 1, idle: false }
    : truckAt(t, leaveAt.current);
  const blink = reduced ? 0 : Math.floor(t / 0.35) % 2;
  const bob = st.idle ? Math.sin(t * 2 * Math.PI * 10) * 0.8 * st.p : 0;

  return (
    <div className="truck-loading">
      <svg
        className="truck-loading__scene"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={ids.sky} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1B7F34" />
            <stop offset="1" stopColor="#367b59" />
          </linearGradient>
          <linearGradient id={ids.ground} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#22583f" />
            <stop offset="1" stopColor="#1c4b35" />
          </linearGradient>
          <linearGradient id={ids.road} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#174130" />
            <stop offset="1" stopColor="#113323" />
          </linearGradient>
          <radialGradient id={ids.glow}>
            <stop offset="0" stopColor="#ffd36e" stopOpacity="0.9" />
            <stop offset="1" stopColor="#ffd36e" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={ids.red}>
            <stop offset="0" stopColor="#ff6b4f" stopOpacity="0.85" />
            <stop offset="1" stopColor="#ff6b4f" stopOpacity="0" />
          </radialGradient>
        </defs>

        <Scenery ids={ids} />

        {st.opacity > 0 && (
          <g transform={`translate(${CX},${yAt(st.p) + bob}) scale(${st.p})`} opacity={st.opacity}>
            <Truck p={st.p} z={st.z} blink={blink} braking={st.braking} ids={ids} />
          </g>
        )}
      </svg>

      <div className="truck-loading__copy" role="status" aria-live="polite">
        <p className="truck-loading__eyebrow">{eyebrow}</p>
        <p className="truck-loading__title">{title}</p>
        <p className="truck-loading__sub">{subtitle}</p>
        <span className="truck-loading__dots" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span key={i} />
          ))}
        </span>
      </div>
    </div>
  );
}
