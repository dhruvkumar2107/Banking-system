import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/models/auth.dart';
import '../data/repositories/auth_repository.dart';
import '../data/token_storage.dart';
import 'providers.dart';

/// Whether we know if the user is signed in yet, and if so, who.
enum AuthStatus { unknown, authenticated, unauthenticated }

class AuthState {
  const AuthState(this.status, {this.customer});

  const AuthState.unknown()
      : status = AuthStatus.unknown,
        customer = null;
  const AuthState.unauthenticated()
      : status = AuthStatus.unauthenticated,
        customer = null;
  const AuthState.authenticated(AuthCustomer this.customer) : status = AuthStatus.authenticated;

  final AuthStatus status;
  final AuthCustomer? customer;

  bool get isAuthenticated => status == AuthStatus.authenticated;
  bool get isResolved => status != AuthStatus.unknown;
}

final StateNotifierProvider<AuthController, AuthState> authControllerProvider =
    StateNotifierProvider<AuthController, AuthState>(
  (ref) => AuthController(ref.watch(authRepositoryProvider), ref.watch(tokenStorageProvider)),
);

/// Owns the session lifecycle: seeds initial state from persisted tokens, flips
/// to authenticated on a successful OTP verify / registration, and clears on
/// logout or an unrecoverable 401.
class AuthController extends StateNotifier<AuthState> {
  AuthController(this._repo, TokenStorage storage)
      : super(
          storage.isAuthenticated && storage.customer != null
              ? AuthState.authenticated(storage.customer!)
              : const AuthState.unauthenticated(),
        );

  final AuthRepository _repo;

  /// Verify an OTP. If the mobile already belongs to a customer, this logs them
  /// in (state → authenticated). A new mobile returns `registered == false` with
  /// a registration token for the next step; state is left unauthenticated.
  Future<OtpVerifyResult> verifyOtp(String mobile, String code) async {
    final OtpVerifyResult result = await _repo.verifyOtp(mobile, code);
    if (result.registered && result.customer != null) {
      state = AuthState.authenticated(result.customer!);
    }
    return result;
  }

  /// Complete registration for a new customer and sign them in.
  Future<RegisterResult> register({
    required String registrationToken,
    required String name,
    required String villageId,
    String? address,
    int? dailyAmountRupees,
  }) async {
    final RegisterResult result = await _repo.register(
      registrationToken: registrationToken,
      name: name,
      villageId: villageId,
      address: address,
      dailyAmountRupees: dailyAmountRupees,
    );
    state = AuthState.authenticated(result.customer);
    return result;
  }

  Future<void> logout() async {
    await _repo.logout();
    state = const AuthState.unauthenticated();
  }

  /// Invoked by the API client after a failed token refresh — the session is
  /// already cleared locally, so we just reflect it in state.
  void onSessionExpired() {
    if (mounted) state = const AuthState.unauthenticated();
  }
}
