import { useEffect, useRef, type CSSProperties } from "react";
import L from "leaflet";
import type { LatLng, Order, ScreenId, Trip, Version } from "../types";
import { BOUNDS, DEPOT, FACTORIES, inGraph } from "../lib/data";
import { createMap, dot, factoryDots, label, lineOn, truck } from "../lib/map";
import { routeTitle, won } from "../lib/orders";

const LOCAL_FACTORIES = FACTORIES.filter((x) => x[0] >= BOUNDS[0][0] && x[0] <= BOUNDS[1][0] && x[1] >= BOUNDS[0][1] && x[1] <= BOUNDS[1][1]);

export interface MapCommon {
  version: Version;
  screen: ScreenId;
  live: boolean;
  origin: LatLng | null;
}
type Props = MapCommon & { fixed?: boolean; height?: number; style?: CSSProperties } & (
  | { kind: "pins"; orders: Order[]; onPin: (id: number) => void }
  | { kind: "selected"; order: Order }
  | { kind: "trip"; order: Order; trip: Trip }
);

export default function MapView(props: Props) {
  const { version, screen, live, origin, fixed, height, style } = props;
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  /* 지도를 다시 그려야 하는 값만 묶는다. 콜 수락 제한시간 같은 값이 바뀌어도 지도는 그대로 둔다. */
  const key = props.kind === "pins"
    ? "pins:" + props.orders.map((o) => o.id).join(",")
    : `${props.kind}:${props.order.id}:${props.order.emptyKm}:${props.kind === "trip" ? props.trip.stage : ""}`;
  const start = origin ?? DEPOT.at;

  useEffect(() => {
    if (!ref.current) return undefined;
    const p = latest.current;
    const m = createMap(ref.current, live);
    const dark = version === "c";
    const brand = dark ? "#F3D46B" : "#1F5A3F";
    const top = p.kind === "trip" ? (version === "a" ? 184 : fixed ? 24 : 72) : version === "a" && screen === "orders" ? 160 : fixed ? 40 : 120;
    const pad: L.FitBoundsOptions = { paddingTopLeft: [fixed ? 72 : 40, top], paddingBottomRight: [40, fixed ? 48 : 72], maxZoom: live ? 15 : 13 };

    if (p.kind === "pins") {
      factoryDots(m, LOCAL_FACTORIES, dark ? "#C9D3CE" : "#2B5C9E");
      const pts: LatLng[] = [start];
      truck(m, start);
      for (const o of p.orders) {
        const first = o.stops[0]!;
        if (inGraph(first)) pts.push(first);
        const icon = L.divIcon({ className: "", html: `<button type="button" class="mk mk-fare" style="transform:translate(-50%,-50%)" aria-label="${routeTitle(o)} ${won(o.fare)}">${(o.fare / 10000).toFixed(1)}만</button>`, iconSize: [0, 0] });
        L.marker(first, { icon, keyboard: false }).on("click", () => { const c = latest.current; if (c.kind === "pins") c.onPin(o.id); }).addTo(m);
      }
      m.fitBounds(pts, pad);
    } else if (p.kind === "selected") {
      const o = p.order, first = o.stops[0]!, last = o.stops[o.stops.length - 1]!;
      lineOn(m, o.empty.coords, dark ? "#C9D3CE" : "#5C6963", "2 8");
      lineOn(m, o.line, brand);
      truck(m, start);
      o.stops.slice(0, -1).forEach((s) => dot(m, s, "mk-pick"));
      dot(m, last, "mk-drop");
      label(m, first, "상차", "up");
      label(m, last, "하차", "down");
      m.fitBounds(o.empty.coords.concat(o.line), pad);
    } else {
      const { order: o, trip: t } = p;
      const moving = t.stage === 0;
      const coords = moving ? o.empty.coords : o.line;
      const last = o.stops[o.stops.length - 1]!;
      const at = moving ? start : t.stage === 1 ? o.stops[0]! : t.stage === 2 ? coords[Math.floor(coords.length * 0.4)]! : last;
      lineOn(m, coords, brand);
      if (moving) dot(m, o.stops[0]!, "mk-pick");
      else {
        o.stops.slice(0, -1).forEach((s) => dot(m, s, "mk-pick"));
        dot(m, last, "mk-drop");
      }
      truck(m, at);
      m.fitBounds(coords, pad);
    }
    return () => { m.remove(); };
  }, [key, version, screen, live, fixed, start]);

  return <div ref={ref} className={"map" + (fixed ? " fixed" : "")} style={{ ...style, ...(height ? { height } : null) }} />;
}
