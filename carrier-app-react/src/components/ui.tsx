import type { Order, ScreenId, SortKey, Trip } from "../types";
import { STAGES } from "../lib/data";
import { km1, routeTitle, won } from "../lib/orders";
import { BAGS_TO_SCAN } from "../state/appState";

const ICON = {
  pin: '<path d="M12 22s7-7.5 7-12a7 7 0 0 0-14 0c0 4.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  truck: '<path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  home: '<path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
  won: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  back: '<path d="m15 6-6 6 6 6"/>',
  next: '<path d="m9 6 6 6-6 6"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  qr: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM21 14v3M14 21h7"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  play: '<path d="M8 5v14l11-7z" fill="currentColor"/>',
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  nav: '<path d="m3 11 18-8-8 18-2-8z"/>',
  locate: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
} as const;
export type IconName = keyof typeof ICON;

export const Ic = ({ k, s = 20 }: { k: IconName; s?: number }) => (
  <svg aria-hidden="true" width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: ICON[k] }} />
);

export const GradeTag = ({ o }: { o: Order }) => <span className={"tag " + o.grade.toLowerCase()}>통과증 {o.grade}</span>;
export const Tags = ({ o }: { o: Order }) => (
  <>
    <GradeTag o={o} />
    {o.tags.map((t, i) => <span key={t} className={"tag" + (i === 0 ? " y" : "")}>{t}</span>)}
  </>
);

export function OrderCard({ o, selected, saved, onClick }: { o: Order; selected?: boolean; saved?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={"card" + (selected ? " selected" : "")} data-id={o.id} data-order onClick={onClick}>
      <span className="row wrap"><Tags o={o} />{saved && <span className="tag">저장함</span>}</span>
      <span className="row between">
        <span className="stack-1 grow"><span className="t16 b">{routeTitle(o)}</span><span className="t12 dim">{o.item} · 마대 {o.bags}개 · {o.ton}t</span></span>
        <span className="stack-1 right"><span className="t20 b green num">{won(o.fare)}</span><span className="t12 dim">{o.pay}</span></span>
      </span>
      <span className="row between t12"><span className="m">{o.when}</span><span className="dim num">적재 {km1(o.km)} · 공차 {km1(o.emptyKm)}</span></span>
    </button>
  );
}
export const CompactRow = ({ o, onClick }: { o: Order; onClick: () => void }) => (
  <button type="button" className="card" data-order data-id={o.id} onClick={onClick}>
    <span className="row between">
      <span className="stack-1 grow"><span className="t14 b">{routeTitle(o)}</span><span className="t12 dim">{o.when} · 공차 {km1(o.emptyKm)}</span></span>
      <span className="t16 b green num">{won(o.fare)}</span>
    </span>
  </button>
);
const KPIS: [string, string, boolean][] = [["오늘 수입", "184,000원", true], ["완료 운행", "2건", false], ["운행 거리", "86km", false]];
export const Kpis = () => (
  <div className="kpis">
    {KPIS.map(([a, b, g]) => <div className="kpi" key={a}><span className="t12 dim m">{a}</span><span className={"t14 b num" + (g ? " green" : "")}>{b}</span></div>)}
  </div>
);
export const SwitchRow = ({ online, onToggle }: { online: boolean; onToggle: () => void }) => (
  <div className="row between">
    <div className="stack-1"><span className="t12 dim m">운행 상태</span><span className="t20 b">{online ? "콜 받는 중" : "운행 대기 중"}</span></div>
    <button type="button" className="switch" role="switch" aria-checked={online} aria-label="콜 받기" onClick={onToggle}><i /></button>
  </div>
);
export const Stops = ({ o }: { o: Order }) => (
  <div className="stops">
    <div className="stop"><span className="pin" /><div className="stack-1 grow"><span className="t14 b">{o.shipper} · {o.from}</span><span className="t12 dim">{o.window} · {o.cond}</span></div></div>
    {o.via && <div className="stop"><span className="pin" /><div className="stack-1 grow"><span className="t14 b">{o.via}</span><span className="t12 dim">{o.viaNote ?? "두 번째 상차지"}</span></div></div>}
    <div className="stop"><span className="pin drop" /><div className="stack-1 grow"><span className="t14 b">{o.consignee} · {o.dropLabel ?? o.to}</span><span className="t12 dim">{o.dropNote}</span></div></div>
  </div>
);
export const FareBreak = ({ o }: { o: Order }) => (
  <div className="kpis">
    {([["기본 운임", o.base], ["등급 프리미엄", o.premium], ["대기 보상", o.wait]] as const).map(([a, v]) => <div className="stack-1" key={a}><span className="t12 dim">{a}</span><span className="t14 b num">{won(v)}</span></div>)}
  </div>
);
export const Metrics = ({ o }: { o: Order }) => <span className="t12 dim num">공차 {km1(o.emptyKm)} {o.emptyMin}분 + 적재 {km1(o.km)} {o.min}분 (예상)</span>;
export const Steps = ({ stage }: { stage: number }) => (
  <div className="steps">{STAGES.map((n, i) => <div key={n} className={"step" + (i <= stage ? " on" : "")}><i />{n}</div>)}</div>
);
const TABS: [ScreenId, string, IconName][] = [["home", "홈", "home"], ["orders", "운반요청", "list"], ["trip", "운행중", "truck"], ["earn", "정산", "won"], ["my", "마이", "user"]];
export const Tabs = ({ screen, go }: { screen: ScreenId; go: (s: ScreenId) => void }) => (
  <nav className="tabs" aria-label="주요 메뉴">
    {TABS.map(([id, name, icon]) => <button type="button" key={id} className="tab" data-tab={id} {...(screen === id ? { "aria-current": "page" as const } : {})} onClick={() => go(id)}><Ic k={icon} />{name}</button>)}
  </nav>
);
export const BackFloat = ({ go, onLocate, saved, onSave }: { go: (s: ScreenId) => void; onLocate: () => void; saved: boolean; onSave: () => void }) => (
  <div className="float-top">
    <button type="button" className="round" aria-label="뒤로" onClick={() => go("orders")}><Ic k="back" /></button>
    <div className="row">
      <button type="button" className={"round" + (saved ? " on" : "")} data-save aria-pressed={saved} aria-label={saved ? "저장 취소" : "이 콜 저장"} onClick={onSave}><Ic k="bookmark" /></button>
      <button type="button" className="round" aria-label="내 위치에서 다시 계산" onClick={onLocate}><Ic k="locate" /></button>
    </div>
  </div>
);
export function AcceptFooter({ cd, lg, go, onAccept, onRetry }: { cd: number; lg?: boolean; go: (s: ScreenId) => void; onAccept: () => void; onRetry: () => void }) {
  const cl = lg ? " lg" : "";
  const over = cd <= 0;
  return (
    <div className="footer">
      <button type="button" className={"btn line" + cl} onClick={() => go("orders")}>건너뛰기</button>
      <button type="button" className={"btn grow" + cl} data-accept onClick={over ? onRetry : onAccept}>
        {over ? "시간 초과 · 다시 받기" : <>수락하기 <span className="num">0:{String(cd).padStart(2, "0")}</span></>}
      </button>
    </div>
  );
}
export function TripAction({ t, onStage, go }: { t: Trip; onStage: () => void; go: (s: ScreenId) => void }) {
  const left = BAGS_TO_SCAN - t.scanned;
  if (t.stage === 0) return <button type="button" className="btn lg full" data-stage onClick={onStage}>상차지 도착</button>;
  if (t.stage === 1) return <button type="button" className="btn lg full" data-stage disabled={left > 0} onClick={onStage}>{left > 0 ? `상차 완료 · ${left}개 더 스캔` : "상차 완료"}</button>;
  if (t.stage === 2) return <button type="button" className="btn lg full" data-stage onClick={onStage}>하차지 도착</button>;
  if (t.stage === 3) return <button type="button" className="btn lg full" data-stage onClick={onStage}>인계서 전송 · 운행 완료</button>;
  return <button type="button" className="btn lg full" data-finish onClick={() => go("earn")}>정산 내역 보기</button>;
}
export function NavLink({ t, o, grow }: { t: Trip; o: Order; grow?: boolean }) {
  const at = t.stage === 0 ? o.stops[0]! : o.stops[o.stops.length - 1]!;
  const name = t.stage === 0 ? o.shipper : o.consignee;
  return <a className={"btn line " + (grow ? "grow" : "full")} target="_blank" rel="noopener noreferrer" href={`https://map.kakao.com/link/to/${encodeURIComponent(name)},${at[0]},${at[1]}`}><Ic k="nav" />카카오맵 길안내</a>;
}
export function TripBody({ t, o, onScan }: { t: Trip; o: Order; onScan: () => void }) {
  if (t.stage === 1) {
    return (
      <div className="card">
        <div className="row between">
          <div className="stack-1"><span className="t12 dim m">마대 QR 검수</span><span className="t20 b num">{t.scanned} / {BAGS_TO_SCAN}개</span></div>
          <button type="button" className="btn" data-scan disabled={t.scanned >= BAGS_TO_SCAN} onClick={onScan}><Ic k="qr" />QR 스캔</button>
        </div>
        <div className="bar"><i style={{ width: Math.round((t.scanned / BAGS_TO_SCAN) * 100) + "%" }} /></div>
        <span className="t12 dim">전부 스캔해야 상차 완료 버튼이 열립니다.</span>
      </div>
    );
  }
  if (t.stage >= 3) {
    return (
      <div className="card">
        <span className="t12 dim m">{t.stage === 3 ? "하차 처리" : "이번 운행"}</span>
        <span className="t20 b num">{t.stage === 3 ? "계량 후 인계서를 전송하세요" : won(o.fare) + " 정산 예정"}</span>
        <span className="t12 dim">폐기물 인계서는 앱이 자동으로 작성합니다.</span>
      </div>
    );
  }
  return (
    <div className="card">
      <span className="t12 dim m">다음 목적지</span>
      <span className="t20 b">{t.stage === 0 ? o.shipper : o.consignee}</span>
      <span className="t14 dim num">{t.stage === 0 ? `${km1(o.emptyKm)} · ${o.emptyMin}분` : `${km1(o.km)} · ${o.min}분`} (예상) · 화물차 조건 반영</span>
    </div>
  );
}
const SORTS: [SortKey, string][] = [["fare", "운임순"], ["near", "가까운순"], ["per", "km당 운임"]];
export const SortChips = ({ sort, setSort }: { sort: SortKey; setSort: (k: SortKey) => void }) => (
  <>{SORTS.map(([k, n]) => <button type="button" key={k} className="chip" data-sort={k} aria-pressed={sort === k} onClick={() => setSort(k)}>{n}</button>)}</>
);
export const FilterChip = ({ count, onClick }: { count: number; onClick: () => void }) => (
  <button type="button" className="chip" data-filter-open aria-pressed={count > 0} aria-haspopup="dialog" onClick={onClick}>필터{count > 0 ? ` ${count}` : ""}</button>
);
export const EmptyCard = ({ onReset }: { onReset: () => void }) => (
  <div className="card">
    <span className="t14 b">조건에 맞는 요청이 없습니다</span>
    <span className="t12 dim">검색어를 지우거나 필터를 줄여 보세요.</span>
    <button type="button" className="btn line full" data-reset onClick={onReset}>조건 모두 지우기</button>
  </div>
);
