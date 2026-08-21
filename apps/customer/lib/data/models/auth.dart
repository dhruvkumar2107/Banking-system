/// A pair of JWTs plus metadata, as issued by the API on login / registration.
class TokenPair {
  const TokenPair({
    required this.accessToken,
    required this.refreshToken,
    required this.tokenType,
    required this.expiresIn,
  });

  final String accessToken;
  final String refreshToken;
  final String tokenType;
  final int expiresIn;

  factory TokenPair.fromJson(Map<String, dynamic> json) => TokenPair(
        accessToken: json['accessToken'] as String,
        refreshToken: json['refreshToken'] as String,
        tokenType: json['tokenType'] as String? ?? 'Bearer',
        expiresIn: (json['expiresIn'] as num?)?.toInt() ?? 900,
      );
}

/// Minimal signed-in customer identity returned alongside tokens.
class AuthCustomer {
  const AuthCustomer({required this.id, required this.name, required this.mobile});

  final String id;
  final String name;
  final String mobile;

  factory AuthCustomer.fromJson(Map<String, dynamic> json) => AuthCustomer(
        id: json['id'] as String,
        name: json['name'] as String? ?? '',
        mobile: json['mobile'] as String? ?? '',
      );

  Map<String, dynamic> toJson() => <String, dynamic>{'id': id, 'name': name, 'mobile': mobile};
}

/// Result of `POST /auth/otp/request`.
class OtpRequestResult {
  const OtpRequestResult({
    required this.sent,
    required this.devCode,
    required this.expiresInSeconds,
    required this.isRegistered,
  });

  final bool sent;

  /// Present only when the server has OTP dev-echo enabled (never in prod).
  final String? devCode;
  final int expiresInSeconds;
  final bool isRegistered;

  factory OtpRequestResult.fromJson(Map<String, dynamic> json) => OtpRequestResult(
        sent: json['sent'] as bool? ?? true,
        devCode: json['devCode'] as String?,
        expiresInSeconds: (json['expiresInSeconds'] as num?)?.toInt() ?? 300,
        isRegistered: json['isRegistered'] as bool? ?? false,
      );
}

/// Result of `POST /auth/otp/verify`. Either the customer is now logged in
/// (`registered == true`, tokens + customer present) or they must complete
/// registration (`registered == false`, `registrationToken` present).
class OtpVerifyResult {
  const OtpVerifyResult({
    required this.registered,
    required this.tokens,
    required this.customer,
    required this.registrationToken,
  });

  final bool registered;
  final TokenPair? tokens;
  final AuthCustomer? customer;
  final String? registrationToken;

  factory OtpVerifyResult.fromJson(Map<String, dynamic> json) {
    final bool registered = json['registered'] as bool? ?? false;
    return OtpVerifyResult(
      registered: registered,
      tokens: registered ? TokenPair.fromJson(json) : null,
      customer: registered && json['customer'] != null
          ? AuthCustomer.fromJson(Map<String, dynamic>.from(json['customer'] as Map))
          : null,
      registrationToken: json['registrationToken'] as String?,
    );
  }
}

/// Result of `POST /auth/register`.
class RegisterResult {
  const RegisterResult({
    required this.tokens,
    required this.customer,
    required this.accountId,
    required this.accountNumber,
  });

  final TokenPair tokens;
  final AuthCustomer customer;
  final String accountId;
  final String accountNumber;

  factory RegisterResult.fromJson(Map<String, dynamic> json) {
    final Map<String, dynamic> acc =
        Map<String, dynamic>.from((json['pigmyAccount'] as Map?) ?? const <String, dynamic>{});
    return RegisterResult(
      tokens: TokenPair.fromJson(json),
      customer: AuthCustomer.fromJson(Map<String, dynamic>.from(json['customer'] as Map)),
      accountId: acc['id'] as String? ?? '',
      accountNumber: acc['accountNumber'] as String? ?? '',
    );
  }
}
