import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';
import '../../widgets/common.dart';
import '../carrier_data.dart';
import '../carrier_theme.dart';
import '../carrier_widgets.dart';

class CarrierEarnScreen extends StatelessWidget {
  const CarrierEarnScreen(this.state, {super.key});
  final CarrierState state;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          CarrierAppBar(
            title: Align(
              alignment: Alignment.centerLeft,
              child: Text('정산', style: cs(20, Weight.bold, Colors.white)),
            ),
            body: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  won(state.live ? state.settledTotal : weekTotal),
                  style: cs(28, Weight.bold, Colors.white, tabular: true),
                ),
                Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  spacing: 4,
                  children: [
                    Opacity(
                      opacity: 0.82,
                      child: Text(
                        state.live ? '정산 완료 합계' : '10.28 ~ 11.03 수입',
                        style: cs(12, Weight.regular, Colors.white),
                      ),
                    ),
                    Text(
                      state.live
                          ? '완료 ${state.settledCount}건 · 진행 ${state.runningCount}건'
                          : '운행 7건 · 묶음 3건',
                      style: cs(12, Weight.medium, Colors.white),
                    ),
                  ],
                ),
              ],
            ),
          ),
          CarrierScroll(
            children: [
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
                            state.live ? '정산 예정' : '다음 정산 · 11.06 (금) 입금',
                            style: cs(12, Weight.medium, CarrierColors.muted),
                          ),
                          Text(
                            won(state.live ? state.runningTotal : pendingTotal),
                            style: cs(
                              20,
                              Weight.bold,
                              CarrierColors.ink,
                              tabular: true,
                            ),
                          ),
                          Text(
                            state.live
                                ? '구매자 입고 검사 후 정산돼요'
                                : '세금계산서 자동 발행 · 수수료 0원',
                            style: cs(12, Weight.regular, CarrierColors.muted),
                          ),
                        ],
                      ),
                      if (!state.live) CButton(
                        '내역',
                        line: true,
                        onTap: () =>
                            showToast(context, '세금계산서 내역을 엽니다 (시연)'),
                      ),
                    ],
                  ),
                ],
              ),
              if (!state.live) CCard(
                color: CarrierColors.accent,
                children: [
                  Opacity(
                    opacity: 0.86,
                    child: Text(
                      '주유 쿠폰',
                      style: cs(12, Weight.medium, CarrierColors.onAccent),
                    ),
                  ),
                  Text(
                    '이번 주 묶음 운행 3건 달성 · 15,000원 지급',
                    style: cs(14, Weight.bold, CarrierColors.onAccent),
                  ),
                ],
              ),
              CCard(
                children: [
                  Text(
                    '운행 내역',
                    style: cs(16, Weight.bold, CarrierColors.ink),
                  ),
                  ListRows(
                    rows: [
                      for (final row in state.live ? state.liveLedger : ledger)
                        _LedgerRow(row),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ],
      );
}

class _LedgerRow extends StatelessWidget {
  const _LedgerRow(this.row);
  final Ledger row;

  @override
  Widget build(BuildContext context) => Row(
        spacing: 12,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 4,
              children: [
                Row(
                  spacing: 4,
                  children: [
                    Flexible(
                      child: Text(
                        row.name,
                        style: cs(14, Weight.bold, CarrierColors.ink),
                      ),
                    ),
                    if (row.bundle)
                      const CTag(
                        '묶음',
                        background: CarrierColors.accent,
                        foreground: CarrierColors.onAccent,
                      ),
                  ],
                ),
                Text(
                  row.date,
                  style: cs(12, Weight.regular, CarrierColors.muted),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            spacing: 4,
            children: [
              Text(
                won(row.value),
                style: cs(14, Weight.bold, CarrierColors.ink, tabular: true),
              ),
              Text(
                row.status,
                style: cs(
                  12,
                  Weight.regular,
                  row.status == '정산 예정'
                      ? CarrierColors.warn
                      : CarrierColors.muted,
                ),
              ),
            ],
          ),
        ],
      );
}
