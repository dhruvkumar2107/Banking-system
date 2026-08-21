import 'money.dart';

/// Ledger (passbook) entry — one immutable line in the append-only ledger.
class LedgerEntry {
  const LedgerEntry({
    required this.id,
    required this.type,
    required this.amount,
    required this.balanceAfter,
    required this.note,
    required this.transactionId,
    required this.createdAt,
  });

  final String id;
  final String type; // 'credit' | 'debit'
  final Money amount;
  final Money balanceAfter;
  final String? note;
  final String? transactionId;
  final DateTime createdAt;

  bool get isCredit => type == 'credit';

  factory LedgerEntry.fromJson(Map<String, dynamic> json) => LedgerEntry(
        id: json['id'] as String,
        type: json['type'] as String? ?? 'credit',
        amount: Money.fromJson(json['amount']),
        balanceAfter: Money.fromJson(json['balanceAfter']),
        note: json['note'] as String?,
        transactionId: json['transactionId'] as String?,
        createdAt: DateTime.tryParse('${json['createdAt']}') ?? DateTime.now(),
      );
}

/// A payment attempt / deposit transaction.
class TransactionModel {
  const TransactionModel({
    required this.id,
    required this.amount,
    required this.status,
    required this.gateway,
    required this.gatewayOrderId,
    required this.gatewayPaymentId,
    required this.failureReason,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final Money amount;
  final String status; // 'pending' | 'success' | 'failed'
  final String gateway;
  final String? gatewayOrderId;
  final String? gatewayPaymentId;
  final String? failureReason;
  final DateTime createdAt;
  final DateTime updatedAt;

  bool get isSuccess => status == 'success';
  bool get isPending => status == 'pending';
  bool get isFailed => status == 'failed';

  factory TransactionModel.fromJson(Map<String, dynamic> json) => TransactionModel(
        id: json['id'] as String,
        amount: Money.fromJson(json['amount']),
        status: json['status'] as String? ?? 'pending',
        gateway: json['gateway'] as String? ?? '',
        gatewayOrderId: json['gatewayOrderId'] as String?,
        gatewayPaymentId: json['gatewayPaymentId'] as String?,
        failureReason: json['failureReason'] as String?,
        createdAt: DateTime.tryParse('${json['createdAt']}') ?? DateTime.now(),
        updatedAt: DateTime.tryParse('${json['updatedAt']}') ?? DateTime.now(),
      );
}

/// Ready-made payment credentials handed back by the API in mock/sandbox mode,
/// so the client can immediately confirm the payment against `/payments/verify`.
class MockPayment {
  const MockPayment({required this.paymentId, required this.signature});
  final String paymentId;
  final String signature;

  factory MockPayment.fromJson(Map<String, dynamic> json) => MockPayment(
        paymentId: json['paymentId'] as String,
        signature: json['signature'] as String,
      );
}

/// Result of `POST /payments/order`.
class PaymentOrder {
  const PaymentOrder({
    required this.transactionId,
    required this.orderId,
    required this.amount,
    required this.currency,
    required this.keyId,
    required this.mode,
    required this.mock,
  });

  final String transactionId;
  final String orderId;
  final Money amount;
  final String currency;
  final String keyId;
  final String mode; // 'mock' | 'live'
  final MockPayment? mock;

  bool get isMock => mode == 'mock';

  factory PaymentOrder.fromJson(Map<String, dynamic> json) => PaymentOrder(
        transactionId: json['transactionId'] as String,
        orderId: json['orderId'] as String,
        amount: Money.fromJson(json['amount']),
        currency: json['currency'] as String? ?? 'INR',
        keyId: json['keyId'] as String? ?? '',
        mode: json['mode'] as String? ?? 'mock',
        mock: json['mock'] == null
            ? null
            : MockPayment.fromJson(Map<String, dynamic>.from(json['mock'] as Map)),
      );
}

/// Result of `POST /payments/verify`.
class VerifyResult {
  const VerifyResult({
    required this.verified,
    required this.alreadyProcessed,
    required this.transactionId,
    required this.status,
    required this.newBalance,
  });

  final bool verified;
  final bool alreadyProcessed;
  final String transactionId;
  final String status;
  final Money? newBalance;

  factory VerifyResult.fromJson(Map<String, dynamic> json) => VerifyResult(
        verified: json['verified'] as bool? ?? false,
        alreadyProcessed: json['alreadyProcessed'] as bool? ?? false,
        transactionId: json['transactionId'] as String? ?? '',
        status: json['status'] as String? ?? 'pending',
        newBalance: json['newBalance'] == null ? null : Money.fromJson(json['newBalance']),
      );
}
