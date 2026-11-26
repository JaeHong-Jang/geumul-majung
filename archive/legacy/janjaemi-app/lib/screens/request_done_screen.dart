import 'package:flutter/material.dart';

import '../data/models.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';

class RequestDoneScreen extends StatelessWidget {
  const RequestDoneScreen({super.key, this.isLive = false});

  /// 서버에 실제 주문한 경우. 지금 서버는 판매자 수락 없이 바로 기사 콜로 넘어간다.
  final bool isLive;
  static const _liveSteps = ['운송기사 배정', '수거·배송', '입고 검사', '정산'];

  static const _steps = ['판매자 수락', '운송기사 배정', '수거·배송', '입고 검수 후 정산'];

  void _finish(BuildContext context, int tab) {
    currentTab.value = tab;
    Navigator.of(context).popUntil((route) => route.isFirst);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Column(
          children: [
            Expanded(
              child: Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(20, 40, 20, 20),
                  child: Column(
                    spacing: 24,
                    children: [
                      const Box(
                        width: 88,
                        height: 88,
                        color: AppColors.green,
                        radius: 44,
                        alignment: Alignment.center,
                        child: Ic('check_done'),
                      ),
                      Column(
                        spacing: 8,
                        children: [
                          Text(
                            '구매 요청을 보냈어요',
                            textAlign: TextAlign.center,
                            style: ts(
                              24,
                              Weight.bold,
                              AppColors.ink,
                              spacing: -0.4,
                            ),
                          ),
                          Text(
                            isLive
                                ? '운송기사에게 콜이 전달됐어요.\n'
                                    '진행 상황은 거래내역에서 볼 수 있어요.'
                                : '판매자가 요청을 수락하면 알림으로 알려드릴게요.\n'
                                    '보통 [시간] 안에 답을 받아요.',
                            textAlign: TextAlign.center,
                            style: ts(
                              14,
                              Weight.regular,
                              AppColors.body,
                              lineHeight: 21,
                            ),
                          ),
                        ],
                      ),
                      AppCard(
                        padding: const EdgeInsets.all(18),
                        radius: 16,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          spacing: 14,
                          children: [
                            Text(
                              '다음 단계',
                              style: ts(15, Weight.bold, AppColors.ink),
                            ),
                            for (final (index, step)
                                in (isLive ? _liveSteps : _steps).indexed)
                              _NextStep(index + 1, step, active: index == 0),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            BottomBar(
              child: Column(
                spacing: 8,
                children: [
                  AppButton(
                    '거래내역 보기',
                    onTap: () => _finish(context, AppTab.history),
                  ),
                  AppButton(
                    '홈으로',
                    outlined: true,
                    onTap: () => _finish(context, AppTab.home),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
}

class _NextStep extends StatelessWidget {
  const _NextStep(this.number, this.label, {required this.active});
  final int number;
  final String label;
  final bool active;

  @override
  Widget build(BuildContext context) => Row(
        spacing: 12,
        children: [
          Box(
            width: 24,
            height: 24,
            color: active ? AppColors.gold : AppColors.surfaceGray,
            radius: 12,
            alignment: Alignment.center,
            child: Text(
              '$number',
              style: ts(
                12,
                Weight.bold,
                active ? AppColors.ink : AppColors.body,
              ),
            ),
          ),
          Text(
            label,
            style: active
                ? ts(14, Weight.bold, AppColors.ink)
                : ts(14, Weight.regular, AppColors.body),
          ),
        ],
      );
}
