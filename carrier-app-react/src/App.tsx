import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ComponentType } from "react";
import FilterSheet from "./components/FilterSheet";
import RouteLab from "./components/RouteLab";
import { CALL_TYPES, INITIAL_ORDERS, inGraph, isLocalOrder, router, SCREENS, VERSIONS } from "./lib/data";
import { activeFilterCount, DEFAULT_FILTERS, filterOrders, reorigin } from "./lib/orders";
import { initialState, loadPersisted, reducer, savePersisted } from "./state/appState";
import type { ScreenApi, ScreenProps } from "./screens/api";
import { Earn, My } from "./screens/shared";
import { ADetail, AHome, AOrders, ATrip } from "./screens/versionA";
import { BDetail, BHome, BOrders, BTrip } from "./screens/versionB";
import { CDetail, CHome, COrders, CTrip } from "./screens/versionC";
import type { LatLng, Order, ScreenId, Version } from "./types";

const VERSION_SCREENS: Record<Version, Record<"home" | "orders" | "detail" | "trip", ComponentType<ScreenProps>>> = {
  a: { home: AHome, orders: AOrders, detail: ADetail, trip: ATrip },
  b: { home: BHome, orders: BOrders, detail: BDetail, trip: BTrip },
  c: { home: CHome, orders: COrders, detail: CDetail, trip: CTrip },
};
const VERSION_KEYS = Object.keys(VERSIONS) as Version[];

function fromHash(): { version?: Version; screen?: ScreenId } {
  const h = location.hash.match(/^#([abc])(?:-(home|orders|detail|trip|earn|my))?$/);
  if (!h) return {};
  return { version: h[1] as Version, screen: (h[2] ?? "home") as ScreenId };
}

export default function App() {
  const [s, dispatch] = useReducer(reducer, undefined, () => initialState({ ...loadPersisted(), ...fromHash() }));
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS);
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [toast, setToast] = useState("");
  const [live, setLive] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  /* 온라인이면 실시간 지도로 전환한다 */
  useEffect(() => {
    const probe = new Image();
    probe.onload = () => setLive(true);
    probe.src = "https://tile.openstreetmap.org/14/14034/6476.png";
  }, []);
  /* 수락 제한시간 */
  const counting = s.screen === "detail" && s.cd > 0;
  useEffect(() => {
    if (!counting) return undefined;
    const t = setInterval(() => dispatch({ type: "tick" }), 1000);
    return () => clearInterval(t);
  }, [counting]);
  useEffect(() => { history.replaceState(null, "", `#${s.version}-${s.screen}`); }, [s.version, s.screen]);
  useEffect(() => { savePersisted(s); }, [s]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const say = useCallback((m: string) => {
    setToast(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2400);
  }, []);
  const locate = useCallback(() => {
    if (!navigator.geolocation) return say("이 브라우저에서는 위치를 쓸 수 없습니다.");
    navigator.geolocation.getCurrentPosition((p) => {
      const at: LatLng = [p.coords.latitude, p.coords.longitude];
      if (!inGraph(at)) return say("지금 위치는 내장 경로 범위(구미·칠곡) 밖입니다.");
      setOrigin(at);
      setOrders((l) => reorigin(l, at, router.route, inGraph));
      say("내 위치 기준으로 공차 거리를 다시 계산했습니다.");
    }, () => say("위치를 가져오지 못했습니다. 브라우저에서 위치 권한을 허용해 주세요."), { enableHighAccuracy: true, timeout: 10000 });
  }, [say]);

  const list = useMemo(() => filterOrders(orders, s.filters, s.q, s.sort, s.saved, isLocalOrder), [orders, s.filters, s.q, s.sort, s.saved]);
  const byId = (i: number): Order => orders.find((o) => o.id === i) ?? orders[0]!;
  const closeFilters = useCallback(() => dispatch({ type: "filterSheet", open: false }), []);

  const a: ScreenApi = {
    version: s.version, online: s.online, list, id: s.id, order: byId(s.id), tripOrder: byId(s.trip.id), trip: s.trip,
    sort: s.sort, filters: s.filters, filterCount: activeFilterCount(s.filters), q: s.q, bmap: s.bmap, cd: s.cd,
    isSaved: (i) => s.saved.includes(i),
    mapProps: { version: s.version, screen: s.screen, live, origin },
    toggle: () => dispatch({ type: "toggleOnline" }),
    go: (screen) => dispatch({ type: "go", screen }),
    open: (id) => dispatch({ type: "open", id }),
    select: (id) => dispatch({ type: "select", id }),
    say, locate,
    setSort: (sort) => dispatch({ type: "sort", sort }),
    setQ: (q) => dispatch({ type: "query", q }),
    toggleMap: () => dispatch({ type: "toggleMap" }),
    openFilters: () => dispatch({ type: "filterSheet", open: true }),
    resetAll: () => { dispatch({ type: "filters", filters: DEFAULT_FILTERS }); dispatch({ type: "query", q: "" }); },
    accept: () => dispatch({ type: "accept" }),
    retry: () => dispatch({ type: "retry" }),
    scan: () => dispatch({ type: "scan" }),
    stage: () => dispatch({ type: "stage" }),
    toggleSaved: () => dispatch({ type: "toggleSaved", id: s.id }),
  };
  const Screen = s.screen === "earn" ? Earn : s.screen === "my" ? My : VERSION_SCREENS[s.version][s.screen];
  const note = VERSIONS[s.version];

  return (
    <main className="hub">
      <section className="rail" aria-label="버전과 화면 선택">
        <h1>운송 파트너 앱 콜 화면 3종 (React·TypeScript)</h1>
        <p className="muted" style={{ margin: 0 }}>화물차 기사용 시안입니다. 세 버전 모두 같은 간격 규칙과 같은 도로 데이터를 씁니다.</p>
        <div id="versions" className="stack">
          {VERSION_KEYS.map((k) => (
            <button type="button" key={k} className="vbtn" data-v={k} aria-pressed={s.version === k} onClick={() => dispatch({ type: "version", version: k })}><b>{VERSIONS[k].name}</b><span>{VERSIONS[k].sub}</span></button>
          ))}
        </div>
        <div id="screens" className="snav">
          {SCREENS.map(([id, n]) => <button type="button" key={id} data-s={id} aria-pressed={s.screen === id} onClick={() => (id === "detail" ? a.open(s.id) : a.go(id))}>{n}</button>)}
        </div>
      </section>
      <section aria-label="앱 미리보기">
        <div id="phone" className="phone" data-theme-v={s.version}>
          <Screen key={s.version + s.screen} a={a} />
          {s.filterOpen && <FilterSheet filters={s.filters} callTypes={CALL_TYPES} resultCount={list.length} onChange={(filters) => dispatch({ type: "filters", filters })} onClose={closeFilters} />}
          {toast && <div className="toast" role="status">{toast}</div>}
        </div>
      </section>
      <section className="side">
        <div className="panel" id="vnote">
          <h2>{note.name}</h2>
          <p className="muted" style={{ margin: 0 }}>{note.refs}</p>
          <ul className="notes">{note.why.map((w) => <li key={w}>{w}</li>)}</ul>
          <p style={{ margin: 0, fontWeight: 700 }}>{note.best}</p>
        </div>
        <RouteLab live={live} />
      </section>
    </main>
  );
}
