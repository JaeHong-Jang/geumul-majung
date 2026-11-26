import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import L from "leaflet";
import type { Factory, LatLng, RouteResult } from "../types";
import { BOUNDS, FACTORIES, GRAPH, INITIAL_ORDERS, inGraph, router } from "../lib/data";
import { createRouter, haversine } from "../lib/dijkstra";
import { addTiles, createMap, divIcon, factoryDots } from "../lib/map";
import { km1 } from "../lib/orders";
import { build, query, type OsmResponse } from "../lib/roadnet";

interface Point { lat: string; lon: string }
const toPoint = (p: LatLng): Point => ({ lat: String(p[0]), lon: String(p[1]) });
const first = INITIAL_ORDERS[0]!;
const MAX_DIRECT_KM = 100;
const SNAP_LIMIT_M = 1000;

function factoryAt(p: LatLng): string {
  const x = FACTORIES.find((f) => Math.abs(f[0] - p[0]) < 0.0003 && Math.abs(f[1] - p[1]) < 0.0003);
  return x ? `${x[3]} #${x[2]}` : "공장 좌표 아님";
}
function nearestFactory(p: LatLng, meters: number): Factory | null {
  let best: Factory | null = null;
  let bd = meters;
  for (const x of FACTORIES) {
    if (Math.abs(x[0] - p[0]) > 0.02 || Math.abs(x[1] - p[1]) > 0.02) continue;
    const d = haversine(p, [x[0], x[1]]);
    if (d < bd) { bd = d; best = x; }
  }
  return best;
}
async function fetchRoads(a: LatLng, b: LatLng, direct: number): Promise<OsmResponse> {
  const post = async (host: string): Promise<OsmResponse> => {
    const ctl = new AbortController();
    const tm = setTimeout(() => ctl.abort(), 40000);
    try {
      const res = await fetch(host + "/api/interpreter", { signal: ctl.signal, method: "POST", body: "data=" + encodeURIComponent(query(a, b, direct)), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return (await res.json()) as OsmResponse;
    } finally {
      clearTimeout(tm);
    }
  };
  return post("https://overpass-api.de").catch(() => post("https://overpass.kumi.systems"));
}

function Field({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (e: ChangeEvent<HTMLInputElement>) => void }) {
  return <label className="field" htmlFor={id}>{label}<input id={id} inputMode="decimal" value={value} onChange={onChange} /></label>;
}

export default function RouteLab({ live }: { live: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const token = useRef(0);
  const nextEnd = useRef<"from" | "to">("from");
  const [from, setFrom] = useState<Point>(toPoint(first.stops[0]!));
  const [to, setTo] = useState<Point>(toPoint(first.stops[first.stops.length - 1]!));
  const [place, setPlace] = useState("");
  const [result, setResult] = useState<[string, string][] | null>(null);
  const [msg, setMsg] = useState("");
  const fromRef = useRef(from), toRef = useRef(to), liveRef = useRef(live);
  fromRef.current = from;
  toRef.current = to;
  liveRef.current = live;

  const say = useCallback((s: string) => { setResult(null); setMsg(s); }, []);
  const show = useCallback((r: RouteResult, a: LatLng, b: LatLng, source: string) => {
    const m = mapRef.current, g = layerRef.current;
    if (!m || !g) return;
    g.clearLayers();
    L.polyline(r.coords, { color: "#FFF", weight: 7 }).addTo(g);
    L.polyline(r.coords, { color: "#1F5A3F", weight: 4 }).addTo(g);
    L.marker(a, { icon: divIcon("mk-pick", "", 20, 20), interactive: false }).addTo(g);
    L.marker(b, { icon: divIcon("mk-drop", "", 20, 20), interactive: false }).addTo(g);
    m.fitBounds(r.coords, { padding: [24, 24] });
    setMsg("");
    setResult([["거리", km1(r.meters / 1000)], ["예상 시간 (정체 미반영)", Math.round(r.seconds / 60) + "분"], ["탐색한 교차점", `${r.settled.toLocaleString("ko-KR")} / ${r.totalNodes.toLocaleString("ko-KR")}`], ["계산 시간", r.computeMs.toFixed(1) + "ms"], ["도로까지 보정 거리", `${r.snapFrom}m / ${r.snapTo}m`], ["출발 공장", factoryAt(a)], ["도착 공장", factoryAt(b)], ["도로 데이터", source]]);
  }, []);

  const run = useCallback(async (f: Point, t: Point, isLive: boolean): Promise<void> => {
    const a: LatLng = [parseFloat(f.lat), parseFloat(f.lon)];
    const b: LatLng = [parseFloat(t.lat), parseFloat(t.lon)];
    const my = ++token.current;
    if ([...a, ...b].some(Number.isNaN) || Math.abs(a[0]) > 90 || Math.abs(b[0]) > 90 || Math.abs(a[1]) > 180 || Math.abs(b[1]) > 180) return say("좌표를 숫자로 입력해 주세요. 예: 위도 36.1169, 경도 128.3752");
    if (inGraph(a) && inGraph(b)) {
      const r = router.route(a, b);
      if (r) show(r, a, b, "내장");
      else say("두 지점을 잇는 도로를 찾지 못했습니다.");
      return;
    }
    if (!isLive) return say("인터넷 연결 없이는 구미·칠곡 범위 안에서만 계산합니다.");
    const direct = haversine(a, b) / 1000;
    if (direct > MAX_DIRECT_KM) return say(`직선거리 ${MAX_DIRECT_KM}km 이내만 실시간으로 계산합니다. 지금은 ${Math.round(direct)}km입니다.`);
    say("실제 도로 데이터를 받는 중입니다.");
    try {
      const osm = await fetchRoads(a, b, direct);
      if (my !== token.current) return;
      const g = build(osm, GRAPH.meta.vehicle);
      const r = g && createRouter(g).route(a, b);
      if (!r) say("두 지점을 잇는 도로를 찾지 못했습니다.");
      else if (r.snapFrom > SNAP_LIMIT_M || r.snapTo > SNAP_LIMIT_M) say("좌표 근처 1km 안에 화물차가 다닐 도로가 없습니다. 좌표를 도로 가까이 옮겨 주세요.");
      else show(r, a, b, "실시간");
    } catch {
      if (my === token.current) say("도로 데이터 서버가 응답하지 않습니다. 잠시 뒤 다시 눌러 주세요.");
    }
  }, [say, show]);

  useEffect(() => {
    if (!box.current) return undefined;
    const m = createMap(box.current, false);
    mapRef.current = m;
    layerRef.current = L.layerGroup().addTo(m);
    m.fitBounds(BOUNDS);
    factoryDots(m, FACTORIES, "#2B5C9E");
    m.on("click", (e: L.LeafletMouseEvent) => {
      const hit = nearestFactory([e.latlng.lat, e.latlng.lng], 400);
      const p: Point = hit ? { lat: String(hit[0]), lon: String(hit[1]) } : { lat: e.latlng.lat.toFixed(5), lon: e.latlng.lng.toFixed(5) };
      if (nextEnd.current === "from") {
        setFrom(p);
        fromRef.current = p;
        nextEnd.current = "to";
      } else {
        setTo(p);
        toRef.current = p;
        nextEnd.current = "from";
        void run(fromRef.current, p, liveRef.current);
      }
    });
    void run(fromRef.current, toRef.current, false);
    return () => { m.remove(); mapRef.current = null; };
  }, [run]);

  useEffect(() => {
    const m = mapRef.current;
    if (!live || !m) return;
    m.setMaxBounds(L.latLngBounds([[-90, -180], [90, 180]]));
    m.setMinZoom(6);
    m.setMaxZoom(19);
    m.eachLayer((l) => { if (l instanceof L.TileLayer) m.removeLayer(l); });
    addTiles(m, true);
  }, [live]);

  const search = async (end: "from" | "to") => {
    const q = place.trim();
    if (!q) return say("찾을 주소나 장소를 입력해 주세요.");
    if (!live) return say("주소 검색은 인터넷 연결이 필요합니다. 좌표를 직접 넣어 주세요.");
    say("주소를 찾는 중입니다.");
    try {
      const res = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=kr&q=" + encodeURIComponent(q));
      if (!res.ok) throw new Error("HTTP " + res.status);
      const hit = ((await res.json()) as { lat: string; lon: string }[])[0];
      if (!hit) return say("검색 결과가 없습니다. 시·군·구까지 넣어 다시 찾아보세요.");
      const p: Point = { lat: (+hit.lat).toFixed(5), lon: (+hit.lon).toFixed(5) };
      if (end === "from") { setFrom(p); await run(p, to, live); } else { setTo(p); await run(from, p, live); }
    } catch {
      say("주소 검색 서버가 응답하지 않습니다. 좌표를 직접 넣어 주세요.");
    }
  };

  return (
    <div className="panel">
      <h2>좌표로 경로 계산</h2>
      <p className="muted" style={{ margin: 0 }}>지도를 누르면 출발과 도착이 번갈아 바뀌고, 400m 안의 공장이 있으면 그 좌표에 붙습니다. 좌표를 직접 넣어도 됩니다.</p>
      <div className="lab-map" ref={box} />
      <div className="stack">
        <label className="field" htmlFor="place">주소나 장소 검색<input id="place" placeholder="예: 구미시청" value={place} onChange={(e) => setPlace(e.target.value)} /></label>
        <div className="field-row">
          <button className="lab-btn" type="button" id="placeFrom" onClick={() => void search("from")}>출발지로</button>
          <button className="lab-btn" type="button" id="placeTo" onClick={() => void search("to")}>도착지로</button>
        </div>
      </div>
      <form id="labform" className="stack" onSubmit={(e) => { e.preventDefault(); void run(from, to, live); }}>
        <div className="field-row">
          <Field id="fromLat" label="출발 위도" value={from.lat} onChange={(e) => setFrom({ ...from, lat: e.target.value })} />
          <Field id="fromLon" label="출발 경도" value={from.lon} onChange={(e) => setFrom({ ...from, lon: e.target.value })} />
          <Field id="toLat" label="도착 위도" value={to.lat} onChange={(e) => setTo({ ...to, lat: e.target.value })} />
          <Field id="toLon" label="도착 경도" value={to.lon} onChange={(e) => setTo({ ...to, lon: e.target.value })} />
        </div>
        <button className="lab-btn" type="submit">경로 계산</button>
      </form>
      <p className="t12" style={{ margin: 0, color: "#9A4E06", fontWeight: 500 }}>공장 위치는 실제 좌표이고 운임·품목은 예시입니다. 좌표 원본에 외부 공유 금지 조건이 있습니다.</p>
      <table className="stat-table" id="labstat">
        <tbody aria-live="polite">
          {msg && <tr><th>{msg}</th></tr>}
          {result?.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}
        </tbody>
      </table>
      <p className="muted t12" style={{ margin: 0 }}>
        공장 좌표 {FACTORIES.length.toLocaleString("ko-KR")}곳을 파란 점으로 표시합니다. {live ? "지도: 실시간 OpenStreetMap. 전국을 이동·확대할 수 있고 범위 밖 좌표는 실제 도로 데이터를 받아 계산합니다." : `지도: 내장 OpenStreetMap (${GRAPH.meta.extractedAt.slice(0, 10)} 기준). 인터넷을 쓸 수 없어 구미·칠곡 일대만 자세히 표시합니다.`} 일방통행과 차량 제한을 반영했고, 회전 제한과 실시간 교통은 반영하지 않았습니다.
      </p>
    </div>
  );
}
