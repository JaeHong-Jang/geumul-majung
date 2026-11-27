import SwiftUI

@main
struct GeumulMajungApp: App {
    @State private var store = Store()
    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .tint(.ocean)
        }
    }
}

@Observable
final class Store {
    private static let key = "geumulmajung.v1"
    var items: [Shipment]
    var storageWarning = false

    init() {
        if let data = UserDefaults.standard.data(forKey: Self.key) {
            if let saved = try? JSONDecoder().decode([Shipment].self, from: data) {
                items = saved
                return
            }
            storageWarning = true
        }
        items = Net.seed()
    }

    func item(_ id: String) -> Shipment? { items.first { $0.id == id } }

    func save(_ s: Shipment) throws {
        try Net.verify(s)
        if let i = items.firstIndex(where: { $0.id == s.id }) { items[i] = s } else { items.insert(s, at: 0) }
        persist()
    }

    func reset() {
        items = Net.seed()
        storageWarning = false
        persist()
    }

    private func persist() {
        UserDefaults.standard.set(try? JSONEncoder().encode(items), forKey: Self.key)
    }
}

extension Color {
    static let ocean = Color(red: 10 / 255, green: 110 / 255, blue: 189 / 255)
    static let sea = Color(red: 24 / 255, green: 180 / 255, blue: 204 / 255)
    static let sand = Color(red: 217 / 255, green: 138 / 255, blue: 18 / 255)
}

extension Status {
    var color: Color {
        switch self {
        case .registered: .sand
        case .confirmed: .sea
        case .settled: .gray
        }
    }
}

enum Fmt {
    static func won(_ v: Int) -> String { v.formatted(.number.locale(Locale(identifier: "ko_KR"))) + "원" }
    static func man(_ v: Int) -> String {
        let sign = v > 0 ? "+" : v < 0 ? "−" : ""
        return sign + (Double(abs(v)) / 10_000).formatted(.number.precision(.fractionLength(0 ... 1))) + "만 원"
    }
    static func tons(_ v: Double) -> String { v.formatted(.number.precision(.fractionLength(0 ... 3))) + "톤" }
    static func when(_ d: Date) -> String {
        var s = Date.FormatStyle(date: .abbreviated, time: .shortened).locale(Locale(identifier: "ko_KR"))
        s.timeZone = Net.calendar.timeZone
        return d.formatted(s)
    }
    static func day(_ d: Date) -> String {
        var s = Date.FormatStyle().month(.defaultDigits).day().locale(Locale(identifier: "ko_KR"))
        s.timeZone = Net.calendar.timeZone
        return d.formatted(s)
    }
}
