import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:janjaemi/carrier/carrier_data.dart';
import 'package:janjaemi/carrier/carrier_shell.dart';
import 'package:janjaemi/carrier/carrier_theme.dart';
import 'package:janjaemi/carrier/screens/detail_screen.dart';
import 'package:janjaemi/screens/login_screen.dart';
import 'package:janjaemi/theme/app_theme.dart';

import 'fake_server.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late CarrierData data;

  setUpAll(() async => data = await CarrierData.load());

  test('경로 계산 결과가 팀원 화면과 같다', () {
    final first = data.orders.first;
    expect(first.title, '구미 공단동 → 칠곡 약목');
    expect(won(first.fare), '71,000원');
    expect(km1(first.km), '9.4km');
    expect(first.min, 15);
    expect(km1(first.emptyKm), '3.7km');
    expect(first.emptyMin, 7);
    expect(won(first.perKm), '5,426원');
  });

  test('공장 좌표 목록은 앱 데이터에 들어 있지 않다', () async {
    expect(data.orders, hasLength(11));
    expect(data.bundledTiles, hasLength(470));
  });

  test('기본 목록은 5톤 초과 콜을 빼고 운임이 높은 순이다', () {
    final state = CarrierState(data);
    expect(state.list, hasLength(10));
    expect(state.list.first.title, '구미 공단동 → 포항 왕복');
    expect(state.list.first.fare, 485000);
    expect(state.list.any((order) => order.ton > maxFitTon), isFalse);
  });

  test('정렬과 필터가 동작한다', () {
    final state = CarrierState(data)..setSort(SortKey.near);
    final near = state.list.map((order) => order.emptyKm).toList();
    expect(near, [...near]..sort());

    state.setSort(SortKey.per);
    expect(state.list.first.perKm, 5426);

    state.setFilters(const CarrierFilters(region: Region.far));
    expect(state.list.every((order) => !data.isLocal(order)), isTrue);
    expect(state.filters.activeCount, 1);

    state.setFilters(const CarrierFilters(fit: false));
    expect(state.list, hasLength(11));

    state
      ..resetAll()
      ..setQuery('청주');
    expect(state.list.single.to, '충북 청주');
  });

  test('저장한 콜만 볼 수 있다', () {
    final state = CarrierState(data)
      ..toggleSaved(3)
      ..setFilters(const CarrierFilters(savedOnly: true));
    expect(state.list.single.id, 3);
    state.toggleSaved(3);
    expect(state.list, isEmpty);
  });

  test('마대를 모두 스캔해야 상차를 끝낼 수 있다', () {
    final state = CarrierState(data);
    expect(state.stage, 1);
    expect(state.scanned, 12);

    state.nextStage();
    expect(state.stage, 1);

    for (var i = 0; i < 10; i++) {
      state.scan();
    }
    expect(state.scanned, bagsToScan);

    state.nextStage();
    expect(state.stage, 2);
  });

  test('콜을 수락하면 처음 단계부터 운행하고 완료에서 멈춘다', () {
    final state = CarrierState(data)..accept(5);
    expect(state.tab, CarrierTab.trip);
    expect(state.tripOrder.id, 5);
    expect(state.stage, 0);
    expect(state.tripTitle, '상차지로 이동 중');

    state.nextStage();
    for (var i = 0; i < bagsToScan; i++) {
      state.scan();
    }
    for (var i = 0; i < 6; i++) {
      state.nextStage();
    }
    expect(state.stage, 4);
    expect(state.tripTitle, '운행 완료');
  });

  test('정산 합계가 원본과 같다', () {
    expect(won(weekTotal), '612,000원');
    expect(won(pendingTotal), '354,000원');
  });

  testWidgets('운송기사로 로그인하면 운송 홈으로 간다', (tester) async {
    tester.view.physicalSize = const Size(1179, 2556);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      MaterialApp(theme: buildTheme(), home: const LoginScreen()),
    );
    await tester.tap(find.text('운송기사'));
    await tester.pump();
    await tester.enterText(find.byType(TextField).at(0), 'truck');
    await tester.enterText(find.byType(TextField).at(1), 'truck-password');
    useFakeServer(role: 'hauler');
    addTearDown(endFakeSession);
    await tester.tap(find.text('운송기사로 로그인'));
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 50)),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    for (var i = 0; i < 40 && find.text('가짜회사').evaluate().isEmpty; i++) {
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 50)),
      );
      await tester.pump(const Duration(milliseconds: 50));
    }

    expect(find.byType(CarrierShell), findsOneWidget);
    expect(find.text('가짜회사'), findsOneWidget);
    expect(find.text('우리 차고지 · 구미'), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());   // 5초 주기 새로 받기를 끈다
  });

  Future<CarrierState> openDetail(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1179, 2556);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final state = CarrierState(data);
    await tester.pumpWidget(
      MaterialApp(
        theme: buildTheme(),
        home: Builder(
          builder: (context) => TextButton(
            onPressed: () =>
                openCarrierDetail(context, state, data.orders.first),
            child: const Text('열기'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('열기'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    return state;
  }

  testWidgets('요청 상세에서 수락하면 운행 화면으로 간다', (tester) async {
    final state = await openDetail(tester);
    expect(find.text('수락하기 0:45'), findsOneWidget);

    await tester.pump(const Duration(seconds: 1));
    expect(find.text('수락하기 0:44'), findsOneWidget);

    await tester.tap(find.text('수락하기 0:44'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    await tester.pump();
    expect(state.tab, CarrierTab.trip);
    expect(state.stage, 0);
    expect(find.byType(CarrierDetailScreen), findsNothing);
  });

  testWidgets('시간이 끝나면 다시 받기로 바뀌고 건너뛰면 목록으로 간다', (tester) async {
    final state = await openDetail(tester);

    await tester.pump(const Duration(seconds: acceptSeconds));
    expect(find.text('시간 초과 · 다시 받기'), findsOneWidget);

    await tester.tap(find.text('시간 초과 · 다시 받기'));
    await tester.pump();
    expect(find.text('수락하기 0:45'), findsOneWidget);

    await tester.tap(find.text('건너뛰기'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(state.tab, CarrierTab.orders);
  });
}
