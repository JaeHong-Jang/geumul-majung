import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../carrier/carrier_shell.dart';
import '../data/models.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'main_shell.dart';

enum Role {
  seller('판매자', '공장 부산물을 팔고 소각비를 줄여요', 'role_seller', 'factory'),
  buyer('구매자', '필요한 원료를 등급별로 골라 사요', 'role_buyer', 'recycler'),
  driver('운송기사', '가까운 마대 수거 일감을 받아요', 'role_driver', 'hauler');

  const Role(this.label, this.description, this.icon, this.serverRole);
  final String serverRole;
  final String label;
  final String description;
  final String icon;
}

/// 앱별 시작 파일에서 정한다. 있으면 역할을 고르지 않는다.
Role? appRole;

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  Role _role = appRole ?? Role.seller;
  final _account = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _account.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (_busy) return;
    if (_role == Role.seller) {
      showToast(context, '${_role.label} 화면은 아직 준비 중이에요');
      return;
    }
    final account = _account.text.trim();
    if (account.isEmpty || _password.text.isEmpty) {
      showToast(context, '계정과 비밀번호를 입력해 주세요');
      return;
    }
    setState(() => _busy = true);
    try {
      await api.login(account, _password.text);
    } on ApiException catch (error) {
      if (mounted) {
        setState(() => _busy = false);
        showToast(context, error.message);
      }
      return;
    }
    if (!mounted) return;
    setState(() => _busy = false);
    if (api.company?['role'] != _role.serverRole) {
      api.logout();
      showToast(context, '${_role.label} 계정이 아니에요');
      return;
    }
    if (_role == Role.buyer) {
      cart.clear();
      live.start();
    }
    final Widget home =
        _role == Role.buyer ? const MainShell() : const CarrierShell();
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => home),
    );
  }

  @override
  Widget build(BuildContext context) {
    final top = math.max(MediaQuery.viewPaddingOf(context).top + 9, 68.0);
    return Scaffold(
      body: LayoutBuilder(
        builder: (context, constraints) => SingleChildScrollView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: IntrinsicHeight(
              child: Padding(
                padding: EdgeInsets.fromLTRB(24, top, 24, 40),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: 24,
                  children: [
                    Row(
                      spacing: 10,
                      children: [
                        const Ic('logo_mark'),
                        Text(
                          '잔재미',
                          style: displayStyle(26, AppColors.green),
                        ),
                      ],
                    ),
                    SizedBox(
                      width: double.infinity,
                      child: Text(
                        appRole == null
                            ? '어떤 일로 잔재미를 쓰시나요?'
                            : '${appRole!.label} 로그인',
                        textAlign: TextAlign.center,
                        style: ts(
                          24,
                          Weight.bold,
                          AppColors.ink,
                          lineHeight: 32.4,
                          spacing: -0.4,
                        ),
                      ),
                    ),
                    if (appRole == null) Column(
                      spacing: 10,
                      children: [
                        for (final role in Role.values)
                          _RoleCard(
                            role: role,
                            selected: role == _role,
                            onTap: () => setState(() => _role = role),
                          ),
                      ],
                    ),
                    Column(
                      spacing: 12,
                      children: [
                        _Field(
                          controller: _account,
                          label: '사업자 계정',
                          hint: '이메일 또는 사업자등록번호',
                          keyboardType: TextInputType.emailAddress,
                        ),
                        _Field(
                          controller: _password,
                          label: '비밀번호',
                          hint: '비밀번호를 입력하세요',
                          obscureText: true,
                        ),
                      ],
                    ),
                    const Spacer(),
                    Column(
                      spacing: 14,
                      children: [
                        AppButton(
                          _busy ? '로그인 중…' : '${_role.label}로 로그인',
                          onTap: _login,
                        ),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          spacing: 16,
                          children: [
                            Text(
                              '회원가입',
                              style: ts(13, Weight.medium, AppColors.green),
                            ),
                            Text(
                              '|',
                              style: ts(13, Weight.regular, AppColors.divider),
                            ),
                            Text(
                              '아이디·비밀번호 찾기',
                              style: ts(13, Weight.regular, AppColors.body),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _RoleCard extends StatelessWidget {
  const _RoleCard({
    required this.role,
    required this.selected,
    required this.onTap,
  });

  final Role role;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Tap(
        onTap: onTap,
        child: Box(
          width: double.infinity,
          color: selected ? AppColors.surfaceMint : Colors.white,
          radius: 16,
          borderColor: selected ? AppColors.green : AppColors.borderStrong,
          borderWidth: 2,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            spacing: 14,
            children: [
              Box(
                width: 44,
                height: 44,
                color: selected ? AppColors.green : AppColors.surfaceGray,
                radius: 12,
                alignment: Alignment.center,
                child: Ic(
                  role.icon,
                  color: selected ? Colors.white : AppColors.green,
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: 2,
                  children: [
                    Text(
                      role.label,
                      style: ts(16, Weight.bold, AppColors.ink),
                    ),
                    Text(
                      role.description,
                      style: ts(13, Weight.regular, AppColors.body),
                    ),
                  ],
                ),
              ),
              if (selected)
                const Ic('radio_on')
              else
                const RadioOff(color: AppColors.borderStrong),
            ],
          ),
        ),
      );
}

class _Field extends StatelessWidget {
  const _Field({
    required this.controller,
    required this.label,
    required this.hint,
    this.keyboardType,
    this.obscureText = false,
  });

  final TextEditingController controller;
  final String label;
  final String hint;
  final TextInputType? keyboardType;
  final bool obscureText;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 6,
        children: [
          Text(label, style: ts(13, Weight.medium, AppColors.inkMuted)),
          SizedBox(
            height: 50,
            child: TextField(
              controller: controller,
              keyboardType: keyboardType,
              obscureText: obscureText,
              style: ts(15, Weight.regular, AppColors.ink),
              cursorColor: AppColors.green,
              decoration: inputDecoration(hint, 15),
            ),
          ),
        ],
      );
}

/// 입력창 공통 모양.
InputDecoration inputDecoration(String hint, double hintSize) {
  OutlineInputBorder border(Color color) => OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: color, width: 1.5),
      );
  return InputDecoration(
    hintText: hint,
    hintStyle: ts(hintSize, Weight.regular, AppColors.hint),
    filled: true,
    fillColor: Colors.white,
    contentPadding: const EdgeInsets.all(14),
    enabledBorder: border(AppColors.borderInput),
    focusedBorder: border(AppColors.green),
  );
}
