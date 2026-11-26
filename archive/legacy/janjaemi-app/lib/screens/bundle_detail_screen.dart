import 'package:flutter/material.dart';

import '../data/models.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'purchase_request_screen.dart';

class BundleDetailScreen extends StatelessWidget {
  const BundleDetailScreen({super.key});

  static const _reasons = [
    '설정하신 관심 품목·등급(알루미늄 칩 B등급 이상)과 일치해요.',
    '세 기업이 가까이 있어 트럭 한 대로 한 번에 수거할 수 있어요.',
    '세 기업 물량을 합치면 최소 구매량을 넘어요.',
  ];

  static const _companies = [
    (Grade.b, '대전 대덕구'),
    (Grade.a, '대전 대덕구'),
    (Grade.b, '대전 유성구'),
  ];

  @override
  Widget build(BuildContext context) {
    final savingStyle = ts(14, Weight.bold, AppColors.green);
    return Scaffold(
      body: Column(
        children: [
          Expanded(
            child: PageBody(
              children: [
                const TopBar('AI 추천 묶음'),
                const _Summary(),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: 10,
                  children: [
                    const SectionTitle('AI가 이 묶음을 추천한 이유'),
                    for (final reason in _reasons) _Reason(reason),
                  ],
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: 8,
                  children: [
                    const SectionTitle('참여 기업'),
                    for (final (grade, region) in _companies)
                      AppCard(
                        child: Row(
                          spacing: 12,
                          children: [
                            GradeBadge(grade, size: 40),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                spacing: 2,
                                children: [
                                  Text(
                                    '[회사명]',
                                    style: ts(14, Weight.bold, AppColors.ink),
                                  ),
                                  Text(
                                    '$region · 마대 [N]개',
                                    style: ts(
                                      12,
                                      Weight.regular,
                                      AppColors.body,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Text(
                              '[무게] kg',
                              style: ts(14, Weight.bold, AppColors.ink),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
                Box(
                  width: double.infinity,
                  color: AppColors.surfaceMint,
                  radius: 16,
                  borderColor: AppColors.borderMint,
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    spacing: 10,
                    children: [
                      Text('개별 구매 대비', style: savingStyle),
                      InfoRow(
                        '예상 운송비',
                        '[금액]원 절감',
                        valueStyle: savingStyle,
                      ),
                      InfoRow(
                        '탄소 감축',
                        '[값] kgCO₂e',
                        valueStyle: savingStyle,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          BottomBar(
            child: AppButton(
              '이 묶음으로 구매 요청하기',
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => const PurchaseRequestScreen(),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary();

  @override
  Widget build(BuildContext context) => Box(
        width: double.infinity,
        color: AppColors.green,
        radius: 20,
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          spacing: 14,
          children: [
            Row(
              spacing: 6,
              children: [
                const Ic('sparkle_16'),
                Text(
                  'AI 추천 공동판매 묶음',
                  style: ts(13, Weight.bold, AppColors.gold),
                ),
              ],
            ),
            Text(
              '알루미늄 칩 B등급\n3개 기업 묶음',
              style: ts(
                20,
                Weight.bold,
                AppColors.cream,
                lineHeight: 28,
                spacing: -0.3,
              ),
            ),
            const Row(
              spacing: 8,
              children: [
                Expanded(child: _Figure('합계', '[무게] kg')),
                Expanded(child: _Figure('참여 기업', '3곳')),
                Expanded(child: _Figure('평균 거리', '[거리] km')),
              ],
            ),
            Column(
              spacing: 6,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      '최소 구매량 [무게] kg',
                      style: ts(12, Weight.regular, AppColors.mint),
                    ),
                    Text(
                      '충족',
                      style: ts(12, Weight.bold, AppColors.gold),
                    ),
                  ],
                ),
                Box(
                  width: double.infinity,
                  height: 6,
                  color: AppColors.gold,
                  radius: 3,
                ),
              ],
            ),
          ],
        ),
      );
}

class _Figure extends StatelessWidget {
  const _Figure(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 2,
        children: [
          Text(label, style: ts(12, Weight.regular, AppColors.mint)),
          Text(value, style: ts(16, Weight.bold, AppColors.cream)),
        ],
      );
}

class _Reason extends StatelessWidget {
  const _Reason(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 10,
        children: [
          const Box(
            width: 20,
            height: 20,
            color: AppColors.surfaceMint,
            radius: 10,
            alignment: Alignment.center,
            child: Ic('check_reason'),
          ),
          Expanded(
            child: Text(
              text,
              style: ts(14, Weight.regular, AppColors.ink, lineHeight: 21),
            ),
          ),
        ],
      );
}
