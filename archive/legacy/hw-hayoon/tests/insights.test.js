import test from 'node:test';
import assert from 'node:assert/strict';
import { ORDERS, DRIVER } from '../src/data.js';
import { createInitialState, acceptOrder, advanceTrip, sanitizeState } from '../src/domain.js';
import {
  toggleComparison, setCostPerKm, compareMetrics, suitabilityChecks,
  transportProgress, buildTransportRecord,
} from '../src/insights.js';

const order = ORDERS[0];
const weights = Array.from({ length: order.bags }, () => order.ton * 1000 / order.bags);
const acceptedState = () => acceptOrder(createInitialState(), order);
const finishTrip = () => {
  let state = advanceTrip(acceptedState(), order);
  state = advanceTrip(state, order, { bagWeights: weights });
  state = advanceTrip(state, order);
  return advanceTrip(state, order).completedTrips[0];
};

test('comparison toggles known IDs immutably with a maximum of three selections', () => {
  const initial = createInitialState();
  let state = initial;
  for (const id of [1, 2, 3]) state = toggleComparison(state, id);
  assert.deepEqual(initial.comparisonIds, []);
  assert.deepEqual(state.comparisonIds, [1, 2, 3]);
  assert.throws(() => toggleComparison(state, 4), /최대 3개/);
  state = toggleComparison(state, 2);
  assert.deepEqual(state.comparisonIds, [1, 3]);
  assert.deepEqual(toggleComparison(state, 4).comparisonIds, [1, 3, 4]);
  assert.deepEqual(toggleComparison(toggleComparison(initial, 1), 1).comparisonIds, []);
  for (const id of [0, 999, '1', NaN, null]) assert.throws(() => toggleComparison(state, id), /콜/);
});

test('running cost settings allow integer boundaries and preserve other preferences', () => {
  const initial = createInitialState();
  for (const cost of [0, 450, 10000]) {
    const state = setCostPerKm(initial, cost);
    assert.deepEqual(state.preferences, { matched: true, sort: 'recommended', costPerKm: cost });
    assert.equal(initial.preferences.costPerKm, 450);
  }
  for (const cost of [-1, 10001, 450.5, NaN, Infinity, '450', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => setCostPerKm(initial, cost), /0.*10,000.*정수/);
  }
});

test('comparison metrics use total travel distance and the fare cap without inventing profit', () => {
  const metrics = compareMetrics(order, 450);
  assert.equal(metrics.totalKm, order.emptyKm + order.loadedKm);
  assert.equal(metrics.ratePerKm, Math.round(order.fare / metrics.totalKm));
  assert.equal(metrics.drivingCost, Math.round(metrics.totalKm * 450));
  assert.equal(metrics.afterDrivingCost, order.fare - metrics.drivingCost);
  assert.equal(compareMetrics(order, 0).afterDrivingCost, order.fare);
  assert.equal(compareMetrics(order, 10000).drivingCost, Math.round(metrics.totalKm * 10000));
  assert.equal('profit' in metrics, false);
  assert.ok(compareMetrics(order, 10000).afterDrivingCost < 0);
});

test('comparison rejects invalid costs, fares and route distances', () => {
  for (const cost of [-1, 10001, 0.5, NaN, Infinity]) assert.throws(() => compareMetrics(order, cost), /비용/);
  for (const [key, value] of [
    ['emptyKm', -1], ['emptyKm', NaN], ['loadedKm', 0], ['loadedKm', Infinity],
    ['fare', 0], ['fare', NaN], ['fare', 1.5], ['fare', Number.MAX_SAFE_INTEGER + 1],
  ]) assert.throws(() => compareMetrics({ ...order, [key]: value }, 450), /거리|운임/);
  assert.equal(compareMetrics({ ...order, emptyKm: 0 }, 450).totalKm, order.loadedKm);
});

test('suitability reports capacity and handling while leaving permit verification to a person', () => {
  const checks = suitabilityChecks(order);
  assert.deepEqual(checks.map(({ id }) => id), ['capacity', 'handling', 'permit']);
  assert.equal(checks.find(({ id }) => id === 'capacity').status, 'ok');
  assert.equal(checks.find(({ id }) => id === 'handling').status, 'ok');
  const large = suitabilityChecks(ORDERS[10]);
  assert.equal(large.find(({ id }) => id === 'capacity').status, 'blocked');
  const manual = suitabilityChecks(ORDERS[2]);
  assert.equal(manual.find(({ id }) => id === 'handling').status, 'review');
  for (const candidate of [order, ORDERS[2], ORDERS[10]]) {
    const permit = suitabilityChecks(candidate, { ...DRIVER, permitVerified: true }).find(({ id }) => id === 'permit');
    assert.deepEqual(permit, { id: 'permit', label: '운반 허가', value: '허가 범위 별도 확인', status: 'review' });
  }
  assert.equal(suitabilityChecks({ ...order, cond: '지게차 없음' })[1].status, 'review');
});

test('progress moves sequentially from acceptance to inspection pending using recorded timestamps', () => {
  let state = acceptedState();
  let rows = transportProgress(order, state.trip);
  assert.deepEqual(rows.map(({ id }) => id), ['accepted', 'pickup', 'departed', 'arrived', 'confirmation', 'inspection']);
  assert.deepEqual(rows.map(({ status }) => status), ['done', 'current', 'pending', 'pending', 'pending', 'pending']);
  assert.equal(rows[0].at, state.trip.acceptedAt);
  assert.ok(rows.slice(1).every(({ at }) => at === null));
  state = advanceTrip(state, order);
  rows = transportProgress(order, state.trip);
  assert.deepEqual(rows.map(({ status }) => status), ['done', 'done', 'current', 'pending', 'pending', 'pending']);
  assert.equal(rows[1].at, state.trip.pickupAt);
  state = advanceTrip(state, order, { bagWeights: weights });
  rows = transportProgress(order, state.trip);
  assert.deepEqual(rows.map(({ status }) => status), ['done', 'done', 'done', 'current', 'pending', 'pending']);
  assert.equal(rows[2].at, state.trip.departedAt);
  state = advanceTrip(state, order);
  rows = transportProgress(order, state.trip);
  assert.deepEqual(rows.map(({ status }) => status), ['done', 'done', 'done', 'done', 'current', 'pending']);
  assert.equal(rows[3].at, state.trip.arrivedAt);
  assert.equal(rows[4].at, null);
  state = advanceTrip(state, order);
  rows = transportProgress(order, state.completedTrips[0]);
  assert.deepEqual(rows.map(({ status }) => status), ['done', 'done', 'done', 'done', 'done', 'current']);
  assert.equal(rows[4].at, state.completedTrips[0].completedAt);
  assert.equal(rows[5].at, null);
});

test('legacy missing timestamps stay empty and cannot imply a completed buyer inspection', () => {
  const trip = finishTrip();
  delete trip.pickupAt;
  delete trip.departedAt;
  delete trip.arrivedAt;
  trip.status = 'paid';
  trip.inspectedAt = '2026-11-05T12:00:00.000Z';
  const rows = transportProgress(order, trip);
  assert.ok(rows.filter(({ id }) => ['pickup', 'departed', 'arrived', 'inspection'].includes(id)).every(({ at }) => at === null));
  assert.equal(rows.find(({ id }) => id === 'confirmation').at, trip.completedAt);
  assert.equal(rows.at(-1).status, 'current');
  const restored = sanitizeState({ ...createInitialState(), completedTrips: [trip] });
  assert.equal(transportProgress(order, restored.completedTrips[0]).at(-1).status, 'current');
});

test('transport records are serializable demonstration data for active and completed trips', () => {
  const active = acceptedState().trip;
  const activeRecord = buildTransportRecord(order, active);
  assert.equal(activeRecord.demo, true);
  assert.match(activeRecord.note, /법정/);
  assert.equal(activeRecord.order.id, order.id);
  assert.equal(activeRecord.order.material, order.material);
  assert.equal(activeRecord.declaredWeightKg, order.ton * 1000);
  assert.equal(activeRecord.actualWeightKg, null);
  assert.deepEqual(activeRecord.bagWeights, []);
  assert.equal(activeRecord.acceptedFare, active.fare);
  assert.equal(activeRecord.status, 'to-pickup');
  assert.deepEqual(activeRecord.timestamps, {
    acceptedAt: active.acceptedAt, pickupAt: null, departedAt: null, arrivedAt: null, completedAt: null,
  });
  const completed = finishTrip();
  const record = buildTransportRecord(order, completed);
  assert.equal(record.status, 'inspection-pending');
  assert.ok(Math.abs(record.actualWeightKg - order.ton * 1000) < 1e-8);
  assert.deepEqual(record.bagWeights, weights);
  assert.equal(record.timestamps.arrivedAt, completed.arrivedAt);
  assert.equal(record.timestamps.completedAt, completed.completedAt);
  assert.deepEqual(JSON.parse(JSON.stringify(record)), record);
  record.bagWeights[0] = 1;
  assert.notEqual(completed.bagWeights[0], 1);
  assert.equal(buildTransportRecord(order, { ...completed, status: 'paid' }).status, 'inspection-pending');
});

test('progress and transport records reject a mismatched call or missing trip', () => {
  for (const make of [transportProgress, buildTransportRecord]) {
    assert.throws(() => make(ORDERS[1], acceptedState().trip), /일치/);
    assert.throws(() => make(order, null), /운송/);
    assert.throws(() => make(order, { ...acceptedState().trip, stage: 'inspection-approved' }), /단계/);
  }
});

// Accepted calls leave recruitment, so their detail must not re-add them.
test('active and completed calls cannot re-enter comparison while removal remains available', () => {
  const base = { comparisonIds: [], trip: { orderId: 1 }, completedTrips: [{ orderId: 2 }] };
  assert.throws(() => toggleComparison(base, 1), /진행 중이거나 완료/);
  assert.throws(() => toggleComparison(base, 2), /진행 중이거나 완료/);
  assert.deepEqual(toggleComparison(base, 3).comparisonIds, [3]);
  assert.deepEqual(toggleComparison({ ...base, comparisonIds: [1] }, 1).comparisonIds, []);
});
