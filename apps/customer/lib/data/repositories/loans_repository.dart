import '../api_client.dart';
import '../models/loan_models.dart';
import '../models/paginated.dart';

/// Customer loans (`/api/me/loans/*`): the product rules, live quotes, the
/// application itself, and the repayment schedule.
///
/// Every rupee figure shown to the customer is server-computed — the only number
/// this app ever sends is `amountRupees` on a quote or an application.
class LoansRepository {
  LoansRepository(this._api);

  final ApiClient _api;

  Future<LoanSettings> settings() async {
    final Map<String, dynamic> json = await _api.getJson('/me/loans/settings');
    return LoanSettings.fromJson(json);
  }

  /// Costs a prospective loan, and says whether the customer qualifies for it.
  ///
  /// The account is chosen server-side: the query is whitelisted down to the
  /// amount and the tenure, and the API rejects any parameter it does not know,
  /// so an account id cannot be passed here.
  Future<LoanQuoteResult> quote({
    required num amountRupees,
    required int tenureMonths,
  }) async {
    final Map<String, dynamic> json = await _api.getJson(
      '/me/loans/quote',
      query: <String, dynamic>{'amountRupees': amountRupees, 'tenureMonths': tenureMonths},
    );
    return LoanQuoteResult.fromJson(json);
  }

  /// Applies for a loan. `amountRupees` is in **rupees**, not paise.
  ///
  /// This route is behind the KYC gate: it answers `403 KYC_REQUIRED` until the
  /// customer's KYC passes (see [ApiException.isKycRequired]).
  Future<Loan> apply({
    required num amountRupees,
    required int tenureMonths,
    String? accountId,
    String? purpose,
  }) async {
    final Map<String, dynamic> body = <String, dynamic>{
      'amountRupees': amountRupees,
      'tenureMonths': tenureMonths,
      'accountId': ?accountId,
      if (purpose != null && purpose.trim().isNotEmpty) 'purpose': purpose.trim(),
    };
    final Map<String, dynamic> json = await _api.post('/me/loans', body: body);
    return Loan.fromJson(json);
  }

  Future<Paginated<Loan>> list({int page = 1, int limit = 20}) async {
    final Map<String, dynamic> json = await _api.getJson(
      '/me/loans',
      query: <String, dynamic>{'page': page, 'limit': limit},
    );
    return Paginated<Loan>.fromJson(json, Loan.fromJson);
  }

  /// A single loan plus its instalments and the next one falling due.
  Future<LoanDetail> detail(String id) async {
    final Map<String, dynamic> json = await _api.getJson('/me/loans/$id');
    return LoanDetail.fromJson(json);
  }

  /// Withdraws the customer's own application. Only a `pending` loan can be
  /// cancelled; the server refuses anything further along.
  Future<Loan> cancel(String id) async {
    final Map<String, dynamic> json = await _api.post('/me/loans/$id/cancel');
    return Loan.fromJson(json);
  }
}
