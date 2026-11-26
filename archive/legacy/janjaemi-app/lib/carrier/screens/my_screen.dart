import 'package:flutter/material.dart';

import '../../api/api_client.dart';
import '../../screens/login_screen.dart';
import '../../theme/app_theme.dart';
import '../../widgets/common.dart';
import '../carrier_data.dart';
import '../carrier_theme.dart';
import '../carrier_widgets.dart';

class CarrierMyScreen extends StatelessWidget {
  const CarrierMyScreen(this.state, {super.key});
  final CarrierState state;

  @override
  Widget build(BuildContext context) {
    final depot = state.data.depot;
    return Column(
      children: [
        CarrierAppBar(
          title: Align(
            alignment: Alignment.centerLeft,
            child: Text('마이', style: cs(20, Weight.bold, Colors.white)),
          ),
          body: Align(
            alignment: Alignment.centerLeft,
            child: Text(
              state.live ? api.companyName : '경북 89바 1234 · 5톤 윙바디',
              style: cs(14, Weight.medium, Colors.white),
            ),
          ),
        ),
        CarrierScroll(
          children: [
            if (!state.live) CCard(
              children: [
                Text(
                  '경로 계산에 쓰는 차량 조건',
                  style: cs(16, Weight.bold, CarrierColors.ink),
                ),
                ListRows(
                  rows: [
                    LabelValue('전고', '${state.data.heightM}m'),
                    LabelValue('총중량', '${state.data.grossT}t'),
                    LabelValue(
                      '통행 제한으로 뺀 도로',
                      '${state.data.excludedWays}구간',
                    ),
                  ],
                ),
                Text(
                  '높이·중량 제한이 차량 조건에 걸리는 도로는 경로에서 뺍니다.',
                  style: cs(12, Weight.regular, CarrierColors.muted),
                ),
              ],
            ),
            if (!state.live) CCard(
              children: [
                Text(
                  '내 인증',
                  style: cs(16, Weight.bold, CarrierColors.ink),
                ),
                const Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    CTag(
                      '통과증 스캐너 인증',
                      background: CarrierColors.accent,
                      foreground: CarrierColors.onAccent,
                      icon: 'check',
                    ),
                    CTag('인계서 자동 작성'),
                  ],
                ),
              ],
            ),
            CCard(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      spacing: 4,
                      children: [
                        Text(
                          '차고지',
                          style: cs(12, Weight.medium, CarrierColors.muted),
                        ),
                        Text(
                          state.depotLabel,
                          style: cs(14, Weight.bold, CarrierColors.ink),
                        ),
                      ],
                    ),
                    Text(
                      '${depot.latitude}, ${depot.longitude}',
                      style: cs(
                        12,
                        Weight.regular,
                        CarrierColors.muted,
                        tabular: true,
                      ),
                    ),
                  ],
                ),
              ],
            ),
            Tap(
              onTap: () {
                api.logout();
                Navigator.of(context, rootNavigator: true).pushReplacement(
                  MaterialPageRoute(builder: (_) => const LoginScreen()),
                );
              },
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Text(
                  '로그아웃',
                  textAlign: TextAlign.center,
                  style: cs(14, Weight.regular, CarrierColors.muted),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
