import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../theme/app_theme.dart';
import '../../widgets/common.dart';
import '../carrier_data.dart';
import '../carrier_map.dart';
import '../carrier_theme.dart';
import '../carrier_widgets.dart';
import 'detail_screen.dart';

class CarrierOrdersScreen extends StatefulWidget {
  const CarrierOrdersScreen(this.state, {super.key});
  final CarrierState state;

  @override
  State<CarrierOrdersScreen> createState() => _CarrierOrdersScreenState();
}

class _CarrierOrdersScreenState extends State<CarrierOrdersScreen> {
  late final _search = TextEditingController(text: widget.state.query);

  @override
  void didUpdateWidget(covariant CarrierOrdersScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_search.text != widget.state.query) {
      _search.text = widget.state.query;
    }
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = widget.state;
    final list = state.list;
    final f = state.filters;
    final filterCount = f.activeCount;
    void toggleType(String type) {
      final next = {...f.types};
      if (!next.remove(type)) next.add(type);
      state.setFilters(f.copyWith(types: next));
    }

    return Column(
      children: [
        // hw-hayoon 콜 찾기 머리: 제목·목록/지도, 검색·상세 필터, 콜 종류·정렬
        AnnotatedRegion<SystemUiOverlayStyle>(
          value: SystemUiOverlayStyle.dark,
          child: Container(
            color: Colors.white,
            padding: EdgeInsets.fromLTRB(16, topInset(context), 16, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 12,
              children: [
                SizedBox(
                  height: 48,
                  child: Row(
                    spacing: 6,
                    children: [
                      Text('나에게 맞는 운송 콜', style: cs(20, Weight.bold, CarrierColors.ink)),
                      Text('${list.length}', style: cs(20, Weight.bold, CarrierColors.brand, tabular: true)),
                      const Spacer(),
                      Box(
                        color: CarrierColors.background,
                        radius: 10,
                        borderColor: CarrierColors.line,
                        borderWidth: 1,
                        padding: const EdgeInsets.all(3),
                        child: Row(
                          children: [
                            _ViewToggle('list', selected: !state.showMap, onTap: state.showMap ? state.toggleMap : null),
                            _ViewToggle('map', selected: state.showMap, onTap: state.showMap ? null : state.toggleMap),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                Row(
                  spacing: 8,
                  children: [
                    Expanded(
                      child: Box(
                        height: 48,
                        color: CarrierColors.background,
                        radius: 12,
                        borderColor: CarrierColors.line,
                        borderWidth: 1,
                        padding: const EdgeInsets.symmetric(horizontal: 14),
                        child: Row(
                          spacing: 8,
                          children: [
                            const CIc('search', size: 16, color: CarrierColors.muted),
                            Expanded(
                              child: TextField(
                                controller: _search,
                                onChanged: state.setQuery,
                                cursorColor: CarrierColors.brand,
                                style: cs(14, Weight.regular, CarrierColors.ink),
                                decoration: InputDecoration(
                                  isCollapsed: true,
                                  border: InputBorder.none,
                                  hintText: '출발지·도착지·품목 검색',
                                  hintStyle: cs(14, Weight.regular, CarrierColors.muted),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    Tap(
                      onTap: () => _openFilters(context, state),
                      child: Box(
                        height: 48,
                        color: Colors.white,
                        radius: 12,
                        borderColor: filterCount > 0 ? CarrierColors.brand : CarrierColors.line,
                        borderWidth: 1,
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        child: Row(
                          spacing: 6,
                          children: [
                            const CIc('sliders', size: 16, color: CarrierColors.ink),
                            Text(
                              filterCount > 0 ? '상세 필터 $filterCount' : '상세 필터',
                              style: cs(14, Weight.medium, CarrierColors.ink),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
                Row(
                  children: [
                    Expanded(
                      child: SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Row(
                          spacing: 6,
                          children: [
                            _Chip('전체', selected: f.types.isEmpty, onTap: () => state.setFilters(f.copyWith(types: {}))),
                            for (final type in state.data.callTypes)
                              _Chip(type, selected: f.types.contains(type), onTap: () => toggleType(type)),
                          ],
                        ),
                      ),
                    ),
                    PopupMenuButton<SortKey>(
                      initialValue: state.sort,
                      onSelected: state.setSort,
                      color: Colors.white,
                      itemBuilder: (_) => [
                        for (final sort in SortKey.values)
                          PopupMenuItem(value: sort, child: Text(sort.label, style: cs(14, Weight.regular, CarrierColors.ink))),
                      ],
                      child: Padding(
                        padding: const EdgeInsets.only(left: 12),
                        child: Row(
                          spacing: 4,
                          children: [
                            Text(state.sort.label, style: cs(13, Weight.medium, CarrierColors.ink)),
                            const CIc('down', size: 14, color: CarrierColors.ink),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        Tap(
          onTap: () => state.setFilters(f.copyWith(fit: !f.fit)),
          child: Container(
            height: 44,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            decoration: const BoxDecoration(
              color: Color(0xFFF7FAF8),
              border: Border.symmetric(horizontal: BorderSide(color: CarrierColors.line)),
            ),
            child: Row(
              spacing: 8,
              children: [
                Box(
                  width: 18,
                  height: 18,
                  radius: 4,
                  color: f.fit ? CarrierColors.brand : Colors.white,
                  borderColor: f.fit ? CarrierColors.brand : const Color(0xFFB9C3B9),
                  borderWidth: 1,
                  alignment: Alignment.center,
                  child: f.fit ? const CIc('check', size: 13, color: Colors.white) : null,
                ),
                Text('내 차량에 맞는 콜만', style: cs(13, Weight.medium, CarrierColors.ink)),
                const Spacer(),
                const CIc('truck', size: 15, color: CarrierColors.muted),
                Text('${maxFitTon.round()}톤 이하', style: cs(12, Weight.regular, CarrierColors.muted)),
              ],
            ),
          ),
        ),
        Expanded(
          child: Stack(
            children: [
              if (state.showMap)
                Positioned.fill(
                  top: 12,
                  child: OrdersMap(
                    key: ValueKey(list.map((o) => o.id).join(',')),
                    data: state.data,
                    orders: list,
                    onPin: (order) =>
                        openCarrierDetail(context, state, order),
                  ),
                )
              else
                Column(
                  children: [
                    CarrierScroll(
                      children: [
                        for (final order in list)
                          OrderCard(
                            order,
                            saved: state.isSaved(order.id),
                            onTap: () =>
                                openCarrierDetail(context, state, order),
                            onSave: () => state.toggleSaved(order.id),
                          ),
                        if (list.isEmpty) EmptyOrders(onReset: state.resetAll),
                      ],
                    ),
                  ],
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ViewToggle extends StatelessWidget {
  const _ViewToggle(this.icon, {required this.selected, required this.onTap});
  final String icon;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Tap(
        onTap: onTap,
        child: Box(
          width: 40,
          height: 34,
          radius: 8,
          color: selected ? Colors.white : null,
          alignment: Alignment.center,
          child: CIc(icon, size: 18, color: selected ? CarrierColors.brand : CarrierColors.muted),
        ),
      );
}

class _Chip extends StatelessWidget {
  const _Chip(this.label, {required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Tap(
        onTap: onTap,
        child: Box(
          height: 34,
          radius: 8,
          color: selected ? CarrierColors.brand : Colors.white,
          borderColor: selected ? CarrierColors.brand : CarrierColors.line,
          borderWidth: 1,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          alignment: Alignment.center,
          child: Text(
            label,
            style: cs(13, selected ? Weight.bold : Weight.medium, selected ? Colors.white : CarrierColors.ink),
          ),
        ),
      );
}

void _openFilters(BuildContext context, CarrierState state) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: CarrierColors.background,
    barrierColor: const Color(0x730F1613),
    constraints: BoxConstraints(
      maxHeight: MediaQuery.sizeOf(context).height * 0.94,
    ),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (_) => ListenableBuilder(
      listenable: state,
      builder: (sheetContext, _) => _FilterSheet(state),
    ),
  );
}

class _FilterSheet extends StatelessWidget {
  const _FilterSheet(this.state);
  final CarrierState state;

  static const _emptyLimits = [null, 5, 10, 20];
  static const _perKm = [null, 2000, 3000, 4000];

  @override
  Widget build(BuildContext context) {
    final f = state.filters;
    final inset = MediaQuery.viewPaddingOf(context).bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, inset < 16 ? 16 : inset),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        spacing: 12,
        children: [
          Flexible(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                spacing: 16,
                children: [
                  _Group('콜 종류', [
                    for (final type in state.data.callTypes)
                      CChip(
                        type,
                        selected: f.types.contains(type),
                        onTap: () {
                          final next = {...f.types};
                          if (!next.remove(type)) next.add(type);
                          state.setFilters(f.copyWith(types: next));
                        },
                      ),
                  ]),
                  _Group('지역', [
                    for (final region in Region.values)
                      CChip(
                        region.label,
                        selected: f.region == region,
                        onTap: () =>
                            state.setFilters(f.copyWith(region: region)),
                      ),
                  ]),
                  _Group('공차 거리 상한', [
                    for (final limit in _emptyLimits)
                      CChip(
                        limit == null ? '제한 없음' : '${limit}km 이내',
                        selected: f.maxEmptyKm == limit,
                        onTap: () => state
                            .setFilters(f.copyWith(maxEmptyKm: () => limit)),
                      ),
                  ]),
                  _Group('공차 포함 km당 운임 하한', [
                    for (final limit in _perKm)
                      CChip(
                        limit == null ? '제한 없음' : '${won(limit)} 이상',
                        selected: f.minPerKm == limit,
                        onTap: () => state
                            .setFilters(f.copyWith(minPerKm: () => limit)),
                      ),
                  ]),
                  _Group('그 밖의 조건', [
                    CChip(
                      '내 차량 맞춤 (${maxFitTon.round()}톤 이하)',
                      selected: f.fit,
                      onTap: () => state.setFilters(f.copyWith(fit: !f.fit)),
                    ),
                    CChip(
                      '저장한 콜만',
                      selected: f.savedOnly,
                      onTap: () => state
                          .setFilters(f.copyWith(savedOnly: !f.savedOnly)),
                    ),
                  ]),
                ],
              ),
            ),
          ),
          Row(
            spacing: 8,
            children: [
              CButton(
                '초기화',
                line: true,
                onTap: () => state.setFilters(const CarrierFilters()),
              ),
              Expanded(
                child: CButton(
                  '콜 ${state.list.length}건 보기',
                  onTap: () => Navigator.of(context).pop(),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Group extends StatelessWidget {
  const _Group(this.title, this.chips);
  final String title;
  final List<Widget> chips;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 8,
        children: [
          Text(title, style: cs(14, Weight.bold, CarrierColors.ink)),
          Wrap(spacing: 8, runSpacing: 8, children: chips),
        ],
      );
}
