import 'dart:async';

import 'package:flutter/foundation.dart';

import '../api/api_client.dart';

/// 디자인의 대괄호 값(`[가격]`, `[무게]` 등)은 실제 데이터가 연결되기 전의 자리 표시자다.
enum Grade { a, b, c }

enum Category {
  all('전체'),
  metal('폐금속'),
  plastic('폐합성수지'),
  paper('폐지');

  const Category(this.label);
  final String label;
}

String money(num value) => value
    .round()
    .toString()
    .replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');

Grade gradeOf(Object? value) => switch (value) {
      'A' => Grade.a,
      'B' => Grade.b,
      _ => Grade.c,
    };

String materialName(Map<String, Object?> json) {
  final target = json['target_material'] as String?;
  final waste = (json['waste_name'] as String?) ?? '';
  final short = waste.split('(').first;
  return target == null ? short : '${target.toUpperCase()} · $short';
}

class Listing {
  const Listing(
    this.name,
    this.region,
    this.grade,
    this.category, {
    this.id,
    this.totalKg,
    this.price,
    this.bagCount,
    this.factoryName,
  });

  /// `GET /v1/listings` 항목.
  factory Listing.fromJson(Map<String, Object?> json) {
    final code = (json['waste_code'] as String?) ?? '';
    return Listing(
      materialName(json),
      (json['region'] as String?) ?? '지역 미입력',
      gradeOf(json['grade']),
      code.startsWith('51-03')
          ? Category.plastic
          : code.startsWith('51-29')
              ? Category.metal
              : code.startsWith('51-28')
                  ? Category.paper
                  : Category.all,
      id: json['id'] as int?,
      totalKg: (json['total_kg'] as num?)?.toDouble(),
      price: (json['price_krw_per_kg'] as num?)?.toDouble(),
      bagCount: json['bag_count'] as int?,
      factoryName: json['factory_name'] as String?,
    );
  }

  final String name;
  final String region;
  final Grade grade;
  final Category category;

  /// 아래 값은 서버 매물에만 있다. 시연 매물은 자리 표시자를 보여 준다.
  final int? id;
  final double? totalKg;
  final double? price;
  final int? bagCount;
  final String? factoryName;

  bool get isLive => id != null;
  String get weightLabel => totalKg == null ? '[무게]' : money(totalKg!);
  String get sellerLabel => factoryName ?? '[회사명]';

  @override
  bool operator ==(Object other) =>
      other is Listing &&
      (isLive ? other.id == id : identical(this, other));

  @override
  int get hashCode => isLive ? id.hashCode : Object.hash(name, region);
}

const aluminum = Listing('알루미늄 스크랩·칩', '대전 대덕구', Grade.a, Category.metal);
const copper = Listing('구리 스크랩', '청주 흥덕구', Grade.b, Category.metal);
const ppScrap = Listing('PP 사출 불량품', '대전 유성구', Grade.b, Category.plastic);
const cardboard = Listing('골판지', '세종', Grade.a, Category.paper);
const peFilm = Listing('PE 포장 필름', '대전 대덕구', Grade.c, Category.plastic);
const officePaper = Listing('사무용지', '세종', Grade.a, Category.paper);

const homeListings = [aluminum, ppScrap, cardboard, copper, peFilm];
const exploreListings = [
  aluminum,
  copper,
  ppScrap,
  cardboard,
  peFilm,
  officePaper,
];

extension ListingFilter on List<Listing> {
  List<Listing> inCategory(Category category) => category == Category.all
      ? this
      : where((listing) => listing.category == category).toList();
}

/// 앱 실행 중에만 유지되는 장바구니. 서버 연결 전 화면 동작용이다.
class Cart extends ChangeNotifier {
  final List<Listing> _items = [aluminum, peFilm, copper];
  final Set<Listing> _selected = {aluminum, peFilm, copper};

  List<Listing> get items => List.unmodifiable(_items);
  List<Listing> get selectedItems =>
      _items.where(_selected.contains).toList();

  /// 로그인하면 시연 항목을 비우고 빈 장바구니로 시작한다.
  void clear() {
    _items.clear();
    _selected.clear();
    notifyListeners();
  }
  int get count => _items.length;
  int get selectedCount => _selected.length;
  bool get allSelected => _items.isNotEmpty && _selected.length == _items.length;
  bool isSelected(Listing item) => _selected.contains(item);

  /// 같은 지역 매물이 2건 이상이면 운송 묶음을 제안할 수 있다.
  int get daedeokCount =>
      _items.where((item) => item.region == '대전 대덕구').length;

  /// 새로 담았으면 true, 이미 담겨 있으면 false.
  bool add(Listing item) {
    if (_items.contains(item)) return false;
    _items.add(item);
    _selected.add(item);
    notifyListeners();
    return true;
  }

  void remove(Listing item) {
    _items.remove(item);
    _selected.remove(item);
    notifyListeners();
  }

  void toggle(Listing item) {
    if (!_selected.remove(item)) _selected.add(item);
    notifyListeners();
  }

  void toggleAll() {
    if (allSelected) {
      _selected.clear();
    } else {
      _selected.addAll(_items);
    }
    notifyListeners();
  }

  void removeSelected() {
    _items.removeWhere(_selected.contains);
    _selected.clear();
    notifyListeners();
  }
}

final cart = Cart();

/// 구매자 앱이 서버에서 받아 두는 매물·주문. 5초마다 새로 받는다.
class LiveData extends ChangeNotifier {
  List<Listing> listings = const [];
  List<Map<String, Object?>> orders = const [];
  Timer? _timer;

  void start() {
    refresh();
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 5), (_) => refresh());
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
    listings = const [];
    orders = const [];
  }

  Future<void> refresh() async {
    if (!api.loggedIn) return;
    try {
      final found = await api.get('/v1/listings') as List<Object?>;
      final mine = await api.get('/v1/me/orders') as List<Object?>;
      if (!api.loggedIn) return;
      listings = [
        for (final row in found) Listing.fromJson(row! as Map<String, Object?>),
      ];
      orders = mine.cast<Map<String, Object?>>();
      notifyListeners();
    } on ApiException {
      // 잠깐 끊긴 경우 다음 주기에 다시 받는다.
    }
  }
}

final live = LiveData();

/// 하단 탭 번호. 다른 화면에서 탭을 바꿀 때도 쓴다.
abstract final class AppTab {
  static const home = 0;
  static const explore = 1;
  static const cart = 2;
  static const history = 3;
  static const my = 4;
}

final currentTab = ValueNotifier<int>(AppTab.home);
