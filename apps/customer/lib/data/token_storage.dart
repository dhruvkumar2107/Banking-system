import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'models/auth.dart';

/// Persists JWTs and the signed-in customer identity in the platform's secure
/// storage (Keystore / Keychain), with an in-memory cache for synchronous reads
/// on the request hot-path.
class TokenStorage {
  TokenStorage([FlutterSecureStorage? storage])
      : _storage = storage ??
            // flutter_secure_storage 11 encrypts on Android by default
            // (AES-GCM data + RSA-OAEP key wrapping), so the old
            // `encryptedSharedPreferences` flag no longer exists.
            const FlutterSecureStorage(aOptions: AndroidOptions());

  final FlutterSecureStorage _storage;

  static const String _kAccess = 'pigmee.accessToken';
  static const String _kRefresh = 'pigmee.refreshToken';
  static const String _kCustomer = 'pigmee.customer';

  String? _access;
  String? _refresh;
  AuthCustomer? _customer;

  String? get accessToken => _access;
  String? get refreshToken => _refresh;
  AuthCustomer? get customer => _customer;
  bool get isAuthenticated => _access != null && _refresh != null;

  /// Hydrate the in-memory cache from disk. Call once at startup.
  Future<void> load() async {
    _access = await _storage.read(key: _kAccess);
    _refresh = await _storage.read(key: _kRefresh);
    final String? raw = await _storage.read(key: _kCustomer);
    if (raw != null) {
      try {
        _customer = AuthCustomer.fromJson(jsonDecode(raw) as Map<String, dynamic>);
      } catch (_) {
        _customer = null;
      }
    }
  }

  Future<void> saveTokens({required String access, required String refresh}) async {
    _access = access;
    _refresh = refresh;
    await _storage.write(key: _kAccess, value: access);
    await _storage.write(key: _kRefresh, value: refresh);
  }

  Future<void> saveCustomer(AuthCustomer customer) async {
    _customer = customer;
    await _storage.write(key: _kCustomer, value: jsonEncode(customer.toJson()));
  }

  Future<void> clear() async {
    _access = null;
    _refresh = null;
    _customer = null;
    await _storage.delete(key: _kAccess);
    await _storage.delete(key: _kRefresh);
    await _storage.delete(key: _kCustomer);
  }
}
