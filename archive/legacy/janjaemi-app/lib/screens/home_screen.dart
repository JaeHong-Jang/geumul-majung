import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../data/models.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'bundle_detail_screen.dart';
import 'listing_detail_screen.dart';
import 'market_screen.dart';
import 'purchase_request_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  Category _category = Category.all;

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

  void _open(Widget screen) => Navigator.of(context)
      .push(MaterialPageRoute(builder: (_) => screen));

  @override
  Widget build(BuildContext context) => PageBody(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: 2,
                children: [
                  Text(
                    '안녕하세요',
                    style: ts(13, Weight.regular, AppColors.body),
                  ),
                  Text(
                    '${api.loggedIn ? api.companyName : '[회사명]'} 님',
                    style: ts(20, Weight.bold, AppColors.ink, spacing: -0.3),
                  ),
                ],
              ),
              const Ic('bell_button'),
            ],
          ),
          SearchBox(onTap: () => currentTab.value = AppTab.explore),
          CategoryChips(
            selected: _category,
            onChanged: (value) => setState(() => _category = value),
          ),
          if (!api.loggedIn) _BundleCard(
            onRequest: () => _open(const PurchaseRequestScreen()),
            onDetail: () => _open(const BundleDetailScreen()),
          ),
          if (!api.loggedIn) Column(
            spacing: 10,
            children: [
              SectionTitle(
                '오늘의 시세',
                onMore: () => _open(const MarketScreen()),
              ),
              Row(
                spacing: 8,
                children: [
                  for (final (name, trend) in const [
                    ('철 스크랩', 'trend_iron'),
                    ('알루미늄', 'trend_aluminum'),
                    ('PP', 'trend_pp'),
                  ])
                    Expanded(
                      child: Tap(
                        onTap: () => _open(const MarketScreen()),
                        child: AppCard(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            spacing: 4,
                            children: [
                              Text(
                                name,
                                style: ts(12, Weight.regular, AppColors.body),
                              ),
                              const PriceText(size: 15),
                              Ic(trend),
                            ],
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ],
          ),
          Column(
            spacing: 10,
            children: [
              SectionTitle(
                '통과증 매물',
                onMore: () => currentTab.value = AppTab.explore,
              ),
              for (final listing
                  in (api.loggedIn ? live.listings : homeListings)
                      .inCategory(_category))
                _ListingRow(
                  listing,
                  onTap: () => _open(ListingDetailScreen(listing: listing)),
                ),
              if (api.loggedIn && live.listings.isEmpty)
                Text(
                  '지금 올라온 매물이 없어요',
                  style: ts(14, Weight.regular, AppColors.body),
                ),
            ],
          ),
        ],
      );
}

class _BundleCard extends StatelessWidget {
  const _BundleCard({required this.onRequest, required this.onDetail});
  final VoidCallback onRequest;
  final VoidCallback onDetail;

  @override
  Widget build(BuildContext context) => Box(
        width: double.infinity,
        color: AppColors.green,
        radius: 20,
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          spacing: 12,
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
              '알루미늄 칩 B등급,\n3개 기업 물량을 모았어요',
              style: ts(
                18,
                Weight.bold,
                AppColors.cream,
                lineHeight: 25.2,
                spacing: -0.3,
              ),
            ),
            Row(
              spacing: 8,
              children: [
                Text(
                  '합계 [무게] kg · 평균 거리 [거리] km',
                  style: ts(13, Weight.regular, AppColors.mint),
                ),
                StatusTag(
                  '최소 구매량 충족',
                  background: AppColors.cream.withValues(alpha: 0.16),
                  foreground: AppColors.cream,
                  vertical: 3,
                ),
              ],
            ),
            Row(
              spacing: 8,
              children: [
                Expanded(
                  child: Tap(
                    onTap: onRequest,
                    child: Box(
                      height: 44,
                      color: AppColors.gold,
                      radius: 12,
                      alignment: Alignment.center,
                      child: Text(
                        '구매 요청하기',
                        style: ts(15, Weight.bold, AppColors.ink),
                      ),
                    ),
                  ),
                ),
                Tap(
                  onTap: onDetail,
                  child: Box(
                    height: 44,
                    radius: 12,
                    borderColor: AppColors.cream.withValues(alpha: 0.4),
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    alignment: Alignment.center,
                    child: Text(
                      '자세히',
                      style: ts(15, Weight.medium, AppColors.cream),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      );
}

class _ListingRow extends StatelessWidget {
  const _ListingRow(this.listing, {required this.onTap});
  final Listing listing;
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
                  spacing: 2,
                  children: [
                    Text(
                      listing.name,
                      style: ts(15, Weight.bold, AppColors.ink),
                    ),
                    Text(
                      '${listing.region} · ${listing.weightLabel} kg',
                      style: ts(12, Weight.regular, AppColors.body),
                    ),
                  ],
                ),
              ),
              PriceText(price: listing.price),
            ],
          ),
        ),
      );
}
