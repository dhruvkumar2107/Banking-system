import 'package:dio/dio.dart';

import '../core/config.dart';
import 'api_exception.dart';
import 'models/auth.dart';
import 'token_storage.dart';

/// Thin wrapper over Dio that:
///  * points at [AppConfig.apiBaseUrl];
///  * attaches the bearer access token to every request;
///  * on a `401`, transparently refreshes the token once and replays the
///    original request — and if refresh fails, clears the session and invokes
///    [onUnauthorized] so the app can redirect to login;
///  * maps transport / server errors to a friendly [ApiException].
class ApiClient {
  ApiClient(this._storage) {
    _dio = Dio(_baseOptions())..interceptors.add(_authInterceptor());
    _refreshDio = Dio(_baseOptions());
  }

  final TokenStorage _storage;
  late final Dio _dio;

  /// A bare client (no interceptors) used solely for the refresh call, so a
  /// `401` from `/auth/refresh` can never recurse back into the refresh flow.
  late final Dio _refreshDio;

  /// Invoked when the session can no longer be recovered (refresh failed or no
  /// refresh token). The auth layer wires this to a forced logout + redirect.
  void Function()? onUnauthorized;

  /// De-duplicates concurrent refreshes: many in-flight requests hitting 401 at
  /// once all await the same refresh Future.
  Future<String>? _refreshing;

  BaseOptions _baseOptions() => BaseOptions(
        baseUrl: AppConfig.apiBaseUrl,
        connectTimeout: AppConfig.connectTimeout,
        receiveTimeout: AppConfig.receiveTimeout,
        headers: <String, dynamic>{'Accept': 'application/json'},
        // We inspect status codes ourselves so the interceptor can react to 401.
        validateStatus: (int? code) => code != null && code < 500,
      );

  InterceptorsWrapper _authInterceptor() => InterceptorsWrapper(
        onRequest: (RequestOptions options, RequestInterceptorHandler handler) {
          final String? token = _storage.accessToken;
          if (token != null && !options.headers.containsKey('Authorization')) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
        onResponse: (Response<dynamic> response, ResponseInterceptorHandler handler) async {
          // validateStatus lets 4xx through as a normal response; surface the
          // ones we treat as errors here so callers get an ApiException.
          final int code = response.statusCode ?? 0;
          if (code == 401 && !_isAuthPath(response.requestOptions.path)) {
            await _handleUnauthorized(response.requestOptions, handler);
            return;
          }
          if (code >= 400) {
            handler.reject(_toDioError(response.requestOptions, response));
            return;
          }
          handler.next(response);
        },
        onError: (DioException error, ErrorInterceptorHandler handler) {
          handler.reject(error);
        },
      );

  bool _isAuthPath(String path) =>
      path.contains('/auth/otp') ||
      path.contains('/auth/register') ||
      path.contains('/auth/refresh');

  Future<void> _handleUnauthorized(
    RequestOptions original,
    ResponseInterceptorHandler handler,
  ) async {
    if (original.extra['pigmee.retried'] == true) {
      // Already retried once with a fresh token and still 401 — give up.
      await _forceLogout();
      handler.reject(_toDioError(original, null, message: 'Session expired. Please sign in again.'));
      return;
    }
    try {
      final String newToken = await _refresh();
      original.extra['pigmee.retried'] = true;
      original.headers['Authorization'] = 'Bearer $newToken';
      final Response<dynamic> replay = await _dio.fetch<dynamic>(original);
      handler.resolve(replay);
    } catch (_) {
      await _forceLogout();
      handler.reject(_toDioError(original, null, message: 'Session expired. Please sign in again.'));
    }
  }

  Future<String> _refresh() {
    return _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);
  }

  Future<String> _doRefresh() async {
    final String? refreshToken = _storage.refreshToken;
    if (refreshToken == null) {
      throw ApiException('No refresh token', statusCode: 401);
    }
    final Response<dynamic> res = await _refreshDio.post<dynamic>(
      '/auth/refresh',
      data: <String, dynamic>{'refreshToken': refreshToken},
    );
    if ((res.statusCode ?? 0) >= 400 || res.data is! Map) {
      throw ApiException('Refresh failed', statusCode: res.statusCode);
    }
    final TokenPair pair = TokenPair.fromJson(Map<String, dynamic>.from(res.data as Map));
    await _storage.saveTokens(access: pair.accessToken, refresh: pair.refreshToken);
    return pair.accessToken;
  }

  Future<void> _forceLogout() async {
    await _storage.clear();
    onUnauthorized?.call();
  }

  // ---------------------------------------------------------------------------
  // Public request helpers
  // ---------------------------------------------------------------------------

  Future<Map<String, dynamic>> getJson(String path, {Map<String, dynamic>? query}) async {
    final Response<dynamic> res = await _request(() => _dio.get<dynamic>(path, queryParameters: query));
    return _asMap(res.data);
  }

  /// Like [getJson] but tolerates an empty / `null` body (returns `null`),
  /// e.g. `GET /me/bank-details` when no bank account is linked yet.
  Future<Map<String, dynamic>?> getJsonOrNull(String path, {Map<String, dynamic>? query}) async {
    final Response<dynamic> res = await _request(() => _dio.get<dynamic>(path, queryParameters: query));
    final dynamic data = res.data;
    if (data == null || (data is String && data.isEmpty)) return null;
    if (data is Map) return Map<String, dynamic>.from(data);
    throw ApiException('Unexpected response shape');
  }

  Future<List<dynamic>> getList(String path, {Map<String, dynamic>? query}) async {
    final Response<dynamic> res = await _request(() => _dio.get<dynamic>(path, queryParameters: query));
    final dynamic data = res.data;
    if (data is List) return data;
    throw ApiException('Unexpected response shape', statusCode: res.statusCode);
  }

  Future<List<int>> getBytes(String path, {Map<String, dynamic>? query}) async {
    final Response<List<int>> res = await _request(
      () => _dio.get<List<int>>(
        path,
        queryParameters: query,
        options: Options(responseType: ResponseType.bytes),
      ),
    );
    return res.data ?? const <int>[];
  }

  Future<Map<String, dynamic>> post(String path, {Object? body, Map<String, dynamic>? query}) async {
    final Response<dynamic> res =
        await _request(() => _dio.post<dynamic>(path, data: body, queryParameters: query));
    return _asMap(res.data);
  }

  /// Posts a single binary file as `multipart/form-data` under the field name
  /// [field]. Used for KYC photo / document upload, where the server needs the
  /// real bytes (and sniffs them) rather than a client-supplied URL.
  Future<Map<String, dynamic>> postFile(
    String path, {
    required List<int> bytes,
    required String fileName,
    required String contentType,
    String field = 'file',
  }) async {
    final FormData form = FormData.fromMap(<String, dynamic>{
      field: MultipartFile.fromBytes(
        bytes,
        filename: fileName,
        contentType: DioMediaType.parse(contentType),
      ),
    });
    final Response<dynamic> res = await _request(
      () => _dio.post<dynamic>(
        path,
        data: form,
        // Uploads over a rural mobile link need more headroom than a JSON call.
        options: Options(sendTimeout: const Duration(seconds: 60)),
      ),
    );
    return _asMap(res.data);
  }

  Future<Map<String, dynamic>> put(String path, {Object? body}) async {
    final Response<dynamic> res = await _request(() => _dio.put<dynamic>(path, data: body));
    return _asMap(res.data);
  }

  Future<Map<String, dynamic>> patch(String path, {Object? body}) async {
    final Response<dynamic> res = await _request(() => _dio.patch<dynamic>(path, data: body));
    return _asMap(res.data);
  }

  Future<Map<String, dynamic>> delete(String path, {Object? body}) async {
    final Response<dynamic> res = await _request(() => _dio.delete<dynamic>(path, data: body));
    return res.data is Map ? _asMap(res.data) : <String, dynamic>{};
  }

  /// Runs a Dio call and normalises any failure into an [ApiException].
  Future<Response<T>> _request<T>(Future<Response<T>> Function() run) async {
    try {
      return await run();
    } on DioException catch (e) {
      throw _mapDioException(e);
    }
  }

  Map<String, dynamic> _asMap(dynamic data) {
    if (data is Map) return Map<String, dynamic>.from(data);
    throw ApiException('Unexpected response shape');
  }

  // ---------------------------------------------------------------------------
  // Error mapping
  // ---------------------------------------------------------------------------

  DioException _toDioError(RequestOptions options, Response<dynamic>? response, {String? message}) {
    return DioException(
      requestOptions: options,
      response: response,
      type: DioExceptionType.badResponse,
      error: message,
    );
  }

  ApiException _mapDioException(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.transformTimeout:
        return ApiException('The server took too long to respond. Please try again.');
      case DioExceptionType.connectionError:
        return ApiException('Cannot reach the server. Check your connection.');
      case DioExceptionType.cancel:
        return ApiException('Request cancelled.');
      case DioExceptionType.badCertificate:
        return ApiException('Secure connection failed.');
      case DioExceptionType.badResponse:
      case DioExceptionType.unknown:
        final Response<dynamic>? res = e.response;
        if (res != null) {
          return ApiException(
            _serverMessage(res.data) ?? (e.error as String?) ?? 'Request failed.',
            statusCode: res.statusCode,
            code: _serverCode(res.data),
            stage: _serverField(res.data, 'stage'),
          );
        }
        return ApiException((e.error as String?) ?? 'Something went wrong. Please try again.');
    }
  }

  /// Turns a server-returned absolute path such as `/api/uploads/<id>/<file>`
  /// into a path relative to [AppConfig.apiBaseUrl] (which already ends in
  /// `/api`), so it can be fetched through this client. Leaves fully-qualified
  /// URLs and already-relative paths alone.
  static String stripApiPrefix(String url) {
    if (url.startsWith('/api/')) return url.substring(4);
    return url;
  }

  /// Extracts a human message from a Nest error body:
  /// `{statusCode, message: string | string[], error}`.
  String? _serverMessage(dynamic data) {
    if (data is Map) {
      final dynamic message = data['message'];
      if (message is String && message.isNotEmpty) return message;
      if (message is List && message.isNotEmpty) {
        return message.map((dynamic m) => '$m').join('\n');
      }
      final dynamic error = data['error'];
      if (error is String && error.isNotEmpty) return error;
    }
    if (data is String && data.isNotEmpty) return data;
    return null;
  }

  /// The machine-readable code from a Nest error body, preferring the explicit
  /// `code` (e.g. `KYC_REQUIRED`) and falling back to the error name
  /// (`KycRequired`) — the gate refusal carries both.
  String? _serverCode(dynamic data) => _serverField(data, 'code') ?? _serverField(data, 'error');

  String? _serverField(dynamic data, String key) {
    if (data is Map) {
      final dynamic value = data[key];
      if (value is String && value.isNotEmpty) return value;
    }
    return null;
  }
}
