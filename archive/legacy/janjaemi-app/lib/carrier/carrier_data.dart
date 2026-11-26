import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:latlong2/latlong.dart';

import '../api/api_client.dart';

enum CarrierTab { home, orders, trip, earn, my }

enum SortKey {
  fare('운임순'),
  near('가까운순'),
  per('km당 운임');

  const SortKey(this.label);
  final String label;
}

enum Region {
  all('전체'),
  local('구미·칠곡권'),
  far('다른 지역');

  const Region(this.label);
  final String label;
}

LatLng _point(Object? raw) {
  final pair = raw! as List<Object?>;
  return LatLng((pair[0]! as num).toDouble(), (pair[1]! as num).toDouble());
}

List<LatLng> _points(Object? raw) =>
    (raw! as List<Object?>).map(_point).toList();

LatLng _latLon(Object? raw) {
  final map = raw! as Map<String, Object?>;
  return LatLng((map['lat']! as num).toDouble(), (map['lon']! as num).toDouble());
}

double _kmBetween(LatLng a, LatLng b) =>
    const Distance().as(LengthUnit.Meter, a, b) / 1000;

/// 직선거리로 어림한 소요 시간(시속 40km). 실제 경로 계산은 아직 없다.
int _minutes(double km) => (km / 40 * 60).round();

class CarrierOrder {
  /// `GET /v1/calls` 항목. 서버에 없는 값은 협의로 표시한다.
  factory CarrierOrder.fromCall(Map<String, Object?> json, LatLng depot) {
    final pickup = _latLon(json['pickup']);
    final dropoff = _latLon(json['dropoff']);
    final km = (json['distance_km']! as num).toDouble();
    final emptyKm = _kmBetween(depot, pickup);
    final fare = json['freight_cap_krw']! as int;
    return CarrierOrder._live(
      id: json['order_id']! as int,
      from: json['pickup_name']! as String,
      to: json['dropoff_name']! as String,
      stops: [pickup, dropoff],
      fare: fare,
      item: ((json['waste_name'] as String?) ?? '').split('(').first,
      bags: json['bag_count']! as int,
      ton: (json['total_kg']! as num) / 1000,
      grade: (json['grade'] as String?) ?? '-',
      cond: (json['pickup_region'] as String?) ?? '지역 미입력',
      dropNote: '${(json['dropoff_region'] as String?) ?? '지역 미입력'} · 하차 시간 협의',
      km: km,
      emptyKm: emptyKm,
      emptyLine: [depot, pickup],
      perKm: (fare / math.max(km + emptyKm, 0.1)).round(),
    );
  }

  CarrierOrder._live({
    required this.id,
    required this.from,
    required this.to,
    required this.stops,
    required this.fare,
    required this.item,
    required this.bags,
    required this.ton,
    required this.grade,
    required this.cond,
    required this.dropNote,
    required this.km,
    required this.emptyKm,
    required this.emptyLine,
    required this.perKm,
  })  : live = true,
        via = null,
        viaNote = null,
        dropLabel = null,
        shipper = from,
        consignee = to,
        base = fare,
        premium = 0,
        wait = 0,
        when = '시간 협의',
        tags = const ['운임 상한'],
        pay = '입고 검사 후 정산',
        rating = 0,
        window = '상차 시간 협의',
        min = _minutes(km),
        line = stops,
        emptyMin = _minutes(emptyKm);

  CarrierOrder.fromJson(Map<String, Object?> json)
      : live = false,
        id = json['id']! as int,
        from = json['from']! as String,
        to = json['to']! as String,
        via = json['via'] as String?,
        viaNote = json['viaNote'] as String?,
        dropLabel = json['dropLabel'] as String?,
        shipper = json['shipper']! as String,
        consignee = json['consignee']! as String,
        stops = _points(json['stops']),
        fare = json['fare']! as int,
        base = json['base']! as int,
        premium = json['premium']! as int,
        wait = json['wait']! as int,
        item = json['item']! as String,
        bags = json['bags']! as int,
        ton = (json['ton']! as num).toDouble(),
        when = json['when']! as String,
        grade = json['grade']! as String,
        tags = (json['tags']! as List<Object?>).cast<String>(),
        pay = json['pay']! as String,
        rating = (json['rating']! as num).toDouble(),
        cond = json['cond']! as String,
        window = json['window']! as String,
        dropNote = json['dropNote']! as String,
        km = (json['km']! as num).toDouble(),
        min = json['min']! as int,
        line = _points(json['line']),
        emptyKm = (json['emptyKm']! as num).toDouble(),
        emptyMin = json['emptyMin']! as int,
        emptyLine = _points(json['emptyLine']),
        perKm = json['perKm']! as int;

  /// 서버에서 받은 콜이면 true, 앱에 넣어 둔 시연 콜이면 false.
  final bool live;
  final int id;
  final String from;
  final String to;
  final String? via;
  final String? viaNote;
  final String? dropLabel;
  final String shipper;
  final String consignee;
  final List<LatLng> stops;
  final int fare;
  final int base;
  final int premium;
  final int wait;
  final String item;
  final int bags;
  final double ton;
  final String when;
  final String grade;
  final List<String> tags;
  final String pay;
  final double rating;
  final String cond;
  final String window;
  final String dropNote;
  final double km;
  final int min;
  final List<LatLng> line;
  final double emptyKm;
  final int emptyMin;
  final List<LatLng> emptyLine;
  final int perKm;

  String get title => '$from → $to';
  String get callType => tags.first;
}

class CarrierFilters {
  const CarrierFilters({
    this.fit = true,
    this.types = const {},
    this.region = Region.all,
    this.maxEmptyKm,
    this.minPerKm,
    this.savedOnly = false,
  });

  /// 적재량 5톤 이하만.
  final bool fit;
  final Set<String> types;
  final Region region;
  final int? maxEmptyKm;
  final int? minPerKm;
  final bool savedOnly;

  int get activeCount => [
        !fit,
        types.isNotEmpty,
        region != Region.all,
        maxEmptyKm != null,
        minPerKm != null,
        savedOnly,
      ].where((active) => active).length;

  /// null로 되돌릴 수 있도록 상한·하한은 함수로 받는다.
  CarrierFilters copyWith({
    bool? fit,
    Set<String>? types,
    Region? region,
    int? Function()? maxEmptyKm,
    int? Function()? minPerKm,
    bool? savedOnly,
  }) =>
      CarrierFilters(
        fit: fit ?? this.fit,
        types: types ?? this.types,
        region: region ?? this.region,
        maxEmptyKm: maxEmptyKm == null ? this.maxEmptyKm : maxEmptyKm(),
        minPerKm: minPerKm == null ? this.minPerKm : minPerKm(),
        savedOnly: savedOnly ?? this.savedOnly,
      );
}

class Ledger {
  const Ledger(this.date, this.name, this.value, this.status, this.bundle);
  final String date;
  final String name;
  final int value;
  final String status;
  final bool bundle;
}

const ledger = [
  Ledger('11.03 (화)', '구미 공단 → 칠곡 약목', 97000, '정산 예정', false),
  Ledger('11.03 (화)', '구미 구포 → 칠곡 가산', 87000, '정산 예정', true),
  Ledger('11.02 (월)', '구미 임수 → 구미 고아', 58000, '정산 예정', false),
  Ledger('10.31 (토)', '구미 산동 → 김천 아포', 112000, '정산 예정', false),
  Ledger('10.30 (금)', '구미 시미 → 칠곡 석적', 46000, '정산 완료', false),
  Ledger('10.29 (목)', '구미 공단 → 칠곡 북삼', 124000, '정산 완료', true),
  Ledger('10.28 (수)', '구미 금전 → 칠곡 약목', 88000, '정산 완료', true),
];

/// 최근 7일 수입 합계(수~화).
const weekTotal = 88000 + 124000 + 46000 + 112000 + 0 + 58000 + 184000;
final pendingTotal = ledger
    .where((row) => row.status == '정산 예정')
    .fold<int>(0, (sum, row) => sum + row.value);

const stageNames = ['이동', '상차·검수', '운송', '하차·계량', '완료'];
const acceptSeconds = 45;
const bagsToScan = 18;
const maxFitTon = 5.0;
const depotName = '우리 차고지 · 구미';

/// 내려받지 않고 앱에 넣어 둔 데이터.
class CarrierData {
  const CarrierData({
    required this.depot,
    required this.orders,
    required this.heightM,
    required this.grossT,
    required this.excludedWays,
    required this.south,
    required this.west,
    required this.north,
    required this.east,
    required this.bundledTiles,
    this.live = false,
  });

  /// 서버에 연결된 상태. 콜 목록을 서버에서 받는다.
  final bool live;

  final LatLng depot;
  final List<CarrierOrder> orders;
  final num heightM;
  final num grossT;
  final int excludedWays;
  final double south;
  final double west;
  final double north;
  final double east;

  /// 앱에 포함된 지도 타일 경로.
  final Set<String> bundledTiles;

  bool inGraph(LatLng point) =>
      point.latitude >= south &&
      point.latitude <= north &&
      point.longitude >= west &&
      point.longitude <= east;

  bool isLocal(CarrierOrder order) => order.stops.every(inGraph);

  List<String> get callTypes =>
      orders.map((order) => order.callType).toSet().toList();

  static Future<CarrierData> load() async {
    final raw = await rootBundle.loadString('assets/carrier/orders.json');
    final json = jsonDecode(raw) as Map<String, Object?>;
    final bounds = json['bounds']! as Map<String, Object?>;
    final vehicle = json['vehicle']! as Map<String, Object?>;
    final manifest = await AssetManifest.loadFromAssetBundle(rootBundle);
    final me = api.loggedIn ? api.company : null;
    final depot = me == null ? _point(json['depot']) : _latLon(me);
    final calls = me == null ? null : await api.get('/v1/calls') as List<Object?>;
    return CarrierData(
      live: calls != null,
      depot: depot,
      orders: calls == null
          ? (json['orders']! as List<Object?>)
              .map((o) => CarrierOrder.fromJson(o! as Map<String, Object?>))
              .toList()
          : calls
              .map((c) => CarrierOrder.fromCall(c! as Map<String, Object?>, depot))
              .toList(),
      heightM: vehicle['heightM']! as num,
      grossT: vehicle['grossT']! as num,
      excludedWays: json['excludedWays']! as int,
      south: (bounds['south']! as num).toDouble(),
      west: (bounds['west']! as num).toDouble(),
      north: (bounds['north']! as num).toDouble(),
      east: (bounds['east']! as num).toDouble(),
      bundledTiles: manifest
          .listAssets()
          .where((path) => path.startsWith('assets/map_tiles/'))
          .toSet(),
    );
  }
}

/// 운송기사 화면 전체 상태. 원본의 appState.ts와 같은 규칙이다.
class CarrierState extends ChangeNotifier {
  CarrierState(this.data, {CarrierTab tab = CarrierTab.home}) : _tab = tab;

  final CarrierData data;

  CarrierTab _tab;
  bool _online = false;
  SortKey _sort = SortKey.fare;
  CarrierFilters _filters = const CarrierFilters();
  String _query = '';
  bool _showMap = false;
  int _tripId = 1;
  int _stage = 1;
  int _scanned = 12;
  final Set<int> _saved = {};
  CarrierOrder? _liveTrip;
  List<Map<String, Object?>> _myOrders = const [];

  bool get live => data.live;

  /// 서버 연결 중인데 맡은 운행이 없으면 false.
  bool get hasTrip => !live || _liveTrip != null;
  int get bagTotal => live ? tripOrder.bags : bagsToScan;
  String get depotLabel => live ? api.companyName : depotName;

  Iterable<Map<String, Object?>> get _settled => _myOrders.where(
        (o) => const {'settled', 'rated'}.contains(o['status']),
      );
  Iterable<Map<String, Object?>> get _running => _myOrders.where(
        (o) => const {'dispatched', 'picked_up', 'arrived'}.contains(o['status']),
      );
  int _haulerPay(Map<String, Object?> o) =>
      (((o['settlement'] as Map?)?['hauler_krw'] ?? o['freight_krw'] ?? 0) as num)
          .round();

  int get settledCount => _settled.length;
  int get runningCount => _running.length;
  int get settledTotal => _settled.fold(0, (sum, o) => sum + _haulerPay(o));
  int get runningTotal => _running.fold(0, (sum, o) => sum + _haulerPay(o));
  List<Ledger> get liveLedger => [
        for (final o in [..._running, ..._settled])
          Ledger(
            ((o['updated_at'] as String?) ?? '').split('T').first,
            ((o['waste_name'] as String?) ?? '').split('(').first,
            _haulerPay(o),
            const {'settled', 'rated'}.contains(o['status'])
                ? '정산 완료'
                : '정산 예정',
            false,
          ),
      ];

  CarrierTab get tab => _tab;
  bool get online => _online;
  SortKey get sort => _sort;
  CarrierFilters get filters => _filters;
  String get query => _query;
  bool get showMap => _showMap;
  int get stage => _stage;
  int get scanned => _scanned;
  CarrierOrder get tripOrder => _liveTrip ?? orderById(_tripId);
  bool isSaved(int id) => _saved.contains(id);

  CarrierOrder orderById(int id) =>
      data.orders.firstWhere((order) => order.id == id);

  /// 현재 조건에 맞는 콜 목록.
  List<CarrierOrder> get list {
    final text = _query.trim();
    final found = data.orders.where((order) {
      if (_filters.fit && order.ton > maxFitTon) return false;
      if (_filters.types.isNotEmpty &&
          !_filters.types.contains(order.callType)) {
        return false;
      }
      if (_filters.region != Region.all &&
          (_filters.region == Region.local) != data.isLocal(order)) {
        return false;
      }
      final maxEmpty = _filters.maxEmptyKm;
      if (maxEmpty != null && order.emptyKm > maxEmpty) return false;
      final minPer = _filters.minPerKm;
      if (minPer != null && order.perKm < minPer) return false;
      if (_filters.savedOnly && !_saved.contains(order.id)) return false;
      if (text.isEmpty) return true;
      return '${order.from}${order.to}${order.item}${order.tags.join(' ')}'
          .contains(text);
    }).toList();
    num key(CarrierOrder order) => switch (_sort) {
          SortKey.fare => -order.fare,
          SortKey.near => order.emptyKm,
          SortKey.per => -order.perKm,
        };
    found.sort((a, b) => key(a).compareTo(key(b)));
    return found;
  }

  String get tripTitle {
    final order = tripOrder;
    return [
      '상차지로 이동 중',
      '${order.shipper}에서 상차 중',
      '${order.consignee}로 운송 중',
      '${order.consignee}에서 하차 중',
      '운행 완료',
    ][_stage];
  }

  void go(CarrierTab tab) {
    _tab = tab;
    notifyListeners();
  }

  void toggleOnline() {
    _online = !_online;
    notifyListeners();
  }

  void setSort(SortKey sort) {
    _sort = sort;
    notifyListeners();
  }

  void setQuery(String query) {
    _query = query;
    notifyListeners();
  }

  void toggleMap() {
    _showMap = !_showMap;
    notifyListeners();
  }

  void setFilters(CarrierFilters filters) {
    _filters = filters;
    notifyListeners();
  }

  void resetAll() {
    _filters = const CarrierFilters();
    _query = '';
    notifyListeners();
  }

  void toggleSaved(int id) {
    if (!_saved.remove(id)) _saved.add(id);
    notifyListeners();
  }

  /// 콜을 수락하면 첫 단계부터 운행을 시작한다.
  void accept(int id) {
    _tripId = id;
    _stage = 0;
    _scanned = 0;
    _tab = CarrierTab.trip;
    notifyListeners();
  }

  void scan() {
    if (_scanned >= bagTotal) return;
    _scanned++;
    notifyListeners();
  }

  /// 상차 단계는 마대를 모두 스캔해야 넘어간다.
  void nextStage() {
    if (_stage == 1 && _scanned < bagTotal) return;
    if (_stage >= 4) return;
    _stage++;
    notifyListeners();
  }

  /// 콜 목록과 내 운행을 서버에서 다시 받는다.
  Future<void> refresh() async {
    if (!live) return;
    try {
      final calls = await api.get('/v1/calls') as List<Object?>;
      final mine = await api.get('/v1/me/orders') as List<Object?>;
      if (!api.loggedIn) return;
      data.orders
        ..clear()
        ..addAll(
          calls.map(
            (c) => CarrierOrder.fromCall(c! as Map<String, Object?>, data.depot),
          ),
        );
      _myOrders = mine.cast<Map<String, Object?>>();
      if (_liveTrip == null) await _resumeTrip();
      notifyListeners();
    } on ApiException {
      // 잠깐 끊긴 경우 다음 주기에 다시 받는다.
    }
  }

  /// 앱을 다시 켜도 맡은 운행을 이어서 하도록 서버 상태에서 단계를 찾는다.
  Future<void> _resumeTrip() async {
    final running = _running.toList();
    if (running.isEmpty) return;
    final order = running.first;
    final detail =
        await api.get('/v1/orders/${order['id']}') as Map<String, Object?>;
    final call = detail['call'] as Map<String, Object?>?;
    if (call == null) return;
    _liveTrip = CarrierOrder.fromCall(call, data.depot);
    _stage = switch (order['status']) {
      'picked_up' => 2,
      'arrived' => 3,
      _ => 0,
    };
    _scanned = 0;
  }

  /// 콜 수락. 실패하면 이유를 돌려준다.
  Future<String?> acceptLive(CarrierOrder order) async {
    try {
      await api.post('/v1/calls/${order.id}/accept', {'freight_krw': order.fare});
    } on ApiException catch (error) {
      await refresh();
      return error.message;
    }
    _liveTrip = order;
    accept(order.id);
    await refresh();
    return null;
  }

  /// 운행 단계를 서버에 알리고 넘어간다. 실패하면 이유를 돌려준다.
  Future<String?> advanceLive({String? vehicleNo}) async {
    final id = tripOrder.id;
    try {
      switch (_stage) {
        case 1:
          // 마대별 계량 입력이 아직 없어 등록 무게를 똑같이 나눠 보낸다.
          final detail = await api.get('/v1/orders/$id') as Map<String, Object?>;
          final bagIds = detail['bag_ids']! as List<Object?>;
          final kg = (detail['total_kg']! as num) / bagIds.length;
          await api.post('/v1/orders/$id/pickup', {
            'bag_weights': [
              for (final bag in bagIds)
                {'bag_id': bag, 'kg': double.parse(kg.toStringAsFixed(3))},
            ],
          });
        case 2:
          await api.post('/v1/orders/$id/arrive');
        case 3:
          await api.post(
            '/v1/orders/$id/handover/carrier',
            {'vehicle_no': vehicleNo},
          );
      }
    } on ApiException catch (error) {
      return error.message;
    }
    nextStage();
    await refresh();
    return null;
  }
}
