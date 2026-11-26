import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../data/models.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'listing_detail_screen.dart';
import 'review_screen.dart';

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  bool _showDone = false;

  void _open(Widget screen) => Navigator.of(context)
      .push(MaterialPageRoute(builder: (_) => screen));

  @override
  Widget build(BuildContext context) => api.loggedIn
      ? const _LiveHistory()
      : PageBody(
        children: [
          Text(
            '거래내역',
            style: ts(24, Weight.bold, AppColors.ink, spacing: -0.4),
          ),
          _StatusTabs(
            showDone: _showDone,
            onChanged: (value) => setState(() => _showDone = value),
          ),
          if (!_showDone) ...[
            const _ShippingCard(),
            AppCard(
              padding: const EdgeInsets.all(16),
              radius: 16,
              child: _DealHeader(
                ppScrap,
                trailing: const StatusTag(
                  '계약 대기',
                  background: AppColors.surfaceGray,
                  foreground: AppColors.body,
                ),
              ),
            ),
          ],
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            spacing: 10,
            children: [
              const SectionTitle('지난 거래'),
              _PastDeal(
                copper,
                action: '통과증 보기',
                onTap: () => _open(const ListingDetailScreen(listing: copper)),
              ),
              _PastDeal(
                cardboard,
                action: '후기 쓰기',
                onTap: () => _open(const ReviewScreen()),
              ),
            ],
          ),
        ],
      );
}

class _StatusTabs extends StatelessWidget {
  const _StatusTabs({
    required this.showDone,
    required this.onChanged,
    this.activeCount = 2,
  });
  final int activeCount;
  final bool showDone;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) => Box(
        height: 44,
        color: AppColors.surfaceGray,
        radius: 12,
        padding: const EdgeInsets.all(4),
        child: Row(
          children: [
            _tab('진행 중 $activeCount', !showDone, () => onChanged(false)),
            _tab('완료', showDone, () => onChanged(true)),
          ],
        ),
      );

  Widget _tab(String label, bool selected, VoidCallback onTap) => Expanded(
        child: Tap(
          onTap: onTap,
          child: Box(
            color: selected ? Colors.white : null,
            radius: 10,
            alignment: Alignment.center,
            child: Text(
              label,
              style: selected
                  ? ts(14, Weight.bold, AppColors.ink)
                  : ts(14, Weight.medium, AppColors.body),
            ),
          ),
        ),
      );
}

class _DealHeader extends StatelessWidget {
  const _DealHeader(this.listing, {required this.trailing});
  final Listing listing;
  final Widget trailing;

  @override
  Widget build(BuildContext context) => Row(
        spacing: 12,
        children: [
          GradeBadge(listing.grade),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 3,
              children: [
                Text(
                  listing.name,
                  style: ts(15, Weight.bold, AppColors.ink),
                ),
                Text(
                  '판매자 [회사명] · [무게] kg',
                  style: ts(12, Weight.regular, AppColors.body),
                ),
              ],
            ),
          ),
          trailing,
        ],
      );
}

enum _Step { done, current, pending }

class _ShippingCard extends StatelessWidget {
  const _ShippingCard();

  static const _steps = [
    ('견적', _Step.done),
    ('계약', _Step.done),
    ('수거', _Step.done),
    ('배송 중', _Step.current),
    ('도착', _Step.pending),
  ];

  @override
  Widget build(BuildContext context) => AppCard(
        padding: const EdgeInsets.all(16),
        radius: 16,
        child: Column(
          spacing: 16,
          children: [
            const _DealHeader(
              aluminum,
              trailing: StatusTag(
                '배송 중',
                background: AppColors.statusShippingBg,
                foreground: AppColors.statusShippingText,
              ),
            ),
            Row(
              children: [
                for (final (label, step) in _steps)
                  Expanded(child: _StepMark(label, step)),
              ],
            ),
            Box(
              color: AppColors.surfaceSoft,
              radius: 12,
              padding: const EdgeInsets.all(12),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    spacing: 10,
                    children: [
                      const Box(
                        width: 32,
                        height: 32,
                        color: AppColors.green,
                        radius: 16,
                        alignment: Alignment.center,
                        child: Ic('truck_white'),
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        spacing: 1,
                        children: [
                          Text(
                            '운송기사 [이름]',
                            style: ts(13, Weight.medium, AppColors.ink),
                          ),
                          Text(
                            '도착 예정 [시간]',
                            style: ts(12, Weight.regular, AppColors.body),
                          ),
                        ],
                      ),
                    ],
                  ),
                  Tap(
                    onTap: () => showToast(context, '위치 보기는 아직 준비 중이에요'),
                    child: Text(
                      '위치 보기',
                      style: ts(13, Weight.bold, AppColors.green),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
}

class _StepMark extends StatelessWidget {
  const _StepMark(this.label, this.step);
  final String label;
  final _Step step;

  @override
  Widget build(BuildContext context) => Column(
        spacing: 6,
        children: [
          SizedBox.square(
            dimension: 14,
            child: OverflowBox(
              maxWidth: 22,
              maxHeight: 22,
              child: Ic(switch (step) {
                _Step.done => 'step_done',
                _Step.current => 'step_current',
                _Step.pending => 'step_pending',
              }),
            ),
          ),
          Text(
            label,
            style: switch (step) {
              _Step.done => ts(11, Weight.regular, AppColors.ink),
              _Step.current => ts(11, Weight.bold, AppColors.ink),
              _Step.pending => ts(11, Weight.regular, AppColors.hint),
            },
          ),
        ],
      );
}

class _PastDeal extends StatelessWidget {
  const _PastDeal(this.listing, {required this.action, required this.onTap});
  final Listing listing;
  final String action;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Tap(
        onTap: onTap,
        child: AppCard(
          child: Row(
            spacing: 12,
            children: [
              GradeBadge(listing.grade),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: 3,
                  children: [
                    Text(
                      listing.name,
                      style: ts(15, Weight.bold, AppColors.ink),
                    ),
                    Text(
                      '[날짜] · [무게] kg · [금액]원',
                      style: ts(12, Weight.regular, AppColors.body),
                    ),
                  ],
                ),
              ),
              Text(action, style: ts(13, Weight.bold, AppColors.green)),
            ],
          ),
        ),
      );
}

const _doneStatuses = {'settled', 'rated', 'cancelled', 'returned'};
const _liveStepNames = ['결제', '배차', '수거', '도착', '정산'];

String _statusLabel(Object? status) => switch (status) {
      'payment_held' => '기사 배정 중',
      'dispatched' => '수거 대기',
      'picked_up' => '운송 중',
      'arrived' => '입고 검사 필요',
      'disputed' => '분쟁 검토 중',
      'settled' => '정산 완료',
      'rated' => '거래 완료',
      'cancelled' => '취소됨',
      'returned' => '반송',
      _ => '$status',
    };

/// 지금 단계 번호. [_liveStepNames]에서 이 번호 앞까지가 끝난 단계다.
int _stepIndex(Object? status) => switch (status) {
      'payment_held' => 1,
      'dispatched' => 2,
      'picked_up' => 3,
      'arrived' || 'disputed' => 4,
      _ => 5,
    };

class _LiveHistory extends StatefulWidget {
  const _LiveHistory();

  @override
  State<_LiveHistory> createState() => _LiveHistoryState();
}

class _LiveHistoryState extends State<_LiveHistory> {
  bool _showDone = false;

  void _changed() {
    if (mounted) setState(() {});
  }

  @override
  void initState() {
    super.initState();
    live.addListener(_changed);
  }

  @override
  void dispose() {
    live.removeListener(_changed);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final shown = live.orders
        .where((o) => _doneStatuses.contains(o['status']) == _showDone)
        .toList();
    final active =
        live.orders.where((o) => !_doneStatuses.contains(o['status'])).length;
    return PageBody(
      children: [
        Text(
          '거래내역',
          style: ts(24, Weight.bold, AppColors.ink, spacing: -0.4),
        ),
        _StatusTabs(
          showDone: _showDone,
          activeCount: active,
          onChanged: (value) => setState(() => _showDone = value),
        ),
        for (final order in shown) _LiveOrderCard(order),
        if (shown.isEmpty)
          Text(
            _showDone ? '끝난 거래가 없어요' : '진행 중인 거래가 없어요',
            style: ts(14, Weight.regular, AppColors.body),
          ),
      ],
    );
  }
}

class _LiveOrderCard extends StatelessWidget {
  const _LiveOrderCard(this.order);
  final Map<String, Object?> order;

  int get _id => order['id']! as int;

  Future<void> _cancel(BuildContext context) async {
    try {
      await api.post('/v1/orders/$_id/cancel');
      await live.refresh();
      if (context.mounted) showToast(context, '주문을 취소했어요');
    } on ApiException catch (error) {
      if (context.mounted) showToast(context, error.message);
    }
  }

  /// 수거 때 잰 무게를 그대로 검사 무게로 보낸다. 계량 입력은 아직 없다.
  Future<void> _inspect(BuildContext context) async {
    try {
      final detail =
          await api.get('/v1/orders/$_id') as Map<String, Object?>;
      final weights = detail['pickup_weights']! as List<Object?>;
      final total = weights.fold<double>(
        0,
        (sum, row) => sum + ((row! as Map)['kg'] as num).toDouble(),
      );
      if (!context.mounted) return;
      final passed = await showDialog<bool>(
        context: context,
        builder: (dialog) => AlertDialog(
          title: const Text('입고 검사'),
          content: Text(
            '수거 무게 ${total.toStringAsFixed(1)}kg (마대 ${weights.length}개)\n'
            '통과증과 맞으면 합격을 눌러 주세요.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialog).pop(false),
              child: const Text('불합격'),
            ),
            TextButton(
              onPressed: () => Navigator.of(dialog).pop(true),
              child: const Text('합격'),
            ),
          ],
        ),
      );
      if (passed == null) return;
      final result = await api.post('/v1/orders/$_id/inspect', {
        'bag_weights': weights,
        'passed': passed,
      }) as Map<String, Object?>;
      await live.refresh();
      if (!context.mounted) return;
      final money_ = result['settlement'] as Map<String, Object?>?;
      showToast(
        context,
        money_ == null
            ? '불합격 처리했어요. 운영자가 확인해요'
            : '정산 완료 · 판매자 ${money(money_['factory_krw']! as num)}원 · '
                '운임 ${money(money_['hauler_krw']! as num)}원 · '
                '환불 ${money(money_['refund_krw']! as num)}원',
      );
    } on ApiException catch (error) {
      if (context.mounted) showToast(context, error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = order['status'];
    final names = (order['counterparty_names'] as List<Object?>?) ?? const [];
    final step = _stepIndex(status);
    return AppCard(
      padding: const EdgeInsets.all(16),
      radius: 16,
      child: Column(
        spacing: 14,
        children: [
          Row(
            spacing: 12,
            children: [
              GradeBadge(gradeOf(order['grade'])),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: 3,
                  children: [
                    Text(
                      materialName(order),
                      style: ts(15, Weight.bold, AppColors.ink),
                    ),
                    Text(
                      '${names.join(' · ')} · '
                      '${money(order['total_kg']! as num)} kg · '
                      '${money(order['goods_krw']! as num)}원',
                      style: ts(12, Weight.regular, AppColors.body),
                    ),
                  ],
                ),
              ),
              StatusTag(_statusLabel(status)),
            ],
          ),
          if (!_doneStatuses.contains(status))
            Row(
              children: [
                for (final (index, label) in _liveStepNames.indexed)
                  Expanded(
                    child: _StepMark(
                      label,
                      index < step
                          ? _Step.done
                          : index == step
                              ? _Step.current
                              : _Step.pending,
                    ),
                  ),
              ],
            ),
          if (status == 'arrived')
            AppButton('입고 검사하기', onTap: () => _inspect(context)),
          if (status == 'payment_held')
            AppButton(
              '주문 취소',
              outlined: true,
              onTap: () => _cancel(context),
            ),
        ],
      ),
    );
  }
}
