(function () {
  "use strict";

  const DEMO_DATE = "2026-11-27";

  function requireText(value, name) {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(name + " 항목을 입력해 주세요.");
    }
  }

  function amount(value, name) {
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      value > Number.MAX_SAFE_INTEGER
    ) {
      throw new Error(name + "에 0 이상의 유효한 숫자를 입력해 주세요.");
    }
    return value;
  }

  function won(value, name) {
    amount(value, name);
    if (!Number.isSafeInteger(value)) {
      throw new Error(name + "에 원 단위 정수를 입력해 주세요.");
    }
    return value;
  }

  function positiveWeight(value, name) {
    amount(value, name);
    if (value === 0) throw new Error(name + "은 0톤보다 커야 합니다.");
  }

  function calendarDay(value, name) {
    const date =
      typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(value + "T00:00:00Z")
        : new Date(NaN);
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    ) {
      throw new Error(name + "에 올바른 날짜를 입력해 주세요.");
    }
    return value;
  }

  function checkAccepted(total, accepted) {
    positiveWeight(total, "반출 중량");
    amount(accepted, "인수 중량");
    if (accepted > total)
      throw new Error("인수 중량은 반출 중량을 넘을 수 없습니다.");
  }

  function defaults(weight, date) {
    positiveWeight(weight, "예상 중량");
    const validUntil = calendarDay(String(date).slice(0, 10), "반출 예정일");
    return [
      {
        label: "현 상태 인수",
        condition: "로프를 부착한 채로 입고하고 육상에서 선별합니다.",
        expected: Math.min(weight, Math.round(weight * 0.6 * 1000) / 1000),
        rate: 220000,
        residualRate: 300000,
        extra: 80000,
        validUntil,
      },
      {
        label: "로프 분리 후 인수",
        condition: "섬에서 부착 로프를 분리한 뒤 그물만 마대에 담습니다.",
        expected: Math.min(weight, Math.round(weight * 0.8 * 1000) / 1000),
        rate: 180000,
        residualRate: 300000,
        extra: 200000,
        validUntil,
      },
    ];
  }

  function calculate(record, quote, total, accepted, extra = quote.extra) {
    checkAccepted(total, accepted);
    won(record.baseRate, "기존 처리 단가");
    won(record.feeRate, "운영료 단가");
    won(record.directCost, "팀 직접비");
    won(quote.rate, "인수 처리 단가");
    won(quote.residualRate, "잔재물 처리 단가");
    won(extra, "추가비");
    const residual = Number((total - accepted).toFixed(9));
    const fee = Math.round(accepted * record.feeRate);
    const baseline = Math.round(total * record.baseRate);
    const cost =
      Math.round(accepted * quote.rate) +
      Math.round(residual * quote.residualRate) +
      extra +
      fee;
    won(baseline, "기존 총비용");
    won(cost, "새 방식 총비용");
    return {
      baseline,
      cost,
      savings: baseline - cost,
      fee,
      margin: fee - record.directCost,
      residual,
      ratio: (accepted / total) * 100,
    };
  }

  function verify(record) {
    if (!record || typeof record !== "object")
      throw new Error("반출 기록을 확인해 주세요.");
    for (const [key, title] of Object.entries({
      id: "반출 번호",
      kind: "어구 종류",
      material: "재질",
      facility: "처리업체",
    }))
      requireText(record[key], title);
    if (!Number.isSafeInteger(record.bags) || record.bags < 1) {
      throw new Error("마대 수에 1 이상의 정수를 입력해 주세요.");
    }
    positiveWeight(record.weight, "예상 중량");
    if (
      typeof record.departure !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(record.departure)
    ) {
      throw new Error("반출 예정일과 시간을 확인해 주세요.");
    }
    const departureDay = calendarDay(
      record.departure.slice(0, 10),
      "반출 예정일",
    );
    if (record.note != null && typeof record.note !== "string")
      throw new Error("현장 메모를 확인해 주세요.");
    if (
      record.photo &&
      (typeof record.photo !== "string" ||
        !/^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(
          record.photo,
        ))
    ) {
      throw new Error(
        "첨부 사진은 JPEG, PNG, WEBP 또는 GIF 형식으로 등록해 주세요.",
      );
    }
    if (!["registered", "confirmed", "settled"].includes(record.status)) {
      throw new Error("반출 단계가 올바르지 않습니다.");
    }
    if (!Array.isArray(record.quotes) || record.quotes.length === 0) {
      throw new Error("인수 조건을 한 가지 이상 입력해 주세요.");
    }
    for (const quote of record.quotes) {
      if (!quote || typeof quote !== "object")
        throw new Error("인수 조건을 확인해 주세요.");
      requireText(quote.label, "조건 이름");
      requireText(quote.condition, "인수 조건");
      calendarDay(quote.validUntil, "견적 유효일");
      calculate(record, quote, record.weight, quote.expected);
    }
    if (record.status === "registered") {
      if (record.choice != null)
        throw new Error("등록 단계에는 확정한 인수 조건이 없습니다.");
    } else {
      const index = record.choice;
      if (
        !Number.isSafeInteger(index) ||
        index < 0 ||
        index >= record.quotes.length
      ) {
        throw new Error("확정할 인수 조건을 선택해 주세요.");
      }
      if (record.quotes[index].validUntil < departureDay) {
        throw new Error(
          "견적 유효일이 출항 예정일보다 빠릅니다. 업체의 인수 조건을 다시 확인해 주세요.",
        );
      }
    }
    if (record.status === "settled") {
      const actual = record.actual;
      if (!actual || typeof actual !== "object")
        throw new Error("실제 계량과 인수 결과를 입력해 주세요.");
      // ponytail: 시연 기준일 고정, 현장용은 실제 하선 시각 기준으로 교체
      if (departureDay > DEMO_DATE)
        throw new Error("출항 전에는 검수·정산을 입력할 수 없습니다.");
      calculate(
        record,
        record.quotes[record.choice],
        actual.total,
        actual.accepted,
        actual.extra,
      );
      requireText(actual.reference, "계량·인수 증빙 번호");
      if (actual.accepted < actual.total)
        requireText(actual.reason, "잔재물 사유");
    } else if (record.actual != null) {
      throw new Error("검수 완료 단계에 실제 계량 결과를 함께 저장해 주세요.");
    }
    return record;
  }

  function allocateId(records, date = DEMO_DATE) {
    const day = calendarDay(String(date).slice(0, 10), "등록일");
    const prefix = "SS-" + day.slice(2, 4) + day.slice(5, 7) + "-";
    let sequence = 0;
    for (const record of records) {
      if (typeof record.id === "string" && record.id.startsWith(prefix)) {
        const suffix = record.id.slice(prefix.length);
        if (/^\d+$/.test(suffix)) sequence = Math.max(sequence, Number(suffix));
      }
    }
    return prefix + String(sequence + 1).padStart(3, "0");
  }

  function seed() {
    const lots = [
      {
        id: "SS-2611-006",
        kind: "폐자망",
        material: "나일론",
        weight: 5,
        bags: 12,
        departure: "2026-11-27T08:30",
        status: "confirmed",
        note: "로프 분리 후 그물을 마대별로 묶어 인계합니다.",
      },
      {
        id: "SS-2611-005",
        kind: "폐통발 그물",
        material: "혼합",
        weight: 3.2,
        bags: 8,
        departure: "2026-11-30T09:00",
        status: "registered",
        note: "부착 로프가 섞여 있어 육상 선별 조건을 확인합니다.",
      },
      {
        id: "SS-2611-004",
        kind: "폐자망",
        material: "나일론",
        weight: 4.5,
        bags: 10,
        departure: "2026-12-01T08:30",
        status: "confirmed",
        note: "마대에 표본 그물을 따로 표시했습니다.",
      },
      {
        id: "SS-2611-003",
        kind: "혼합 폐어망",
        material: "미확인",
        weight: 2.4,
        bags: 6,
        departure: "2026-12-02T10:00",
        status: "registered",
        note: "재질 표본 확인이 필요합니다.",
      },
      {
        id: "SS-2611-002",
        kind: "폐자망",
        material: "나일론",
        weight: 5,
        bags: 11,
        departure: "2026-11-24T08:50",
        status: "settled",
        note: "지정 업체 검수 완료.",
        actual: {
          total: 5,
          accepted: 4,
          reason: "부착 로프와 오염 그물",
          reference: "예시-계량-1124",
        },
      },
      {
        id: "SS-2611-001",
        kind: "폐통발 그물",
        material: "혼합",
        weight: 3,
        bags: 7,
        departure: "2026-11-20T09:10",
        status: "settled",
        note: "잔재물을 별도 처리했습니다.",
        actual: {
          total: 3.1,
          accepted: 2.8,
          reason: "금속 고리 혼입",
          reference: "예시-계량-1120",
          extra: 90000,
        },
      },
    ];
    return lots.map((lot) =>
      verify({
        photo: null,
        facility: "보령 지정 재활용업체 (가상)",
        actual: null,
        baseRate: 300000,
        feeRate: 40000,
        directCost: 110000,
        choice: lot.status === "registered" ? null : 1,
        quotes: defaults(lot.weight, lot.departure),
        ...lot,
      }),
    );
  }

  const model = Object.freeze({
    DEMO_DATE,
    seed,
    defaults,
    calculate,
    allocateId,
    verify,
  });
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  else globalThis.NetModel = model;
})();
