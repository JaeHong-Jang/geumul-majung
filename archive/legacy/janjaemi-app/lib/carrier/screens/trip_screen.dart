import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';
import '../../widgets/common.dart';
import '../carrier_data.dart';
import '../carrier_map.dart';
import '../carrier_theme.dart';
import '../carrier_widgets.dart';

class CarrierTripScreen extends StatelessWidget {
  const CarrierTripScreen(this.state, {super.key});
  final CarrierState state;

  @override
  Widget build(BuildContext context) {
    if (!state.hasTrip) {
      return Column(
        children: [
          CarrierAppBar(
            title: Align(
              alignment: Alignment.centerLeft,
              child: Text('운행', style: cs(20, Weight.bold, Colors.white)),
            ),
            body: const SizedBox.shrink(),
          ),
          CarrierScroll(
            children: [
              CCard(
                children: [
                  Text(
                    '진행 중인 운행이 없어요',
                    style: cs(16, Weight.bold, CarrierColors.ink),
                  ),
                  CButton(
                    '운반 요청 보기',
                    onTap: () => state.go(CarrierTab.orders),
                  ),
                ],
              ),
            ],
          ),
        ],
      );
    }
    final order = state.tripOrder;
    final stage = state.stage;
    return Column(
      children: [
        CarrierAppBar(
          title: Row(
            spacing: 8,
            children: [
              Expanded(
                child: Text(
                  state.tripTitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: cs(20, Weight.bold, Colors.white),
                ),
              ),
              Opacity(
                opacity: 0.82,
                child: Text(
                  state.live ? '주문 #${order.id}' : 'PASS-2026-000123',
                  style: cs(12, Weight.regular, Colors.white, tabular: true),
                ),
              ),
            ],
          ),
          body: Align(
            alignment: Alignment.topCenter,
            child: _Steps(stage),
          ),
        ),
        CarrierScroll(
          children: [
            _TripBody(state),
            if (stage == 1 && !state.live) const _BagChecks(),
            ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: SizedBox(
                height: 176,
                child: TripMap(
                  key: ValueKey('${order.id}:$stage'),
                  data: state.data,
                  order: order,
                  stage: stage,
                ),
              ),
            ),
            CButton(
              '카카오맵 길안내',
              icon: 'nav',
              line: true,
              onTap: () => openKakaoNavi(context, order, stage),
            ),
          ],
        ),
        CFooter(
          withTabs: true,
          children: [Expanded(child: _TripAction(state))],
        ),
      ],
    );
  }
}

class _Steps extends StatelessWidget {
  const _Steps(this.stage);
  final int stage;

  @override
  Widget build(BuildContext context) => Row(
        spacing: 4,
        children: [
          for (final (index, name) in stageNames.indexed)
            Expanded(
              child: Opacity(
                opacity: index <= stage ? 1 : 0.72,
                child: Column(
                  spacing: 4,
                  children: [
                    Box(
                      height: 4,
                      width: double.infinity,
                      radius: 999,
                      color: index <= stage
                          ? CarrierColors.accent
                          : Colors.white.withValues(alpha: 0.3),
                    ),
                    Text(
                      name,
                      style: cs(
                        12,
                        index <= stage ? Weight.bold : Weight.medium,
                        Colors.white,
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      );
}

class _TripBody extends StatelessWidget {
  const _TripBody(this.state);
  final CarrierState state;

  @override
  Widget build(BuildContext context) {
    final stage = state.stage;
    final order = state.tripOrder;
    final label = cs(12, Weight.medium, CarrierColors.muted);
    final note = cs(12, Weight.regular, CarrierColors.muted);
    final big = cs(20, Weight.bold, CarrierColors.ink, tabular: true);
    if (stage == 1) {
      return CCard(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: 4,
                children: [
                  Text('마대 QR 검수', style: label),
                  Text('${state.scanned} / ${state.bagTotal}개', style: big),
                ],
              ),
              CButton(
                'QR 스캔',
                icon: 'qr',
                onTap: state.scanned >= state.bagTotal ? null : state.scan,
              ),
            ],
          ),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: state.scanned / state.bagTotal,
              minHeight: 8,
              backgroundColor: CarrierColors.line,
              color: CarrierColors.brand,
            ),
          ),
          Text('전부 스캔해야 상차 완료 버튼이 열립니다.', style: note),
        ],
      );
    }
    if (stage >= 3) {
      return CCard(
        children: [
          Text(stage == 3 ? '하차 처리' : '이번 운행', style: label),
          Text(
            stage == 3 ? '계량 후 인계서를 전송하세요' : '${won(order.fare)} 정산 예정',
            style: big,
          ),
          Text('폐기물 인계서는 앱이 자동으로 작성합니다.', style: note),
        ],
      );
    }
    final distance = stage == 0
        ? '${km1(order.emptyKm)} · ${order.emptyMin}분'
        : '${km1(order.km)} · ${order.min}분';
    return CCard(
      children: [
        Text('다음 목적지', style: label),
        Text(
          stage == 0 ? order.shipper : order.consignee,
          style: cs(20, Weight.bold, CarrierColors.ink),
        ),
        Text(
          state.live
              ? '$distance (직선거리 기준 예상)'
              : '$distance (예상) · 화물차 조건 반영',
          style: cs(14, Weight.regular, CarrierColors.muted, tabular: true),
        ),
      ],
    );
  }
}

class _BagChecks extends StatelessWidget {
  const _BagChecks();

  @override
  Widget build(BuildContext context) => CCard(
        children: [
          ListRows(
            rows: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    spacing: 4,
                    children: [
                      Text(
                        'KM-0042-000883',
                        style: cs(
                          14,
                          Weight.bold,
                          CarrierColors.ink,
                          tabular: true,
                        ),
                      ),
                      Text(
                        'PP · 198kg · 순도 98.1%',
                        style: cs(12, Weight.regular, CarrierColors.muted),
                      ),
                    ],
                  ),
                  const CIc('check', color: CarrierColors.ink),
                ],
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    spacing: 4,
                    children: [
                      Text(
                        'KM-0042-000879',
                        style: cs(
                          14,
                          Weight.bold,
                          CarrierColors.ink,
                          tabular: true,
                        ),
                      ),
                      Text(
                        '사진에서 PE 혼입 의심',
                        style: cs(12, Weight.regular, CarrierColors.warn),
                      ),
                    ],
                  ),
                  CButton(
                    '사진 보기',
                    line: true,
                    onTap: () => showToast(context, '적재 사진을 엽니다 (시연)'),
                  ),
                ],
              ),
            ],
          ),
        ],
      );
}

class _TripAction extends StatelessWidget {
  const _TripAction(this.state);
  final CarrierState state;

  @override
  Widget build(BuildContext context) {
    final left = state.bagTotal - state.scanned;
    void next() => _advance(context, state);
    return switch (state.stage) {
      0 => CButton('상차지 도착', large: true, onTap: next),
      1 => CButton(
          left > 0 ? '상차 완료 · $left개 더 스캔' : '상차 완료',
          large: true,
          onTap: left > 0 ? null : next,
        ),
      2 => CButton('하차지 도착', large: true, onTap: next),
      3 => CButton('인계서 전송 · 운행 완료', large: true, onTap: next),
      _ => CButton(
          '정산 내역 보기',
          large: true,
          onTap: () => state.go(CarrierTab.earn),
        ),
    };
  }
}

Future<void> _advance(BuildContext context, CarrierState state) async {
  if (!state.live) {
    state.nextStage();
    return;
  }
  String? vehicle;
  if (state.stage == 3) {
    vehicle = await _askVehicle(context);
    if (vehicle == null) return;
  }
  final error = await state.advanceLive(vehicleNo: vehicle);
  if (error != null && context.mounted) showToast(context, error);
}

/// 인계서 운반자 칸에 들어갈 차량 번호.
Future<String?> _askVehicle(BuildContext context) {
  final controller = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (dialog) => AlertDialog(
      title: const Text('차량 번호'),
      content: TextField(
        controller: controller,
        autofocus: true,
        decoration: const InputDecoration(hintText: '예) 경북 00바 0000'),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(dialog).pop(),
          child: const Text('취소'),
        ),
        TextButton(
          onPressed: () {
            final text = controller.text.trim();
            if (text.isNotEmpty) Navigator.of(dialog).pop(text);
          },
          child: const Text('전송'),
        ),
      ],
    ),
  );
}
