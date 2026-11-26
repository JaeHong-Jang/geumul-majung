import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../data/models.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'purchase_request_screen.dart';

class CartScreen extends StatelessWidget {
  const CartScreen({super.key});

  String get _goods {
    if (!api.loggedIn) return '[금액]';
    return money(
      cart.selectedItems.fold<double>(
        0,
        (sum, item) => sum + item.totalKg! * item.price!,
      ),
    );
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: cart,
        builder: (context, _) => PageBody(
          children: [
            Text(
              '장바구니',
              style: ts(24, Weight.bold, AppColors.ink, spacing: -0.4),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  spacing: 8,
                  children: [
                    AppCheckbox(
                      checked: cart.allSelected,
                      onTap: cart.toggleAll,
                    ),
                    Text(
                      '전체 선택 (${cart.count})',
                      style: ts(14, Weight.medium, AppColors.ink),
                    ),
                  ],
                ),
                Tap(
                  onTap: cart.removeSelected,
                  child: Text(
                    '선택 삭제',
                    style: ts(13, Weight.regular, AppColors.body),
                  ),
                ),
              ],
            ),
            Column(
              spacing: 8,
              children: [for (final item in cart.items) _CartRow(item)],
            ),
            if (cart.daedeokCount >= 2)
              AiNote(
                title: 'AI 운송 묶음 제안',
                message:
                    '대덕구 매물 ${cart.daedeokCount}건은 같은 트럭으로 한 번에 받을 수 있어요. '
                    '예상 운송비가 [금액]원 줄어요.',
              ),
            AppCard(
              padding: const EdgeInsets.all(16),
              radius: 16,
              child: Column(
                spacing: 10,
                children: [
                  InfoRow('선택 품목', '${cart.selectedCount}건'),
                  InfoRow('예상 원료비', '$_goods원'),
                  if (!api.loggedIn) const InfoRow('예상 운송비', '[금액]원'),
                  const HairLine(),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('합계', style: ts(16, Weight.bold, AppColors.ink)),
                      Text(
                        '$_goods원',
                        style: ts(18, Weight.bold, AppColors.green),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            AppButton(
              api.loggedIn
                  ? '첫 번째 품목 구매 요청하기'
                  : '구매 요청하기 (${cart.selectedCount}건)',
              onTap: cart.selectedCount == 0
                  ? null
                  : () => Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => api.loggedIn
                              ? PurchaseRequestScreen(
                                  listing: cart.selectedItems.first,
                                )
                              : const PurchaseRequestScreen(),
                        ),
                      ),
            ),
          ],
        ),
      );
}

class _CartRow extends StatelessWidget {
  const _CartRow(this.item);
  final Listing item;

  @override
  Widget build(BuildContext context) => AppCard(
        child: Row(
          spacing: 12,
          children: [
            AppCheckbox(
              checked: cart.isSelected(item),
              onTap: () => cart.toggle(item),
            ),
            GradeBadge(item.grade),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: 3,
                children: [
                  Text(item.name, style: ts(15, Weight.bold, AppColors.ink)),
                  Text(
                    '${item.region} · ${item.weightLabel} kg',
                    style: ts(12, Weight.regular, AppColors.body),
                  ),
                  PriceText(price: item.price),
                ],
              ),
            ),
            Tap(onTap: () => cart.remove(item), child: const Ic('close')),
          ],
        ),
      );
}
