import 'package:dotted_border/dotted_border.dart';
import 'package:flutter/material.dart';

import '../data/models.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'login_screen.dart' show inputDecoration;

class ReviewScreen extends StatefulWidget {
  const ReviewScreen({super.key});

  @override
  State<ReviewScreen> createState() => _ReviewScreenState();
}

class _ReviewScreenState extends State<ReviewScreen> {
  static const _ratingLabels = ['아쉬워요', '조금 아쉬워요', '보통이에요', '좋아요', '아주 좋아요'];
  static const _praises = [
    '분류가 깔끔해요',
    '약속한 양과 같아요',
    '통과증과 일치해요',
    '포장이 꼼꼼해요',
    '연락이 빨라요',
  ];

  String _gradeMatch = '같아요';
  int _sellerRating = 5;
  int _driverRating = 4;
  final Set<String> _selectedPraises = {
    '분류가 깔끔해요',
    '약속한 양과 같아요',
    '통과증과 일치해요',
  };

  void _togglePraise(String praise) => setState(() {
        if (!_selectedPraises.remove(praise)) _selectedPraises.add(praise);
      });

  void _submit() {
    showToast(context, '입고를 확정하고 후기를 남겼어요');
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Column(
          children: [
            Expanded(
              child: PageBody(
                spacing: 22,
                children: [
                  const TopBar('입고 확인·후기'),
                  const _DealSummary(),
                  _inspection(),
                  _Titled('판매자는 어땠나요?', _sellerReview()),
                  _Titled('운송은 어땠나요?', _driverReview()),
                  _Titled(
                    '후기 (선택)',
                    SizedBox(
                      height: 96,
                      child: TextField(
                        expands: true,
                        maxLines: null,
                        textAlignVertical: TextAlignVertical.top,
                        style: ts(14, Weight.regular, AppColors.ink),
                        cursorColor: AppColors.green,
                        decoration: inputDecoration(
                          '다른 구매 기업에게 도움이 될 이야기를 남겨 주세요',
                          14,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            BottomBar(
              child: AppButton('입고 확정하고 후기 남기기', onTap: _submit),
            ),
          ],
        ),
      );

  Widget _inspection() => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 10,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            spacing: 2,
            children: [
              Text('입고 검수', style: ts(16, Weight.bold, AppColors.ink)),
              Text(
                '받은 마대를 통과증과 비교해 주세요. 결과는 정산과 판매자 신뢰도에 반영돼요.',
                style: ts(12, Weight.regular, AppColors.body),
              ),
            ],
          ),
          AppCard(
            padding: const EdgeInsets.all(16),
            radius: 16,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 14,
              children: [
                const InfoRow('통과증 무게', '[무게] kg'),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      '받은 무게',
                      style: ts(14, Weight.regular, AppColors.body),
                    ),
                    Box(
                      height: 40,
                      color: Colors.white,
                      radius: 10,
                      borderColor: AppColors.borderInput,
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        spacing: 6,
                        children: [
                          Text(
                            '[무게]',
                            style: ts(14, Weight.medium, AppColors.ink),
                          ),
                          Text(
                            'kg',
                            style: ts(13, Weight.regular, AppColors.body),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const HairLine(),
                Text(
                  '등급이 통과증과 같나요?',
                  style: ts(14, Weight.medium, AppColors.ink),
                ),
                Row(
                  spacing: 8,
                  children: [
                    for (final option in const ['같아요', '낮아요', '높아요'])
                      Expanded(child: _gradeOption(option)),
                  ],
                ),
                Row(
                  spacing: 8,
                  children: [
                    const _PhotoSlot(),
                    const _PhotoSlot(),
                    DottedBorder(
                      options: const RoundedRectDottedBorderOptions(
                        radius: Radius.circular(12),
                        color: AppColors.borderInput,
                        strokeWidth: 1.5,
                        dashPattern: [4, 3],
                        padding: EdgeInsets.zero,
                      ),
                      child: SizedBox.square(
                        dimension: 64,
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          spacing: 2,
                          children: [
                            const Ic('plus_gray'),
                            Text(
                              '2/5',
                              style: ts(11, Weight.regular, AppColors.body),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      );

  Widget _gradeOption(String option) {
    final selected = option == _gradeMatch;
    return Tap(
      onTap: () => setState(() => _gradeMatch = option),
      child: Box(
        height: 44,
        color: selected ? AppColors.surfaceMint : Colors.white,
        radius: 12,
        borderColor: selected ? AppColors.green : AppColors.borderStrong,
        borderWidth: selected ? 2 : 1.5,
        alignment: Alignment.center,
        child: Text(
          option,
          style: selected
              ? ts(14, Weight.bold, AppColors.green)
              : ts(14, Weight.medium, AppColors.inkMuted),
        ),
      ),
    );
  }

  Widget _sellerReview() => AppCard(
        padding: const EdgeInsets.all(16),
        radius: 16,
        child: Column(
          spacing: 14,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              spacing: 4,
              children: [
                for (var star = 1; star <= 5; star++)
                  Tap(
                    onTap: () => setState(() => _sellerRating = star),
                    child: Ic(
                      'star_large',
                      color: star <= _sellerRating
                          ? null
                          : AppColors.borderStrong,
                    ),
                  ),
              ],
            ),
            Text(
              _ratingLabels[_sellerRating - 1],
              textAlign: TextAlign.center,
              style: ts(14, Weight.bold, AppColors.green),
            ),
            SizedBox(
              width: double.infinity,
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final praise in _praises)
                    _PraiseChip(
                      praise,
                      selected: _selectedPraises.contains(praise),
                      onTap: () => _togglePraise(praise),
                    ),
                ],
              ),
            ),
          ],
        ),
      );

  Widget _driverReview() => AppCard(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        radius: 16,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 2,
              children: [
                Text(
                  '운송기사 [이름]',
                  style: ts(14, Weight.medium, AppColors.ink),
                ),
                Text(
                  '[날짜] 수거 · 약속 시간 도착',
                  style: ts(12, Weight.regular, AppColors.body),
                ),
              ],
            ),
            Row(
              spacing: 4,
              children: [
                for (var star = 1; star <= 5; star++)
                  Tap(
                    onTap: () => setState(() => _driverRating = star),
                    child: Ic(
                      star <= _driverRating
                          ? 'star_small_on'
                          : 'star_small_off',
                    ),
                  ),
              ],
            ),
          ],
        ),
      );
}

class _DealSummary extends StatelessWidget {
  const _DealSummary();

  @override
  Widget build(BuildContext context) => AppCard(
        padding: const EdgeInsets.all(14),
        radius: 16,
        child: Row(
          spacing: 12,
          children: [
            const GradeBadge(Grade.a),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: 3,
                children: [
                  Text('골판지', style: ts(15, Weight.bold, AppColors.ink)),
                  Text(
                    '판매자 [회사명] · [날짜] 도착',
                    style: ts(12, Weight.regular, AppColors.body),
                  ),
                ],
              ),
            ),
            const StatusTag('도착 완료'),
          ],
        ),
      );
}

class _Titled extends StatelessWidget {
  const _Titled(this.title, this.child);
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 10,
        children: [
          Text(title, style: ts(16, Weight.bold, AppColors.ink)),
          child,
        ],
      );
}

class _PhotoSlot extends StatelessWidget {
  const _PhotoSlot();

  @override
  Widget build(BuildContext context) => const Box(
        width: 64,
        height: 64,
        color: AppColors.surfacePhoto,
        radius: 12,
        alignment: Alignment.center,
        child: Ic('photo_small'),
      );
}

class _PraiseChip extends StatelessWidget {
  const _PraiseChip(this.label, {required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Tap(
        onTap: onTap,
        child: Box(
          height: 34,
          color: selected ? AppColors.surfaceMint : Colors.white,
          radius: 17,
          borderColor: selected ? AppColors.green : AppColors.borderStrong,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            spacing: 4,
            children: [
              if (selected) const Ic('check_chip'),
              Text(
                label,
                style: selected
                    ? ts(13, Weight.bold, AppColors.green)
                    : ts(13, Weight.medium, AppColors.inkMuted),
              ),
            ],
          ),
        ),
      );
}
