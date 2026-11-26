import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';
import '../../widgets/common.dart';
import '../carrier_data.dart';
import '../carrier_theme.dart';
import '../carrier_widgets.dart';
import 'detail_screen.dart';

class CarrierHomeScreen extends StatelessWidget {
  const CarrierHomeScreen(this.state, {super.key});
  final CarrierState state;

  @override
  Widget build(BuildContext context) {
    final list = state.list;
    return Column(
      children: [
        CarrierAppBar(
          title: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                spacing: 8,
                children: [
                  const CIc('pin', size: 16, color: Colors.white),
                  Text(state.depotLabel, style: cs(20, Weight.bold, Colors.white)),
                ],
              ),
              Tap(
                onTap: () => showToast(
                  context,
                  state.live ? '알림은 아직 준비 중이에요' : '새 알림 1건: 묶음 요청이 등록됐어요',
                ),
                child: Container(
                  width: 48,
                  height: 48,
                  alignment: Alignment.center,
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    color: CarrierColors.glass,
                  ),
                  child: Stack(
                    clipBehavior: Clip.none,
                    alignment: Alignment.center,
                    children: [
                      const CIc('bell', color: Colors.white),
                      Positioned(
                        top: -2,
                        right: -2,
                        child: Container(
                          width: 8,
                          height: 8,
                          decoration: const BoxDecoration(
                            shape: BoxShape.circle,
                            color: CarrierColors.notice,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          body: state.live ? const SizedBox.shrink() : const Row(
            spacing: 8,
            children: [
              CTag(
                '5톤 윙바디 · 경북 89바 1234',
                background: CarrierColors.glass,
                foreground: Colors.white,
                icon: 'truck',
              ),
              CTag(
                '통과증 스캐너 인증',
                background: CarrierColors.accent,
                foreground: CarrierColors.onAccent,
                icon: 'check',
              ),
            ],
          ),
        ),
        CarrierScroll(
          children: [
            CCard(children: [_OnlineSwitch(state)]),
            _Kpis(state),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text.rich(
                  TextSpan(
                    style: cs(16, Weight.bold, CarrierColors.ink),
                    children: [
                      const TextSpan(text: '받을 수 있는 요청 '),
                      TextSpan(
                        text: '${list.length}건',
                        style: cs(
                          16,
                          Weight.bold,
                          CarrierColors.brand,
                          tabular: true,
                        ),
                      ),
                    ],
                  ),
                ),
                CButton(
                  '전체 보기',
                  line: true,
                  onTap: () => state.go(CarrierTab.orders),
                ),
              ],
            ),
            for (final order in list.take(3))
              OrderCard(
                order,
                saved: state.isSaved(order.id),
                onTap: () => openCarrierDetail(context, state, order),
                onSave: () => state.toggleSaved(order.id),
              ),
            if (list.isEmpty) EmptyOrders(onReset: state.resetAll),
          ],
        ),
      ],
    );
  }
}

class _OnlineSwitch extends StatelessWidget {
  const _OnlineSwitch(this.state);
  final CarrierState state;

  @override
  Widget build(BuildContext context) => Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            spacing: 4,
            children: [
              Text(
                '운행 상태',
                style: cs(12, Weight.medium, CarrierColors.muted),
              ),
              Text(
                state.online ? '콜 받는 중' : '운행 대기 중',
                style: cs(20, Weight.bold, CarrierColors.ink),
              ),
            ],
          ),
          Tap(
            onTap: state.toggleOnline,
            child: SizedBox(
              width: 64,
              height: 48,
              child: Center(
                child: Box(
                  width: 64,
                  height: 32,
                  radius: 999,
                  color:
                      state.online ? CarrierColors.brand : CarrierColors.line,
                  padding: const EdgeInsets.all(4),
                  alignment: state.online
                      ? Alignment.centerRight
                      : Alignment.centerLeft,
                  child: Container(
                    width: 24,
                    height: 24,
                    decoration: const BoxDecoration(
                      shape: BoxShape.circle,
                      color: Colors.white,
                      boxShadow: [
                        BoxShadow(
                          color: Color(0x4D000000),
                          offset: Offset(0, 1),
                          blurRadius: 4,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      );
}

class _Kpis extends StatelessWidget {
  const _Kpis(this.state);
  final CarrierState state;

  List<(String, String, bool)> get _items => state.live
      ? [
          ('정산 완료', won(state.settledTotal), true),
          ('완료 운행', '${state.settledCount}건', false),
          ('진행 중', '${state.runningCount}건', false),
        ]
      : const [
          ('오늘 수입', '184,000원', true),
          ('완료 운행', '2건', false),
          ('운행 거리', '86km', false),
        ];

  @override
  Widget build(BuildContext context) => Row(
        spacing: 8,
        children: [
          for (final (label, value, green) in _items)
            Expanded(
              child: Box(
                color: Colors.white,
                radius: 12,
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: 4,
                  children: [
                    Text(
                      label,
                      style: cs(12, Weight.medium, CarrierColors.muted),
                    ),
                    Text(
                      value,
                      style: cs(
                        14,
                        Weight.bold,
                        green ? CarrierColors.brand : CarrierColors.ink,
                        tabular: true,
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      );
}
