import { ORDERS, DRIVER } from './data.js';

const ORDER_IDS = new Set(ORDERS.map(({ id }) => id));
const SORTS = new Set(['recommended', 'fare', 'nearby', 'efficiency', 'distance', 'time']);
const STAGES = ['to-pickup', 'loading', 'in-transit', 'arrived'];
const numberFormat = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });

export const won = (value) => `${numberFormat.format(Number.isFinite(value) ? value : 0)}원`;
export const km = (value) => `${Number.isFinite(value) ? Number(value.toFixed(1)) : 0}km`;

const efficiency = (order) => order.fare / Math.max(1, order.emptyKm + order.loadedKm);
const departureTime = (order) => {
  const minutes = order.departLabel === '지금' ? 0 : order.departLabel.split(':').reduce((hours, value) => hours * 60 + Number(value), 0);
  return minutes + (/내일|11\.06/.test(order.when) ? 24 * 60 : 0);
};

export function filterOrders(orders, {
  query = '', category = '전체', sort = 'recommended', matched = true,
  minFare = 0, maxEmptyKm = 100, savedOnly = false, savedIds = [], excludedIds = [],
} = {}, driver = DRIVER) {
  const terms = String(query).trim().toLocaleLowerCase('ko-KR').split(/\s+/).filter(Boolean);
  const saved = new Set(savedIds);
  const excluded = new Set(excludedIds);
  const results = orders.filter((order) => {
    if (excluded.has(order.id) || (savedOnly && !saved.has(order.id))) return false;
    if (matched && order.ton > driver.capacityTon) return false;
    if (order.fare < minFare || order.emptyKm > maxEmptyKm) return false;
    if (category === '추천' && !order.recommended) return false;
    if (category === '급송' && !(order.urgent || order.category === '급송')) return false;
    if (!['전체', '추천', '급송'].includes(category) && order.category !== category) return false;
    const searchable = [order.from, order.to, order.shipper, order.consignee, order.item,
      order.material, order.category, order.via, order.fromAddress, order.toAddress, ...order.tags,
    ].join(' ').toLocaleLowerCase('ko-KR');
    return terms.every((term) => searchable.includes(term));
  });
  return results.sort((a, b) => {
    if (sort === 'fare') return b.fare - a.fare || a.id - b.id;
    if (sort === 'nearby' || sort === 'distance') return a.emptyKm - b.emptyKm || b.fare - a.fare || a.id - b.id;
    if (sort === 'efficiency') return efficiency(b) - efficiency(a) || a.id - b.id;
    if (sort === 'time') return departureTime(a) - departureTime(b) || a.id - b.id;
    return Number(b.recommended) - Number(a.recommended) || Number(b.urgent) - Number(a.urgent)
      || a.emptyKm - b.emptyKm || b.rating - a.rating || a.id - b.id;
  });
}

export function createInitialState() {
  return {
    version: 1,
    online: true,
    savedIds: [],
    comparisonIds: [],
    trip: null,
    completedTrips: [],
    preferences: { matched: true, sort: 'recommended', costPerKm: 450 },
    notificationsRead: false,
  };
}

const validWeights = (weights, order) => Array.isArray(weights) && weights.length === order.bags
  && Array.from(weights).every((weight) => Number.isFinite(weight) && weight > 0 && weight <= 2000);

function weightWarning(weights, order) {
  if (!validWeights(weights, order)) return null;
  const actual = weights.reduce((sum, weight) => sum + weight, 0);
  const expected = order.ton * 1000;
  return Math.abs(actual - expected) > expected * 0.05 + 1e-8
    ? `상차 중량이 등록 중량과 5%를 초과해 차이 납니다. 등록 ${numberFormat.format(expected)}kg · 확인 ${numberFormat.format(actual)}kg. 인계 전 중량을 확인해 주세요.`
    : null;
}

const isDateString = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const isIsoTimestamp = (value) => isDateString(value)
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  && new Date(`${value.slice(0, 10)}T00:00:00.000Z`).toISOString().slice(0, 10) === value.slice(0, 10);

function sanitizeTrip(raw, completed = false) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const order = ORDERS.find(({ id }) => id === raw.orderId);
  if (!order || order.ton > DRIVER.capacityTon || !Number.isSafeInteger(raw.fare)
      || raw.fare < 1 || raw.fare > order.fare || !isDateString(raw.acceptedAt)) return null;
  if (!STAGES.includes(raw.stage) || (completed && raw.stage !== 'arrived')) return null;
  const mustHaveWeights = completed || ['in-transit', 'arrived'].includes(raw.stage);
  if (mustHaveWeights && !validWeights(raw.bagWeights, order)) return null;
  if (completed && !isDateString(raw.completedAt)) return null;
  const bagWeights = validWeights(raw.bagWeights, order) ? [...raw.bagWeights] : [];
  const trip = {
    orderId: order.id,
    fare: raw.fare,
    stage: raw.stage,
    acceptedAt: raw.acceptedAt,
    bagWeights,
    completedAt: completed ? raw.completedAt : null,
  };
  for (const field of ['pickupAt', 'departedAt', 'arrivedAt']) {
    if (isIsoTimestamp(raw[field])) trip[field] = raw[field];
  }
  if (mustHaveWeights || bagWeights.length) trip.weightWarning = weightWarning(bagWeights, order);
  if (completed) trip.status = 'inspection-pending';
  return trip;
}

export function sanitizeState(raw) {
  const initial = createInitialState();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== 1) return initial;
  const completedIds = new Set();
  const completedTrips = [];
  for (const savedTrip of Array.isArray(raw.completedTrips) ? raw.completedTrips : []) {
    const trip = sanitizeTrip(savedTrip, true);
    if (trip && !completedIds.has(trip.orderId)) {
      completedIds.add(trip.orderId);
      completedTrips.push(trip);
    }
  }
  const trip = sanitizeTrip(raw.trip);
  return {
    version: 1,
    online: typeof raw.online === 'boolean' ? raw.online : initial.online,
    savedIds: [...new Set(Array.isArray(raw.savedIds) ? raw.savedIds.filter((id) => ORDER_IDS.has(id)) : [])],
    comparisonIds: [...new Set(Array.isArray(raw.comparisonIds) ? raw.comparisonIds.filter((id) => ORDER_IDS.has(id)) : [])].slice(0, 3),
    trip: trip && !completedIds.has(trip.orderId) ? trip : null,
    completedTrips,
    preferences: {
      matched: typeof raw.preferences?.matched === 'boolean' ? raw.preferences.matched : true,
      sort: SORTS.has(raw.preferences?.sort) ? raw.preferences.sort : 'recommended',
      costPerKm: Number.isSafeInteger(raw.preferences?.costPerKm) && raw.preferences.costPerKm >= 0
        && raw.preferences.costPerKm <= 10000 ? raw.preferences.costPerKm : 450,
    },
    notificationsRead: typeof raw.notificationsRead === 'boolean' ? raw.notificationsRead : false,
  };
}

export function toggleSaved(state, id) {
  if (!ORDER_IDS.has(id)) return state;
  return {
    ...state,
    savedIds: state.savedIds.includes(id)
      ? state.savedIds.filter((savedId) => savedId !== id)
      : [...state.savedIds, id],
  };
}

/** 서버로 보내야 하는 행동(수락·운송 단계 전송)은 오프라인에서 막는다. 실제 API를 붙일 지점이며, 저장된 화면 보기·비교·저장은 막지 않는다. */
export function assertConnected(connected, action) {
  if (connected === false) throw new Error(`인터넷 연결이 끊겨 ${action}할 수 없습니다. 연결된 뒤 다시 시도해 주세요. 입력한 내용은 그대로 남아 있습니다.`);
}

export function acceptOrder(state, order, fare = order?.fare) {
  if (!order || !ORDER_IDS.has(order.id)) throw new Error('콜 정보를 찾을 수 없습니다. 목록에서 다시 선택해 주세요.');
  if (!state.online) throw new Error('온라인 상태에서 콜을 수락할 수 있습니다. 운행 상태를 온라인으로 변경해 주세요.');
  if (state.trip) throw new Error('이미 진행 중인 운송이 있습니다. 현재 운송을 마친 뒤 새 콜을 수락해 주세요.');
  if (state.completedTrips.some(({ orderId }) => orderId === order.id)) throw new Error('이미 운송을 완료한 콜입니다.');
  if (!Number.isFinite(order.ton) || order.ton > DRIVER.capacityTon) throw new Error('내 차량의 적재 한도 5톤을 초과한 콜은 수락할 수 없습니다.');
  if (!Number.isSafeInteger(fare) || fare < 1 || fare > order.fare) throw new Error(`운임은 1원 이상, 운임 상한 ${won(order.fare)} 이하의 정수로 입력해 주세요.`);
  return {
    ...state,
    comparisonIds: (state.comparisonIds || []).filter((id) => id !== order.id),
    trip: {
      orderId: order.id,
      fare,
      stage: 'to-pickup',
      acceptedAt: new Date().toISOString(),
      bagWeights: [],
      completedAt: null,
    },
  };
}

export function advanceTrip(state, order, { bagWeights } = {}) {
  if (!state.trip) throw new Error('진행 중인 운송이 없습니다. 콜을 먼저 수락해 주세요.');
  if (!order || state.trip.orderId !== order.id) throw new Error('현재 운송과 콜 정보가 일치하지 않습니다.');
  const stageIndex = STAGES.indexOf(state.trip.stage);
  if (stageIndex < 0) throw new Error('운송 단계를 확인할 수 없습니다. 저장된 운송 정보를 다시 확인해 주세요.');
  if (state.trip.stage === 'arrived') {
    return {
      ...state,
      trip: null,
      completedTrips: [...state.completedTrips, {
        ...state.trip,
        bagWeights: [...state.trip.bagWeights],
        completedAt: new Date().toISOString(),
        status: 'inspection-pending',
      }],
    };
  }
  const nextTrip = { ...state.trip, stage: STAGES[stageIndex + 1], bagWeights: [...state.trip.bagWeights] };
  if (state.trip.stage === 'loading') {
    if (!Array.isArray(bagWeights) || bagWeights.length !== order.bags) throw new Error(`마대 ${order.bags}개의 중량을 모두 입력해 주세요.`);
    if (!validWeights(bagWeights, order)) throw new Error('각 마대의 중량은 0kg 초과, 2,000kg 이하의 숫자로 입력해 주세요.');
    nextTrip.bagWeights = [...bagWeights];
    nextTrip.weightWarning = weightWarning(bagWeights, order);
  }
  const timestampField = { 'to-pickup': 'pickupAt', loading: 'departedAt', 'in-transit': 'arrivedAt' }[state.trip.stage];
  nextTrip[timestampField] = new Date().toISOString();
  return { ...state, trip: nextTrip };
}
