import 'package:flutter/material.dart';

import '../data/models.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';

enum _Trend {
  up('▲', AppColors.priceUp),
  down('▼', AppColors.priceDown),
  flat('—', AppColors.body);

  const _Trend(this.mark, this.color);
  final String mark;
  final Color color;
}

class MarketScreen extends StatefulWidget {
  const MarketScreen({super.key});

  @override
  State<MarketScreen> createState() => _MarketScreenState();
}

class _MarketScreenState extends State<MarketScreen> {
  static const _rows = [
    ('철 스크랩', '국내 철스크랩 시세', 'mini_iron', _Trend.up),
    ('알루미늄 스크랩·칩', '조달청·LME', 'mini_aluminum', _Trend.up),
    ('구리 스크랩', '국내 동스크랩 시세·LME', 'mini_copper', _Trend.down),
    ('PP', '재활용가능자원 가격조사', 'mini_pp', _Trend.flat),
    ('PE', '재활용가능자원 가격조사', 'mini_pe', _Trend.up),
    ('골판지', '잔재미 자체 조사', 'mini_cardboard', _Trend.flat),
  ];

  Category _category = Category.metal;
  String _period = '3개월';

  @override
  Widget build(BuildContext context) => Scaffold(
        body: PageBody(
          spacing: 18,
          bottom: 34,
          children: [
            const TopBar('시세'),
            CategoryChips(
              selected: _category,
              onChanged: (value) => setState(() => _category = value),
            ),
            AppCard(
              padding: const EdgeInsets.all(16),
              radius: 18,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: 12,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        spacing: 2,
                        children: [
                          Text(
                            '알루미늄 스크랩·칩',
                            style: ts(13, Weight.medium, AppColors.body),
                          ),
                          const PriceText(size: 24, unitSize: 13),
                        ],
                      ),
                      const StatusTag(
                        '지난달 대비 [±%]',
                        horizontal: 7,
                        vertical: 3,
                        size: 11,
                      ),
                    ],
                  ),
                  _PeriodTabs(
                    selected: _period,
                    onChanged: (value) => setState(() => _period = value),
                  ),
                  const SizedBox(
                    height: 140,
                    child: OverflowBox(
                      alignment: Alignment.centerLeft,
                      maxWidth: 321,
                      child: Ic('chart_main'),
                    ),
                  ),
                  Text(
                    '출처: 조달청 비축물자·LME 국제가격 · 그래프는 예시',
                    style: ts(11, Weight.regular, AppColors.hint),
                  ),
                ],
              ),
            ),
            const AiNote(
              title: 'AI 구매 타이밍',
              message: '최근 [N]주 동안 오름세예요. 필요한 물량이 있다면 이번 주 안에 '
                  '확보하는 편이 유리할 수 있어요.',
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '품목별 시세',
                  style: ts(17, Weight.bold, AppColors.ink),
                ),
                Text(
                  '원/kg · [날짜] 기준',
                  style: ts(12, Weight.regular, AppColors.body),
                ),
              ],
            ),
            AppCard(
              padding: EdgeInsets.zero,
              radius: 16,
              child: Column(
                children: [
                  for (final (index, row) in _rows.indexed)
                    _MarketRow(row, showDivider: index < _rows.length - 1),
                ],
              ),
            ),
          ],
        ),
      );
}

class _PeriodTabs extends StatelessWidget {
  const _PeriodTabs({required this.selected, required this.onChanged});
  final String selected;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) => Box(
        height: 36,
        color: AppColors.surfaceGray,
        radius: 10,
        padding: const EdgeInsets.all(3),
        child: Row(
          children: [
            for (final period in const ['1개월', '3개월', '1년'])
              Expanded(
                child: Tap(
                  onTap: () => onChanged(period),
                  child: Box(
                    color: period == selected ? Colors.white : null,
                    radius: 8,
                    alignment: Alignment.center,
                    child: Text(
                      period,
                      style: period == selected
                          ? ts(13, Weight.bold, AppColors.ink)
                          : ts(13, Weight.medium, AppColors.body),
                    ),
                  ),
                ),
              ),
          ],
        ),
      );
}

class _MarketRow extends StatelessWidget {
  const _MarketRow(this.row, {required this.showDivider});
  final (String, String, String, _Trend) row;
  final bool showDivider;

  @override
  Widget build(BuildContext context) {
    final (name, source, chart, trend) = row;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        border: showDivider
            ? const Border(bottom: BorderSide(color: AppColors.border))
            : null,
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 2,
              children: [
                Text(name, style: ts(15, Weight.bold, AppColors.ink)),
                Text(source, style: ts(11, Weight.regular, AppColors.hint)),
              ],
            ),
          ),
          Ic(chart),
          SizedBox(
            width: 76,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              spacing: 2,
              children: [
                Text('[가격]', style: ts(15, Weight.bold, AppColors.ink)),
                Text(
                  '${trend.mark} [±%]',
                  style: ts(11, Weight.medium, trend.color),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
