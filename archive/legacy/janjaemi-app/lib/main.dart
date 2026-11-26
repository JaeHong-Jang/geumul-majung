import 'dart:io' show Directory, File;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'carrier/carrier_data.dart';
import 'carrier/carrier_shell.dart';
import 'carrier/screens/detail_screen.dart';
import 'data/models.dart';
import 'screens/bundle_detail_screen.dart';
import 'screens/listing_detail_screen.dart';
import 'screens/loading_screen.dart';
import 'screens/login_screen.dart';
import 'screens/main_shell.dart';
import 'screens/market_screen.dart';
import 'screens/purchase_request_screen.dart';
import 'screens/request_done_screen.dart';
import 'screens/review_screen.dart';
import 'theme/app_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  runApp(const JanjaemiApp());
}

class JanjaemiApp extends StatelessWidget {
  const JanjaemiApp({super.key});

  @override
  Widget build(BuildContext context) => AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.dark,
        child: MaterialApp(
          title: '잔재미',
          debugShowCheckedModeBanner: false,
          theme: buildTheme(),
          home: _debugStartScreen() ?? const LoadingScreen(),
          builder: kIsWeb ? (context, child) => _PhoneFrame(child: child!) : null,
        ),
      );
}

/// 디버그 빌드에서 앱 Documents의 debug_start_screen 파일에 적힌 화면부터 띄운다.
/// 시뮬레이터에서 화면을 하나씩 검수할 때 쓴다.
Widget? _debugStartScreen() {
  if (!kDebugMode || kIsWeb) return null;
  final file = File(
    '${Directory.systemTemp.parent.path}/Documents/debug_start_screen',
  );
  if (!file.existsSync()) return null;
  final name = file.readAsStringSync().trim();
  Widget tab(int index) {
    currentTab.value = index;
    return const MainShell();
  }

  return switch (name) {
    'loading' => const LoadingScreen(goToLogin: false),
    'login' => const LoginScreen(),
    'home' => tab(AppTab.home),
    'explore' => tab(AppTab.explore),
    'cart' => tab(AppTab.cart),
    'history' => tab(AppTab.history),
    'my' => tab(AppTab.my),
    'detail' => const ListingDetailScreen(),
    'bundle' => const BundleDetailScreen(),
    'market' => const MarketScreen(),
    'request' => const PurchaseRequestScreen(),
    'done' => const RequestDoneScreen(),
    'review' => const ReviewScreen(),
    'carrier_home' => const CarrierShell(),
    'carrier_orders' => const CarrierShell(initialTab: CarrierTab.orders),
    'carrier_map' => const CarrierShell(
        initialTab: CarrierTab.orders,
        startWithMap: true,
      ),
    'carrier_trip' => const CarrierShell(initialTab: CarrierTab.trip),
    'carrier_earn' => const CarrierShell(initialTab: CarrierTab.earn),
    'carrier_my' => const CarrierShell(initialTab: CarrierTab.my),
    'carrier_detail' => FutureBuilder(
        future: CarrierData.load(),
        builder: (context, snapshot) {
          final data = snapshot.data;
          if (data == null) return const SizedBox.shrink();
          return CarrierDetailScreen(
            state: CarrierState(data),
            order: data.orders.first,
          );
        },
      ),
    _ => null,
  };
}

/// 웹(Chrome)에서 iPhone 14 Pro 크기로 보여준다. 창이 작으면 비율대로 줄인다.
class _PhoneFrame extends StatelessWidget {
  const _PhoneFrame({required this.child});
  final Widget child;

  static const size = Size(393, 852);

  @override
  Widget build(BuildContext context) => ColoredBox(
        color: const Color(0xFF2B2B2B),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: FittedBox(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(44),
              child: SizedBox.fromSize(
                size: size,
                child: MediaQuery(
                  data: MediaQuery.of(context).copyWith(
                    size: size,
                    padding: const EdgeInsets.only(top: 59, bottom: 34),
                    viewPadding: const EdgeInsets.only(top: 59, bottom: 34),
                  ),
                  child: child,
                ),
              ),
            ),
          ),
        ),
      );
}
