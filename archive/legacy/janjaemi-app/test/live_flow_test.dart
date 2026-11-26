import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:janjaemi/api/api_client.dart';
import 'package:latlong2/latlong.dart';
import 'package:janjaemi/carrier/carrier_data.dart';
import 'package:janjaemi/data/models.dart';
import 'package:janjaemi/screens/login_screen.dart';
import 'package:janjaemi/screens/main_shell.dart';
import 'package:janjaemi/screens/purchase_request_screen.dart';
import 'package:janjaemi/theme/app_theme.dart';

import 'fake_server.dart';

Future<void> settle(WidgetTester tester) async {
  await tester.runAsync(
    () => Future<void>.delayed(const Duration(milliseconds: 50)),
  );
  await tester.pump();
}

Future<void> pumpScreen(WidgetTester tester, Widget screen) async {
  tester.view.physicalSize = const Size(1179, 2556);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(MaterialApp(theme: buildTheme(), home: screen));
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  tearDown(() {
    appRole = null;
    endFakeSession();
  });

  testWidgets('틀린 비밀번호면 서버 메시지를 보여 주고 머문다', (tester) async {
    useFakeServer(role: 'recycler', loginOk: false);
    appRole = Role.buyer;
    await pumpScreen(tester, const LoginScreen());
    await tester.enterText(find.byType(TextField).at(0), 'buyer');
    await tester.enterText(find.byType(TextField).at(1), 'wrong');
    await tester.tap(find.text('구매자로 로그인'));
    await settle(tester);
    expect(find.text('아이디 또는 비밀번호가 맞지 않음'), findsOneWidget);
    expect(find.byType(MainShell), findsNothing);
    expect(api.loggedIn, isFalse);
    await tester.pump(const Duration(seconds: 3));
  });

  testWidgets('입력이 비면 서버를 부르지 않는다', (tester) async {
    useFakeServer(role: 'recycler');
    appRole = Role.buyer;
    await pumpScreen(tester, const LoginScreen());
    await tester.tap(find.text('구매자로 로그인'));
    await tester.pump();
    expect(fakeRequests, isEmpty);
    await tester.pump(const Duration(seconds: 3));
  });

  testWidgets('다른 역할 계정은 들어가지 못한다', (tester) async {
    useFakeServer(role: 'hauler');
    appRole = Role.buyer;
    await pumpScreen(tester, const LoginScreen());
    await tester.enterText(find.byType(TextField).at(0), 'truck');
    await tester.enterText(find.byType(TextField).at(1), 'truck-password');
    await tester.tap(find.text('구매자로 로그인'));
    await settle(tester);
    expect(find.byType(MainShell), findsNothing);
    expect(api.loggedIn, isFalse);
    await tester.pump(const Duration(seconds: 3));
  });

  testWidgets('구매자 앱은 역할 선택 없이 서버 매물을 보여 준다', (tester) async {
    useFakeServer(role: 'recycler');
    appRole = Role.buyer;
    await pumpScreen(tester, const LoginScreen());
    expect(find.text('구매자 로그인'), findsOneWidget);
    expect(find.text('운송기사'), findsNothing);
    await tester.enterText(find.byType(TextField).at(0), 'buyer');
    await tester.enterText(find.byType(TextField).at(1), 'buyer-password');
    await tester.tap(find.text('구매자로 로그인'));
    await settle(tester);
    await settle(tester);
    expect(find.text('가짜회사 님'), findsOneWidget);
    expect(find.text('PP · 폐합성수지류'), findsWidgets);
    expect(find.text('알루미늄 스크랩·칩'), findsNothing);
    expect(find.textContaining('[가격]'), findsNothing);
    expect(tester.takeException(), isNull);
    endFakeSession();
  });

  testWidgets('구매 요청은 매물 번호와 운임 상한을 서버에 보낸다', (tester) async {
    useFakeServer(role: 'recycler');
    await api.login('buyer', 'buyer-password');
    final listing = Listing.fromJson(fakeListing);
    await pumpScreen(tester, PurchaseRequestScreen(listing: listing));
    await tester.enterText(find.byType(TextField), '70000');
    await tester.pump();
    await tester.tap(find.text('구매 요청 보내기'));
    await settle(tester);
    await settle(tester);
    final order = fakeRequests.firstWhere((r) => r.url.path == '/v1/orders');
    expect(jsonDecode(order.body), {'listing_id': 7, 'freight_cap_krw': 70000});
    expect(find.text('구매 요청을 보냈어요'), findsOneWidget);
  });

  test('서버 콜을 화면용 콜로 바꾼다', () {
    final order = CarrierOrder.fromCall(fakeCall, const LatLng(36.11, 128.37));
    expect(order.live, isTrue);
    expect(order.id, 9);
    expect(order.fare, 80000);
    expect(order.title, '가짜공장 → 가짜재활용');
    expect(order.ton, 0.3);
    expect(order.stops, hasLength(2));
    expect(order.perKm, greaterThan(0));
  });
}
