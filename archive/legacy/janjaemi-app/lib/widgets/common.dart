import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../data/models.dart';
import '../theme/app_theme.dart';

/// Figma에서 내려받은 SVG. 크기는 SVG 원본 크기를 그대로 쓴다.
class Ic extends StatelessWidget {
  const Ic(this.name, {super.key, this.color});
  final String name;
  final Color? color;

  @override
  Widget build(BuildContext context) => SvgPicture.asset(
        'assets/icons/$name.svg',
        colorFilter:
            color == null ? null : ColorFilter.mode(color!, BlendMode.srcIn),
      );
}

/// Figma 자동 레이아웃과 같이 테두리 두께만큼 내용이 안쪽으로 들어가는 상자.
class Box extends StatelessWidget {
  const Box({
    super.key,
    this.child,
    this.width,
    this.height,
    this.color,
    this.radius = 0,
    this.borderColor,
    this.borderWidth = 1.5,
    this.padding,
    this.alignment,
  });

  final Widget? child;
  final double? width;
  final double? height;
  final Color? color;
  final double radius;
  final Color? borderColor;
  final double borderWidth;
  final EdgeInsetsGeometry? padding;
  final AlignmentGeometry? alignment;

  @override
  Widget build(BuildContext context) => Container(
        width: width,
        height: height,
        padding: padding,
        alignment: alignment,
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(radius),
          border: borderColor == null
              ? null
              : Border.all(color: borderColor!, width: borderWidth),
        ),
        child: child,
      );
}

/// 흰 배경의 기본 카드.
class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(12),
    this.radius = 14,
    this.borderColor = AppColors.border,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final double radius;
  final Color borderColor;

  @override
  Widget build(BuildContext context) => Box(
        width: double.infinity,
        color: Colors.white,
        radius: radius,
        borderColor: borderColor,
        padding: padding,
        child: child,
      );
}

class Tap extends StatelessWidget {
  const Tap({super.key, required this.onTap, required this.child});
  final VoidCallback? onTap;
  final Widget child;

  @override
  Widget build(BuildContext context) => GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: child,
      );
}

class GradeBadge extends StatelessWidget {
  const GradeBadge(this.grade, {super.key, this.size = 44});
  final Grade grade;
  final double size;

  @override
  Widget build(BuildContext context) {
    final (background, foreground, letter) = switch (grade) {
      Grade.a => (AppColors.green, Colors.white, 'A'),
      Grade.b => (AppColors.gradeB, AppColors.greenDark, 'B'),
      Grade.c => (AppColors.gradeC, AppColors.gradeCText, 'C'),
    };
    return Box(
      width: size,
      height: size,
      color: background,
      radius: 12,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        spacing: 1,
        children: [
          Text(letter, style: ts(18, Weight.bold, foreground, lineHeight: 18)),
          Text('등급', style: ts(9, Weight.medium, foreground, lineHeight: 10)),
        ],
      ),
    );
  }
}

/// `[가격] 원/kg` 형식의 금액.
class PriceText extends StatelessWidget {
  const PriceText({
    super.key,
    this.size = 14,
    this.unitSize = 11,
    this.unitWeight = Weight.medium,
    this.price,
  });

  /// 없으면 디자인의 자리 표시자를 보여 준다.
  final double? price;
  final double size;
  final double unitSize;
  final Weight unitWeight;

  @override
  Widget build(BuildContext context) => Text.rich(
        TextSpan(children: [
          TextSpan(
            text: price == null ? '[가격]' : money(price!),
            style: ts(size, Weight.bold, AppColors.ink),
          ),
          TextSpan(
            text: ' 원/kg',
            style: ts(unitSize, unitWeight, AppColors.body),
          ),
        ]),
      );
}

class CategoryChips extends StatelessWidget {
  const CategoryChips({
    super.key,
    required this.selected,
    required this.onChanged,
  });

  final Category selected;
  final ValueChanged<Category> onChanged;

  @override
  Widget build(BuildContext context) => Row(
        spacing: 8,
        children: [
          for (final category in Category.values)
            Tap(
              onTap: () => onChanged(category),
              child: Box(
                height: 36,
                color: category == selected ? AppColors.green : Colors.white,
                radius: 18,
                borderColor: category == selected
                    ? AppColors.green
                    : AppColors.borderStrong,
                padding: const EdgeInsets.symmetric(horizontal: 14),
                alignment: Alignment.center,
                child: Text(
                  category.label,
                  style: ts(
                    14,
                    Weight.medium,
                    category == selected ? Colors.white : AppColors.inkMuted,
                  ),
                ),
              ),
            ),
        ],
      );
}

class SearchBox extends StatelessWidget {
  const SearchBox({super.key, this.onTap});
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Tap(
        onTap: onTap,
        child: Box(
          height: 48,
          color: Colors.white,
          radius: 14,
          borderColor: AppColors.borderStrong,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            spacing: 10,
            children: [
              const Ic('search'),
              Text(
                '품목, 등급, 지역으로 찾기',
                style: ts(15, Weight.regular, AppColors.hint),
              ),
            ],
          ),
        ),
      );
}

class StatusTag extends StatelessWidget {
  const StatusTag(
    this.label, {
    super.key,
    this.background = AppColors.surfaceMint,
    this.foreground = AppColors.green,
    this.horizontal = 8,
    this.vertical = 4,
    this.size = 12,
    this.radius = 6,
  });

  final String label;
  final Color background;
  final Color foreground;
  final double horizontal;
  final double vertical;
  final double size;
  final double radius;

  @override
  Widget build(BuildContext context) => Box(
        color: background,
        radius: radius,
        padding:
            EdgeInsets.symmetric(horizontal: horizontal, vertical: vertical),
        child: Text(label, style: ts(size, Weight.bold, foreground)),
      );
}

/// 왼쪽 라벨, 오른쪽 값으로 이루어진 정보 한 줄.
class InfoRow extends StatelessWidget {
  const InfoRow(this.label, this.value, {super.key, this.valueStyle});
  final String label;
  final String value;
  final TextStyle? valueStyle;

  @override
  Widget build(BuildContext context) => Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: ts(14, Weight.regular, AppColors.body)),
          FixedLineText(
            value,
            style: valueStyle ?? ts(14, Weight.medium, AppColors.ink),
          ),
        ],
      );
}

/// `₂`처럼 다른 글꼴로 그려지는 문자가 있어도 줄 높이를 유지하는 텍스트.
class FixedLineText extends StatelessWidget {
  const FixedLineText(this.text, {super.key, required this.style});
  final String text;
  final TextStyle style;

  @override
  Widget build(BuildContext context) => Text(
        text,
        style: style,
        strutStyle: StrutStyle.fromTextStyle(style, forceStrutHeight: true),
      );
}

class HairLine extends StatelessWidget {
  const HairLine({super.key});

  @override
  Widget build(BuildContext context) => Container(
        height: 1,
        width: double.infinity,
        color: AppColors.border,
      );
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.title, {super.key, this.size = 17, this.onMore});
  final String title;
  final double size;
  final VoidCallback? onMore;

  @override
  Widget build(BuildContext context) => Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(title, style: ts(size, Weight.bold, AppColors.ink)),
          if (onMore != null)
            Tap(
              onTap: onMore,
              child: Text(
                '전체 보기',
                style: ts(13, Weight.medium, AppColors.green),
              ),
            ),
        ],
      );
}

/// 민트색 AI 안내 카드.
class AiNote extends StatelessWidget {
  const AiNote({super.key, required this.title, required this.message});
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) => Box(
        width: double.infinity,
        color: AppColors.surfaceMint,
        radius: 16,
        borderColor: AppColors.borderMint,
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          spacing: 6,
          children: [
            Row(
              spacing: 6,
              children: [
                const Ic('sparkle_14'),
                Text(title, style: ts(13, Weight.bold, AppColors.green)),
              ],
            ),
            Text(
              message,
              style: ts(13, Weight.regular, AppColors.ink, lineHeight: 19.5),
            ),
          ],
        ),
      );
}

class AppButton extends StatelessWidget {
  const AppButton(
    this.label, {
    super.key,
    required this.onTap,
    this.outlined = false,
  });

  final String label;
  final VoidCallback? onTap;
  final bool outlined;

  @override
  Widget build(BuildContext context) => Tap(
        onTap: onTap,
        child: Opacity(
          opacity: onTap == null ? 0.5 : 1,
          child: Box(
            width: double.infinity,
            height: 54,
            color: outlined ? Colors.white : AppColors.green,
            radius: 14,
            borderColor: outlined ? AppColors.green : null,
            alignment: Alignment.center,
            child: Text(
              label,
              style: ts(
                16,
                Weight.bold,
                outlined ? AppColors.green : Colors.white,
              ),
            ),
          ),
        ),
      );
}

/// 화면 하단에 고정되는 버튼 영역.
class BottomBar extends StatelessWidget {
  const BottomBar({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: const BoxDecoration(
          color: Colors.white,
          border: Border(top: BorderSide(color: AppColors.border)),
        ),
        child: Padding(
          padding: EdgeInsets.fromLTRB(20, 12, 20, bottomInset(context)),
          child: child,
        ),
      );
}

/// 뒤로 가기 버튼과 가운데 제목이 있는 상단 바.
class TopBar extends StatelessWidget {
  const TopBar(this.title, {super.key, this.trailing});
  final String title;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 44,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Tap(
              onTap: () => Navigator.of(context).maybePop(),
              child: const RoundIconBox(Ic('back')),
            ),
            Text(title, style: ts(17, Weight.bold, AppColors.ink)),
            trailing ?? const SizedBox.square(dimension: 40),
          ],
        ),
      );
}

class RoundIconBox extends StatelessWidget {
  const RoundIconBox(this.icon, {super.key});
  final Widget icon;

  @override
  Widget build(BuildContext context) => Box(
        width: 40,
        height: 40,
        color: Colors.white,
        radius: 20,
        borderColor: AppColors.borderStrong,
        alignment: Alignment.center,
        child: icon,
      );
}

/// 네모 체크박스. 선택 시 초록 배경에 흰 체크를 표시한다.
class AppCheckbox extends StatelessWidget {
  const AppCheckbox({super.key, required this.checked, required this.onTap});
  final bool checked;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Tap(
        onTap: onTap,
        child: Box(
          width: 22,
          height: 22,
          color: checked ? AppColors.green : Colors.white,
          radius: 6,
          borderColor: checked ? AppColors.green : AppColors.borderInput,
          alignment: Alignment.center,
          child: checked ? const Ic('check_white') : null,
        ),
      );
}

/// 선택되지 않은 라디오 표시.
class RadioOff extends StatelessWidget {
  const RadioOff({super.key, this.color = AppColors.borderInput});
  final Color color;

  @override
  Widget build(BuildContext context) => Box(
        width: 22,
        height: 22,
        radius: 11,
        borderColor: color,
        borderWidth: 2,
      );
}

/// 흰 카드와 스크롤이 있는 화면의 기본 내용 영역.
class PageBody extends StatelessWidget {
  const PageBody({
    super.key,
    required this.children,
    this.spacing = 20,
    this.bottom = 20,
  });

  final List<Widget> children;
  final double spacing;
  final double bottom;

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: EdgeInsets.fromLTRB(20, topInset(context), 20, bottom),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          spacing: spacing,
          children: children,
        ),
      );
}

/// 상태바 아래 여백. iPhone 14 Pro에서는 Figma와 같은 59pt가 된다.
double topInset(BuildContext context) =>
    math.max(MediaQuery.viewPaddingOf(context).top, 44);

/// 하단 버튼 영역의 아래 여백. iPhone 14 Pro에서는 Figma와 같은 34pt가 된다.
double bottomInset(BuildContext context) =>
    math.max(MediaQuery.viewPaddingOf(context).bottom, 16);

void showToast(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(message, style: ts(14, Weight.medium, Colors.white)),
        backgroundColor: AppColors.ink,
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 2),
      ),
    );
}
