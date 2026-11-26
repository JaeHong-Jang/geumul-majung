// carrier-app의 콜·도로·타일 데이터를 앱용 파일로 만든다.
// 실행: node janjaemi-app/tool/build_carrier_data.mjs (저장소 맨 위에서)
// 공장 좌표 목록(factories)은 외부 공유 제한이 있어 앱에 넣지 않는다.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const src = path.join(root, 'carrier-app');
const out = path.join(root, 'janjaemi-app/assets');

const sandbox = { window: {}, console };
sandbox.globalThis = sandbox;
sandbox.self = sandbox.window;
vm.createContext(sandbox);
for (const file of ['data/road-graph.js', 'data/factories.js', 'data/tiles.js']) {
  vm.runInContext(fs.readFileSync(path.join(src, file), 'utf8'), sandbox);
}
const { ROAD_GRAPH: graph, LOCAL_DATA: local, TILES: tiles } = sandbox.window;
const { createRouter } = createRequire(import.meta.url)(path.join(src, 'dijkstra.js'));
const route = createRouter(graph).route;

const round = ([lat, lng]) => [Number(lat.toFixed(5)), Number(lng.toFixed(5))];
const need = (leg, what) => {
  if (!leg) throw new Error('경로를 찾지 못했습니다: ' + what);
  return leg;
};

const orders = local.orders.map((seed) => {
  const legs = seed.pre
    ? seed.pre.legs
    : seed.stops.slice(0, -1).map((s, i) => need(route(s, seed.stops[i + 1]), seed.from));
  const empty = seed.pre?.empty ?? need(route(local.depot, seed.stops[0]), '공차 ' + seed.from);
  const km = legs.reduce((a, l) => a + l.meters, 0) / 1000;
  const emptyKm = empty.meters / 1000;
  const { pre, ...rest } = seed;
  return {
    ...rest,
    km,
    min: Math.round(legs.reduce((a, l) => a + l.seconds, 0) / 60),
    line: legs.flatMap((l) => l.coords).map(round),
    emptyKm,
    emptyMin: Math.round(empty.seconds / 60),
    emptyLine: empty.coords.map(round),
    perKm: Math.round(seed.fare / (km + emptyKm)),
  };
});

const [south, west, north, east] = graph.meta.bbox;
fs.writeFileSync(
  path.join(out, 'carrier/orders.json'),
  JSON.stringify({
    depot: local.depot,
    bounds: { south, west, north, east },
    vehicle: graph.meta.vehicle,
    excludedWays: graph.meta.excludedWays,
    orders,
  }),
);

let count = 0;
for (const [key, uri] of Object.entries(tiles)) {
  const bytes = Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64');
  fs.writeFileSync(path.join(out, 'map_tiles', key.replaceAll('/', '_') + '.png'), bytes);
  count++;
}
console.log('orders', orders.length, 'tiles', count);
