import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../data/models.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'purchase_request_screen.dart';

class ListingDetailScreen extends StatefulWidget {
  const ListingDetailScreen({super.key, this.listing = aluminum});
  final Listing listing;

  @override
  State<ListingDetailScreen> createState() => _ListingDetailScreenState();
}

class _ListingDetailScreenState extends State<ListingDetailScreen> {
  Map<String, Object?>? _detail;

  double? get _purity => (_detail?['purity_avg'] as num?)?.toDouble();

  @override
  void initState() {
    super.initState();
    final id = widget.listing.id;
    if (id == null) return;
    api.get('/v1/listings/$id').then((body) {
      if (mounted) setState(() => _detail = body as Map<String, Object?>?);
    }).catchError((Object error) {
      if (mounted) showToast(context, '$error');
    });
  }

  void _addToCart() => showToast(
        context,
        cart.add(widget.listing) ? '장바구니에 담았어요' : '이미 장바구니에 있어요',
      );

  @override
  Widget build(BuildContext context) {
    final listing = widget.listing;
    return Scaffold(
      body: Column(
        children: [
          Expanded(
            child: PageBody(
              children: [
                const TopBar(
                  '매물 상세',
                  trailing: RoundIconBox(Ic('heart')),
                ),
                if (!listing.isLive) Box(
                  width: double.infinity,
                  height: 188,
                  color: AppColors.surfacePhoto,
                  radius: 16,
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    spacing: 8,
                    children: [
                      const Ic('photo_large'),
                      Text(
                        '분류 검수 때 찍은 마대 사진',
                        style: ts(13, Weight.regular, AppColors.hint),
                      ),
                    ],
                  ),
                ),
                Row(
                  spacing: 12,
                  children: [
                    GradeBadge(listing.grade, size: 52),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        spacing: 3,
                        children: [
                          Text(
                            listing.name,
                            style: ts(
                              20,
                              Weight.bold,
                              AppColors.ink,
                              spacing: -0.3,
                            ),
                          ),
                          Text(
                            '${listing.region} · 판매자 ${listing.sellerLabel}',
                            style: ts(13, Weight.regular, AppColors.body),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                Row(
                  spacing: 10,
                  children: [
                    PriceText(size: 26, unitSize: 14, price: listing.price),
                    if (!listing.isLive) const StatusTag('오늘 시세 대비 [±%]'),
                  ],
                ),
                AppCard(
                  padding: const EdgeInsets.all(16),
                  radius: 16,
                  borderColor: AppColors.green,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    spacing: 12,
                    children: [
                      Row(
                        spacing: 8,
                        children: [
                          const Ic('shield'),
                          Text(
                            '마대 통과증',
                            style: ts(15, Weight.bold, AppColors.green),
                          ),
                        ],
                      ),
                      if (listing.isLive) ...[
                        InfoRow(
                          '순도',
                          _purity == null
                              ? '확인 중'
                              : '${(_purity! * 100).toStringAsFixed(1)}%',
                          valueStyle: ts(14, Weight.bold, AppColors.green),
                        ),
                        InfoRow(
                          '이물질',
                          _purity == null
                              ? '확인 중'
                              : '${((1 - _purity!) * 100).toStringAsFixed(1)}%',
                        ),
                        const InfoRow('검수 방식', '판매자 입력 품목 기준 계산'),
                      ] else ...[
                        const InfoRow('통과증 번호', 'BAG-[번호]'),
                        InfoRow(
                          '순도',
                          '[순도]%',
                          valueStyle: ts(14, Weight.bold, AppColors.green),
                        ),
                        const InfoRow('이물질', '[비율]%'),
                        const InfoRow('검수 방식', 'AI 비전 분석 + 사람 검수'),
                        const InfoRow('발급일', '[날짜]'),
                      ],
                    ],
                  ),
                ),
                AppCard(
                  padding: const EdgeInsets.all(16),
                  radius: 16,
                  child: Column(
                    spacing: 10,
                    children: listing.isLive
                        ? [
                            InfoRow(
                              '판매 수량',
                              '${listing.weightLabel} kg '
                                  '(마대 ${listing.bagCount}개)',
                            ),
                          ]
                        : const [
                            InfoRow('판매 수량', '[무게] kg (마대 [N]개)'),
                            InfoRow('수거 가능일', '[날짜]부터'),
                            InfoRow('구매자까지 거리', '[거리] km'),
                          ],
                  ),
                ),
              ],
            ),
          ),
          BottomBar(
            child: Row(
              spacing: 8,
              children: [
                Expanded(
                  child: AppButton(
                    '장바구니 담기',
                    outlined: true,
                    onTap: _addToCart,
                  ),
                ),
                Expanded(
                  child: AppButton(
                    '구매 요청',
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) =>
                            PurchaseRequestScreen(listing: listing),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
