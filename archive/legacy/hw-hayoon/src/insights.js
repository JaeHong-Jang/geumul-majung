import { ORDERS, DRIVER } from './data.js';

const ORDER_IDS = new Set(ORDERS.map(({ id }) => id));
const STAGES = ['to-pickup', 'loading', 'in-transit', 'arrived'];
const TIMESTAMPS = ['acceptedAt', 'pickupAt', 'departedAt', 'arrivedAt', 'completedAt'];

function validateCost(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 10000) {
    throw new Error('주행 비용은 0원부터 10,000원 사이의 정수로 입력해 주세요.');
  }
}

export function toggleComparison(state, id) {
  if (!ORDER_IDS.has(id)) throw new Error('비교할 콜을 찾을 수 없습니다. 목록에서 다시 선택해 주세요.');
  const ids = [...new Set(state.comparisonIds || [])];
  if (ids.includes(id)) return { ...state, comparisonIds: ids.filter((savedId) => savedId !== id) };
  if (state.trip?.orderId === id || state.completedTrips?.some(trip => trip.orderId === id)) {
    throw new Error('진행 중이거나 완료된 콜은 비교에 담을 수 없습니다. 모집 중인 콜을 선택해 주세요.');
  }
  if (ids.length >= 3) throw new Error('비교할 콜은 최대 3개까지 선택할 수 있습니다. 하나를 해제해 주세요.');
  return { ...state, comparisonIds: [...ids, id] };
}

export function setCostPerKm(state, value) {
  validateCost(value);
  return { ...state, preferences: { ...state.preferences, costPerKm: value } };
}

export function compareMetrics(order, costPerKm) {
  validateCost(costPerKm);
  if (!order || !Number.isFinite(order.emptyKm) || order.emptyKm < 0
      || !Number.isFinite(order.loadedKm) || order.loadedKm <= 0) {
    throw new Error('예상 주행 거리를 확인할 수 없습니다. 콜 정보를 다시 확인해 주세요.');
  }
  if (!Number.isSafeInteger(order.fare) || order.fare < 1) throw new Error('운임 상한은 1원 이상의 정수여야 합니다.');
  const totalKm = order.emptyKm + order.loadedKm;
  const ratePerKm = Math.round(order.fare / totalKm);
  const drivingCost = Math.round(totalKm * costPerKm);
  if (!Number.isFinite(totalKm) || !Number.isSafeInteger(ratePerKm) || !Number.isSafeInteger(drivingCost)) {
    throw new Error('예상 거리 또는 비용의 계산 범위를 초과했습니다.');
  }
  return { totalKm, ratePerKm, drivingCost, afterDrivingCost: order.fare - drivingCost };
}

export function suitabilityChecks(order, driver = DRIVER) {
  if (!order || !Number.isFinite(order.ton) || order.ton <= 0
      || !Number.isFinite(driver?.capacityTon) || driver.capacityTon <= 0) {
    throw new Error('콜의 중량과 차량 적재 한도를 확인해 주세요.');
  }
  const condition = typeof order.cond === 'string' ? order.cond : '';
  const forkliftAvailable = condition.includes('지게차 있음') && !condition.includes('수작업');
  return [
    {
      id: 'capacity', label: '차량 적재량', value: `${order.ton}톤 / 내 차량 ${driver.capacityTon}톤`,
      status: order.ton > driver.capacityTon ? 'blocked' : 'ok',
    },
    { id: 'handling', label: '상차 조건', value: condition || '상차 조건 별도 확인', status: forkliftAvailable ? 'ok' : 'review' },
    { id: 'permit', label: '운반 허가', value: '허가 범위 별도 확인', status: 'review' },
  ];
}

const timestampOrNull = (value) => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  && Number.isFinite(Date.parse(value))
  && new Date(`${value.slice(0, 10)}T00:00:00.000Z`).toISOString().slice(0, 10) === value.slice(0, 10) ? value : null;

const inspectionPending = (trip) => trip.stage === 'arrived'
  && Boolean(timestampOrNull(trip.completedAt) || trip.status === 'inspection-pending');

function validateTrip(order, trip) {
  if (!trip || typeof trip !== 'object') throw new Error('운송 기록을 찾을 수 없습니다.');
  if (!order || order.id !== trip.orderId) throw new Error('운송 기록과 콜 정보가 일치하지 않습니다.');
  if (!STAGES.includes(trip.stage)) throw new Error('운송 단계를 확인할 수 없습니다.');
}

export function transportProgress(order, trip) {
  validateTrip(order, trip);
  const currentIndex = inspectionPending(trip) ? 5 : STAGES.indexOf(trip.stage) + 1;
  return [
    { id: 'accepted', label: '콜 수락', field: 'acceptedAt' },
    { id: 'pickup', label: '상차지 도착', field: 'pickupAt' },
    { id: 'departed', label: '상차 확인·출발', field: 'departedAt' },
    { id: 'arrived', label: '하차지 도착', field: 'arrivedAt' },
    { id: 'confirmation', label: '도착 확인 전송', field: 'completedAt' },
    { id: 'inspection', label: '구매자 검사 대기', field: null },
  ].map(({ id, label, field }, index) => {
    const status = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'pending';
    return { id, label, status, at: status === 'done' && field ? timestampOrNull(trip[field]) : null };
  });
}

export function buildTransportRecord(order, trip) {
  validateTrip(order, trip);
  if (!Number.isSafeInteger(trip.fare) || trip.fare < 1 || trip.fare > order.fare) {
    throw new Error('운송 기록의 확정 운임을 확인해 주세요.');
  }
  if (!Number.isFinite(order.ton) || order.ton <= 0 || !Array.isArray(trip.bagWeights)) {
    throw new Error('운송 기록의 중량 정보를 확인해 주세요.');
  }
  const bagWeights = Array.from(trip.bagWeights);
  if (bagWeights.length && (bagWeights.length !== order.bags
      || bagWeights.some((weight) => !Number.isFinite(weight) || weight <= 0 || weight > 2000))) {
    throw new Error('운송 기록의 마대별 중량을 확인해 주세요.');
  }
  const timestamps = Object.fromEntries(TIMESTAMPS.map((field) => [field, timestampOrNull(trip[field])]));
  return {
    demo: true,
    note: '시연용 운송 기록입니다. 법정 인계서·계량증명서 또는 구매자 검사·정산 승인 자료가 아닙니다.',
    order: {
      id: order.id, from: order.from, to: order.to, shipper: order.shipper,
      consignee: order.consignee, material: order.material || order.item, item: order.item,
    },
    declaredWeightKg: order.ton * 1000,
    actualWeightKg: bagWeights.length ? bagWeights.reduce((sum, weight) => sum + weight, 0) : null,
    bagWeights,
    acceptedFare: trip.fare,
    status: inspectionPending(trip) ? 'inspection-pending' : trip.stage,
    timestamps,
  };
}
