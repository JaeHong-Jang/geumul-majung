import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// hw-hayoon(HW 하윤) 프로토타입의 색상과 간격.
abstract final class CarrierColors {
  static const brand = Color(0xFF116B55);
  static const brandSoft = Color(0xFFE8F4EE);
  static const accent = Color(0xFFF3D46B);
  static const onAccent = Color(0xFF1B1B1B);
  static const background = Color(0xFFF5F7F8);
  static const ink = Color(0xFF182A2B);
  static const muted = Color(0xFF73807D);
  static const line = Color(0xFFE7ECE9);
  static const warn = Color(0xFF9A4E06);
  static const notice = Color(0xFFD9822B);
  static const gradeB = Color(0xFF2B5C9E);
  static const gradeC = Color(0xFFA85A10);
  static const glass = Color(0x2EFFFFFF);
  static const mapEmpty = Color(0xFFDDE3DB);
}

abstract final class CarrierSpace {
  static const s1 = 4.0;
  static const s2 = 8.0;
  static const s3 = 12.0;
  static const s4 = 16.0;
  static const s6 = 24.0;
}

/// 원본 CSS의 줄 높이: 기본 1.45, 20px은 1.3, 28px은 1.2.
TextStyle cs(
  double size,
  Weight weight,
  Color color, {
  bool tabular = false,
}) {
  final ratio = switch (size) { 28 => 1.2, 20 => 1.3, _ => 1.45 };
  return ts(size, weight, color, lineHeight: size * ratio).copyWith(
    fontFeatures: tabular ? const [FontFeature.tabularFigures()] : null,
  );
}

const carrierShadow = [
  BoxShadow(color: Color(0x24143C28), offset: Offset(0, 4), blurRadius: 16),
];

/// 원본의 `won()`.
String won(num value) {
  final digits = value.round().abs().toString();
  final grouped = digits.replaceAllMapped(
    RegExp(r'\B(?=(\d{3})+(?!\d))'),
    (_) => ',',
  );
  return '${value < 0 ? '-' : ''}$grouped원';
}

String km1(double value) => '${value.toStringAsFixed(1)}km';
