import 'dart:async';

import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'carrier_data.dart';
import 'carrier_theme.dart';
import 'carrier_widgets.dart';
import 'screens/earn_screen.dart';
import 'screens/home_screen.dart';
import 'screens/my_screen.dart';
import 'screens/orders_screen.dart';
import 'screens/trip_screen.dart';

/// 운송기사 앱. 로그인에서 운송기사를 고르면 들어온다.
class CarrierShell extends StatefulWidget {
  const CarrierShell({
    super.key,
    this.initialTab = CarrierTab.home,
    this.startWithMap = false,
  });

  final CarrierTab initialTab;
  final bool startWithMap;

  @override
  State<CarrierShell> createState() => _CarrierShellState();
}

class _CarrierShellState extends State<CarrierShell> {
  late final Future<CarrierState> _state = CarrierData.load().then((data) {
    final state = CarrierState(data, tab: widget.initialTab);
    if (widget.startWithMap) state.toggleMap();
    if (data.live) {
      state.refresh();
      _poll = Timer.periodic(
        const Duration(seconds: 5),
        (_) => state.refresh(),
      );
    }
    return state;
  });
  Timer? _poll;

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FutureBuilder(
        future: _state,
        builder: (context, snapshot) {
          final state = snapshot.data;
          if (snapshot.hasError) {
            return Scaffold(
              backgroundColor: CarrierColors.background,
              body: Center(
                child: Text(
                  '${snapshot.error}',
                  style: cs(14, Weight.medium, CarrierColors.muted),
                ),
              ),
            );
          }
          if (state == null) {
            return const Scaffold(backgroundColor: CarrierColors.brand);
          }
          return ListenableBuilder(
            listenable: state,
            builder: (context, _) => Scaffold(
              backgroundColor: CarrierColors.background,
              body: switch (state.tab) {
                CarrierTab.home => CarrierHomeScreen(state),
                CarrierTab.orders => CarrierOrdersScreen(state),
                CarrierTab.trip => CarrierTripScreen(state),
                CarrierTab.earn => CarrierEarnScreen(state),
                CarrierTab.my => CarrierMyScreen(state),
              },
              bottomNavigationBar: _Tabs(state),
            ),
          );
        },
      );
}

class _Tabs extends StatelessWidget {
  const _Tabs(this.state);
  final CarrierState state;

  static const _tabs = [
    (CarrierTab.home, '홈', 'home'),
    (CarrierTab.orders, '운반요청', 'list'),
    (CarrierTab.trip, '운행중', 'truck'),
    (CarrierTab.earn, '정산', 'won'),
    (CarrierTab.my, '마이', 'user'),
  ];

  @override
  Widget build(BuildContext context) {
    final inset = MediaQuery.viewPaddingOf(context).bottom;
    return Container(
      padding: EdgeInsets.fromLTRB(8, 8, 8, inset < 16 ? 16 : inset),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: CarrierColors.line)),
      ),
      child: Row(
        children: [
          for (final (tab, label, icon) in _tabs)
            Expanded(
              child: Tap(
                onTap: () => state.go(tab),
                child: SizedBox(
                  height: 48,
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    spacing: 4,
                    children: [
                      CIc(
                        icon,
                        color: tab == state.tab
                            ? CarrierColors.brand
                            : CarrierColors.muted,
                      ),
                      Text(
                        label,
                        style: tab == state.tab
                            ? cs(12, Weight.bold, CarrierColors.brand)
                                .copyWith(height: 1)
                            : cs(12, Weight.medium, CarrierColors.muted)
                                .copyWith(height: 1),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
