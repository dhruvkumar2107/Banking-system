import '../api_client.dart';
import '../models/paginated.dart';
import '../models/transaction.dart';

/// Deposit payments and transaction history (`/api/payments/*`).
///
/// The deposit flow is: [createOrder] → (gateway checkout, or the ready-made
/// mock credentials) → [verifyPayment]. Verification is always server-side; the
/// client never decides that a payment succeeded.
class PaymentsRepository {
  PaymentsRepository(this._api);

  final ApiClient _api;

  /// Create a payment order for a deposit. Both fields are optional — the API
  /// defaults to the primary account and its configured daily amount.
  Future<PaymentOrder> createOrder({String? accountId, int? amountRupees}) async {
    final Map<String, dynamic> body = <String, dynamic>{
      'accountId': ?accountId,
      'amountRupees': ?amountRupees,
    };
    final Map<String, dynamic> json = await _api.post('/payments/order', body: body);
    return PaymentOrder.fromJson(json);
  }

  /// Confirm a payment. The API re-checks the HMAC signature and, on success,
  /// credits the ledger exactly once (idempotent on the order).
  Future<VerifyResult> verifyPayment({
    required String orderId,
    required String paymentId,
    required String signature,
  }) async {
    final Map<String, dynamic> json = await _api.post(
      '/payments/verify',
      body: <String, dynamic>{
        'orderId': orderId,
        'paymentId': paymentId,
        'signature': signature,
      },
    );
    return VerifyResult.fromJson(json);
  }

  Future<Paginated<TransactionModel>> transactions({int page = 1, int limit = 20}) async {
    final Map<String, dynamic> json = await _api.getJson(
      '/payments/transactions',
      query: <String, dynamic>{'page': page, 'limit': limit},
    );
    return Paginated<TransactionModel>.fromJson(json, TransactionModel.fromJson);
  }

  Future<TransactionModel> transaction(String id) async {
    final Map<String, dynamic> json = await _api.getJson('/payments/transactions/$id');
    return TransactionModel.fromJson(json);
  }

  /// Raw PDF bytes for a successful payment's receipt.
  Future<List<int>> receiptPdf(String id) =>
      _api.getBytes('/payments/transactions/$id/receipt');
}
