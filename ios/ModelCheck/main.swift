import Foundation

// 실행: swiftc ios/GeumulMajung/Model.swift ios/ModelCheck/main.swift -o /tmp/netcheck && /tmp/netcheck
func check(_ ok: Bool, _ what: String, line: Int = #line) {
    if !ok { print("실패 \(line): \(what)"); exit(1) }
}
func fails(_ what: String, _ needle: String, _ body: () throws -> Void) {
    do { try body(); check(false, what) } catch { check(error.localizedDescription.contains(needle), what + " · " + error.localizedDescription) }
}

let lots = Net.seed()
let lot = lots[0], q = lot.quotes[1]
for (accepted, cost, savings, fee, margin) in [(2.0, 1_540_000, -40_000, 80_000, -30_000),
                                                (3.0, 1_460_000, 40_000, 120_000, 10_000),
                                                (4.0, 1_380_000, 120_000, 160_000, 50_000)] {
    let t = try! Net.calculate(lot, q, total: 5, accepted: accepted)
    check(t.baseline == 1_500_000 && t.cost == cost && t.savings == savings && t.fee == fee && t.margin == margin, "\(accepted)톤 정산")
}
check(try! Net.calculate(lot, q, total: 5, accepted: 2.75).margin == 0, "손익분기 2.75톤")
check(try! Net.calculate(lot, q, total: 3.1, accepted: 2.8).residual == 0.3, "잔재 소수 오차")
fails("인수량 초과", "초과") { _ = try Net.calculate(lot, q, total: 5, accepted: 5.01) }

var settled = lot
settled.status = .settled
fails("계량 없음", "실제 계량") { try Net.verify(settled) }
settled.actual = Actual(total: 5, accepted: 4, extra: nil, reference: "", reason: "", signer: "")
fails("증빙 없음", "증빙") { try Net.verify(settled) }
settled.actual!.reference = "예시-검수-001"
fails("잔재 사유 없음", "잔재물") { try Net.verify(settled) }
settled.actual!.reason = "로프 혼입"
try! Net.verify(settled)

var future = lots[2]
future.status = .settled
future.actual = settled.actual
fails("출항 전 정산", "출항 전") { try Net.verify(future) }

var expired = lots[1]
expired.quotes[0].validUntil = Net.date("2026-11-26")
expired.status = .confirmed
expired.choice = 0
fails("만료 견적 확정", "견적 유효일") { try Net.verify(expired) }

var bad = lot
bad.checks = ["임의"]
fails("사전 점검", "사전 점검") { try Net.verify(bad) }

check(Net.allocateId(lots) == "SS-2611-007", "반출번호")
check(Net.allocateId(lots, on: Net.date("2026-12-01")) == "SS-2612-001", "월 변경 반출번호")
check(Net.noticeBy(Net.date("2026-11-27T08:30")) == Net.date("2026-11-26T08:30"), "신청 기한")
lots.forEach { try! Net.verify($0) }
print("모델 검증 통과")
