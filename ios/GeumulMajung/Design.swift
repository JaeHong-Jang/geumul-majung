import Charts
import SwiftUI

// MARK: - 토큰·기본 조각

extension Color {
    static let ink = Color(red: 13 / 255, green: 42 / 255, blue: 54 / 255)
    static let deep = Color(red: 7 / 255, green: 84 / 255, blue: 143 / 255)
    static let foam = Color(red: 231 / 255, green: 242 / 255, blue: 250 / 255)
}

extension Status {
    var icon: String {
        switch self {
        case .registered: "doc.text.magnifyingglass"
        case .confirmed: "ferry.fill"
        case .settled: "checkmark.seal.fill"
        }
    }
}

let oceanGradient = LinearGradient(colors: [.ocean, .sea], startPoint: .topLeading, endPoint: .bottomTrailing)

struct AppBackground: View {
    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(red: 0.91, green: 0.96, blue: 0.98), Color(red: 0.97, green: 0.98, blue: 0.99)],
                           startPoint: .top, endPoint: .bottom)
            Circle().fill(Color.sea.opacity(0.18)).frame(width: 320).blur(radius: 70).offset(x: 150, y: -330)
            Circle().fill(Color.ocean.opacity(0.12)).frame(width: 280).blur(radius: 80).offset(x: -160, y: -160)
        }
        .ignoresSafeArea()
    }
}

struct Card<Content: View>: View {
    var padding: CGFloat = 18
    @ViewBuilder var content: Content
    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.white, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .shadow(color: Color.ink.opacity(0.07), radius: 16, y: 8)
    }
}

struct SectionTitle: View {
    let title: String
    var sub: String?
    var trailing: String?
    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.title3.bold()).foregroundStyle(Color.ink)
                if let sub { Text(sub).font(.caption).foregroundStyle(.secondary) }
            }
            Spacer()
            if let trailing {
                Text(trailing).font(.caption.bold()).foregroundStyle(Color.ocean)
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(Color.foam, in: Capsule())
            }
        }
    }
}

extension View {
    func cardRow() -> some View {
        listRowSeparator(.hidden)
            .listRowBackground(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(.white)
                .shadow(color: Color.ink.opacity(0.05), radius: 10, y: 4))
    }
}

struct StatusBadge: View {
    let status: Status
    var body: some View {
        HStack(spacing: 5) {
            Circle().fill(status.color).frame(width: 7)
            Text(status.name)
        }
        .font(.caption.bold())
        .foregroundStyle(status.color)
        .padding(.horizontal, 9).padding(.vertical, 4)
        .background(status.color.opacity(0.13), in: Capsule())
    }
}

struct StatusIcon: View {
    let status: Status
    var size: CGFloat = 46
    var body: some View {
        RoundedRectangle(cornerRadius: size * 0.32, style: .continuous)
            .fill(LinearGradient(colors: [status.color.opacity(0.75), status.color], startPoint: .topLeading, endPoint: .bottomTrailing))
            .frame(width: size, height: size)
            .overlay(Image(systemName: status.icon).font(.system(size: size * 0.42, weight: .semibold)).foregroundStyle(.white))
            .shadow(color: status.color.opacity(0.35), radius: 6, y: 3)
    }
}

struct ShipmentRow: View {
    let s: Shipment
    var body: some View {
        HStack(spacing: 14) {
            StatusIcon(status: s.status)
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(s.id).font(.headline.monospacedDigit()).foregroundStyle(Color.ink)
                    Spacer()
                    StatusBadge(status: s.status)
                }
                Text("\(s.kind) · \(s.material) · \(s.bags)마대").font(.subheadline).foregroundStyle(.secondary)
                HStack(spacing: 6) {
                    Label(Fmt.when(s.departure), systemImage: "calendar").font(.caption).foregroundStyle(.secondary)
                    Spacer()
                    Text(Fmt.tons(s.weight)).font(.subheadline.bold()).foregroundStyle(Color.ocean)
                }
            }
        }
        .padding(.vertical, 6)
    }
}

struct SettlementRow: View {
    let s: Shipment
    var body: some View {
        let t = Net.totals(s)
        HStack(spacing: 14) {
            ZStack {
                Ring(pct: (t?.ratio ?? 0) / 100, color: .ocean, width: 6)
                Text("\(Int((t?.ratio ?? 0).rounded()))%").font(.caption2.bold()).foregroundStyle(Color.ocean)
            }
            .frame(width: 50, height: 50)
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(s.id).font(.headline.monospacedDigit()).foregroundStyle(Color.ink)
                    Spacer()
                    Text(Fmt.day(s.departure)).font(.caption).foregroundStyle(.secondary)
                }
                Text("\(s.kind) · 인수 \(Fmt.tons(s.actual?.accepted ?? 0)) / 계량 \(Fmt.tons(s.actual?.total ?? 0))")
                    .font(.subheadline).foregroundStyle(.secondary)
                HStack(spacing: 6) {
                    Pill(text: "고객 \(Fmt.man(t?.savings ?? 0))", good: (t?.savings ?? 0) >= 0)
                    Pill(text: "팀 \(Fmt.man(t?.margin ?? 0))", good: (t?.margin ?? 0) >= 0)
                }
            }
        }
        .padding(.vertical, 6)
    }
}

struct Pill: View {
    let text: String
    var good = true
    var body: some View {
        Text(text).font(.caption.bold())
            .foregroundStyle(good ? Color.ocean : .red)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background((good ? Color.foam : Color.red.opacity(0.1)), in: Capsule())
    }
}

struct Ring: View {
    let pct: Double
    let color: Color
    var width: CGFloat = 10
    @State private var shown = 0.0
    var body: some View {
        ZStack {
            Circle().stroke(color.opacity(0.13), lineWidth: width)
            Circle().trim(from: 0, to: shown)
                .stroke(AngularGradient(colors: [color.opacity(0.55), color], center: .center),
                        style: StrokeStyle(lineWidth: width, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
        .onAppear { withAnimation(.spring(duration: 1.3).delay(0.15)) { shown = pct } }
        .onChange(of: pct) { _, v in withAnimation(.spring) { shown = v } }
    }
}

// MARK: - 상세 헤더

struct DetailHeader: View {
    let s: Shipment
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(s.id).font(.subheadline.monospacedDigit()).opacity(0.85)
                    Text("\(s.kind) · \(s.material)").font(.title2.bold())
                }
                Spacer()
                Image(systemName: s.status.icon).font(.title2)
                    .frame(width: 48, height: 48)
                    .background(.white.opacity(0.18), in: Circle())
            }
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(s.weight.formatted(.number.precision(.fractionLength(0 ... 3))))
                    .font(.system(size: 46, weight: .bold, design: .rounded))
                Text("톤 · \(s.bags)마대").font(.headline).opacity(0.85)
                Spacer()
                Text(s.status.name).font(.caption.bold())
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(.white.opacity(0.2), in: Capsule())
            }
            Track(s: s)
        }
        .foregroundStyle(.white)
        .padding(20)
        .background {
            ZStack {
                oceanGradient
                Circle().fill(.white.opacity(0.08)).frame(width: 220).offset(x: 140, y: -80)
                Image(systemName: "water.waves").font(.system(size: 120)).foregroundStyle(.white.opacity(0.06))
                    .offset(x: 110, y: 50)
            }
            .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        }
        .shadow(color: Color.ocean.opacity(0.3), radius: 16, y: 8)
    }
}

// 처리 이력 (어망내망 수거·계량 이력 · 클리어비드 진행 현황 참고)
struct Track: View {
    let s: Shipment
    var body: some View {
        let steps = [("등록", true),
                     ("조건 확정", s.status != .registered),
                     ("출항·하선", s.status != .registered && Net.sailed(s)),
                     ("정산", s.status == .settled)]
        let done = steps.filter(\.1).count
        ZStack(alignment: .top) {
            GeometryReader { g in
                let a = g.size.width / 8, span = g.size.width * 0.75
                Capsule().fill(.white.opacity(0.25)).frame(width: span, height: 2).offset(x: a, y: 12)
                Capsule().fill(.white).frame(width: span * Double(done - 1) / 3, height: 2).offset(x: a, y: 12)
            }
            HStack(spacing: 0) {
                ForEach(Array(steps.enumerated()), id: \.offset) { i, step in
                    VStack(spacing: 6) {
                        ZStack {
                            Circle().fill(step.1 ? AnyShapeStyle(.white) : AnyShapeStyle(Color.deep)).frame(width: 26)
                                .overlay(Circle().stroke(.white.opacity(0.5)))
                            if step.1 {
                                Image(systemName: "checkmark").font(.caption.bold()).foregroundStyle(Color.ocean)
                            } else {
                                Text("\(i + 1)").font(.caption.bold())
                            }
                        }
                        Text(step.0).font(.caption2.bold()).opacity(step.1 ? 1 : 0.7)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
        }
        .frame(height: 48)
    }
}

// MARK: - 메뉴

struct AppMenu: View {
    @Environment(Store.self) private var store
    @State private var guide = false
    var body: some View {
        Menu {
            Button("시연 안내", systemImage: "questionmark.circle") { guide = true }
            Button("시연 데이터 초기화", systemImage: "arrow.counterclockwise", role: .destructive) { store.reset() }
        } label: { Image(systemName: "ellipsis.circle") }
            .sheet(isPresented: $guide) { GuideView() }
    }
}

struct NewButton: View {
    @State private var open = false
    var body: some View {
        Button("새 반출 등록", systemImage: "plus") { open = true }
            .sheet(isPresented: $open) { CreateView() }
    }
}

// MARK: - 운영 현황

struct DashboardView: View {
    @Environment(Store.self) private var store
    let goList: (Status?) -> Void

    var body: some View {
        let rows = store.items
        let settled = rows.filter { $0.status == .settled }
        let active = rows.filter { $0.status != .settled }
        let total = settled.reduce(0) { $0 + ($1.actual?.total ?? 0) }
        let accepted = settled.reduce(0) { $0 + ($1.actual?.accepted ?? 0) }
        let ratio = total > 0 ? accepted / total : 0
        let savings = settled.compactMap(Net.totals).reduce(0) { $0 + $1.savings }
        let next = active.sorted { $0.departure < $1.departure }.first { Net.day($0.departure) >= Net.demoDate }
        let atSea = rows.filter { $0.status == .confirmed && Net.day($0.departure) == Net.demoDate }.count
        let count = { (st: Status) in rows.filter { $0.status == st }.count }

        ScrollView {
            VStack(spacing: 18) {
                if store.storageWarning {
                    Label("저장 기록 일부 판독 불가 · 시연 데이터로 표시함", systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote.bold()).foregroundStyle(.orange)
                }
                if let next {
                    NavigationLink(value: next.id) { HeroCard(s: next) }.buttonStyle(.plain)
                }
                RouteStrip(island: rows.count - atSea - settled.count, sea: atSea, plant: settled.count)

                LazyVGrid(columns: [GridItem(.flexible(), spacing: 14), GridItem(.flexible(), spacing: 14)], spacing: 14) {
                    KpiTile(icon: "shippingbox.fill", title: "전체 반출", value: Double(rows.count), digits: 0, unit: "건") {
                        GeometryReader { g in
                            HStack(spacing: 3) {
                                ForEach(Status.allCases, id: \.self) { st in
                                    Capsule().fill(st.color.gradient)
                                        .frame(width: max(0, g.size.width * Double(count(st)) / Double(max(rows.count, 1)) - 3))
                                }
                            }
                        }
                        .frame(height: 8)
                    }
                    KpiTile(icon: "scalemass.fill", title: "반출 예정 중량", value: active.reduce(0) { $0 + $1.weight }, digits: 1, unit: "톤") {
                        Chart(Array(active.sorted { $0.departure < $1.departure }.enumerated()), id: \.offset) { i, s in
                            AreaMark(x: .value("순서", i), y: .value("톤", s.weight))
                                .foregroundStyle(LinearGradient(colors: [Color.ocean.opacity(0.3), .clear], startPoint: .top, endPoint: .bottom))
                                .interpolationMethod(.catmullRom)
                            LineMark(x: .value("순서", i), y: .value("톤", s.weight))
                                .foregroundStyle(Color.ocean).interpolationMethod(.catmullRom)
                        }
                        .chartXAxis(.hidden).chartYAxis(.hidden)
                        .frame(height: 30)
                    }
                    KpiTile(icon: "arrow.down.to.line.compact", title: "누적 인수 중량", value: accepted, digits: 1, unit: "톤") {
                        HStack(alignment: .bottom, spacing: 5) {
                            ForEach(settled) { s in
                                Capsule().fill(Color.ocean.gradient).frame(width: 7, height: 30 * (s.actual?.accepted ?? 0) / 6)
                                Capsule().fill(Color.secondary.opacity(0.2)).frame(width: 7, height: 30 * (s.actual?.total ?? 0) / 6)
                            }
                        }
                        .frame(height: 30, alignment: .bottom)
                    }
                    Card(padding: 16) {
                        VStack(alignment: .leading, spacing: 8) {
                            TileHead(icon: "percent", title: "누적 인수율")
                            ZStack {
                                Ring(pct: ratio, color: .ocean, width: 9)
                                Text(total > 0 ? (ratio * 100).formatted(.number.precision(.fractionLength(1))) : "—")
                                    .font(.system(.title3, design: .rounded, weight: .bold)).foregroundStyle(Color.ink)
                            }
                            .frame(width: 74, height: 74)
                            .frame(maxWidth: .infinity)
                        }
                        .frame(minHeight: 128, alignment: .topLeading)
                    }
                }

                Card {
                    VStack(alignment: .leading, spacing: 16) {
                        SectionTitle(title: "인수 구성", sub: "정산 완료 반출의 실계량 기준")
                        HStack(spacing: 22) {
                            ZStack {
                                Ring(pct: ratio, color: .ocean, width: 13).frame(width: 132, height: 132)
                                Ring(pct: total > 0 ? 1 - ratio : 0, color: .sand, width: 11).frame(width: 96, height: 96)
                                Ring(pct: Double(settled.count) / Double(max(rows.count, 1)), color: .sea, width: 9).frame(width: 64, height: 64)
                                Text("\(Int((ratio * 100).rounded()))%").font(.system(.headline, design: .rounded, weight: .bold))
                            }
                            VStack(alignment: .leading, spacing: 12) {
                                Legend(color: .ocean, title: "인수 중량", value: Fmt.tons(accepted))
                                Legend(color: .sand, title: "잔재 중량", value: Fmt.tons(((total - accepted) * 1000).rounded() / 1000))
                                Legend(color: .sea, title: "정산 완료", value: "\(settled.count)/\(rows.count)건")
                            }
                        }
                    }
                }

                Card {
                    VStack(alignment: .leading, spacing: 14) {
                        SectionTitle(title: "반출별 중량", sub: "출항일 순 · 오늘 출항 강조", trailing: "최대 6톤")
                        Chart(rows.sorted { $0.departure < $1.departure }) { s in
                            let today = Net.day(s.departure) == Net.demoDate
                            BarMark(x: .value("반출", String(s.id.suffix(3))), y: .value("중량", s.weight), width: .ratio(0.55))
                                .foregroundStyle(today ? AnyShapeStyle(oceanGradient)
                                    : AnyShapeStyle(LinearGradient(colors: [Color(red: 0.72, green: 0.8, blue: 0.85), Color(red: 0.85, green: 0.9, blue: 0.93)], startPoint: .top, endPoint: .bottom)))
                                .cornerRadius(8)
                                .annotation(position: .top) {
                                    Text(Fmt.tons(s.weight)).font(.caption2.bold()).foregroundStyle(today ? Color.ocean : .secondary)
                                }
                        }
                        .chartYScale(domain: 0 ... 6.5)
                        .chartYAxis(.hidden)
                        .frame(height: 180)
                    }
                }

                VStack(alignment: .leading, spacing: 12) {
                    SectionTitle(title: "처리할 업무")
                    HStack(spacing: 14) {
                        TodoTile(title: "인수 조건 협의", sub: "업체 조건 2안 비교", n: count(.registered), of: active.count, color: .sand, icon: "doc.text.magnifyingglass") { goList(.registered) }
                        TodoTile(title: "검수·정산 입력", sub: "하선 후 실계량·증빙", n: count(.confirmed), of: active.count, color: .sea, icon: "scalemass.fill") { goList(.confirmed) }
                    }
                }

                // 누적 성과 (서천서부수협 회수량·절감액 보고 방식 참고)
                Card {
                    VStack(alignment: .leading, spacing: 12) {
                        SectionTitle(title: "최근 정산", trailing: "누적 고객 절감 \(Fmt.man(savings))")
                        ForEach(settled) { s in
                            NavigationLink(value: s.id) {
                                HStack {
                                    SettlementRow(s: s)
                                    Image(systemName: "chevron.right").font(.caption.bold()).foregroundStyle(.tertiary)
                                }
                            }
                            .buttonStyle(.plain)
                            if s.id != settled.last?.id { Divider() }
                        }
                    }
                }
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 30)
        }
        .background(AppBackground())
        .navigationTitle("반출 운영 현황")
        .navigationDestination(for: String.self) { DetailView(id: $0) }
        .toolbar {
            ToolbarItem(placement: .topBarLeading) { AppMenu() }
            ToolbarItem(placement: .topBarTrailing) { NewButton() }
        }
    }
}

struct HeroCard: View {
    let s: Shipment
    var body: some View {
        let q = s.quotes[s.choice ?? 1]
        let t = try? Net.calculate(s, q, total: s.weight, accepted: q.expected)
        ZStack(alignment: .bottomLeading) {
            Group {
                if let img = UIImage(named: "daecheon.jpg") {
                    Image(uiImage: img).resizable().scaledToFill()
                } else { oceanGradient }
            }
            .frame(height: 250).frame(maxWidth: .infinity).clipped()
            LinearGradient(colors: [.clear, Color.deep.opacity(0.55), Color.deep.opacity(0.95)], startPoint: .top, endPoint: .bottom)
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Label("충남 보령 · 삽시도", systemImage: "mappin.and.ellipse")
                        .font(.caption.bold())
                        .padding(.horizontal, 10).padding(.vertical, 6)
                        .background(.ultraThinMaterial, in: Capsule())
                    Spacer()
                    Text(Net.day(s.departure) == Net.demoDate ? "오늘 출항" : "출항 예정")
                        .font(.caption.bold())
                        .padding(.horizontal, 10).padding(.vertical, 6)
                        .background(Color.sea, in: Capsule())
                }
                Spacer()
                Text("다음 반출 · \(s.id)").font(.subheadline.weight(.semibold)).opacity(0.85)
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(s.weight.formatted(.number.precision(.fractionLength(0 ... 3))))
                        .font(.system(size: 52, weight: .bold, design: .rounded))
                    Text("톤").font(.title3.bold())
                    Spacer()
                    if let t {
                        VStack(alignment: .trailing, spacing: 2) {
                            Text("예상 고객 절감").font(.caption2).opacity(0.8)
                            Text(Fmt.man(t.savings)).font(.headline)
                        }
                    }
                }
                HStack {
                    Label(Fmt.when(s.departure), systemImage: "clock")
                    Spacer()
                    HStack(spacing: 4) {
                        Text(s.status == .registered ? "인수 조건 비교" : "검수·정산 입력")
                        Image(systemName: "arrow.right")
                    }
                    .font(.subheadline.bold())
                    .foregroundStyle(Color.ocean)
                    .padding(.horizontal, 14).padding(.vertical, 9)
                    .background(.white, in: Capsule())
                }
                .font(.footnote)
            }
            .foregroundStyle(.white)
            .padding(18)
        }
        .frame(height: 250)
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .shadow(color: Color.deep.opacity(0.3), radius: 18, y: 10)
    }
}

struct RouteStrip: View {
    let island: Int, sea: Int, plant: Int
    @State private var go = false
    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 14) {
                SectionTitle(title: "반출 경로", sub: "개념도 · 단계별 반출 건수")
                ZStack(alignment: .top) {
                    GeometryReader { g in
                        Path { p in
                            p.move(to: CGPoint(x: 30, y: 26))
                            p.addQuadCurve(to: CGPoint(x: g.size.width - 30, y: 26), control: CGPoint(x: g.size.width / 2, y: 46))
                        }
                        .stroke(Color.ocean.opacity(0.45), style: StrokeStyle(lineWidth: 2.5, lineCap: .round, dash: [3, 7], dashPhase: go ? -30 : 0))
                        Image(systemName: "ferry.fill")
                            .font(.footnote)
                            .foregroundStyle(Color.ocean)
                            .padding(5)
                            .background(.white, in: Circle())
                            .shadow(color: Color.ocean.opacity(0.3), radius: 4)
                            .position(x: go ? g.size.width * 0.42 : g.size.width * 0.2, y: 37)
                    }
                    HStack {
                        RouteNode(icon: "house.fill", name: "삽시도 집하장", n: island, color: .sand)
                        Spacer()
                        RouteNode(icon: "water.waves", name: "해상 운반", n: sea, color: .sea)
                        Spacer()
                        RouteNode(icon: "arrow.3.trianglepath", name: "재활용업체", n: plant, color: .ocean)
                    }
                }
                .frame(height: 100)
            }
        }
        .onAppear { withAnimation(.easeInOut(duration: 3.2).repeatForever(autoreverses: true)) { go = true } }
    }
}

struct RouteNode: View {
    let icon: String, name: String, n: Int, color: Color
    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: icon).font(.title3).foregroundStyle(.white)
                .frame(width: 52, height: 52)
                .background(color.gradient, in: Circle())
                .overlay(Circle().stroke(.white, lineWidth: 3))
                .shadow(color: color.opacity(0.4), radius: 8, y: 4)
            Text(name).font(.caption.bold()).foregroundStyle(Color.ink)
            Text("\(n)건").font(.caption2.bold()).foregroundStyle(color)
        }
        .frame(width: 84)
    }
}

struct TileHead: View {
    let icon: String, title: String
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: icon).font(.caption.bold()).foregroundStyle(Color.ocean)
                .frame(width: 24, height: 24).background(Color.foam, in: RoundedRectangle(cornerRadius: 7))
            Text(title).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
        }
    }
}

struct KpiTile<Viz: View>: View {
    let icon: String, title: String, value: Double, digits: Int, unit: String
    @ViewBuilder var viz: Viz
    @State private var shown = 0.0
    var body: some View {
        Card(padding: 16) {
            VStack(alignment: .leading, spacing: 10) {
                TileHead(icon: icon, title: title)
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text(shown.formatted(.number.precision(.fractionLength(digits))))
                        .font(.system(size: 32, weight: .bold, design: .rounded))
                        .foregroundStyle(Color.ink)
                        .contentTransition(.numericText(value: shown))
                    Text(unit).font(.caption.bold()).foregroundStyle(.secondary)
                }
                viz
            }
            .frame(minHeight: 128, alignment: .topLeading)
        }
        .onAppear { withAnimation(.smooth(duration: 1)) { shown = value } }
        .onChange(of: value) { _, v in withAnimation { shown = v } }
    }
}

struct Legend: View {
    let color: Color, title: String, value: String
    var body: some View {
        HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 3).fill(color).frame(width: 10, height: 10)
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.caption).foregroundStyle(.secondary)
                Text(value).font(.subheadline.bold()).foregroundStyle(Color.ink)
            }
        }
    }
}

struct TodoTile: View {
    let title: String, sub: String, n: Int, of: Int, color: Color, icon: String
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Card(padding: 16) {
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Image(systemName: icon).font(.subheadline.bold()).foregroundStyle(.white)
                            .frame(width: 34, height: 34).background(color.gradient, in: RoundedRectangle(cornerRadius: 10))
                        Spacer()
                        Text("\(n)").font(.system(size: 30, weight: .bold, design: .rounded)).foregroundStyle(Color.ink)
                    }
                    Text(title).font(.subheadline.bold()).foregroundStyle(Color.ink)
                    Text(sub).font(.caption).foregroundStyle(.secondary)
                    HStack(spacing: 3) {
                        ForEach(0 ..< max(of, 1), id: \.self) { i in
                            Capsule().fill(i < n ? color : Color.secondary.opacity(0.15)).frame(height: 5)
                        }
                    }
                }
            }
        }
        .buttonStyle(.plain)
    }
}
