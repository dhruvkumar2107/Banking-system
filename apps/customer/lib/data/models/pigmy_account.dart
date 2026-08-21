import 'money.dart';

/// Lifecycle of a pigmy account.
enum PigmyStatus { active, inactive, closed }

PigmyStatus pigmyStatusFrom(String? s) {
  switch (s) {
    case 'inactive':
      return PigmyStatus.inactive;
    case 'closed':
      return PigmyStatus.closed;
    default:
      return PigmyStatus.active;
  }
}

/// A customer's daily-deposit (pigmy) account. Balances are server-derived.
class PigmyAccount {
  const PigmyAccount({
    required this.id,
    required this.accountNumber,
    required this.status,
    required this.dailyAmount,
    required this.currentBalance,
    required this.totalDeposited,
    required this.createdAt,
  });

  final String id;
  final String accountNumber;
  final PigmyStatus status;
  final Money dailyAmount;
  final Money currentBalance;
  final Money totalDeposited;
  final DateTime createdAt;

  factory PigmyAccount.fromJson(Map<String, dynamic> json) => PigmyAccount(
        id: json['id'] as String,
        accountNumber: json['accountNumber'] as String? ?? '',
        status: pigmyStatusFrom(json['status'] as String?),
        dailyAmount: Money.fromJson(json['dailyAmount']),
        currentBalance: Money.fromJson(json['currentBalance']),
        totalDeposited: Money.fromJson(json['totalDeposited']),
        createdAt: DateTime.tryParse('${json['createdAt']}') ?? DateTime.now(),
      );
}
