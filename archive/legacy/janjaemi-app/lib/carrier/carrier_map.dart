import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../theme/app_theme.dart';
import 'carrier_data.dart';
import 'carrier_theme.dart';
import 'carrier_widgets.dart';

/// 앱에 포함된 타일을 먼저 쓰고, 없는 칸만 인터넷에서 받는다.
class _BundledTiles extends TileProvider {
  _BundledTiles(this.bundled);
  final Set<String> bundled;
  final _network = NetworkTileProvider();

  @override
  bool get supportsCancelLoading => true;

  @override
  ImageProvider getImageWithCancelLoadingSupport(
    TileCoordinates coordinates,
    TileLayer options,
    Future<void> cancelLoading,
  ) {
    final path =
        'assets/map_tiles/${coordinates.z}_${coordinates.x}_${coordinates.y}.png';
    return bundled.contains(path)
        ? AssetImage(path)
        : _network.getImageWithCancelLoadingSupport(
            coordinates,
            options,
            cancelLoading,
          );
  }

  @override
  void dispose() {
    _network.dispose();
    super.dispose();
  }
}

/// 원본 지도의 `saturate(.72) contrast(.96)` 색감.
const _tileFilter = ColorFilter.matrix([
  0.76, 0.2, 0.02, 0, 5.1,
  0.06, 0.9, 0.02, 0, 5.1,
  0.06, 0.2, 0.72, 0, 5.1,
  0, 0, 0, 1, 0,
]);

class _Base extends StatefulWidget {
  const _Base({
    required this.data,
    required this.fit,
    required this.padding,
    required this.children,
    this.interactive = true,
  });

  final CarrierData data;
  final List<LatLng> fit;
  final EdgeInsets padding;
  final List<Widget> children;
  final bool interactive;

  @override
  State<_Base> createState() => _BaseState();
}

class _BaseState extends State<_Base> {
  late final _tiles = _BundledTiles(widget.data.bundledTiles);

  @override
  Widget build(BuildContext context) => FlutterMap(
        options: MapOptions(
          backgroundColor: CarrierColors.mapEmpty,
          minZoom: 6,
          maxZoom: 19,
          initialCameraFit: CameraFit.coordinates(
            coordinates: widget.fit,
            padding: widget.padding,
            maxZoom: 13,
          ),
          interactionOptions: InteractionOptions(
            flags: widget.interactive
                ? InteractiveFlag.all & ~InteractiveFlag.rotate
                : InteractiveFlag.none,
          ),
        ),
        children: [
          ColorFiltered(
            colorFilter: _tileFilter,
            child: TileLayer(
              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              userAgentPackageName: 'com.janjaemi.janjaemi',
              tileProvider: _tiles,
            ),
          ),
          ...widget.children,
          const _Attribution(),
        ],
      );
}

class _Attribution extends StatelessWidget {
  const _Attribution();

  @override
  Widget build(BuildContext context) => Align(
        alignment: Alignment.bottomRight,
        child: Container(
          color: const Color(0xDBFFFFFF),
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Text(
            '© OpenStreetMap 기여자',
            style: ts(10, Weight.regular, const Color(0xFF333333)),
          ),
        ),
      );
}

Polyline<Object> _casing(List<LatLng> points) => Polyline(
      points: points,
      color: const Color(0xE6FFFFFF),
      strokeWidth: 8,
      strokeCap: StrokeCap.round,
      strokeJoin: StrokeJoin.round,
    );

Polyline<Object> _route(List<LatLng> points) => Polyline(
      points: points,
      color: CarrierColors.brand,
      strokeWidth: 5,
      strokeCap: StrokeCap.round,
      strokeJoin: StrokeJoin.round,
    );

Marker _circle(LatLng at, Color fill, Color edge, double width) => Marker(
      point: at,
      width: 20,
      height: 20,
      child: Container(
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: fill,
          border: Border.all(color: edge, width: width),
          boxShadow: const [
            BoxShadow(
              color: Color(0x59000000),
              offset: Offset(0, 1),
              blurRadius: 4,
            ),
          ],
        ),
      ),
    );

Marker _pick(LatLng at) => _circle(at, Colors.white, CarrierColors.brand, 5);
Marker _drop(LatLng at) => _circle(at, CarrierColors.brand, Colors.white, 3);

Marker _truck(LatLng at) => Marker(
      point: at,
      width: 32,
      height: 32,
      child: Container(
        alignment: Alignment.center,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: CarrierColors.accent,
          border: Border.all(color: Colors.white, width: 2),
          boxShadow: const [
            BoxShadow(
              color: Color(0x66000000),
              offset: Offset(0, 2),
              blurRadius: 8,
            ),
          ],
        ),
        child: const CIc('truck', size: 16, color: CarrierColors.onAccent),
      ),
    );

Marker _label(LatLng at, String text, {required bool up}) => Marker(
      point: at,
      width: 56,
      height: 96,
      child: Align(
        alignment: up ? Alignment.topCenter : Alignment.bottomCenter,
        child: Container(
          margin: EdgeInsets.only(top: up ? 6 : 0, bottom: up ? 0 : 6),
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(8),
            boxShadow: const [
              BoxShadow(
                color: Color(0x3D000000),
                offset: Offset(0, 2),
                blurRadius: 8,
              ),
            ],
          ),
          child: Text(text, style: cs(12, Weight.bold, CarrierColors.ink)),
        ),
      ),
    );

/// 요청 상세: 공차 구간(점선)과 적재 구간.
class SelectedOrderMap extends StatelessWidget {
  const SelectedOrderMap({super.key, required this.data, required this.order});
  final CarrierData data;
  final CarrierOrder order;

  @override
  Widget build(BuildContext context) {
    final first = order.stops.first;
    final last = order.stops.last;
    return _Base(
      data: data,
      fit: [...order.emptyLine, ...order.line],
      padding: const EdgeInsets.fromLTRB(72, 40 + 59, 40, 48),
      children: [
        PolylineLayer(
          polylines: [
            Polyline(
              points: order.emptyLine,
              color: CarrierColors.muted,
              strokeWidth: 4,
              strokeCap: StrokeCap.round,
              pattern: StrokePattern.dashed(segments: const [2, 8]),
            ),
            _casing(order.line),
            _route(order.line),
          ],
        ),
        MarkerLayer(
          markers: [
            _truck(data.depot),
            for (final stop in order.stops.sublist(0, order.stops.length - 1))
              _pick(stop),
            _drop(last),
            _label(first, '상차', up: true),
            _label(last, '하차', up: false),
          ],
        ),
      ],
    );
  }
}

/// 운행 중: 현재 구간과 트럭 위치.
class TripMap extends StatelessWidget {
  const TripMap({
    super.key,
    required this.data,
    required this.order,
    required this.stage,
  });

  final CarrierData data;
  final CarrierOrder order;
  final int stage;

  @override
  Widget build(BuildContext context) {
    final moving = stage == 0;
    final coords = moving ? order.emptyLine : order.line;
    final last = order.stops.last;
    final at = switch (stage) {
      0 => data.depot,
      1 => order.stops.first,
      2 => coords[(coords.length * 0.4).floor()],
      _ => last,
    };
    return _Base(
      data: data,
      fit: coords,
      interactive: false,
      padding: const EdgeInsets.fromLTRB(72, 24, 40, 48),
      children: [
        PolylineLayer(polylines: [_casing(coords), _route(coords)]),
        MarkerLayer(
          markers: [
            if (moving)
              _pick(order.stops.first)
            else ...[
              for (final stop in order.stops.sublist(0, order.stops.length - 1))
                _pick(stop),
              _drop(last),
            ],
            _truck(at),
          ],
        ),
      ],
    );
  }
}

/// 운반 요청 지도 보기: 콜마다 운임 표식을 올린다.
class OrdersMap extends StatelessWidget {
  const OrdersMap({
    super.key,
    required this.data,
    required this.orders,
    required this.onPin,
  });

  final CarrierData data;
  final List<CarrierOrder> orders;
  final ValueChanged<CarrierOrder> onPin;

  @override
  Widget build(BuildContext context) => _Base(
        data: data,
        fit: [
          data.depot,
          for (final order in orders)
            if (data.inGraph(order.stops.first)) order.stops.first,
        ],
        padding: const EdgeInsets.fromLTRB(40, 120, 40, 72),
        children: [
          MarkerLayer(
            markers: [
              _truck(data.depot),
              for (final order in orders)
                Marker(
                  point: order.stops.first,
                  width: 64,
                  height: 28,
                  child: GestureDetector(
                    onTap: () => onPin(order),
                    child: Center(
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: CarrierColors.brand,
                          borderRadius: BorderRadius.circular(8),
                          boxShadow: const [
                            BoxShadow(
                              color: Color(0x47000000),
                              offset: Offset(0, 2),
                              blurRadius: 8,
                            ),
                          ],
                        ),
                        child: Text(
                          '${(order.fare / 10000).toStringAsFixed(1)}만',
                          style: ts(12, Weight.bold, Colors.white),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ],
      );
}
