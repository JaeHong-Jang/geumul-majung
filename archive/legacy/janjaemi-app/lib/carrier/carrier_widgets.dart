import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:url_launcher/url_launcher.dart';

import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'carrier_data.dart';
import 'carrier_theme.dart';

const _iconPaths = {
  'pin': '<path d="M12 22s7-7.5 7-12a7 7 0 0 0-14 0c0 4.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  'bell': '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  'truck': '<path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  'home': '<path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  'list': '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
  'won': '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>',
  'user': '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  'back': '<path d="m15 6-6 6 6 6"/>',
  'qr': '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM21 14v3M14 21h7"/>',
  'check': '<path d="M20 6 9 17l-5-5"/>',
  'map': '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
  'search': '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  'nav': '<path d="m3 11 18-8-8 18-2-8z"/>',
  'locate': '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  'bookmark': '<path d="M6 3h12v18l-6-4-6 4z"/>',
  'arrow': '<path d="M5 12h14M13 6l6 6-6 6"/>',
  'route': '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h8.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H16"/>',
  'clock': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  'chevron': '<path d="m9 6 6 6-6 6"/>',
  'down': '<path d="m6 9 6 6 6-6"/>',
  'building': '<path d="M4 21V5l8-2v18M12 9h8v12M8 8h.01M8 12h.01M8 16h.01M16 13h.01M16 17h.01M2 21h20"/>',
  'sliders': '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
};

/// 원본과 같은 선 아이콘.
class CIc extends StatelessWidget {
  const CIc(this.name, {super.key, this.size = 20, this.color});
  final String name;
  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final tint = color ?? DefaultTextStyle.of(context).style.color ?? CarrierColors.ink;
    final hex = (tint.toARGB32() & 0xFFFFFF).toRadixString(16).padLeft(6, '0');
    return SvgPicture.string(
      '<svg xmlns="http://www.w3.org/2000/svg" width="$size" height="$size" '
      'viewBox="0 0 24 24" fill="none" stroke="#$hex" stroke-width="2" '
      'stroke-linecap="round" stroke-linejoin="round">${_iconPaths[name]}</svg>',
      width: size,
      height: size,
    );
  }
}

/// 초록 상단 영역. 상태바 글자는 밝게 표시한다.
class CarrierAppBar extends StatelessWidget {
  const CarrierAppBar({super.key, required this.title, required this.body});
  final Widget title;
  final Widget body;

  @override
  Widget build(BuildContext context) => AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.light,
        child: Container(
          color: CarrierColors.brand,
          padding: EdgeInsets.fromLTRB(16, topInset(context), 16, 16),
          child: DefaultTextStyle(
            style: cs(14, Weight.regular, Colors.white),
            child: Column(
              spacing: 8,
              children: [
                SizedBox(height: 48, child: title),
                SizedBox(height: 48, child: body),
              ],
            ),
          ),
        ),
      );
}

/// 카드 사이 간격 12, 좌우 16인 스크롤 영역.
class CarrierScroll extends StatelessWidget {
  const CarrierScroll({
    super.key,
    required this.children,
    this.bottom = 16,
  });

  final List<Widget> children;
  final double bottom;

  @override
  Widget build(BuildContext context) => Expanded(
        child: SingleChildScrollView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: EdgeInsets.fromLTRB(16, 16, 16, bottom),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: 12,
            children: children,
          ),
        ),
      );
}

class CCard extends StatelessWidget {
  const CCard({
    super.key,
    required this.children,
    this.color = Colors.white,
    this.onTap,
  });

  final List<Widget> children;
  final Color color;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Tap(
        onTap: onTap,
        child: Box(
          width: double.infinity,
          color: color,
          radius: 16,
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: 12,
            children: children,
          ),
        ),
      );
}

class CTag extends StatelessWidget {
  const CTag(
    this.label, {
    super.key,
    this.background = CarrierColors.brandSoft,
    this.foreground = CarrierColors.brand,
    this.icon,
  });

  final String label;
  final Color background;
  final Color foreground;
  final String? icon;

  @override
  Widget build(BuildContext context) => Box(
        color: background,
        radius: 8,
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          spacing: 4,
          children: [
            if (icon != null) CIc(icon!, size: 16, color: foreground),
            Text(label, style: cs(12, Weight.bold, foreground)),
          ],
        ),
      );
}

const _accentTag = (CarrierColors.accent, CarrierColors.onAccent);

class OrderTags extends StatelessWidget {
  const OrderTags(this.order, {super.key, this.trailing = const []});
  final CarrierOrder order;
  final List<Widget> trailing;

  @override
  Widget build(BuildContext context) {
    final gradeColor = switch (order.grade) {
      'A' => CarrierColors.brand,
      'B' => CarrierColors.gradeB,
      _ => CarrierColors.gradeC,
    };
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        CTag(
          '통과증 ${order.grade}',
          background: gradeColor,
          foreground: Colors.white,
        ),
        for (final (index, tag) in order.tags.indexed)
          index == 0
              ? CTag(
                  tag,
                  background: _accentTag.$1,
                  foreground: _accentTag.$2,
                )
              : CTag(tag),
        ...trailing,
      ],
    );
  }
}

/// hw-hayoon `.order-card`. 배지·저장 / 경로 / 품목·운임 / 거리 / 상차 시간.
class OrderCard extends StatelessWidget {
  const OrderCard(
    this.order, {
    super.key,
    required this.saved,
    required this.onTap,
    required this.onSave,
  });

  final CarrierOrder order;
  final bool saved;
  final VoidCallback onTap;
  final VoidCallback onSave;

  static const _route = Color(0xFF3A5142);
  static const _soft = Color(0xFF95A195);
  static const _urgent = Color(0xFFBC8D4F);

  @override
  Widget build(BuildContext context) {
    final urgent = order.tags.any((t) => t.contains('급송'));
    final fit = order.ton <= maxFitTon;
    final dot = Container(
      width: 3,
      height: 3,
      margin: const EdgeInsets.symmetric(horizontal: 5),
      decoration: const BoxDecoration(color: Color(0xFFB9C3B9), shape: BoxShape.circle),
    );
    return Tap(
      onTap: onTap,
      child: Box(
        width: double.infinity,
        color: Colors.white,
        radius: 12,
        borderColor: const Color(0xFFE5EBE5),
        borderWidth: 1,
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      _Badge(order.callType, urgent ? _BadgeTone.amber : _BadgeTone.neutral),
                      if (fit) const _Badge('내 차량 추천', _BadgeTone.mint),
                    ],
                  ),
                ),
                Tap(
                  onTap: onSave,
                  child: Padding(
                    padding: const EdgeInsets.all(4),
                    child: CIc(
                      'bookmark',
                      size: 20,
                      color: saved ? CarrierColors.brand : const Color(0xFFBEC9BF),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              spacing: 8,
              children: [
                Flexible(child: Text(order.from, style: cs(16, Weight.bold, _route), overflow: TextOverflow.ellipsis)),
                const CIc('arrow', size: 16, color: Color(0xFFA8B5A9)),
                Flexible(child: Text(order.to, style: cs(16, Weight.bold, _route), overflow: TextOverflow.ellipsis)),
              ],
            ),
            const SizedBox(height: 6),
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Expanded(
                  child: Wrap(
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text(order.item, style: cs(12, Weight.regular, _soft)),
                      dot,
                      Text('${_ton(order.ton)}톤', style: cs(12, Weight.regular, _soft)),
                      dot,
                      Text('${order.bags}마대', style: cs(12, Weight.regular, _soft)),
                      const SizedBox(width: 6),
                      Box(
                        color: const Color(0xFFEFF5EA),
                        radius: 3,
                        padding: const EdgeInsets.symmetric(horizontal: 5),
                        child: Text('등급 ${order.grade}', style: cs(10, Weight.medium, const Color(0xFF7C9B78))),
                      ),
                    ],
                  ),
                ),
                Text.rich(
                  TextSpan(
                    text: won(order.fare).replaceAll('원', ''),
                    style: cs(26, Weight.bold, CarrierColors.brand, tabular: true),
                    children: [
                      TextSpan(text: ' 원', style: cs(13, Weight.medium, CarrierColors.brand)),
                    ],
                  ),
                ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.only(top: 10, bottom: 14),
              child: DefaultTextStyle(
                style: cs(12, Weight.regular, const Color(0xFF9AA89B), tabular: true),
                child: Row(
                  spacing: 12,
                  children: [
                    Row(
                      spacing: 4,
                      children: [
                        const CIc('route', size: 14, color: Color(0xFF9AA89B)),
                        const Text('공차'),
                        Text(km1(order.emptyKm), style: cs(12, Weight.medium, const Color(0xFF6C856F), tabular: true)),
                      ],
                    ),
                    Text('적재 ${km1(order.km)}'),
                    const Spacer(),
                    const CIc('building', size: 14, color: Color(0xFF9AA89B)),
                    Flexible(child: Text(order.cond, overflow: TextOverflow.ellipsis)),
                  ],
                ),
              ),
            ),
            Container(
              height: 44,
              decoration: const BoxDecoration(
                border: Border(top: BorderSide(color: Color(0xFFEDF1EC))),
              ),
              child: Row(
                spacing: 4,
                children: [
                  CIc('clock', size: 14, color: urgent ? _urgent : const Color(0xFF849586)),
                  Text(order.when, style: cs(12, Weight.regular, urgent ? _urgent : const Color(0xFF849586))),
                  if (order.pay == '당일 정산')
                    Box(
                      color: const Color(0xFFFBF4E9),
                      radius: 3,
                      padding: const EdgeInsets.symmetric(horizontal: 5),
                      child: Text('당일 정산', style: cs(10, Weight.medium, const Color(0xFFBF965E))),
                    ),
                  const Spacer(),
                  Text('상세 보기', style: cs(12, Weight.regular, const Color(0xFF79917B))),
                  const CIc('chevron', size: 14, color: Color(0xFF79917B)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

enum _BadgeTone {
  neutral(Color(0xFFF0F3F1), Color(0xFF5F7766)),
  mint(Color(0xFFEAF4EB), Color(0xFF3F7850)),
  amber(Color(0xFFFFF3E3), Color(0xFF966021));

  const _BadgeTone(this.background, this.foreground);
  final Color background;
  final Color foreground;
}

class _Badge extends StatelessWidget {
  const _Badge(this.label, this.tone);
  final String label;
  final _BadgeTone tone;

  @override
  Widget build(BuildContext context) => Box(
        color: tone.background,
        radius: 4,
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
        child: Text(label, style: cs(11, Weight.medium, tone.foreground)),
      );
}

String _ton(double ton) =>
    ton == ton.roundToDouble() ? ton.toStringAsFixed(0) : ton.toString();

String tonLabel(double ton) => _ton(ton);

class EmptyOrders extends StatelessWidget {
  const EmptyOrders({super.key, required this.onReset});
  final VoidCallback onReset;

  @override
  Widget build(BuildContext context) => CCard(
        children: [
          Text(
            '조건에 맞는 요청이 없습니다',
            style: cs(14, Weight.bold, CarrierColors.ink),
          ),
          Text(
            '검색어를 지우거나 필터를 줄여 보세요.',
            style: cs(12, Weight.regular, CarrierColors.muted),
          ),
          CButton('조건 모두 지우기', line: true, onTap: onReset),
        ],
      );
}

class CButton extends StatelessWidget {
  const CButton(
    this.label, {
    super.key,
    required this.onTap,
    this.line = false,
    this.large = false,
    this.icon,
  });

  final String label;
  final VoidCallback? onTap;
  final bool line;
  final bool large;
  final String? icon;

  @override
  Widget build(BuildContext context) {
    final disabled = onTap == null;
    final background = disabled
        ? CarrierColors.line
        : (line ? Colors.transparent : CarrierColors.brand);
    final foreground = disabled
        ? CarrierColors.muted
        : (line ? CarrierColors.ink : Colors.white);
    return Tap(
      onTap: onTap,
      child: Box(
        height: large ? 56 : 48,
        color: background,
        radius: 12,
        borderColor: line ? CarrierColors.line : null,
        borderWidth: 1,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        alignment: Alignment.center,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          spacing: 8,
          children: [
            if (icon != null) CIc(icon!, color: foreground),
            Text(label, style: cs(16, Weight.bold, foreground)),
          ],
        ),
      ),
    );
  }
}

class CChip extends StatelessWidget {
  const CChip(
    this.label, {
    super.key,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Tap(
        onTap: onTap,
        child: Box(
          height: 48,
          color: selected ? CarrierColors.brand : Colors.white,
          radius: 999,
          borderColor: selected ? CarrierColors.brand : CarrierColors.line,
          borderWidth: 1,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          alignment: Alignment.center,
          child: Text(
            label,
            style: selected
                ? cs(14, Weight.bold, Colors.white)
                : cs(14, Weight.medium, CarrierColors.ink),
          ),
        ),
      );
}

/// 위아래 구분선이 있는 정보 묶음.
class ListRows extends StatelessWidget {
  const ListRows({super.key, required this.rows});
  final List<Widget> rows;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          for (final (index, row) in rows.indexed)
            Container(
              constraints: const BoxConstraints(minHeight: 48),
              margin: EdgeInsets.only(top: index == 0 ? 0 : 12),
              padding: EdgeInsets.only(top: index == 0 ? 0 : 12),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                border: index == 0
                    ? null
                    : const Border(top: BorderSide(color: CarrierColors.line)),
              ),
              child: row,
            ),
        ],
      );
}

class LabelValue extends StatelessWidget {
  const LabelValue(this.label, this.value, {super.key});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        spacing: 12,
        children: [
          Text(label, style: cs(14, Weight.regular, CarrierColors.ink)),
          Text(
            value,
            style: cs(14, Weight.bold, CarrierColors.ink, tabular: true),
          ),
        ],
      );
}

class RoundButton extends StatelessWidget {
  const RoundButton({
    super.key,
    required this.icon,
    required this.onTap,
    this.active = false,
  });

  final String icon;
  final VoidCallback onTap;
  final bool active;

  @override
  Widget build(BuildContext context) => Tap(
        onTap: onTap,
        child: Container(
          width: 48,
          height: 48,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: active ? CarrierColors.accent : Colors.white,
            boxShadow: carrierShadow,
          ),
          child: CIc(
            icon,
            color: active ? CarrierColors.onAccent : CarrierColors.ink,
          ),
        ),
      );
}

/// 화면 아래 고정 버튼 영역.
class CFooter extends StatelessWidget {
  const CFooter({super.key, required this.children, this.withTabs = false});
  final List<Widget> children;

  /// 하단 탭 위에 놓이면 홈 표시줄 여백이 필요 없다.
  final bool withTabs;

  @override
  Widget build(BuildContext context) {
    final inset = MediaQuery.viewPaddingOf(context).bottom;
    final bottom = withTabs || inset < 24 ? 24.0 : inset;
    return Container(
      padding: EdgeInsets.fromLTRB(16, 12, 16, bottom),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: CarrierColors.line)),
      ),
      child: Row(spacing: 8, children: children),
    );
  }
}

/// 다음 목적지까지 카카오맵 길안내를 연다.
Future<void> openKakaoNavi(
  BuildContext context,
  CarrierOrder order,
  int stage,
) async {
  final at = stage == 0 ? order.stops.first : order.stops.last;
  final name = stage == 0 ? order.shipper : order.consignee;
  final url = Uri.parse(
    'https://map.kakao.com/link/to/${Uri.encodeComponent(name)},'
    '${at.latitude},${at.longitude}',
  );
  final opened = await launchUrl(url, mode: LaunchMode.externalApplication);
  if (!opened && context.mounted) {
    showToast(context, '카카오맵을 열지 못했습니다.');
  }
}
