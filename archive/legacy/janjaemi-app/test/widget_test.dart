import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:janjaemi/data/models.dart';
import 'package:janjaemi/screens/bundle_detail_screen.dart';
import 'package:janjaemi/screens/listing_detail_screen.dart';
import 'package:janjaemi/screens/loading_screen.dart';
import 'package:janjaemi/screens/login_screen.dart';
import 'package:janjaemi/screens/main_shell.dart';
import 'package:janjaemi/screens/market_screen.dart';
import 'package:janjaemi/screens/purchase_request_screen.dart';
import 'package:janjaemi/screens/request_done_screen.dart';
import 'package:janjaemi/screens/review_screen.dart';
import 'package:janjaemi/theme/app_theme.dart';

import 'fake_server.dart';

Future<void> _loadFont(String family, String path) async {
  final bytes = File(path).readAsBytesSync();
  await (FontLoader(family)
        ..addFont(Future.value(ByteData.sublistView(bytes))))
      .load();
}

/// iPhone 14 Pro: 393×852pt, 위 59pt / 아래 34pt 안전 영역.
Future<void> _pump(WidgetTester tester, Widget screen) async {
  tester.view.physicalSize = const Size(1179, 2556);
  tester.view.devicePixelRatio = 3;
  tester.view.padding = const FakeViewPadding(top: 177, bottom: 102);
  tester.view.viewPadding = const FakeViewPadding(top: 177, bottom: 102);
  addTearDown(tester.view.reset);
  await tester.pumpWidget(MaterialApp(theme: buildTheme(), home: screen));
  await tester.pump(const Duration(milliseconds: 100));
}

void main() {
  setUpAll(() async {
    await _loadFont('NotoSansKR', 'assets/fonts/NotoSansKR-Variable.ttf');
    await _loadFont('BlackHanSans', 'assets/fonts/BlackHanSans-Regular.ttf');
  });

  final screens = <String, Widget>{
    '로딩': const LoadingScreen(goToLogin: false),
    '로그인': const LoginScreen(),
    '매물 상세': const ListingDetailScreen(),
    'AI 추천 묶음': const BundleDetailScreen(),
    '시세': const MarketScreen(),
    '구매 요청': const PurchaseRequestScreen(),
    '구매 요청 완료': const RequestDoneScreen(),
    '입고 확인·후기': const ReviewScreen(),
  };

  screens.forEach((name, screen) {
    testWidgets('$name 화면에 레이아웃 오류가 없다', (tester) async {
      await _pump(tester, screen);
      expect(tester.takeException(), isNull);
    });
  });

  for (final (index, name) in const ['홈', '탐색', '장바구니', '거래내역', '마이페이지'].indexed) {
    testWidgets('$name 탭에 레이아웃 오류가 없다', (tester) async {
      currentTab.value = index;
      await _pump(tester, const MainShell());
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('구매자로 로그인하면 홈으로 이동한다', (tester) async {
    currentTab.value = AppTab.home;
    await _pump(tester, const LoginScreen());
    expect(find.text('판매자로 로그인'), findsOneWidget);

    await tester.tap(find.text('구매자'));
    await tester.pump();
    await tester.enterText(find.byType(TextField).at(0), 'buyer');
    await tester.enterText(find.byType(TextField).at(1), 'buyer-password');
    useFakeServer(role: 'recycler');
    addTearDown(endFakeSession);
    await tester.tap(find.text('구매자로 로그인'));
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 50)),
    );
    await tester.pump();
    await tester.pumpAndSettle();

    expect(find.text('가짜회사 님'), findsOneWidget);
    live.stop();
  });

  testWidgets('장바구니에서 항목을 빼면 건수가 함께 바뀐다', (tester) async {
    final testCart = cart;
    final before = testCart.count;
    testCart.remove(copper);
    expect(testCart.count, before - 1);
    expect(testCart.add(copper), isTrue);
    expect(testCart.add(copper), isFalse);
  });

  testWidgets('구매 요청을 보내고 거래내역으로 간다', (tester) async {
    currentTab.value = AppTab.home;
    await _pump(tester, const MainShell());
    Navigator.of(tester.element(find.byType(Scaffold).first)).push(
      MaterialPageRoute(builder: (_) => const PurchaseRequestScreen()),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('구매 요청 보내기'));
    await tester.pumpAndSettle();
    expect(find.text('구매 요청을 보냈어요'), findsOneWidget);

    await tester.tap(find.text('거래내역 보기'));
    await tester.pumpAndSettle();
    expect(currentTab.value, AppTab.history);
    expect(find.text('진행 중 2'), findsOneWidget);
  });
}
