import test from 'node:test';
import assert from 'node:assert/strict';
import { ORDERS, DRIVER, LEDGER, WEEK } from '../src/data.js';
import {
  won, km, filterOrders, createInitialState, sanitizeState,
  toggleSaved, acceptOrder, advanceTrip, assertConnected,
} from '../src/domain.js';

const first = ORDERS[0];
const weightsFor = (order) => Array.from({ length: order.bags }, () => order.ton * 1000 / order.bags);
const accepted = (order = first) => acceptOrder(createInitialState(), order);

test('seed data includes the 11 original calls and their prepared route estimates', () => {
  assert.deepEqual(ORDERS.map(({ id }) => id), Array.from({ length: 11 }, (_, index) => index + 1));
  assert.equal(first.fare, 71000);
  assert.equal(first.loadedKm, 9.41);
  assert.equal(first.emptyKm, 3.676);
  assert.equal(first.estimatedMin, 15);
  assert.equal(ORDERS[10].ton, 7.5);
  assert.equal(DRIVER.capacityTon, 5);
  assert.equal(LEDGER.filter(({ status }) => status === 'pending').reduce((sum, row) => sum + row.fare, 0), 354000);
  assert.equal(WEEK.reduce((sum, day) => sum + day.value, 0), 612000);
});

test('money and distance use readable Korean units', () => {
  assert.equal(won(71000), '71,000원');
  assert.equal(km(3.676), '3.7km');
  assert.equal(km(0), '0km');
});

test('search combines regions, item, factory and category without mutating the input', () => {
  const ids = ORDERS.map(({ id }) => id);
  assert.deepEqual(filterOrders(ORDERS, { query: '약목' }).map(({ id }) => id), [1]);
  assert.deepEqual(filterOrders(ORDERS, { query: '고철', category: '묶음' }).map(({ id }) => id), [2]);
  assert.deepEqual(filterOrders(ORDERS, { query: '175101' }).map(({ id }) => id).sort((a, b) => a - b), [1, 6, 10]);
  assert.deepEqual(ORDERS.map(({ id }) => id), ids);
});

test('matching respects vehicle capacity and can be disabled', () => {
  assert.equal(filterOrders(ORDERS, {}).length, 10);
  assert.equal(filterOrders(ORDERS, { matched: false }).length, 11);
  assert.ok(filterOrders(ORDERS, {}, { ...DRIVER, capacityTon: 2 }).every(({ ton }) => ton <= 2));
});

test('recommendation and urgent categories use their flags', () => {
  const recommended = filterOrders(ORDERS, { category: '추천' });
  assert.ok(recommended.length > 0);
  assert.ok(recommended.every((order) => order.recommended));
  assert.deepEqual(filterOrders(ORDERS, { category: '급송' }).map(({ id }) => id), [6]);
  const flagged = [{ ...first, category: '독차', urgent: true }];
  assert.equal(filterOrders(flagged, { category: '급송' }).length, 1);
});

test('fare, empty distance, saved IDs and excluded trips compose', () => {
  const result = filterOrders(ORDERS, {
    minFare: 100000, maxEmptyKm: 5, savedOnly: true,
    savedIds: [6, 7, 9, 10], excludedIds: [10], sort: 'fare',
  });
  assert.deepEqual(result.map(({ id }) => id), [7, 6]);
  assert.deepEqual(filterOrders(ORDERS, { savedOnly: true }).map(({ id }) => id), []);
});

test('sorting supports recommended, highest fare, nearest pickup and earliest departure', () => {
  assert.equal(filterOrders(ORDERS, { sort: 'fare' })[0].id, 10);
  const nearest = filterOrders(ORDERS, { sort: 'distance' });
  assert.ok(nearest.every((order, index) => index === 0 || nearest[index - 1].emptyKm <= order.emptyKm));
  assert.deepEqual(filterOrders(ORDERS, { sort: 'nearby' }), nearest);
  const efficient = filterOrders(ORDERS, { sort: 'efficiency' });
  const perKm = (order) => order.fare / (order.emptyKm + order.loadedKm);
  assert.ok(efficient.every((order, index) => index === 0 || perKm(efficient[index - 1]) >= perKm(order)));
  assert.equal(filterOrders(ORDERS, { sort: 'time' })[0].id, 6);
  const recommended = filterOrders(ORDERS, { sort: 'recommended' });
  assert.ok(recommended[0].recommended);
});

test('saved calls toggle immutably, deduplicate and ignore unknown IDs', () => {
  const initial = createInitialState();
  const saved = toggleSaved(initial, first.id);
  assert.deepEqual(initial.savedIds, []);
  assert.deepEqual(saved.savedIds, [first.id]);
  assert.deepEqual(toggleSaved(saved, first.id).savedIds, []);
  assert.deepEqual(toggleSaved(saved, 999).savedIds, [first.id]);
});

test('offline and overcapacity calls cannot be accepted', () => {
  assert.throws(() => acceptOrder({ ...createInitialState(), online: false }, first), /온라인/);
  assert.throws(() => acceptOrder(createInitialState(), ORDERS[10]), /5톤/);
});

test('accepted fare must be a positive safe integer within the published fare cap', () => {
  for (const fare of [0, -1, 1.5, first.fare + 1, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, '71000']) {
    assert.throws(() => acceptOrder(createInitialState(), first, fare), /운임/);
  }
  assert.throws(() => acceptOrder(createInitialState(), first, 0), /1원 이상/);
  assert.equal(acceptOrder(createInitialState(), first, 1).trip.fare, 1);
  assert.equal(acceptOrder(createInitialState(), first, first.fare).trip.fare, first.fare);
  assert.equal(acceptOrder(createInitialState(), first, 65000).trip.fare, 65000);
});

test('restored trips reject fares outside the backend integer boundary', () => {
  const valid = accepted();
  for (const fare of [0, -1, 1.5, first.fare + 1, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN]) {
    assert.equal(sanitizeState({ ...valid, trip: { ...valid.trip, fare } }).trip, null);
  }
  assert.equal(sanitizeState({ ...valid, trip: { ...valid.trip, fare: 1 } }).trip.fare, 1);
});

test('acceptance creates a single trip and blocks duplicate or overlapping acceptance', () => {
  const initial = createInitialState();
  const state = accepted();
  assert.equal(initial.trip, null);
  assert.equal(state.trip.stage, 'to-pickup');
  assert.equal(state.trip.orderId, first.id);
  assert.deepEqual(state.trip.bagWeights, []);
  assert.ok(Number.isFinite(Date.parse(state.trip.acceptedAt)));
  assert.throws(() => acceptOrder(state, first), /진행 중/);
  assert.throws(() => acceptOrder(state, ORDERS[1]), /진행 중/);
});

test('every listed bag must be weighed before loading can finish', () => {
  for (const order of [first, ORDERS[1], ORDERS[4]]) {
    const loading = advanceTrip(accepted(order), order);
    assert.equal(loading.trip.stage, 'loading');
    assert.throws(() => advanceTrip(loading, order), new RegExp(`${order.bags}개`));
    assert.throws(() => advanceTrip(loading, order, { bagWeights: weightsFor(order).slice(1) }), new RegExp(`${order.bags}개`));
    const loaded = advanceTrip(loading, order, { bagWeights: weightsFor(order) });
    assert.equal(loaded.trip.stage, 'in-transit');
    assert.equal(loaded.trip.bagWeights.length, order.bags);
  }
});

test('each bag weight must be positive, finite and at most 2,000kg', () => {
  const state = advanceTrip(accepted(), first);
  for (const bad of [0, -10, NaN, Infinity, 2001, '100']) {
    const weights = weightsFor(first);
    weights[0] = bad;
    assert.throws(() => advanceTrip(state, first, { bagWeights: weights }), /마대.*중량/);
  }
  assert.throws(() => advanceTrip(state, first, { bagWeights: Array(first.bags) }), /마대.*중량/);
  assert.equal(state.trip.stage, 'loading');
  assert.deepEqual(state.trip.bagWeights, []);
});

test('weight variance above 5% creates a warning and preserves the actual weights', () => {
  const loading = advanceTrip(accepted(), first);
  const weights = weightsFor(first).map((weight) => weight * 1.1);
  const loaded = advanceTrip(loading, first, { bagWeights: weights });
  assert.equal(loaded.trip.stage, 'in-transit');
  assert.match(loaded.trip.weightWarning, /5%/);
  assert.deepEqual(loaded.trip.bagWeights, weights);
  weights[0] = 10;
  assert.notEqual(loaded.trip.bagWeights[0], 10);
  assert.equal(advanceTrip(loading, first, { bagWeights: weightsFor(first) }).trip.weightWarning, null);
  const fivePercent = weightsFor(first).map((weight) => weight * 1.05);
  assert.equal(advanceTrip(loading, first, { bagWeights: fivePercent }).trip.weightWarning, null);
});

test('arrival completes into buyer inspection pending and cannot be self-settled or accepted again', () => {
  let state = advanceTrip(accepted(), first);
  state = advanceTrip(state, first, { bagWeights: weightsFor(first) });
  state = advanceTrip(state, first);
  assert.equal(state.trip.stage, 'arrived');
  state = advanceTrip(state, first);
  assert.equal(state.trip, null);
  assert.equal(state.completedTrips[0].status, 'inspection-pending');
  assert.equal(state.completedTrips[0].stage, 'arrived');
  assert.ok(Number.isFinite(Date.parse(state.completedTrips[0].completedAt)));
  assert.throws(() => acceptOrder(state, first), /이미.*완료/);
  assert.throws(() => advanceTrip(state, first), /진행 중인 운송/);
});

test('a different call cannot advance the accepted trip', () => {
  assert.throws(() => advanceTrip(accepted(), ORDERS[1]), /운송.*일치/);
});

test('sanitizing tolerates corrupt persistence and removes unknown IDs and unsafe preferences', () => {
  for (const raw of [null, false, 'broken', 12, [], { version: 99 }]) {
    assert.deepEqual(sanitizeState(raw), createInitialState());
  }
  const state = sanitizeState({
    version: 1, online: false, savedIds: [1, 1, 999, '2', null],
    preferences: { matched: false, sort: 'javascript:bad' },
    notificationsRead: true, trip: { orderId: 999 }, completedTrips: [{ orderId: 999 }],
  });
  assert.equal(state.online, false);
  assert.deepEqual(state.savedIds, [1]);
  assert.deepEqual(state.preferences, { matched: false, sort: 'recommended', costPerKm: 450 });
  assert.equal(state.notificationsRead, true);
  assert.equal(state.trip, null);
  assert.deepEqual(state.completedTrips, []);
});

test('valid persistence round-trips through every trip stage without granting settlement rights', () => {
  let state = accepted();
  assert.deepEqual(sanitizeState(JSON.parse(JSON.stringify(state))), state);
  state = advanceTrip(state, first);
  state = advanceTrip(state, first, { bagWeights: weightsFor(first) });
  assert.deepEqual(sanitizeState(JSON.parse(JSON.stringify(state))), state);
  const badWeights = structuredClone(state);
  badWeights.trip.bagWeights = [0];
  assert.equal(sanitizeState(badWeights).trip, null);
  state = advanceTrip(state, first);
  state = advanceTrip(state, first);
  const persisted = JSON.parse(JSON.stringify(state));
  persisted.completedTrips[0].status = 'paid';
  persisted.completedTrips.push(persisted.completedTrips[0]);
  persisted.trip = { ...accepted().trip };
  const restored = sanitizeState(persisted);
  assert.equal(restored.trip, null);
  assert.equal(restored.completedTrips.length, 1);
  assert.equal(restored.completedTrips[0].status, 'inspection-pending');
});

test('older version 1 state receives comparison and running-cost defaults', () => {
  const oldState = {
    version: 1, online: false, savedIds: [1], trip: null, completedTrips: [],
    preferences: { matched: false, sort: 'fare' }, notificationsRead: true,
  };
  const restored = sanitizeState(oldState);
  assert.deepEqual(restored.comparisonIds, []);
  assert.deepEqual(restored.preferences, { matched: false, sort: 'fare', costPerKm: 450 });
  assert.equal(restored.online, false);
  assert.deepEqual(restored.savedIds, [1]);
  assert.equal(restored.notificationsRead, true);
  assert.deepEqual(createInitialState().comparisonIds, []);
  assert.equal(createInitialState().preferences.costPerKm, 450);
});

test('restored comparison IDs are unique, known and limited to three calls', () => {
  const restored = sanitizeState({ ...createInitialState(), comparisonIds: [2, 2, 999, '1', 1, 3, 4] });
  assert.deepEqual(restored.comparisonIds, [2, 1, 3]);
  for (const costPerKm of [-1, 10001, 1.5, NaN, Infinity, '450', Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(sanitizeState({ ...createInitialState(), preferences: { costPerKm } }).preferences.costPerKm, 450);
  }
  for (const costPerKm of [0, 450, 10000]) {
    assert.equal(sanitizeState({ ...createInitialState(), preferences: { costPerKm } }).preferences.costPerKm, costPerKm);
  }
});

test('accepting a comparison call removes it from the comparison without changing the source state', () => {
  const state = { ...createInitialState(), comparisonIds: [1, 2, 3] };
  assert.deepEqual(acceptOrder(state, first).comparisonIds, [2, 3]);
  assert.deepEqual(state.comparisonIds, [1, 2, 3]);
});

test('trip stage timestamps are recorded only on successful advances and survive reload', () => {
  let state = accepted();
  for (const field of ['pickupAt', 'departedAt', 'arrivedAt']) assert.equal(field in state.trip, false);
  state = advanceTrip(state, first);
  assert.ok(Number.isFinite(Date.parse(state.trip.pickupAt)));
  assert.equal('departedAt' in state.trip, false);
  assert.throws(() => advanceTrip(state, first, { bagWeights: [] }), /마대/);
  assert.equal('departedAt' in state.trip, false);
  const pickupAt = state.trip.pickupAt;
  state = advanceTrip(state, first, { bagWeights: weightsFor(first) });
  assert.equal(state.trip.pickupAt, pickupAt);
  assert.ok(Number.isFinite(Date.parse(state.trip.departedAt)));
  assert.equal('arrivedAt' in state.trip, false);
  assert.deepEqual(sanitizeState(JSON.parse(JSON.stringify(state))), state);
  state = advanceTrip(state, first);
  assert.ok(Number.isFinite(Date.parse(state.trip.arrivedAt)));
  state = advanceTrip(state, first);
  assert.deepEqual(sanitizeState(JSON.parse(JSON.stringify(state))), state);
});

test('old trip history never fabricates missing event timestamps and drops invalid optional values', () => {
  const old = accepted();
  old.trip.pickupAt = 'yesterday';
  old.trip.departedAt = 123;
  old.trip.arrivedAt = '2026-11-05';
  const trip = sanitizeState(old).trip;
  for (const field of ['pickupAt', 'departedAt', 'arrivedAt']) assert.equal(field in trip, false);
  assert.equal(trip.acceptedAt, old.trip.acceptedAt);
  old.trip.pickupAt = '2026-02-30T10:00:00.000Z';
  assert.equal('pickupAt' in sanitizeState(old).trip, false);
});

test('offline blocks server-bound actions with a reason, online passes', () => {
  assert.throws(() => assertConnected(false, '콜을 수락'), /인터넷 연결이 끊겨 콜을 수락할 수 없습니다/);
  assert.doesNotThrow(() => assertConnected(true, '콜을 수락'));
  assert.doesNotThrow(() => assertConnected(undefined, '콜을 수락'));   // 알 수 없으면 막지 않는다
});
