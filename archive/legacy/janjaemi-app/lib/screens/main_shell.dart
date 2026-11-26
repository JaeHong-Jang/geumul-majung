import 'package:flutter/material.dart';

import '../data/models.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'cart_screen.dart';
import 'explore_screen.dart';
import 'history_screen.dart';
import 'home_screen.dart';
import 'my_page_screen.dart';

class MainShell extends StatelessWidget {
  const MainShell({super.key});

  @override
  Widget build(BuildContext context) => ValueListenableBuilder(
        valueListenable: currentTab,
        builder: (context, tab, _) => Scaffold(
          body: IndexedStack(
            index: tab,
            children: const [
              HomeScreen(),
              ExploreScreen(),
              CartScreen(),
              HistoryScreen(),
              MyPageScreen(),
            ],
          ),
          bottomNavigationBar: _BottomMenu(tab),
        ),
      );
}

class _BottomMenu extends StatelessWidget {
  const _BottomMenu(this.current);
  final int current;

  static const _tabs = [
    ('홈', 'home'),
    ('탐색', 'explore'),
    ('장바구니', 'cart'),
    ('거래내역', 'history'),
    ('마이페이지', 'my'),
  ];

  @override
  Widget build(BuildContext context) {
    final inset = MediaQuery.viewPaddingOf(context).bottom;
    return Container(
      height: 49 + (inset < 8 ? 8 : inset),
      padding: const EdgeInsets.fromLTRB(4, 8, 4, 0),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final (index, (label, icon)) in _tabs.indexed)
            Expanded(
              child: Tap(
                onTap: () => currentTab.value = index,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  spacing: 3,
                  children: [
                    Ic('tab_${icon}_${index == current ? 'on' : 'off'}'),
                    Text(
                      label,
                      style: index == current
                          ? ts(11, Weight.bold, AppColors.green)
                          : ts(11, Weight.medium, AppColors.body),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
