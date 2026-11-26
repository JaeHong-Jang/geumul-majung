import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'login_screen.dart';

/// Figma 타임라인(3.2초 반복)의 키프레임 한 점.
class _Key {
  const _Key(this.at, this.value, [this.curve = Curves.linear]);
  final double at;
  final double value;

  /// 이 키프레임에서 다음 키프레임까지 적용되는 곡선.
  final Curve curve;
}

double _sample(List<_Key> keys, double t) {
  for (var i = 0; i < keys.length - 1; i++) {
    final from = keys[i];
    final to = keys[i + 1];
    if (t <= to.at) {
      final progress = (t - from.at) / (to.at - from.at);
      return from.value +
          (to.value - from.value) * from.curve.transform(progress);
    }
  }
  return keys.last.value;
}

const _truckX = [
  _Key(0, 0, Curves.easeInOut),
  _Key(.78, 100, Curves.easeOut),
  _Key(.92, 104),
  _Key(1, 104),
];
const _truckOpacity = [
  _Key(0, 0, Curves.easeOut),
  _Key(.08, 1),
  _Key(.78, 1, Curves.easeIn),
  _Key(.92, 0),
  _Key(1, 0),
];
const _sparkleOpacity = [
  _Key(0, 0),
  _Key(.7, 0, Curves.easeOut),
  _Key(.8, 1, Curves.easeIn),
  _Key(1, 0),
];

/// 차체는 0.125 주기로 1.5pt씩 위아래로 흔들린다.
final _bodyBounce = [
  for (var i = 0; i <= 16; i++)
    _Key(i / 16, i.isOdd ? -1.5 : 0, Curves.easeInOut),
];

const _wheelTurns = 31.415926;

class LoadingScreen extends StatefulWidget {
  const LoadingScreen({super.key, this.goToLogin = true});

  /// 화면 확인용으로 멈춰 두고 싶을 때 false로 둔다.
  final bool goToLogin;

  @override
  State<LoadingScreen> createState() => _LoadingScreenState();
}

class _LoadingScreenState extends State<LoadingScreen>
    with SingleTickerProviderStateMixin {
  static const _cycle = Duration(milliseconds: 3200);

  late final AnimationController _controller =
      AnimationController(vsync: this, duration: _cycle)..repeat();

  @override
  void initState() {
    super.initState();
    if (widget.goToLogin) Future.delayed(_cycle, _openLogin);
  }

  void _openLogin() {
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      PageRouteBuilder(
        transitionDuration: const Duration(milliseconds: 350),
        pageBuilder: (_, _, _) => const LoginScreen(),
        transitionsBuilder: (_, animation, _, child) =>
            FadeTransition(opacity: animation, child: child),
      ),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final subtitleStyle = ts(
      15,
      Weight.regular,
      AppColors.mint,
      lineHeight: 22.5,
    );
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: AppColors.green,
        body: Center(
          child: FittedBox(
            child: SizedBox(
              width: 393,
              height: 852,
              child: Stack(
                children: [
                  const Positioned(left: 114, top: 155, child: Ic('loading_logo')),
                  Positioned(
                    left: 0,
                    right: 0,
                    top: 323,
                    child: Text(
                      '잔재미',
                      textAlign: TextAlign.center,
                      style: displayStyle(
                        48,
                        AppColors.cream,
                        spacing: -1,
                      ),
                    ),
                  ),
                  Positioned(
                    left: 0,
                    right: 0,
                    top: 381,
                    child: Text(
                      '버려지던 잔재에서 찾는 재미',
                      textAlign: TextAlign.center,
                      style: subtitleStyle,
                    ),
                  ),
                  Positioned(
                    left: 32,
                    top: 490,
                    width: 329,
                    height: 170,
                    child: AnimatedBuilder(
                      animation: _controller,
                      builder: (_, _) => _DeliveryScene(_controller.value),
                    ),
                  ),
                  Positioned(
                    left: 0,
                    right: 0,
                    top: 726,
                    child: Text(
                      '마대를 구매 기업으로 옮기고 있어요',
                      textAlign: TextAlign.center,
                      style: ts(
                        13,
                        Weight.regular,
                        AppColors.mint,
                        lineHeight: 19,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _DeliveryScene extends StatelessWidget {
  const _DeliveryScene(this.t);
  final double t;

  @override
  Widget build(BuildContext context) => Stack(
        clipBehavior: Clip.none,
        children: [
          const Positioned(left: 0, top: 0, child: Ic('loading_road')),
          Positioned(
            left: 74,
            top: 159,
            width: 183,
            height: 6,
            child: ClipRect(
              child: OverflowBox(
                alignment: Alignment.topLeft,
                maxWidth: 303,
                child: Transform.translate(
                  offset: Offset(-120 + 120 * t, 0),
                  child: const Ic('loading_road_dash'),
                ),
              ),
            ),
          ),
          const Positioned(left: 0, top: 0, child: Ic('loading_seller_factory')),
          const Positioned(left: 0, top: 0, child: Ic('loading_buyer_factory')),
          Positioned(
            left: 271,
            top: 91,
            child: Opacity(
              opacity: _sample(_sparkleOpacity, t),
              child: const Ic('loading_sparkle'),
            ),
          ),
          Positioned(
            left: 74 + _sample(_truckX, t),
            top: 106,
            width: 84,
            height: 57,
            child: Opacity(
              opacity: _sample(_truckOpacity, t),
              child: Stack(
                children: [
                  Positioned(
                    left: 0,
                    top: _sample(_bodyBounce, t),
                    child: const Ic('loading_truck_body'),
                  ),
                  Positioned(left: 5, top: 35, child: _wheel('loading_wheel_rear')),
                  Positioned(left: 57, top: 35, child: _wheel('loading_wheel_front')),
                ],
              ),
            ),
          ),
        ],
      );

  Widget _wheel(String asset) =>
      Transform.rotate(angle: _wheelTurns * t, child: Ic(asset));
}
