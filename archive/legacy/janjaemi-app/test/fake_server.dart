import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:janjaemi/api/api_client.dart';
import 'package:janjaemi/data/models.dart';

/// 실제 서버 대신 쓰는 최소 응답. 보낸 요청은 [fakeRequests]에 남는다.
final fakeRequests = <http.Request>[];

const fakeListing = {
  'id': 7,
  'status': 'posted',
  'waste_code': '51-03-01',
  'waste_name': '폐합성수지류(폐염화비닐수지류 제외)',
  'target_material': 'pp',
  'grade': 'A',
  'total_kg': 300.0,
  'price_krw_per_kg': 320.0,
  'bag_count': 2,
  'factory_name': '가짜공장',
  'region': '경북 구미',
};

const fakeCall = {
  'order_id': 9,
  'waste_code': '51-03-01',
  'waste_name': '폐합성수지류(폐염화비닐수지류 제외)',
  'total_kg': 300.0,
  'bag_count': 2,
  'freight_cap_krw': 80000,
  'distance_km': 3.2,
  'pickup': {'lat': 36.10, 'lon': 128.39},
  'dropoff': {'lat': 36.12, 'lon': 128.36},
  'grade': 'A',
  'pickup_name': '가짜공장',
  'pickup_region': '경북 구미',
  'dropoff_name': '가짜재활용',
  'dropoff_region': '경북 구미',
};

void useFakeServer({required String role, bool loginOk = true}) {
  fakeRequests.clear();
  api.client = MockClient((request) async {
    fakeRequests.add(request);
    http.Response json(Object? body, [int status = 200]) => http.Response.bytes(
          utf8.encode(jsonEncode(body)),
          status,
          headers: {'content-type': 'application/json'},
        );
    final path = request.url.path;
    if (path == '/v1/auth/login') {
      if (!loginOk) return json({'detail': '아이디 또는 비밀번호가 맞지 않음'}, 401);
      return json({
        'access_token': 'fake-token',
        'company': {
          'id': 1,
          'name': '가짜회사',
          'role': role,
          'verified': true,
          'lat': 36.11,
          'lon': 128.37,
        },
      });
    }
    if (path == '/v1/listings') return json([fakeListing]);
    if (path == '/v1/me/orders') return json([]);
    if (path == '/v1/calls') return json([fakeCall]);
    if (path == '/v1/orders') return json({'id': 9, 'status': 'payment_held'}, 201);
    if (path == '/v1/calls/9/accept') return json({'order_id': 9, 'status': 'dispatched'});
    return json({'detail': '없음'}, 404);
  });
}

void endFakeSession() {
  api.logout();
  live.stop();
  api.client = http.Client();
  cart.clear();
  [aluminum, peFilm, copper].forEach(cart.add);
}
