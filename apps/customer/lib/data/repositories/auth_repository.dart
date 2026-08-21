import '../api_client.dart';
import '../models/auth.dart';
import '../token_storage.dart';

/// Authentication + registration flows against `/api/auth/*`.
class AuthRepository {
  AuthRepository(this._api, this._storage);

  final ApiClient _api;
  final TokenStorage _storage;

  /// Step 1 — request an OTP for [mobile]. In dev mode the response echoes the
  /// code so the login screen can prefill it.
  Future<OtpRequestResult> requestOtp(String mobile) async {
    final Map<String, dynamic> json =
        await _api.post('/auth/otp/request', body: <String, dynamic>{'mobile': mobile});
    return OtpRequestResult.fromJson(json);
  }

  /// Step 2 — verify the OTP. On success for an existing customer this persists
  /// the tokens and identity; a new mobile returns a [registrationToken].
  Future<OtpVerifyResult> verifyOtp(String mobile, String code) async {
    final Map<String, dynamic> json = await _api.post(
      '/auth/otp/verify',
      body: <String, dynamic>{'mobile': mobile, 'code': code},
    );
    final OtpVerifyResult result = OtpVerifyResult.fromJson(json);
    if (result.registered && result.tokens != null) {
      await _persist(result.tokens!, result.customer);
    }
    return result;
  }

  /// Step 3 (new customers only) — complete registration and log in.
  Future<RegisterResult> register({
    required String registrationToken,
    required String name,
    required String villageId,
    String? address,
    int? dailyAmountRupees,
  }) async {
    final Map<String, dynamic> body = <String, dynamic>{
      'registrationToken': registrationToken,
      'name': name,
      'villageId': villageId,
      if (address != null && address.trim().isNotEmpty) 'address': address.trim(),
      'dailyAmountRupees': ?dailyAmountRupees,
    };
    final Map<String, dynamic> json = await _api.post('/auth/register', body: body);
    final RegisterResult result = RegisterResult.fromJson(json);
    await _persist(result.tokens, result.customer);
    return result;
  }

  /// Revoke the refresh token server-side, then clear local state. Network
  /// failures are swallowed — the local session is cleared regardless.
  Future<void> logout() async {
    final String? refresh = _storage.refreshToken;
    if (refresh != null) {
      try {
        await _api.post('/auth/logout', body: <String, dynamic>{'refreshToken': refresh});
      } catch (_) {
        // Best-effort revoke; local clear below is what matters for the user.
      }
    }
    await _storage.clear();
  }

  Future<void> _persist(TokenPair tokens, AuthCustomer? customer) async {
    await _storage.saveTokens(access: tokens.accessToken, refresh: tokens.refreshToken);
    if (customer != null) {
      await _storage.saveCustomer(customer);
    }
  }
}
