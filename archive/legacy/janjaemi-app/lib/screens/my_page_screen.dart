import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../data/models.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'login_screen.dart';

class MyPageScreen extends StatelessWidget {
  const MyPageScreen({super.key});

  static const _menu = [
    ('menu_star', '관심 품목·등급 설정'),
    ('menu_factory', '자주 거래하는 판매자'),
    ('menu_pin', '배송지 관리'),
    ('menu_bell', '알림 설정'),
    ('menu_help', '고객센터'),
  ];

  void _logout(BuildContext context) {
    api.logout();
    live.stop();
    currentTab.value = AppTab.home;
    Navigator.of(context, rootNavigator: true).pushReplacement(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
    );
  }

  @override
  Widget build(BuildContext context) => PageBody(
        children: [
          Text(
            '마이페이지',
            style: ts(24, Weight.bold, AppColors.ink, spacing: -0.4),
          ),
          Row(
            spacing: 14,
            children: [
              const Box(
                width: 56,
                height: 56,
                color: AppColors.green,
                radius: 28,
                alignment: Alignment.center,
                child: Ic('factory_white'),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: 6,
                  children: [
                    Text(
                      api.loggedIn ? api.companyName : '[회사명]',
                      style: ts(20, Weight.bold, AppColors.ink),
                    ),
                    Row(
                      spacing: 8,
                      children: [
                        const StatusTag('구매자'),
                        Row(
                          spacing: 3,
                          children: [
                            const Ic('check_verified'),
                            Text(
                              '사업자 인증 완료',
                              style: ts(12, Weight.regular, AppColors.body),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (!api.loggedIn) Box(
            width: double.infinity,
            color: AppColors.green,
            radius: 20,
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 14,
              children: [
                Text(
                  '이번 달 자원순환 성과',
                  style: ts(13, Weight.bold, AppColors.gold),
                ),
                const Row(
                  spacing: 12,
                  children: [
                    Expanded(child: _Metric('재활용 원료 구매', '[무게] kg')),
                    Expanded(child: _Metric('탄소 감축 효과', '[값] kgCO₂e')),
                  ],
                ),
                Text(
                  'ESG 리포트 내려받기  ›',
                  style: ts(13, Weight.medium, AppColors.cream),
                ),
              ],
            ),
          ),
          AppCard(
            padding: EdgeInsets.zero,
            radius: 16,
            child: Column(
              children: [
                for (final (index, (icon, label)) in _menu.indexed)
                  _MenuRow(icon, label, showDivider: index < _menu.length - 1),
              ],
            ),
          ),
          SizedBox(
            width: double.infinity,
            child: Tap(
              onTap: () => _logout(context),
              child: Text(
                '로그아웃',
                textAlign: TextAlign.center,
                style: ts(13, Weight.regular, AppColors.body),
              ),
            ),
          ),
        ],
      );
}

class _Metric extends StatelessWidget {
  const _Metric(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 4,
        children: [
          Text(label, style: ts(12, Weight.regular, AppColors.mint)),
          FixedLineText(value, style: ts(20, Weight.bold, AppColors.cream)),
        ],
      );
}

class _MenuRow extends StatelessWidget {
  const _MenuRow(this.icon, this.label, {required this.showDivider});
  final String icon;
  final String label;
  final bool showDivider;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          border: showDivider
              ? const Border(bottom: BorderSide(color: AppColors.border))
              : null,
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              spacing: 12,
              children: [
                Ic(icon),
                Text(label, style: ts(15, Weight.medium, AppColors.ink)),
              ],
            ),
            const Ic('chevron_right'),
          ],
        ),
      );
}
