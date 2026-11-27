import Foundation

// 웹 시제품 model.js와 같은 계산·상태 규칙. Foundation만 사용 (ModelCheck에서 단독 컴파일).

enum Status: String, Codable, CaseIterable {
    case registered, confirmed, settled
    var name: String {
        switch self {
        case .registered: "인수 협의"
        case .confirmed: "인수 확정"
        case .settled: "정산 완료"
        }
    }
}

struct Quote: Codable, Hashable {
    var label: String
    var condition: String
    var expected: Double
    var rate: Int
    var residualRate: Int
    var extra: Int
    var validUntil: Date
}

struct Actual: Codable, Hashable {
    var total: Double
    var accepted: Double
    var extra: Int?
    var reference: String
    var reason: String
    var signer: String
}

struct Shipment: Codable, Identifiable, Hashable {
    var id: String
    var kind: String
    var material: String
    var weight: Double
    var bags: Int
    var departure: Date
    var facility: String
    var note: String
    var checks: [String]
    var status: Status
    var quotes: [Quote]
    var choice: Int?
    var actual: Actual?
    var baseRate: Int
    var feeRate: Int
    var directCost: Int
}

struct Totals: Equatable {
    var baseline: Int, cost: Int, savings: Int, fee: Int, margin: Int
    var residual: Double, ratio: Double
}

struct NetError: LocalizedError {
    let errorDescription: String?
    init(_ message: String) { errorDescription = message }
}

enum Net {
    static let calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Asia/Seoul")!
        return c
    }()

    /// "2026-11-27T08:30" 또는 "2026-11-27"
    static func date(_ text: String) -> Date {
        let f = DateFormatter()
        f.calendar = calendar
        f.timeZone = calendar.timeZone
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = text.count > 10 ? "yyyy-MM-dd'T'HH:mm" : "yyyy-MM-dd"
        return f.date(from: text)!
    }

    static let demoDate = date("2026-11-27")
    static let facility = "보령 지정 재활용업체 (가상)"
    // 인수 기준 사전 점검 (Fisheries Iceland 부착물 기준 · Net Your Problem 표본 확인 참고)
    static let checks = ["부착 로프 분리", "금속 고리·추 제거", "패각·진흙 등 이물 제거", "재질 표본 사진 확보"]

    static func day(_ d: Date) -> Date { calendar.startOfDay(for: d) }
    static func sailed(_ s: Shipment) -> Bool { day(s.departure) <= demoDate }
    // 1톤 초과 반입은 출항 24시간 전 업체 신청 (Fisheries Iceland 규칙 차용)
    static func noticeBy(_ departure: Date) -> Date { departure.addingTimeInterval(-86_400) }

    static func defaults(weight: Double, departure: Date) -> [Quote] {
        let valid = day(departure)
        let r = { (x: Double) in min(weight, (weight * x * 1000).rounded() / 1000) }
        return [
            Quote(label: "현 상태 인수", condition: "로프 부착 상태로 입고 후 육상 선별",
                  expected: r(0.6), rate: 220_000, residualRate: 300_000, extra: 80_000, validUntil: valid),
            Quote(label: "로프 분리 후 인수", condition: "섬에서 부착 로프 분리 후 그물만 마대 적재",
                  expected: r(0.8), rate: 180_000, residualRate: 300_000, extra: 200_000, validUntil: valid),
        ]
    }

    static func calculate(_ s: Shipment, _ q: Quote, total: Double, accepted: Double, extra: Int? = nil) throws -> Totals {
        guard total.isFinite, total > 0 else { throw NetError("반출 중량: 0톤 초과 값 필요") }
        guard accepted.isFinite, accepted >= 0 else { throw NetError("인수 중량: 0 이상의 유효 숫자 입력 필요") }
        guard accepted <= total else { throw NetError("인수 중량의 반출 중량 초과 불가") }
        let extra = extra ?? q.extra
        guard [s.baseRate, s.feeRate, s.directCost, q.rate, q.residualRate, extra].allSatisfy({ $0 >= 0 }) else {
            throw NetError("단가·추가비: 0 이상의 원 단위 정수 입력 필요")
        }
        let won = { (x: Double) in Int(x.rounded()) }
        let residual = ((total - accepted) * 1e9).rounded() / 1e9
        let fee = won(accepted * Double(s.feeRate))
        let baseline = won(total * Double(s.baseRate))
        let cost = won(accepted * Double(q.rate)) + won(residual * Double(q.residualRate)) + extra + fee
        return Totals(baseline: baseline, cost: cost, savings: baseline - cost, fee: fee,
                      margin: fee - s.directCost, residual: residual, ratio: accepted / total * 100)
    }

    static func verify(_ s: Shipment) throws {
        for (value, title) in [(s.id, "반출 번호"), (s.kind, "어구 종류"), (s.material, "재질"), (s.facility, "처리업체")]
        where value.trimmingCharacters(in: .whitespaces).isEmpty {
            throw NetError("\(title) 입력 필요")
        }
        guard s.bags >= 1 else { throw NetError("마대 수: 1 이상의 정수 입력 필요") }
        guard s.weight.isFinite, s.weight > 0 else { throw NetError("예상 중량: 0톤 초과 값 필요") }
        guard s.checks.allSatisfy(checks.contains) else { throw NetError("사전 점검 항목 확인 필요") }
        guard !s.quotes.isEmpty else { throw NetError("인수 조건 1건 이상 입력 필요") }
        for q in s.quotes {
            if q.label.isEmpty || q.condition.trimmingCharacters(in: .whitespaces).isEmpty {
                throw NetError("인수 조건 입력 필요")
            }
            _ = try calculate(s, q, total: s.weight, accepted: q.expected)
        }
        if s.status == .registered {
            if s.choice != nil { throw NetError("등록 단계에는 확정 인수 조건 부재") }
        } else {
            guard let c = s.choice, s.quotes.indices.contains(c) else { throw NetError("확정할 인수 조건 선택 필요") }
            if day(s.quotes[c].validUntil) < day(s.departure) {
                throw NetError("견적 유효일이 출항 예정일보다 이름 · 업체 인수 조건 재확인 필요")
            }
        }
        if s.status == .settled {
            guard let a = s.actual else { throw NetError("실제 계량 및 인수 결과 입력 필요") }
            // ponytail: 시연 기준일 고정, 현장용은 실제 하선 시각 기준으로 교체
            guard sailed(s) else { throw NetError("출항 전 검수·정산 입력 불가") }
            _ = try calculate(s, s.quotes[s.choice!], total: a.total, accepted: a.accepted, extra: a.extra)
            if a.reference.trimmingCharacters(in: .whitespaces).isEmpty { throw NetError("계량·인수 증빙 번호 입력 필요") }
            if a.accepted < a.total, a.reason.trimmingCharacters(in: .whitespaces).isEmpty {
                throw NetError("잔재물 사유 입력 필요")
            }
        } else if s.actual != nil {
            throw NetError("실제 계량 결과는 검수 완료 단계에서만 저장 가능")
        }
    }

    static func totals(_ s: Shipment) -> Totals? {
        guard let a = s.actual, let c = s.choice else { return nil }
        return try? calculate(s, s.quotes[c], total: a.total, accepted: a.accepted, extra: a.extra)
    }

    static func allocateId(_ list: [Shipment], on d: Date = demoDate) -> String {
        let p = calendar.dateComponents([.year, .month], from: d)
        let prefix = String(format: "SS-%02d%02d-", p.year! % 100, p.month!)
        let n = list.compactMap { $0.id.hasPrefix(prefix) ? Int($0.id.dropFirst(prefix.count)) : nil }.max() ?? 0
        return prefix + String(format: "%03d", n + 1)
    }

    static func seed() -> [Shipment] {
        func lot(_ id: String, _ kind: String, _ material: String, _ weight: Double, _ bags: Int, _ dep: String,
                 _ status: Status, _ note: String, checks: [String] = [], actual: Actual? = nil) -> Shipment {
            let d = date(dep)
            return Shipment(id: id, kind: kind, material: material, weight: weight, bags: bags, departure: d,
                            facility: facility, note: note, checks: checks, status: status,
                            quotes: defaults(weight: weight, departure: d),
                            choice: status == .registered ? nil : 1, actual: actual,
                            baseRate: 300_000, feeRate: 40_000, directCost: 110_000)
        }
        return [
            lot("SS-2611-006", "폐자망", "나일론", 5, 12, "2026-11-27T08:30", .confirmed,
                "로프 분리 후 그물을 마대별로 결속해 인계함", checks: ["부착 로프 분리", "금속 고리·추 제거"]),
            lot("SS-2611-005", "폐통발 그물", "혼합", 3.2, 8, "2026-11-30T09:00", .registered,
                "부착 로프 혼입으로 육상 선별 조건 확인 중"),
            lot("SS-2611-004", "폐자망", "나일론", 4.5, 10, "2026-12-01T08:30", .confirmed, "마대별 표본 그물 별도 표시"),
            lot("SS-2611-003", "혼합 폐어망", "미확인", 2.4, 6, "2026-12-02T10:00", .registered, "재질 표본 확인 필요"),
            lot("SS-2611-002", "폐자망", "나일론", 5, 11, "2026-11-24T08:50", .settled, "지정 업체 검수 완료",
                actual: Actual(total: 5, accepted: 4, extra: nil, reference: "예시-계량-1124",
                               reason: "부착 로프와 오염 그물", signer: "업체 검수 담당 (가상)")),
            lot("SS-2611-001", "폐통발 그물", "혼합", 3, 7, "2026-11-20T09:10", .settled, "잔재물 별도 처리 완료",
                actual: Actual(total: 3.1, accepted: 2.8, extra: 90_000, reference: "예시-계량-1120",
                               reason: "금속 고리 혼입", signer: "")),
        ]
    }
}
