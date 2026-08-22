/// A user-facing API error with an optional HTTP status code.
class ApiException implements Exception {
  ApiException(this.message, {this.statusCode, this.code, this.stage});

  final String message;
  final int? statusCode;

  /// Machine-readable error identifier when the server sends one, e.g.
  /// `KYC_REQUIRED` (falling back to the error name, `KycRequired`).
  final String? code;

  /// The customer's KYC stage, carried on a `KYC_REQUIRED` refusal so the gate
  /// can be explained without a second round trip.
  final String? stage;

  bool get isUnauthorized => statusCode == 401;
  bool get isRateLimited => statusCode == 429;

  /// This action is gated on KYC: deposits, withdrawals and loan applications
  /// all answer `403` until the customer's KYC passes. Callers route to the KYC
  /// screen and show [message], which is the server's own explanation.
  bool get isKycRequired => code == 'KYC_REQUIRED' || code == 'KycRequired';

  @override
  String toString() => message;
}
