import 'package:flutter/material.dart';

/// Figma `잔재미` 화면에서 쓰는 색상.
abstract final class AppColors {
  static const green = Color(0xFF286347);
  static const greenDark = Color(0xFF1B4733);
  static const gold = Color(0xFFF2B544);
  static const cream = Color(0xFFF4F1E8);
  static const mint = Color(0xFFD3E6DA);
  static const background = Color(0xFFFAF8F3);

  static const ink = Color(0xFF17251E);
  static const inkMuted = Color(0xFF36463D);
  static const body = Color(0xFF56665D);
  static const hint = Color(0xFF8A968F);
  static const divider = Color(0xFFA3AFA8);

  static const border = Color(0xFFE6EBE7);
  static const borderStrong = Color(0xFFDDE3DF);
  static const borderInput = Color(0xFFCFD8D2);
  static const borderMint = Color(0xFFCFE3D6);

  static const surfaceMint = Color(0xFFEEF5F0);
  static const surfaceGray = Color(0xFFEEF2EF);
  static const surfacePhoto = Color(0xFFE9EEEA);
  static const surfaceSoft = Color(0xFFF6F8F6);

  static const gradeB = Color(0xFFDCEBE2);
  static const gradeC = Color(0xFFF1EBDB);
  static const gradeCText = Color(0xFF5E4B1C);

  static const statusShippingBg = Color(0xFFFBEFD5);
  static const statusShippingText = Color(0xFF7A5410);
  static const priceUp = Color(0xFFC2410C);
  static const priceDown = Color(0xFF1D5FA8);
}

/// Noto Sans KR 굵기. 가변 폰트라 wght 축도 함께 지정한다.
enum Weight {
  regular(FontWeight.w400, 400),
  medium(FontWeight.w500, 500),
  bold(FontWeight.w700, 700);

  const Weight(this.fontWeight, this.axis);
  final FontWeight fontWeight;
  final double axis;
}

/// [lineHeight]가 없으면 Figma 기본 줄 높이(글자 크기의 1.2배 반올림)를 쓴다.
TextStyle ts(
  double size,
  Weight weight,
  Color color, {
  double? lineHeight,
  double? spacing,
}) =>
    TextStyle(
      fontFamily: 'NotoSansKR',
      fontSize: size,
      fontWeight: weight.fontWeight,
      fontVariations: [FontVariation('wght', weight.axis)],
      color: color,
      height: (lineHeight ?? (size * 1.2).roundToDouble()) / size,
      leadingDistribution: TextLeadingDistribution.even,
      letterSpacing: spacing,
    );

TextStyle displayStyle(double size, Color color, {double? spacing}) => TextStyle(
      fontFamily: 'BlackHanSans',
      fontSize: size,
      color: color,
      height: 1,
      leadingDistribution: TextLeadingDistribution.even,
      letterSpacing: spacing,
    );

ThemeData buildTheme() => ThemeData(
      useMaterial3: true,
      fontFamily: 'NotoSansKR',
      scaffoldBackgroundColor: AppColors.background,
      colorScheme: ColorScheme.fromSeed(
        seedColor: AppColors.green,
        primary: AppColors.green,
        surface: AppColors.background,
      ),
      splashFactory: NoSplash.splashFactory,
      highlightColor: Colors.transparent,
    );
