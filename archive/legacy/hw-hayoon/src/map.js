const TILE_RANGES = {
  8: [217, 220, 99, 101],
  9: [435, 440, 198, 203],
  10: [871, 881, 396, 406],
  11: [1753, 1755, 802, 804],
  12: [3506, 3511, 1604, 1608],
  13: [7013, 7022, 3208, 3217],
};
const TILE_BASE = new URL('../assets/maps/', import.meta.url);
const DEPOT = [36.105, 128.39];
const LOCAL_BOUNDS = [[35.98, 128.21], [36.30, 128.59]];
// The outermost bundled tiles, not a live geolocation or tracking boundary.
const MAP_BOUNDS = [[34.30714, 125.15625], [37.71859, 130.78125]];
let routeDataPromise;

function loadRoutes() {
  routeDataPromise ??= fetch(new URL('./routes.json', import.meta.url))
    .then(response => {
      if (!response.ok) throw new Error('Route data unavailable');
      return response.json();
    })
    .catch(() => ({ depot: DEPOT, routes: {} }));
  return routeDataPromise;
}

function addStyles() {
  if (document.getElementById('hayoon-map-styles')) return;
  const style = document.createElement('style');
  style.id = 'hayoon-map-styles';
  style.textContent = `
    .hayoon-map { isolation:isolate; width:100%; height:100%; min-height:220px; background:#e8ede9; font-family:inherit; }
    .hayoon-map.leaflet-container { font-family:inherit; }
    .hayoon-map .leaflet-tile-pane { filter:saturate(.25) contrast(.92) brightness(1.04); }
    .hayoon-map .leaflet-control-attribution { margin:0 6px 5px 0; padding:2px 5px; border-radius:4px; color:#4a5e56; background:rgba(255,255,255,.92); font-family:inherit; font-size:9px; line-height:1.5; }
    .hayoon-map .leaflet-control-attribution a { color:#3a6152; }
    .hayoon-map .hayoon-map-icon { background:none; border:0; }
    .hayoon-map-pin { position:relative; display:flex; align-items:center; justify-content:center; gap:3px; min-width:68px; height:34px; margin:0; padding:0 11px; border:1px solid #b7cfc1; border-radius:18px; background:#fff; color:#165b45; box-shadow:0 3px 9px #183c2521; font-family:inherit; font-size:13px; font-weight:700; line-height:1; font-variant-numeric:tabular-nums; white-space:nowrap; cursor:pointer; transition:background .15s,box-shadow .15s; }
    .hayoon-map-pin:hover { background:#f0f8f3; box-shadow:0 4px 12px #183c2533; }
    .hayoon-map-pin.is-selected { border:2px solid #fff; background:#116b55; color:#fff; box-shadow:0 0 0 1px #116b55,0 4px 12px #116b553b; }
    .hayoon-map-pin:focus-visible { outline:3px solid #1769dc; outline-offset:3px; }
    .hayoon-map-pin small { font-size:10px; font-weight:500; }
    .hayoon-map-stop { display:flex; align-items:center; justify-content:center; gap:5px; width:max-content; height:27px; padding:0 8px; border:1px solid #fff; border-radius:7px; background:#173f35; color:#fff; box-shadow:0 2px 7px #163c2729; font-size:11px; font-weight:700; white-space:nowrap; }
    .hayoon-map-stop.is-dropoff { background:#fff; border-color:#b4c9bc; color:#275444; }
    .hayoon-map-stop-dot { width:6px; height:6px; border-radius:50%; background:currentColor; }
    .hayoon-map-location { display:block; box-sizing:border-box; width:19px; height:19px; border:3px solid #fff; border-radius:50%; background:#347ee5; box-shadow:0 0 0 8px #347ee51f,0 1px 5px #14365940; }
    .hayoon-map-fallback { height:100%; min-height:260px; display:grid; place-content:center; gap:8px; padding:24px; text-align:center; color:#52665c; font-size:13px; }
    .hayoon-map-fallback strong { color:#213e31; font-size:15px; }
    @media (prefers-reduced-motion:reduce) { .hayoon-map-pin { transition:none; } }
  `;
  document.head.append(style);
}

function coordinate(value) {
  if (Array.isArray(value) && value.length >= 2 && value.every(Number.isFinite)) return value;
  if (value && Number.isFinite(value.lat) && Number.isFinite(value.lng)) return [value.lat, value.lng];
  return null;
}

function orderKey(order) {
  return String(order?.originalId ?? order?.id ?? '');
}

function sourceFor(order, data) {
  const original = data.routes[orderKey(order)] ?? {};
  const stops = order?.stops?.map(coordinate).filter(Boolean);
  const pickup = coordinate(order?.pickup?.coordinates ?? order?.pickup?.coords ?? order?.pickup);
  const dropoff = coordinate(order?.dropoff?.coordinates ?? order?.dropoff?.coords ?? order?.dropoff);
  return {
    stops: stops?.length ? stops : original.stops ?? [pickup, dropoff].filter(Boolean),
    // Never replace missing road geometry with a straight, purported road route.
    line: Array.isArray(order?.line) ? order.line : original.line ?? [],
  };
}

function makeOfflineTiles(L) {
  const OfflineTiles = L.GridLayer.extend({
    createTile(coords) {
      let { x, y, z } = coords;
      let scale = 1;
      const originalX = x;
      const originalY = y;
      while (z >= 8) {
        const range = TILE_RANGES[z];
        if (range && x >= range[0] && x <= range[1] && y >= range[2] && y <= range[3]) {
          const tile = document.createElement('div');
          tile.style.backgroundImage = `url("${new URL(`${z}/${x}/${y}.png`, TILE_BASE).href}")`;
          tile.style.backgroundSize = `${256 * scale}px ${256 * scale}px`;
          tile.style.backgroundPosition = `${-(originalX - x * scale) * 256}px ${-(originalY - y * scale) * 256}px`;
          return tile;
        }
        x = Math.floor(x / 2);
        y = Math.floor(y / 2);
        z -= 1;
        scale *= 2;
      }
      // Only possible outside the bundled country overview, beyond maxBounds.
      const tile = document.createElement('div');
      tile.style.background = '#e8ede9';
      return tile;
    },
  });
  return new OfflineTiles({
    minZoom: 8,
    maxZoom: 15,
    noWrap: true,
    bounds: MAP_BOUNDS,
    keepBuffer: 2,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  });
}

function fallback(element) {
  const message = document.createElement('div');
  message.className = 'hayoon-map-fallback';
  const title = document.createElement('strong');
  title.textContent = '지도를 준비하지 못했어요';
  const description = document.createElement('span');
  description.textContent = '콜 목록에서 운송 조건을 확인해 주세요.';
  message.append(title, description);
  element.replaceChildren(message);
  return {
    update() {}, locate() {}, zoomIn() {}, zoomOut() {},
    destroy() { element.replaceChildren(); element.classList.remove('hayoon-map'); },
  };
}

/** Local-only call map. The caller owns sizing and all surrounding controls. */
export async function mountCallMap(element, {
  orders = [], selectedId = null, onSelect = () => {}, activeOrder = null, mode = 'calls',
} = {}) {
  addStyles();
  element.classList.add('hayoon-map');
  const L = globalThis.L;
  if (!L?.map || !L?.GridLayer) return fallback(element);
  const data = await loadRoutes();
  let options = { orders, selectedId, onSelect, activeOrder, mode };
  let destroyed = false;
  let cameraKey;
  let resizeFrame;
  const prefersReducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const map = L.map(element, {
    zoomControl: false,
    attributionControl: true,
    minZoom: 8,
    maxZoom: 15,
    maxBounds: MAP_BOUNDS,
    maxBoundsViscosity: 1,
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    scrollWheelZoom: false,
    fadeAnimation: !prefersReducedMotion,
    zoomAnimation: !prefersReducedMotion,
  });
  map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
  makeOfflineTiles(L).addTo(map);
  const routeLayer = L.layerGroup().addTo(map);
  const stopLayer = L.layerGroup().addTo(map);
  const pinLayer = L.layerGroup().addTo(map);
  const depot = coordinate(data.depot) ?? DEPOT;
  L.marker(depot, {
    icon: L.divIcon({ className: 'hayoon-map-icon', html: '<span class="hayoon-map-location" aria-hidden="true"></span>', iconSize: [19, 19], iconAnchor: [9.5, 9.5] }),
    interactive: false,
    keyboard: false,
    zIndexOffset: 800,
  }).addTo(map);

  function currentSelection() {
    const active = options.activeOrder?.order ?? options.activeOrder;
    if (active && options.mode !== 'calls' && options.mode !== 'saved') return active;
    return options.orders.find(order => String(order.id) === String(options.selectedId))
      ?? options.orders[0] ?? active ?? null;
  }

  function fitCamera(selected, force = false) {
    const key = `${options.mode}:${orderKey(selected)}`;
    if (!force && cameraKey === key) return;
    cameraKey = key;
    const selectedSource = sourceFor(selected, data);
    const points = [...selectedSource.line, ...selectedSource.stops];
    const localBounds = L.latLngBounds(LOCAL_BOUNDS);
    const isLocal = points.length > 0 && points.every(point => localBounds.contains(point));
    if (options.mode === 'calls' || options.mode === 'saved') {
      // Local pickups give an overview while a selected long haul gets its full route.
      if (isLocal || !selected) {
        points.push(depot);
        for (const order of options.orders) {
          const pickup = sourceFor(order, data).stops[0];
          if (pickup && localBounds.contains(pickup)) points.push(pickup);
        }
      }
    }
    if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points), {
        paddingTopLeft: [48, 72],
        paddingBottomRight: [48, 100],
        maxZoom: 13,
        animate: false,
      });
    } else map.setView(depot, 13, { animate: false });
  }

  function drawRoute(selected) {
    routeLayer.clearLayers();
    stopLayer.clearLayers();
    if (!selected) return;
    const { line, stops } = sourceFor(selected, data);
    if (line.length > 1) {
      const shared = { interactive: false, lineCap: 'round', lineJoin: 'round', smoothFactor: 0.6 };
      L.polyline(line, { ...shared, color: '#fff', weight: 9, opacity: 0.96 }).addTo(routeLayer);
      L.polyline(line, { ...shared, color: '#116b55', weight: 4.5, opacity: 1 }).addTo(routeLayer);
    }
    stops.forEach((stop, index) => {
      const last = index === stops.length - 1;
      const label = index === 0 ? '상차' : last ? '하차' : '경유';
      L.circleMarker(stop, { radius: 5, color: '#fff', weight: 2.5, fillColor: '#116b55', fillOpacity: 1, interactive: false }).addTo(stopLayer);
      L.marker(stop, {
        icon: L.divIcon({
          className: 'hayoon-map-icon',
          html: `<span class="hayoon-map-stop${last ? ' is-dropoff' : ''}"><span class="hayoon-map-stop-dot"></span>${label}</span>`,
          iconSize: [52, 27],
          iconAnchor: [26, -12],
        }),
        interactive: false, keyboard: false, zIndexOffset: 400,
      }).addTo(stopLayer);
    });
  }

  function drawPins() {
    pinLayer.clearLayers();
    const selected = currentSelection();
    const selectedKey = orderKey(selected);
    const list = options.mode === 'calls' || options.mode === 'saved'
      ? [...options.orders].sort((a, b) => Number(orderKey(b) === selectedKey) - Number(orderKey(a) === selectedKey))
      : selected ? [selected] : [];
    const occupied = [];
    const offsets = [[0, -28], [74, -25], [-74, -25], [28, 34], [-52, 34], [75, -76], [-70, -76], [0, -82], [100, 30], [-100, 30]];
    for (const order of list) {
      const at = sourceFor(order, data).stops[0];
      if (!at || !map.getBounds().pad(0.2).contains(at)) continue;
      const point = map.latLngToContainerPoint(at);
      const [dx, dy] = offsets.find(([x, y]) => !occupied.some(rect => Math.abs(point.x + x - rect.x) < 77 && Math.abs(point.y + y - rect.y) < 40)) ?? offsets[0];
      occupied.push({ x: point.x + dx, y: point.y + dy });
      const button = document.createElement('button');
      const isSelected = orderKey(order) === selectedKey;
      button.type = 'button';
      button.className = `hayoon-map-pin${isSelected ? ' is-selected' : ''}`;
      button.setAttribute('aria-pressed', String(isSelected));
      const fare = Number(order.fare) || 0;
      button.setAttribute('aria-label', `${order.from ?? '상차지'}에서 ${order.to ?? '하차지'}까지, 운임 ${fare.toLocaleString('ko-KR')}원`);
      const amount = document.createElement('span');
      amount.textContent = Number((fare / 10000).toFixed(1)).toLocaleString('ko-KR');
      const unit = document.createElement('small');
      unit.textContent = '만';
      button.append(amount, unit);
      button.addEventListener('click', event => {
        L.DomEvent.stopPropagation(event);
        options.onSelect(order.id);
      });
      L.marker(at, {
        icon: L.divIcon({ className: 'hayoon-map-icon', html: button, iconSize: [74, 34], iconAnchor: [37 - dx, 17 - dy] }),
        keyboard: false,
        zIndexOffset: isSelected ? 700 : 500,
      }).addTo(pinLayer);
    }
  }

  function render(forceCamera = false) {
    if (destroyed) return;
    const selected = currentSelection();
    fitCamera(selected, forceCamera);
    drawRoute(selected);
    drawPins();
  }
  map.on('moveend', drawPins);
  const resizeObserver = globalThis.ResizeObserver ? new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      if (destroyed) return;
      map.invalidateSize({ animate: false, pan: false });
      render(true);
    });
  }) : null;
  resizeObserver?.observe(element);
  render(true);

  return {
    update(nextOptions = {}) {
      options = { ...options, ...nextOptions };
      render();
    },
    locate() { if (!destroyed) map.setView(depot, 13, { animate: !prefersReducedMotion }); },
    zoomIn() { if (!destroyed) map.zoomIn(0.5, { animate: !prefersReducedMotion }); },
    zoomOut() { if (!destroyed) map.zoomOut(0.5, { animate: !prefersReducedMotion }); },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(resizeFrame);
      resizeObserver?.disconnect();
      map.off('moveend', drawPins);
      map.remove();
      element.classList.remove('hayoon-map');
    },
  };
}
