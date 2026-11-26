import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../data/models.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'login_screen.dart' show inputDecoration;
import 'request_done_screen.dart';

class PurchaseRequestScreen extends StatefulWidget {
  const PurchaseRequestScreen({super.key, this.listing = aluminum});
  final Listing listing;

  @override
  State<PurchaseRequestScreen> createState() => _PurchaseRequestScreenState();
}

class _PurchaseRequestScreenState extends State<PurchaseRequestScreen> {
  /// 사용자가 바꾸기 전까지는 디자인의 `[N]` 자리 표시자를 보여 준다.
  int? _quantity;
  bool _buyAll = false;
  bool _matchedTransport = true;
  bool _escrow = true;
  bool _agreed = true;
  final _freightCap = TextEditingController(text: '80000');
  bool _busy = false;

  @override
  void dispose() {
    _freightCap.dispose();
    super.dispose();
  }

  int get _cap => int.tryParse(_freightCap.text.replaceAll(',', '').trim()) ?? 0;

  Future<void> _submit() async {
    setState(() => _busy = true);
    try {
      await api.post('/v1/orders', {
        'listing_id': widget.listing.id,
        'freight_cap_krw': _cap,
      });
    } on ApiException catch (error) {
      if (mounted) {
        setState(() => _busy = false);
        showToast(context, error.message);
      }
      return;
    }
    cart.remove(widget.listing);
    await live.refresh();
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const RequestDoneScreen(isLive: true)),
    );
  }

  /// 서버는 매물 전체를 한 번에 주문하고, 대금·운임을 앱에서 보류한다.
  Widget _liveBuild() {
    final listing = widget.listing;
    final goods = listing.totalKg! * listing.price!;
    final held = (goods * 1.05).round() + _cap;
    return Scaffold(
      body: Column(
        children: [
          Expanded(
            child: PageBody(
              children: [
                const TopBar('구매 요청'),
                _ListingSummary(listing),
                _Section(
                  '구매 수량',
                  AppCard(
                    padding: const EdgeInsets.all(16),
                    radius: 16,
                    child: InfoRow(
                      '마대 ${listing.bagCount}개 전체',
                      '${listing.weightLabel} kg',
                    ),
                  ),
                ),
                _Section(
                  '배송지',
                  AppCard(
                    padding: const EdgeInsets.all(16),
                    radius: 16,
                    child: Text(
                      api.companyName,
                      style: ts(14, Weight.medium, AppColors.ink),
                    ),
                  ),
                ),
                _Section(
                  '운임 상한',
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    spacing: 6,
                    children: [
                      SizedBox(
                        height: 50,
                        child: TextField(
                          controller: _freightCap,
                          keyboardType: TextInputType.number,
                          onChanged: (_) => setState(() {}),
                          style: ts(15, Weight.regular, AppColors.ink),
                          cursorColor: AppColors.green,
                          decoration: inputDecoration('예) 80000', 14),
                        ),
                      ),
                      Text(
                        '기사는 이 금액 안에서 콜을 받아요. 남은 금액은 정산 때 돌려받아요.',
                        style: ts(12, Weight.regular, AppColors.body),
                      ),
                    ],
                  ),
                ),
                AppCard(
                  padding: const EdgeInsets.all(16),
                  radius: 16,
                  child: Column(
                    spacing: 10,
                    children: [
                      InfoRow('원료비', '${money(goods)}원'),
                      InfoRow('무게 오차 여유 (5%)', '${money(held - _cap - goods)}원'),
                      InfoRow('운임 상한', '${money(_cap)}원'),
                      const HairLine(),
                      InfoRow(
                        '결제 보류 금액',
                        '${money(held)}원',
                        valueStyle: ts(18, Weight.bold, AppColors.green),
                      ),
                    ],
                  ),
                ),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: 10,
                  children: [
                    AppCheckbox(
                      checked: _agreed,
                      onTap: () => setState(() => _agreed = !_agreed),
                    ),
                    Expanded(
                      child: Text(
                        '입고 검수 결과가 통과증과 다르면 정산 금액을 조정하는 데 동의해요.',
                        style: ts(
                          13,
                          Weight.regular,
                          AppColors.ink,
                          lineHeight: 19.5,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          BottomBar(
            child: AppButton(
              _busy ? '보내는 중…' : '구매 요청 보내기',
              onTap: _agreed && _cap > 0 && !_busy ? _submit : null,
            ),
          ),
        ],
      ),
    );
  }

  String get _quantityLabel => _quantity?.toString() ?? '[N]';

  void _changeQuantity(int delta) => setState(() {
        final current = _quantity ?? 1;
        _quantity = (current + delta).clamp(1, 999);
      });

  @override
  Widget build(BuildContext context) => widget.listing.isLive
      ? _liveBuild()
      : Scaffold(
        body: Column(
          children: [
            Expanded(
              child: PageBody(
                children: [
                  const TopBar('구매 요청'),
                  _ListingSummary(widget.listing),
                  _Section('구매 수량', _quantityCard()),
                  _Section('수거·배송', _deliveryCard()),
                  _Section(
                    '운송 방식',
                    Column(
                      spacing: 10,
                      children: [
                        _Option(
                          title: '잔재미 운송 매칭',
                          description: '가까운 운송기사를 자동으로 배정해요 · 예상 [금액]원',
                          tag: '추천',
                          selected: _matchedTransport,
                          onTap: () =>
                              setState(() => _matchedTransport = true),
                        ),
                        _Option(
                          title: '직접 수거',
                          description: '구매 기업이 판매자 공장에서 직접 가져가요',
                          selected: !_matchedTransport,
                          onTap: () =>
                              setState(() => _matchedTransport = false),
                        ),
                      ],
                    ),
                  ),
                  _Section(
                    '결제 방식',
                    Column(
                      spacing: 10,
                      children: [
                        _Option(
                          title: '안전결제 (에스크로)',
                          description: '입고 검수가 끝난 뒤 판매자에게 정산돼요',
                          selected: _escrow,
                          onTap: () => setState(() => _escrow = true),
                        ),
                        _Option(
                          title: '세금계산서 발행 후 계좌이체',
                          description: '판매자와 직접 정산해요',
                          selected: !_escrow,
                          onTap: () => setState(() => _escrow = false),
                        ),
                      ],
                    ),
                  ),
                  _Section(
                    '판매자에게 남길 말 (선택)',
                    SizedBox(
                      height: 84,
                      child: TextField(
                        expands: true,
                        maxLines: null,
                        textAlignVertical: TextAlignVertical.top,
                        style: ts(14, Weight.regular, AppColors.ink),
                        cursorColor: AppColors.green,
                        decoration:
                            inputDecoration('예) 수거 전에 연락 부탁드려요', 14),
                      ),
                    ),
                  ),
                  const AppCard(
                    padding: EdgeInsets.all(16),
                    radius: 16,
                    child: _PaymentSummary(),
                  ),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    spacing: 10,
                    children: [
                      AppCheckbox(
                        checked: _agreed,
                        onTap: () => setState(() => _agreed = !_agreed),
                      ),
                      Expanded(
                        child: Text(
                          '입고 검수 결과가 통과증과 다르면 정산 금액을 조정하는 데 동의해요.',
                          style: ts(
                            13,
                            Weight.regular,
                            AppColors.ink,
                            lineHeight: 19.5,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            BottomBar(
              child: AppButton(
                '구매 요청 보내기',
                onTap: _agreed
                    ? () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => const RequestDoneScreen(),
                          ),
                        )
                    : null,
              ),
            ),
          ],
        ),
      );

  Widget _quantityCard() => AppCard(
        padding: const EdgeInsets.all(16),
        radius: 16,
        child: Column(
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
                      '마대 $_quantityLabel개',
                      style: ts(18, Weight.bold, AppColors.ink),
                    ),
                    Text(
                      '약 [무게] kg',
                      style: ts(13, Weight.regular, AppColors.body),
                    ),
                  ],
                ),
                Box(
                  height: 40,
                  radius: 12,
                  borderColor: AppColors.borderStrong,
                  child: Row(
                    children: [
                      Tap(
                        onTap: () => _changeQuantity(-1),
                        child: const SizedBox.square(
                          dimension: 40,
                          child: Center(child: Ic('minus')),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 10),
                        child: Text(
                          _quantityLabel,
                          style: ts(15, Weight.bold, AppColors.ink),
                        ),
                      ),
                      Tap(
                        onTap: () => _changeQuantity(1),
                        child: const SizedBox.square(
                          dimension: 40,
                          child: Center(child: Ic('plus_dark')),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const HairLine(),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '남은 수량 전부 구매 (마대 [N]개)',
                  style: ts(13, Weight.regular, AppColors.body),
                ),
                Tap(
                  onTap: () => setState(() => _buyAll = !_buyAll),
                  child: _buyAll ? const _SwitchOn() : const Ic('switch_off'),
                ),
              ],
            ),
          ],
        ),
      );

  Widget _deliveryCard() => AppCard(
        padding: const EdgeInsets.all(16),
        radius: 16,
        child: Column(
          spacing: 12,
          children: [
            const InfoRow('희망 도착일', '[날짜] ▾'),
            const HairLine(),
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    spacing: 2,
                    children: [
                      Text(
                        '배송지',
                        style: ts(14, Weight.regular, AppColors.body),
                      ),
                      Text(
                        '[회사명] 공장 · [주소]',
                        style: ts(14, Weight.medium, AppColors.ink),
                      ),
                    ],
                  ),
                ),
                Text('변경', style: ts(13, Weight.bold, AppColors.green)),
              ],
            ),
          ],
        ),
      );
}

class _ListingSummary extends StatelessWidget {
  const _ListingSummary(this.listing);
  final Listing listing;

  @override
  Widget build(BuildContext context) => AppCard(
        padding: const EdgeInsets.all(14),
        radius: 16,
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
                    '판매자 ${listing.sellerLabel} · ${listing.region}',
                    style: ts(12, Weight.regular, AppColors.body),
                  ),
                ],
              ),
            ),
            PriceText(unitWeight: Weight.bold, price: listing.price),
          ],
        ),
      );
}

class _Section extends StatelessWidget {
  const _Section(this.title, this.child);
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

class _Option extends StatelessWidget {
  const _Option({
    required this.title,
    required this.description,
    required this.selected,
    required this.onTap,
    this.tag,
  });

  final String title;
  final String description;
  final bool selected;
  final VoidCallback onTap;
  final String? tag;

  @override
  Widget build(BuildContext context) => Tap(
        onTap: onTap,
        child: Box(
          width: double.infinity,
          color: selected ? AppColors.surfaceMint : Colors.white,
          radius: 14,
          borderColor: selected ? AppColors.green : AppColors.borderStrong,
          borderWidth: selected ? 2 : 1.5,
          padding: const EdgeInsets.all(14),
          child: Row(
            spacing: 12,
            children: [
              if (selected) const Ic('radio_on') else const RadioOff(),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: 2,
                  children: [
                    Row(
                      spacing: 6,
                      children: [
                        Text(
                          title,
                          style: ts(15, Weight.bold, AppColors.ink),
                        ),
                        if (tag != null)
                          StatusTag(
                            tag!,
                            background: AppColors.green,
                            foreground: Colors.white,
                            horizontal: 6,
                            vertical: 2,
                            size: 11,
                            radius: 5,
                          ),
                      ],
                    ),
                    Text(
                      description,
                      style: ts(12, Weight.regular, AppColors.body),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
}

class _PaymentSummary extends StatelessWidget {
  const _PaymentSummary();

  @override
  Widget build(BuildContext context) => Column(
        spacing: 10,
        children: [
          const InfoRow('원료비', '[금액]원'),
          const InfoRow('운송비', '[금액]원'),
          const InfoRow('플랫폼 수수료', '[금액]원'),
          const HairLine(),
          InfoRow(
            '합계',
            '[금액]원',
            valueStyle: ts(18, Weight.bold, AppColors.green),
          ),
        ],
      );
}

/// 디자인에는 꺼짐 상태만 있어 같은 크기로 켜짐 상태를 그린다.
class _SwitchOn extends StatelessWidget {
  const _SwitchOn();

  @override
  Widget build(BuildContext context) => const Box(
        width: 46,
        height: 26,
        color: AppColors.green,
        radius: 13,
        padding: EdgeInsets.all(3),
        alignment: Alignment.centerRight,
        child: Box(width: 20, height: 20, color: Colors.white, radius: 10),
      );
}
