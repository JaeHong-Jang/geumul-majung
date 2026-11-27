(function () {
  "use strict";

  const DEMO_DATE = "2026-11-27";
  // 인수 기준 사전 점검 (Fisheries Iceland 부착물 기준 · Net Your Problem 표본 확인 참고)
  const CHECKS = [
    "부착 로프 분리",
    "금속 고리·추 제거",
    "패각·진흙 등 이물 제거",
    "재질 표본 사진 확보",
  ];

  // 담는 방식. 삽시도 집하장은 포장 없는 더미가 기본(충남연구원 사진 판독, 05_리서치 수거 구조 확인)
  const PACKS = ["더미", "마대", "톤백", "암롤박스"];
  // 운반 경로. 보령 섬 물량은 시 용역 바지선 또는 도 운반선(늘푸른충남호)으로 나간다
  const ROUTES = ["시 용역 바지선", "도 운반선", "육상 차량", "미정"];
  const ROUTE_STATUS = ["예정", "결항", "연기", "완료"];
  const UNIT = { 마대: "마대", 톤백: "톤백", 암롤박스: "암롤" };
  // 화면 표시: "더미" 또는 "12마대"
  function packLabel(record) {
    const p = record.packaging || "마대";
    return p === "더미" ? "더미" : record.bags + UNIT[p];
  }

  // 1톤 초과 반입은 출항 24시간 전 업체 신청 (Fisheries Iceland 규칙 차용)
  function noticeBy(departure) {
    return new Date(Date.parse(departure + ":00Z") - 864e5)
      .toISOString()
      .slice(0, 16);
  }

  function requireText(value, name) {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(name + " 입력 필요");
    }
  }

  function amount(value, name) {
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      value > Number.MAX_SAFE_INTEGER
    ) {
      throw new Error(name + ": 0 이상의 유효 숫자 입력 필요");
    }
    return value;
  }

  function won(value, name) {
    amount(value, name);
    if (!Number.isSafeInteger(value)) {
      throw new Error(name + ": 원 단위 정수 입력 필요");
    }
    return value;
  }

  function positiveWeight(value, name) {
    amount(value, name);
    if (value === 0) throw new Error(name + ": 0톤 초과 값 필요");
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
      throw new Error(name + ": 올바른 날짜 입력 필요");
    }
    return value;
  }

  function checkAccepted(total, accepted) {
    positiveWeight(total, "반출 중량");
    amount(accepted, "인수 중량");
    if (accepted > total) throw new Error("인수 중량의 반출 중량 초과 불가");
  }

  function defaults(weight, date) {
    positiveWeight(weight, "예상 중량");
    const validUntil = calendarDay(String(date).slice(0, 10), "반출 예정일");
    return [
      {
        label: "현 상태 인수",
        condition: "로프 부착 상태로 입고 후 육상 선별",
        expected: Math.min(weight, Math.round(weight * 0.6 * 1000) / 1000),
        rate: 220000,
        residualRate: 300000,
        extra: 80000,
        validUntil,
      },
      {
        label: "로프 분리 후 인수",
        condition: "섬에서 부착 로프 분리 후 그물만 마대 적재",
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
      throw new Error("반출 기록 확인 필요");
    for (const [key, title] of Object.entries({
      id: "반출 번호",
      kind: "어구 종류",
      material: "재질",
      facility: "처리업체",
    }))
      requireText(record[key], title);
    const pack = record.packaging ?? "마대"; // 예전 기록은 마대
    if (!PACKS.includes(pack)) throw new Error("담는 방식 확인 필요");
    const minBags = pack === "더미" ? 0 : 1;
    if (!Number.isSafeInteger(record.bags) || record.bags < minBags) {
      throw new Error(
        pack === "더미"
          ? "개수: 0 이상의 정수 입력 필요"
          : "개수: " + pack + "이면 1 이상의 정수 입력 필요",
      );
    }
    const route = record.route;
    if (route != null) {
      if (typeof route !== "object" || !ROUTES.includes(route.mode))
        throw new Error("운반 경로 확인 필요");
      if (route.status != null && !ROUTE_STATUS.includes(route.status))
        throw new Error("운항 상태 확인 필요");
      for (const k of ["vessel", "landingPort", "contract", "reason"])
        if (route[k] != null && typeof route[k] !== "string")
          throw new Error("운반 정보 확인 필요");
    }
    positiveWeight(record.weight, "예상 중량");
    if (
      typeof record.departure !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(record.departure)
    ) {
      throw new Error("반출 예정 일시 확인 필요");
    }
    const departureDay = calendarDay(
      record.departure.slice(0, 10),
      "반출 예정일",
    );
    if (record.note != null && typeof record.note !== "string")
      throw new Error("현장 메모 확인 필요");
    if (
      record.checks != null &&
      !(
        Array.isArray(record.checks) &&
        record.checks.every((c) => CHECKS.includes(c))
      )
    )
      throw new Error("사전 점검 항목 확인 필요");
    if (
      record.photo &&
      (typeof record.photo !== "string" ||
        !/^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(
          record.photo,
        ))
    ) {
      throw new Error("첨부 사진: JPEG·PNG·WEBP·GIF 형식만 등록 가능");
    }
    if (!["registered", "confirmed", "settled"].includes(record.status)) {
      throw new Error("반출 단계 오류");
    }
    if (!Array.isArray(record.quotes) || record.quotes.length === 0) {
      throw new Error("인수 조건 1건 이상 입력 필요");
    }
    for (const quote of record.quotes) {
      if (!quote || typeof quote !== "object")
        throw new Error("인수 조건 확인 필요");
      requireText(quote.label, "조건 이름");
      requireText(quote.condition, "인수 조건");
      calendarDay(quote.validUntil, "견적 유효일");
      calculate(record, quote, record.weight, quote.expected);
    }
    if (record.status === "registered") {
      if (record.choice != null)
        throw new Error("등록 단계에는 확정 인수 조건 부재");
    } else {
      const index = record.choice;
      if (
        !Number.isSafeInteger(index) ||
        index < 0 ||
        index >= record.quotes.length
      ) {
        throw new Error("확정할 인수 조건 선택 필요");
      }
      if (record.quotes[index].validUntil < departureDay) {
        throw new Error(
          "견적 유효일이 출항 예정일보다 이름 · 업체 인수 조건 재확인 필요",
        );
      }
    }
    if (record.status === "settled") {
      const actual = record.actual;
      if (!actual || typeof actual !== "object")
        throw new Error("실제 계량 및 인수 결과 입력 필요");
      // ponytail: 시연 기준일 고정, 현장용은 실제 하선 시각 기준으로 교체
      if (departureDay > DEMO_DATE)
        throw new Error("출항 전 검수·정산 입력 불가");
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
      if (actual.signer != null && typeof actual.signer !== "string")
        throw new Error("업체 확인자 확인 필요");
    } else if (record.actual != null) {
      throw new Error("실제 계량 결과는 검수 완료 단계에서만 저장 가능");
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

  // 운반 경로별 기본 정보. 2026 보령 도서지역 정화사업은 계약 업체가 예선·대선으로 대천항까지 옮기고 낙찰 업체 처리장에서 처리한다
  function routeFor(mode) {
    if (mode === "도 운반선")
      return { mode, vessel: "늘푸른충남호(충남도 직영)", landingPort: "대천항(추정)",
        contract: "미확인(하역 뒤 처리 계약 확인 필요)", status: "예정" };
    if (mode === "시 용역 바지선")
      return { mode, vessel: "예선, 대선(계약 업체)", landingPort: "대천항",
        contract: "2026 보령 도서지역 해양쓰레기 정화사업(공동도급)", status: "예정" };
    return { mode, vessel: "", landingPort: "", contract: "", status: "예정" };
  }
  function routeOf(lot) {
    const r = routeFor(lot.id === "SS-2611-004" ? "도 운반선" : "시 용역 바지선");
    return lot.status === "settled" ? { ...r, status: "완료" } : r;
  }

  function seed() {
    const lots = [
      {
        id: "SS-2611-006",
        kind: "폐자망",
        material: "나일론",
        weight: 5,
        bags: 12,
        packaging: "마대",
        departure: "2026-11-27T08:30",
        status: "confirmed",
        note: "로프 분리 후 그물을 마대별로 결속해 인계함",
        checks: ["부착 로프 분리", "금속 고리·추 제거"],
      },
      {
        id: "SS-2611-005",
        kind: "폐통발 그물",
        material: "혼합",
        weight: 3.2,
        bags: 0,
        packaging: "더미",
        departure: "2026-11-30T09:00",
        status: "registered",
        note: "부착 로프 혼입으로 육상 선별 조건 확인 중",
      },
      {
        id: "SS-2611-004",
        kind: "폐자망",
        material: "나일론",
        weight: 4.5,
        bags: 10,
        packaging: "마대",
        departure: "2026-12-01T08:30",
        status: "confirmed",
        note: "마대별 표본 그물 별도 표시",
      },
      {
        id: "SS-2611-003",
        kind: "혼합 폐어망",
        material: "미확인",
        weight: 2.4,
        bags: 0,
        packaging: "더미",
        departure: "2026-12-02T10:00",
        status: "registered",
        note: "재질 표본 확인 필요",
      },
      {
        id: "SS-2611-002",
        kind: "폐자망",
        material: "나일론",
        weight: 5,
        bags: 11,
        packaging: "마대",
        departure: "2026-11-24T08:50",
        status: "settled",
        note: "지정 업체 검수 완료",
        actual: {
          total: 5,
          accepted: 4,
          reason: "부착 로프와 오염 그물",
          reference: "예시-계량-1124",
          signer: "업체 검수 담당 (가상)",
        },
      },
      {
        id: "SS-2611-001",
        kind: "폐통발 그물",
        material: "혼합",
        weight: 3,
        bags: 0,
        packaging: "더미",
        departure: "2026-11-20T09:10",
        status: "settled",
        note: "잔재물 별도 처리 완료",
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
        route: routeOf(lot),
        quotes: defaults(lot.weight, lot.departure),
        ...lot,
      }),
    );
  }

  const model = Object.freeze({
    DEMO_DATE,
    CHECKS,
    PACKS,
    ROUTES,
    ROUTE_STATUS,
    packLabel,
    routeFor,
    noticeBy,
    seed,
    defaults,
    calculate,
    allocateId,
    verify,
  });
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  else globalThis.NetModel = model;
})();
