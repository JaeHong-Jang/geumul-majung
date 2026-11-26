import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

class ApiException implements Exception {
  const ApiException(this.status, this.message);
  final int status;
  final String message;

  @override
  String toString() => message;
}

/// 마대 장터 서버 호출. 주소는 빌드할 때 `--dart-define=API_BASE=...`로 바꾼다.
/// 토큰은 메모리에만 두므로 앱을 다시 켜면 다시 로그인한다.
class Api {
  static const baseUrl = String.fromEnvironment(
    'API_BASE',
    defaultValue: 'http://localhost:8000',
  );

  http.Client client = http.Client();
  String? _token;
  Map<String, Object?>? company;

  bool get loggedIn => _token != null;
  String get companyName => (company?['name'] as String?) ?? '';

  Future<void> login(String loginId, String password) async {
    final body = await post('/v1/auth/login', {
      'login_id': loginId,
      'password': password,
    }) as Map<String, Object?>;
    _token = body['access_token'] as String?;
    company = body['company'] as Map<String, Object?>?;
  }

  void logout() {
    _token = null;
    company = null;
  }

  Future<Object?> get(String path) => _send(
        () => client.get(Uri.parse('$baseUrl$path'), headers: _headers),
      );

  Future<Object?> post(String path, [Map<String, Object?>? body]) => _send(
        () => client.post(
          Uri.parse('$baseUrl$path'),
          headers: _headers,
          body: jsonEncode(body ?? const {}),
        ),
      );

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (_token != null) 'Authorization': 'Bearer $_token',
      };

  Future<Object?> _send(Future<http.Response> Function() request) async {
    final http.Response response;
    try {
      response = await request().timeout(const Duration(seconds: 20));
    } on TimeoutException {
      throw const ApiException(0, '서버 응답이 늦어요. 다시 시도해 주세요');
    } on http.ClientException {
      throw const ApiException(0, '서버에 연결할 수 없어요');
    }
    final text = utf8.decode(response.bodyBytes);
    final Object? data = text.isEmpty ? null : jsonDecode(text);
    if (response.statusCode >= 400) {
      final detail = data is Map ? data['detail'] : null;
      throw ApiException(
        response.statusCode,
        detail is List ? '입력값을 확인해 주세요' : '${detail ?? '요청을 처리하지 못했어요'}',
      );
    }
    return data;
  }
}

final api = Api();
