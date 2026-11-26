import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../data/models.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'listing_detail_screen.dart';

class ExploreScreen extends StatefulWidget {
  const ExploreScreen({super.key});

  @override
  State<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends State<ExploreScreen> {
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

  List<Listing> get _listings =>
      (api.loggedIn ? live.listings : exploreListings).inCategory(_category);

  void _addToCart(Listing listing) => showToast(
        context,
        cart.add(listing) ? '장바구니에 담았어요' : '이미 장바구니에 있어요',
      );

  @override
  Widget build(BuildContext context) => PageBody(
        children: [
          Text(
            '탐색',
            style: ts(24, Weight.bold, AppColors.ink, spacing: -0.4),
          ),
          const SearchBox(),
          CategoryChips(
            selected: _category,
            onChanged: (value) => setState(() => _category = value),
          ),
          const Row(
            spacing: 8,
            children: [
              _FilterButton('등급 전체'),
              _FilterButton('지역 전체'),
              _FilterButton('가까운 순'),
            ],
          ),
          Text(
            '통과증 매물 ${api.loggedIn ? _listings.length : '[N]'}개',
            style: ts(13, Weight.medium, AppColors.body),
          ),
          Column(
            spacing: 8,
            children: [
              for (final listing in _listings)
                _ExploreRow(
                  listing,
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => ListingDetailScreen(listing: listing),
                    ),
                  ),
                  onAdd: () => _addToCart(listing),
                ),
            ],
          ),
        ],
      );
}

class _FilterButton extends StatelessWidget {
  const _FilterButton(this.label);
  final String label;

  @override
  Widget build(BuildContext context) => Box(
        height: 34,
        color: Colors.white,
        radius: 10,
        borderColor: AppColors.borderStrong,
        padding: const EdgeInsets.only(left: 12, right: 10),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          spacing: 4,
          children: [
            Text(label, style: ts(13, Weight.medium, AppColors.inkMuted)),
            const Ic('chevron_down'),
          ],
        ),
      );
}

class _ExploreRow extends StatelessWidget {
  const _ExploreRow(this.listing, {required this.onTap, required this.onAdd});
  final Listing listing;
  final VoidCallback onTap;
  final VoidCallback onAdd;

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
                      listing.isLive
                          ? '${listing.region} · ${listing.weightLabel} kg'
                          : '${listing.region} · [무게] kg · [거리] km',
                      style: ts(12, Weight.regular, AppColors.body),
                    ),
                    PriceText(price: listing.price),
                  ],
                ),
              ),
              Tap(
                onTap: onAdd,
                child: const Box(
                  width: 36,
                  height: 36,
                  color: AppColors.surfaceMint,
                  radius: 10,
                  alignment: Alignment.center,
                  child: Ic('plus_green'),
                ),
              ),
            ],
          ),
        ),
      );
}
