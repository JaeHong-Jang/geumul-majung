import Charts
import SwiftUI

struct RootView: View {
    @Environment(Store.self) private var store
    @State private var tab = Int(ProcessInfo.processInfo.environment["GM_TAB"] ?? "") ?? 0
    @State private var listFilter: Status?
    @State private var path: [String] = {
        // 시연·검수용: GM_OPEN=반출번호 로 실행 시 상세 화면 바로 열기
        ProcessInfo.processInfo.environment["GM_OPEN"].flatMap { $0.isEmpty ? nil : [$0] } ?? []
    }()

    var body: some View {
        TabView(selection: $tab) {
            Tab("운영 현황", systemImage: "square.grid.2x2", value: 0) {
                NavigationStack(path: $path) { DashboardView { listFilter = $0; tab = 1 } }
            }
            Tab("반출 목록", systemImage: "shippingbox", value: 1) {
                NavigationStack { ShipmentListView(filter: $listFilter) }
            }
            Tab("정산 내역", systemImage: "doc.text", value: 2) {
                NavigationStack { SettlementListView() }
            }
        }
    }
}

// MARK: - 목록

struct ShipmentListView: View {
    @Environment(Store.self) private var store
    @Binding var filter: Status?
    @State private var term = ""

    var body: some View {
        let rows = store.items.filter { s in
            (filter == nil || s.status == filter)
                && (term.isEmpty || [s.id, s.kind, s.material, s.facility].contains { $0.localizedCaseInsensitiveContains(term) })
        }
        List {
            Picker("진행 상태", selection: $filter) {
                Text("전체").tag(Status?.none)
                ForEach(Status.allCases, id: \.self) { Text($0.name).tag(Status?.some($0)) }
            }
            .pickerStyle(.segmented)
            .listRowBackground(Color.clear)
            if rows.isEmpty {
                ContentUnavailableView("조건에 부합하는 반출 없음", systemImage: "magnifyingglass")
            }
            ForEach(rows) { s in
                NavigationLink(value: s.id) { ShipmentRow(s: s) }
                    .cardRow()
            }
        }
        .listRowSpacing(10)
        .scrollContentBackground(.hidden)
        .background(AppBackground())
        .searchable(text: $term, prompt: "반출번호, 품목, 업체 검색")
        .navigationTitle("반출 목록")
        .navigationDestination(for: String.self) { DetailView(id: $0) }
        .toolbar { ToolbarItem(placement: .topBarTrailing) { NewButton() } }
    }
}

struct SettlementListView: View {
    @Environment(Store.self) private var store
    var body: some View {
        let rows = store.items.filter { $0.status == .settled }
        List {
            if rows.isEmpty { ContentUnavailableView("정산 완료 반출 없음", systemImage: "doc.text") }
            ForEach(rows) { s in
                NavigationLink(value: s.id) { SettlementRow(s: s) }
                    .cardRow()
            }
        }
        .listRowSpacing(10)
        .scrollContentBackground(.hidden)
        .background(AppBackground())
        .navigationTitle("정산 내역")
        .navigationDestination(for: String.self) { DetailView(id: $0) }
    }
}

// MARK: - 상세

struct DetailView: View {
    @Environment(Store.self) private var store
    let id: String

    var body: some View {
        if let s = store.item(id) {
            Form {
                Section { DetailHeader(s: s) }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                Section("반출 정보") { Summary(s: s) }
                switch s.status {
                case .registered: QuoteEditor(s: s)
                case .confirmed where !Net.sailed(s):
                    Section("검수 입력 전") {
                        Text("\(Fmt.when(s.departure)) 출항 후 대천항 하선·계량 완료 시 실제 인수량 입력 가능")
                            .foregroundStyle(.secondary)
                    }
                    ConfirmedTerms(s: s)
                case .confirmed:
                    SettlementEditor(s: s)
                    ConfirmedTerms(s: s)
                case .settled:
                    SettlementReport(s: s)
                    ConfirmedTerms(s: s)
                }
            }
            .scrollContentBackground(.hidden)
            .background(AppBackground())
            .navigationTitle(s.id)
            .navigationBarTitleDisplayMode(.inline)
        } else {
            ContentUnavailableView("해당 반출 건 조회 불가", systemImage: "exclamationmark.triangle")
        }
    }
}

struct Summary: View {
    let s: Shipment
    var body: some View {
        LabeledContent("반출 예정", value: Fmt.when(s.departure))
        LabeledContent("예상 반출량", value: "\(Fmt.tons(s.weight)) · \(s.bags)마대")
        LabeledContent("어구 · 재질", value: "\(s.kind) · \(s.material)")
        LabeledContent("지정 처리업체", value: s.facility)
        LabeledContent("사전 점검", value: s.checks.isEmpty ? "미기록" : "\(s.checks.count)/\(Net.checks.count) · " + s.checks.joined(separator: ", "))
        if !s.note.isEmpty { Text("현장 메모 · \(s.note)").font(.footnote).foregroundStyle(.secondary) }
    }
}

struct ConfirmedTerms: View {
    let s: Shipment
    var body: some View {
        if let c = s.choice {
            let q = s.quotes[c]
            Section("확정 조건") {
                LabeledContent("선택한 조건", value: q.label)
                LabeledContent("인수 기준", value: q.condition)
                LabeledContent("인수분 처리비", value: Fmt.won(q.rate) + "/톤")
                LabeledContent("잔재물 처리비", value: Fmt.won(q.residualRate) + "/톤")
                LabeledContent("기존 방식 단가", value: Fmt.won(s.baseRate) + "/톤")
                LabeledContent("운영료", value: Fmt.won(s.feeRate) + "/인수 톤")
                LabeledContent("팀 직접비", value: Fmt.won(s.directCost) + "/건")
            }
        }
    }
}

struct ResultRows: View {
    let t: Totals
    var body: some View {
        LabeledContent("재활용업체 인수율", value: t.ratio.formatted(.number.precision(.fractionLength(0 ... 1))) + "%")
        LabeledContent("잔재량", value: Fmt.tons(t.residual))
        LabeledContent("기존 방식 비용", value: Fmt.won(t.baseline))
        LabeledContent("새 방식 총비용", value: Fmt.won(t.cost))
        LabeledContent("고객 순절감액") { Text(Fmt.won(t.savings)).foregroundStyle(t.savings < 0 ? .red : .ocean).bold() }
        LabeledContent("운영료 매출", value: Fmt.won(t.fee))
        LabeledContent("팀 공헌이익") { Text(Fmt.won(t.margin)).foregroundStyle(t.margin < 0 ? .red : .ocean).bold() }
    }
}

// MARK: - 인수 조건 비교

struct QuoteEditor: View {
    @Environment(Store.self) private var store
    let s: Shipment
    @State private var quotes: [Quote] = []
    @State private var choice: Int?
    @State private var error: String?

    var body: some View {
        let options = quotes.indices.compactMap { i -> (String, Int)? in
            guard let t = try? Net.calculate(s, quotes[i], total: s.weight, accepted: quotes[i].expected),
                  Net.day(quotes[i].validUntil) >= Net.day(s.departure) else { return nil }
            return (quotes[i].label, t.cost)
        }.sorted { $0.1 < $1.1 }

        Section {
            if s.weight > 1 {
                Label("1톤 초과 반입 · 업체 신청 기한 \(Fmt.when(Net.noticeBy(s.departure)))(출항 24시간 전)", systemImage: "clock.badge.exclamationmark")
                    .font(.footnote).foregroundStyle(Color.sand)
            }
            Text(options.count == 2
                 ? (options[1].1 > options[0].1 ? "‘\(options[0].0)’ 조건의 예상 총비용 \(Fmt.won(options[1].1 - options[0].1)) 절감" : "두 조건의 예상 총비용 동일")
                 : "두 견적의 수량·단가 및 출항일까지의 유효일 확인 필요")
                .font(.subheadline.bold()).foregroundStyle(Color.ocean)
        } header: {
            Text("인수 조건 비교")
        } footer: {
            Text("동일 업체의 선별 조건 2안 · 예상 총비용에 인수 톤당 운영료 \(Fmt.won(s.feeRate)) 포함 · 초깃값은 시연용 가정값")
        }

        ForEach(quotes.indices, id: \.self) { i in
            Section {
                Toggle("이 조건 선택", isOn: Binding(get: { choice == i }, set: { choice = $0 ? i : nil }))
                TextField("인수 조건", text: $quotes[i].condition, axis: .vertical)
                DecimalRow(title: "예상 인수량 (톤)", value: $quotes[i].expected)
                IntRow(title: "인수분 처리비 (원/톤)", value: $quotes[i].rate)
                IntRow(title: "잔재물 처리비 (원/톤)", value: $quotes[i].residualRate)
                IntRow(title: "추가 선별·운반비 (원/건)", value: $quotes[i].extra)
                DatePicker("견적 유효일", selection: $quotes[i].validUntil, displayedComponents: .date)
                if let t = try? Net.calculate(s, quotes[i], total: s.weight, accepted: quotes[i].expected) {
                    Text("예상 총비용 \(Fmt.won(t.cost)) · 고객 순절감 \(Fmt.won(t.savings))").font(.footnote.bold())
                } else {
                    Text("비용 산출을 위한 물량·단가 확인 필요").font(.footnote).foregroundStyle(.red)
                }
            } header: { Text(quotes[i].label) }
        }

        Section {
            if let error { Text(error).foregroundStyle(.red) }
            Button("인수 조건 확정") { save(confirm: true) }.bold()
            Button("견적 임시 저장") { save(confirm: false) }
        }
        .onAppear { if quotes.isEmpty { quotes = s.quotes } }
    }

    private func save(confirm: Bool) {
        var next = s
        next.quotes = quotes
        do {
            if confirm {
                guard let c = choice else { throw NetError("확정할 인수 조건 1건 선택 필요") }
                if Net.day(quotes[c].validUntil) < Net.day(s.departure) { throw NetError("선택 견적의 출항일 전 만료 · 견적 유효일 재확인 필요") }
                next.choice = c
                next.status = .confirmed
            }
            try store.save(next)
            error = nil
        } catch let e { error = e.localizedDescription }
    }
}

struct DecimalRow: View {
    let title: String
    @Binding var value: Double
    var body: some View {
        LabeledContent(title) {
            TextField(title, value: $value, format: .number).keyboardType(.decimalPad).multilineTextAlignment(.trailing)
        }
    }
}

struct IntRow: View {
    let title: String
    @Binding var value: Int
    var body: some View {
        LabeledContent(title) {
            TextField(title, value: $value, format: .number).keyboardType(.numberPad).multilineTextAlignment(.trailing)
        }
    }
}

// MARK: - 검수·정산

struct SettlementEditor: View {
    @Environment(Store.self) private var store
    let s: Shipment
    @State private var total = 0.0
    @State private var accepted = 0.0
    @State private var extra = 0
    @State private var reference = ""
    @State private var signer = ""
    @State private var reason = ""
    @State private var agree = false
    @State private var error: String?

    var body: some View {
        let q = s.quotes[s.choice ?? 0]
        Section {
            DecimalRow(title: "실제 반출량 (톤)", value: $total)
            DecimalRow(title: "최종 인수량 (톤)", value: $accepted)
            IntRow(title: "실제 추가 선별·운반비 (원)", value: $extra)
            TextField("계량·인수 증빙번호", text: $reference)
            TextField("업체 확인자", text: $signer)
            TextField(accepted < total ? "잔재 발생 사유 (필수)" : "잔재 발생 사유", text: $reason, axis: .vertical)
            Toggle("계량표·인수 내역 집하장·업체 상호 대조 완료", isOn: $agree)
        } header: { Text("검수 입력") } footer: {
            Text("\(s.facility) · \(q.label) · 입력 중량은 견적 예상치이므로 실측값 확인 필요")
        }
        Section("예상 정산 내역") {
            if let t = try? Net.calculate(s, q, total: total, accepted: accepted, extra: extra) {
                ResultRows(t: t)
            } else {
                Text("계량 총 반출량 및 그 범위 내 인수량 입력 필요").foregroundStyle(.secondary)
            }
        }
        Section {
            if let error { Text(error).foregroundStyle(.red) }
            Button("정산 확정") { save() }.bold().disabled(!agree)
        }
        .onAppear {
            if total == 0 { total = s.weight; accepted = q.expected; extra = q.extra }
        }
    }

    private func save() {
        var next = s
        next.status = .settled
        next.actual = Actual(total: total, accepted: accepted, extra: extra,
                             reference: reference.trimmingCharacters(in: .whitespaces),
                             reason: reason.trimmingCharacters(in: .whitespaces),
                             signer: signer.trimmingCharacters(in: .whitespaces))
        do {
            if accepted < total, next.actual!.reason.isEmpty { throw NetError("미인수 물량의 사유 기재 필요") }
            try store.save(next)
            error = nil
        } catch let e { error = e.localizedDescription }
    }
}

struct SettlementReport: View {
    let s: Shipment
    var body: some View {
        if let a = s.actual, let t = Net.totals(s) {
            Section("계량·인수 결과") {
                LabeledContent("실제 반출량", value: Fmt.tons(a.total))
                LabeledContent("최종 인수량", value: Fmt.tons(a.accepted))
                LabeledContent("선별·운반 등 추가비", value: Fmt.won(a.extra ?? s.quotes[s.choice!].extra))
                LabeledContent("계량·인수 증빙", value: a.reference)
                LabeledContent("업체 확인자", value: a.signer.isEmpty ? "미기록" : a.signer)
                LabeledContent("잔재 사유", value: a.reason.isEmpty ? "전량 인수" : a.reason)
            }
            Section("정산 내역") { ResultRows(t: t) }
        }
    }
}

// MARK: - 반출 등록

struct CreateView: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var kind = "폐어망"
    @State private var material = "미확인"
    @State private var weight = 0.0
    @State private var bags = 0
    @State private var departure = Net.date("2026-11-27T13:00")
    @State private var facility = Net.facility
    @State private var note = ""
    @State private var checks: Set<String> = []
    @State private var baseRate = 300_000
    @State private var feeRate = 40_000
    @State private var directCost = 110_000
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("집하 정보") {
                    Picker("어구 종류", selection: $kind) {
                        ForEach(["폐어망", "폐자망", "폐통발 그물", "혼합 그물"], id: \.self) { Text($0) }
                    }
                    Picker("재질", selection: $material) {
                        ForEach(["미확인", "나일론", "폴리에틸렌", "폴리프로필렌", "혼합"], id: \.self) { Text($0) }
                    }
                    DecimalRow(title: "예상 반출량 (톤)", value: $weight)
                    IntRow(title: "마대 수 (개)", value: $bags)
                    DatePicker("출항 예정 일시", selection: $departure)
                    TextField("지정 처리업체", text: $facility)
                    TextField("혼입물·현장 메모 (선택)", text: $note, axis: .vertical)
                }
                Section {
                    ForEach(Net.checks, id: \.self) { c in
                        Toggle(c, isOn: Binding(get: { checks.contains(c) },
                                                set: { if $0 { checks.insert(c) } else { checks.remove(c) } }))
                    }
                } header: { Text("인수 기준 사전 점검") } footer: { Text("미충족 항목은 업체 거절·추가비 사유") }
                Section {
                    DisclosureGroup("시연 비용 가정 조정") {
                        IntRow(title: "기존 방식 처리비 (원/톤)", value: $baseRate)
                        IntRow(title: "인수 톤당 운영료 (원)", value: $feeRate)
                        IntRow(title: "건별 팀 직접비 (원)", value: $directCost)
                    }
                } footer: {
                    Text("참고 단가 · 군산시수협 2026 인양쓰레기 기초단가 224,500원/톤(선별·계량·운반·재활용 포함) · 태안군 2026 하반기 폐어망 수거·처리 계약 84,268,800원")
                }
                if let error { Section { Text(error).foregroundStyle(.red) } }
            }
            .scrollContentBackground(.hidden)
            .background(AppBackground())
            .navigationTitle("반출 등록")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("닫기") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("등록") { save() }.bold() }
            }
        }
    }

    private func save() {
        let s = Shipment(id: Net.allocateId(store.items), kind: kind, material: material, weight: weight, bags: bags,
                         departure: departure, facility: facility.trimmingCharacters(in: .whitespaces),
                         note: note.trimmingCharacters(in: .whitespaces),
                         checks: Net.checks.filter(checks.contains), status: .registered,
                         quotes: Net.defaults(weight: weight, departure: departure), choice: nil, actual: nil,
                         baseRate: baseRate, feeRate: feeRate, directCost: directCost)
        do {
            try store.save(s)
            dismiss()
        } catch let e { error = e.localizedDescription }
    }
}

// MARK: - 시연 안내

struct GuideView: View {
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            List {
                Text("선적 전 지정 업체와 인수 조건을 합의하고, 육상 검수 완료 후 비용을 정산하는 절차임.")
                Section("시연 순서") {
                    Text("1. 새 반출 등록에서 집하 정보·사전 점검 입력")
                    Text("2. 동일 업체의 처리 조건 2안 비교 후 1안 확정")
                    Text("3. 실제 인수량·증빙·업체 확인자 입력 후 고객 절감액과 팀 공헌이익 확인")
                }
                Text("모든 일정·금액은 가상값임. 기록은 이 기기에 저장됨. 시연 기준일 2026. 11. 27.\n대천항 사진 · Yu Nam-hae, 2013 · 공공누리 제1유형")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            .navigationTitle("시연 안내")
            .toolbar { Button("닫기") { dismiss() } }
        }
    }
}
