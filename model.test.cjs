const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const model = require("./model.js");

test("5톤 반출의 실제 인수 중량별 정산이 사업 실증안과 일치한다", () => {
  const lot = model.seed()[0];
  const quote = lot.quotes[1];
  for (const [accepted, cost, savings, fee, margin] of [
    [2, 1540000, -40000, 80000, -30000],
    [3, 1460000, 40000, 120000, 10000],
    [4, 1380000, 120000, 160000, 50000],
  ]) {
    assert.deepEqual(model.calculate(lot, quote, 5, accepted), {
      baseline: 1500000,
      cost,
      savings,
      fee,
      margin,
      residual: 5 - accepted,
      ratio: accepted * 20,
    });
  }
  assert.equal(model.calculate(lot, quote, 5, 2.75).margin, 0);
  assert.equal(model.calculate(lot, quote, 5, 4, 0).cost, 1180000);
  assert.equal(model.calculate(lot, quote, 5, 0).fee, 0);
  assert.equal(model.calculate(lot, quote, 5, 5).residual, 0);
});

test("가격과 중량을 검증하고 실계량이 예상량과 달라도 정산한다", () => {
  const lot = model.seed()[0];
  const quote = lot.quotes[1];
  for (const [total, accepted] of [
    [0, 0],
    [-1, 0],
    [5, -1],
    [5, 5.01],
    [5, NaN],
    [Infinity, 1],
    [5, "4"],
  ]) {
    assert.throws(() => model.calculate(lot, quote, total, accepted));
  }
  assert.throws(() => model.calculate(lot, quote, 5, 2, -1), /추가비/);
  assert.throws(
    () => model.calculate(lot, { ...quote, rate: 1.1 }, 5, 2),
    /원 단위/,
  );
  assert.equal(model.calculate(lot, quote, 3.1, 2.8).residual, 0.3);
  assert.equal(model.calculate(lot, quote, 6, 6).baseline, 1800000);
});

test("등록 시 초과 보관된 견적은 열어볼 수 있고 유효한 조건만 확정한다", () => {
  const lot = model.seed()[1];
  lot.quotes[0].validUntil = "2026-11-26";
  model.verify(lot);
  assert.throws(
    () => model.verify({ ...lot, status: "confirmed", choice: 0 }),
    /견적 유효일/,
  );
  model.verify({ ...lot, status: "confirmed", choice: 1 });
  assert.throws(() => model.verify({ ...lot, choice: 1 }), /등록 단계/);
  assert.throws(
    () => model.verify({ ...lot, status: "confirmed", choice: 3 }),
    /선택/,
  );
  lot.departure = "2026-02-31T09:30";
  assert.throws(() => model.verify(lot), /날짜/);
});

test("확정한 기록에 검수증빙이 있어야 정산을 완료한다", () => {
  const lot = model.seed()[0];
  lot.status = "settled";
  assert.throws(() => model.verify(lot), /실제 계량/);
  lot.actual = { total: 5, accepted: 4, reference: "", reason: "" };
  assert.throws(() => model.verify(lot), /증빙/);
  lot.actual.reference = "예시-검수-001";
  assert.throws(() => model.verify(lot), /잔재물/);
  lot.actual.reason = "로프 혼입";
  model.verify(lot);
  lot.actual.accepted = 5;
  lot.actual.reason = "";
  model.verify(lot);
  assert.throws(
    () => model.verify({ ...lot, status: "registered", choice: null }),
    /검수 완료/,
  );
  assert.throws(
    () =>
      model.verify({
        ...lot,
        departure: "2026-11-28T08:30",
        quotes: lot.quotes.map((q) => ({ ...q, validUntil: "2026-11-28" })),
      }),
    /출항 전/,
  );
});

test("오프라인 브라우저용 전역 API와 독립된 시연 데이터, 중복 없는 반출번호를 제공한다", () => {
  const context = vm.createContext({});
  vm.runInContext(
    fs.readFileSync(require.resolve("./model.js"), "utf8"),
    context,
  );
  assert.equal(context.NetModel.DEMO_DATE, "2026-11-27");
  const lots = model.seed();
  assert.equal(lots.length, new Set(lots.map((r) => r.id)).size);
  assert.equal(lots.filter((r) => r.status === "settled").length, 2);
  assert.equal(lots[0].departure, "2026-11-27T08:30");
  assert.equal(lots[0].facility, "보령 지정 재활용업체 (가상)");
  assert.equal(model.allocateId(lots), "SS-2611-007");
  assert.equal(model.allocateId(lots, "2026-12-01"), "SS-2612-001");
  assert.equal(model.noticeBy("2026-11-27T08:30"), "2026-11-26T08:30");
  assert.throws(
    () => model.verify({ ...lots[0], checks: ["임의"] }),
    /사전 점검/,
  );
  lots[0].quotes[1].rate = 1;
  assert.equal(model.seed()[0].quotes[1].rate, 180000);
});
