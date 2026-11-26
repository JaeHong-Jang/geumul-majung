import 'dart:async';

import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';
import '../../widgets/common.dart';
import '../carrier_data.dart';
import '../carrier_map.dart';
import '../carrier_theme.dart';
import '../carrier_widgets.dart';

void openCarrierDetail(
  BuildContext context,
  CarrierState state,
  CarrierOrder order,
) {
  Navigator.of(context).push(
    MaterialPageRoute(
      builder: (_) => CarrierDetailScreen(state: state, order: order),
    ),
  );
}

class CarrierDetailScreen extends StatefulWidget {
  const CarrierDetailScreen({
    super.key,
    required this.state,
    required this.order,
  });

  final CarrierState state;
  final CarrierOrder order;

  @override
  State<CarrierDetailScreen> createState() => _CarrierDetailScreenState();
}

class _CarrierDetailScreenState extends State<CarrierDetailScreen> {
  int _seconds = acceptSeconds;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _startTimer();
  }

  void _startTimer() {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      setState(() => _seconds--);
      if (_seconds <= 0) timer.cancel();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _leave() {
    widget.state.go(CarrierTab.orders);
    Navigator.of(context).pop();
  }

  Future<void> _accept() async {
    if (_seconds <= 0) return;
    final state = widget.state;
    if (state.live) {
      final error = await state.acceptLive(widget.order);
      if (!mounted) return;
      if (error != null) {
        showToast(context, error);
        return;
      }
    } else {
      state.accept(widget.order.id);
    }
    Navigator.of(context).pop();
  }

  void _retry() => setState(() {
        _seconds = acceptSeconds;
        _startTimer();
      });

  @override
  Widget build(BuildContext context) {
    final order = widget.order;
    final state = widget.state;
    final over = _seconds <= 0;
    return ListenableBuilder(
      listenable: state,
      builder: (context, _) => Scaffold(
        backgroundColor: CarrierColors.background,
        body: Column(
          children: [
            SizedBox(
              height: 280,
              child: Stack(
                children: [
                  Positioned.fill(
                    child: SelectedOrderMap(data: state.data, order: order),
                  ),
                  Positioned(
                    top: topInset(context),
                    left: 16,
                    right: 16,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        RoundButton(icon: 'back', onTap: _leave),
                        Row(
                          spacing: 8,
                          children: [
                            RoundButton(
                              icon: 'bookmark',
                              active: state.isSaved(order.id),
                              onTap: () => state.toggleSaved(order.id),
                            ),
                            RoundButton(
                              icon: 'locate',
                              onTap: () => showToast(
                                context,
                                '내 위치 다시 계산은 아직 준비 중이에요',
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            CarrierScroll(
              children: [
                _FareCard(order),
                CCard(children: [_Stops(order)]),
                if (!order.live) CCard(children: [_FareBreak(order)]),
                CCard(
                  children: [
                    ListRows(
                      rows: [
                        LabelValue('품목', order.item),
                        LabelValue(
                          '마대 · 중량',
                          '${order.bags}개 · ${tonLabel(order.ton)}t',
                        ),
                        if (!order.live)
                          LabelValue('화주 평점', '${order.rating} / 5.0'),
                      ],
                    ),
                  ],
                ),
              ],
            ),
            CFooter(
              children: [
                CButton('건너뛰기', line: true, onTap: _leave),
                Expanded(
                  child: CButton(
                    over
                        ? '시간 초과 · 다시 받기'
                        : '수락하기 0:${_seconds.toString().padLeft(2, '0')}',
                    onTap: over ? _retry : _accept,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _FareCard extends StatelessWidget {
  const _FareCard(this.order);
  final CarrierOrder order;

  @override
  Widget build(BuildContext context) => CCard(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: 4,
                children: [
                  Text(
                    order.live ? '운임 상한 · 수수료 0원' : '총 운임 · 수수료 0원',
                    style: cs(12, Weight.medium, CarrierColors.muted),
                  ),
                  Text(
                    won(order.fare),
                    style: cs(
                      28,
                      Weight.bold,
                      CarrierColors.brand,
                      tabular: true,
                    ),
                  ),
                ],
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                spacing: 4,
                children: [
                  Text(
                    '공차 포함 km당',
                    style: cs(12, Weight.regular, CarrierColors.muted),
                  ),
                  Text(
                    won(order.perKm),
                    style: cs(
                      14,
                      Weight.bold,
                      CarrierColors.ink,
                      tabular: true,
                    ),
                  ),
                ],
              ),
            ],
          ),
          Text(
            '공차 ${km1(order.emptyKm)} ${order.emptyMin}분 + '
            '적재 ${km1(order.km)} ${order.min}분 (예상)',
            style: cs(12, Weight.regular, CarrierColors.muted, tabular: true),
          ),
          OrderTags(order, trailing: [CTag(order.pay)]),
        ],
      );
}

class _Stops extends StatelessWidget {
  const _Stops(this.order);
  final CarrierOrder order;

  @override
  Widget build(BuildContext context) {
    final via = order.via;
    return Column(
      spacing: 12,
      children: [
        _Stop(
          order.live ? order.shipper : '${order.shipper} · ${order.from}',
          '${order.window} · ${order.cond}',
        ),
        if (via != null) _Stop(via, order.viaNote ?? '두 번째 상차지'),
        _Stop(
          order.live
              ? order.consignee
              : '${order.consignee} · ${order.dropLabel ?? order.to}',
          order.dropNote,
          drop: true,
        ),
      ],
    );
  }
}

class _Stop extends StatelessWidget {
  const _Stop(this.title, this.note, {this.drop = false});
  final String title;
  final String note;
  final bool drop;

  @override
  Widget build(BuildContext context) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 12,
        children: [
          Container(
            width: 16,
            height: 16,
            margin: const EdgeInsets.only(top: 4),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: drop ? CarrierColors.brand : Colors.white,
              border: Border.all(color: CarrierColors.brand, width: 4),
            ),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 4,
              children: [
                Text(title, style: cs(14, Weight.bold, CarrierColors.ink)),
                Text(
                  note,
                  style: cs(12, Weight.regular, CarrierColors.muted),
                ),
              ],
            ),
          ),
        ],
      );
}

class _FareBreak extends StatelessWidget {
  const _FareBreak(this.order);
  final CarrierOrder order;

  @override
  Widget build(BuildContext context) => Row(
        spacing: 8,
        children: [
          for (final (label, value) in [
            ('기본 운임', order.base),
            ('등급 프리미엄', order.premium),
            ('대기 보상', order.wait),
          ])
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: 4,
                children: [
                  Text(
                    label,
                    style: cs(12, Weight.regular, CarrierColors.muted),
                  ),
                  Text(
                    won(value),
                    style: cs(
                      14,
                      Weight.bold,
                      CarrierColors.ink,
                      tabular: true,
                    ),
                  ),
                ],
              ),
            ),
        ],
      );
}
