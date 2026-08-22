import 'money.dart';

/// Product rules for customer loans (`GET /me/loans/settings`). Everything the
/// apply screen needs to bound its inputs before a quote is ever requested.
class LoanSettings {
  const LoanSettings({
    required this.enabled,
    required this.minAmount,
    required this.maxAmount,
    required this.interestRateBps,
    required this.interestRatePercent,
    required this.interestBasis,
    required this.approxReducingRatePercent,
    required this.minTenureMonths,
    required this.maxTenureMonths,
    required this.maxLoanToBalanceBps,
    required this.maxLoanToBalanceMultiple,
    required this.processingFeeBps,
    required this.processingFeePercent,
    required this.minSavings,
  });

  /// False when the branch has lending switched off entirely.
  final bool enabled;
  final Money minAmount;
  final Money maxAmount;
  final int interestRateBps;
  final double interestRatePercent;

  /// A human sentence explaining how interest is charged, e.g. "flat rate on the
  /// original principal, repaid in equal monthly instalments".
  final String interestBasis;
  final double approxReducingRatePercent;
  final int minTenureMonths;
  final int maxTenureMonths;
  final int maxLoanToBalanceBps;

  /// How many times their savings balance a customer may borrow.
  final double maxLoanToBalanceMultiple;
  final int processingFeeBps;
  final double processingFeePercent;
  final Money minSavings;

  factory LoanSettings.fromJson(Map<String, dynamic> json) => LoanSettings(
        enabled: json['enabled'] as bool? ?? false,
        minAmount: Money.fromJson(json['minAmount']),
        maxAmount: Money.fromJson(json['maxAmount']),
        interestRateBps: (json['interestRateBps'] as num?)?.toInt() ?? 0,
        interestRatePercent: (json['interestRatePercent'] as num?)?.toDouble() ?? 0,
        interestBasis: json['interestBasis'] as String? ?? '',
        approxReducingRatePercent:
            (json['approxReducingRatePercent'] as num?)?.toDouble() ?? 0,
        minTenureMonths: (json['minTenureMonths'] as num?)?.toInt() ?? 1,
        maxTenureMonths: (json['maxTenureMonths'] as num?)?.toInt() ?? 12,
        maxLoanToBalanceBps: (json['maxLoanToBalanceBps'] as num?)?.toInt() ?? 0,
        maxLoanToBalanceMultiple:
            (json['maxLoanToBalanceMultiple'] as num?)?.toDouble() ?? 0,
        processingFeeBps: (json['processingFeeBps'] as num?)?.toInt() ?? 0,
        processingFeePercent: (json['processingFeePercent'] as num?)?.toDouble() ?? 0,
        minSavings: Money.fromJson(json['minSavings']),
      );
}

/// The costed breakdown of a prospective loan. Every amount is server-computed —
/// the client never does interest or EMI maths of its own.
class LoanQuote {
  const LoanQuote({
    required this.principal,
    required this.tenureMonths,
    required this.interestRateBps,
    required this.interestRatePercent,
    required this.approxReducingRatePercent,
    required this.totalInterest,
    required this.processingFee,
    required this.totalPayable,
    required this.emiAmount,
    required this.netDisbursed,
  });

  final Money principal;
  final int tenureMonths;
  final int interestRateBps;
  final double interestRatePercent;
  final double approxReducingRatePercent;
  final Money totalInterest;
  final Money processingFee;
  final Money totalPayable;
  final Money emiAmount;

  /// Principal minus the processing fee — what actually reaches the customer.
  final Money netDisbursed;

  factory LoanQuote.fromJson(Map<String, dynamic> json) => LoanQuote(
        principal: Money.fromJson(json['principal']),
        tenureMonths: (json['tenureMonths'] as num?)?.toInt() ?? 0,
        interestRateBps: (json['interestRateBps'] as num?)?.toInt() ?? 0,
        interestRatePercent: (json['interestRatePercent'] as num?)?.toDouble() ?? 0,
        approxReducingRatePercent:
            (json['approxReducingRatePercent'] as num?)?.toDouble() ?? 0,
        totalInterest: Money.fromJson(json['totalInterest']),
        processingFee: Money.fromJson(json['processingFee']),
        totalPayable: Money.fromJson(json['totalPayable']),
        emiAmount: Money.fromJson(json['emiAmount']),
        netDisbursed: Money.fromJson(json['netDisbursed']),
      );
}

/// Result of `GET /me/loans/quote`: whether the customer qualifies, and if not,
/// every reason why. [reasons] is the complete list of blockers — show all of it.
class LoanQuoteResult {
  const LoanQuoteResult({
    required this.eligible,
    required this.reasons,
    required this.accountId,
    required this.accountNumber,
    required this.savingsBalance,
    required this.maxEligible,
    required this.quote,
  });

  final bool eligible;
  final List<String> reasons;
  final String? accountId;
  final String? accountNumber;
  final Money savingsBalance;

  /// The largest principal this customer could borrow right now.
  final Money maxEligible;
  final LoanQuote? quote;

  factory LoanQuoteResult.fromJson(Map<String, dynamic> json) => LoanQuoteResult(
        eligible: json['eligible'] as bool? ?? false,
        reasons: ((json['reasons'] as List<dynamic>?) ?? const <dynamic>[])
            .map((dynamic e) => '$e')
            .toList(growable: false),
        accountId: json['accountId'] as String?,
        accountNumber: json['accountNumber'] as String?,
        savingsBalance: Money.fromJson(json['savingsBalance']),
        maxEligible: Money.fromJson(json['maxEligible']),
        quote: json['quote'] == null
            ? null
            : LoanQuote.fromJson(Map<String, dynamic>.from(json['quote'] as Map)),
      );
}

/// A customer loan at any point in its lifecycle.
class Loan {
  const Loan({
    required this.id,
    required this.pigmyAccountId,
    required this.loanNumber,
    required this.status,
    required this.principal,
    required this.purpose,
    required this.tenureMonths,
    required this.interestRatePercent,
    required this.totalInterest,
    required this.processingFee,
    required this.totalPayable,
    required this.emiAmount,
    required this.outstanding,
    required this.totalRepaid,
    required this.disbursementMethod,
    required this.bankAccountMasked,
    required this.bankIfsc,
    required this.reference,
    required this.note,
    required this.rejectionReason,
    required this.requestedAt,
    required this.decidedAt,
    required this.disbursedAt,
    required this.firstDueDate,
    required this.closedAt,
  });

  final String id;
  final String pigmyAccountId;
  final String loanNumber;

  /// 'pending' | 'approved' | 'rejected' | 'cancelled' | 'disbursed' | 'closed'
  /// | 'defaulted'
  final String status;
  final Money principal;
  final String? purpose;
  final int tenureMonths;
  final double interestRatePercent;
  final Money totalInterest;
  final Money processingFee;
  final Money totalPayable;
  final Money emiAmount;

  /// Zero until the loan is disbursed.
  final Money outstanding;
  final Money totalRepaid;
  final String disbursementMethod; // 'bank_transfer' | 'cash'
  final String? bankAccountMasked;
  final String? bankIfsc;
  final String? reference;
  final String? note;
  final String? rejectionReason;
  final DateTime requestedAt;
  final DateTime? decidedAt;
  final DateTime? disbursedAt;
  final DateTime? firstDueDate;
  final DateTime? closedAt;

  bool get isPending => status == 'pending';
  bool get isDisbursed => status == 'disbursed';
  bool get isClosed => status == 'closed';
  bool get isRejected => status == 'rejected';

  /// A loan is only ever the customer's to withdraw while it awaits a decision.
  bool get canCancel => isPending;

  /// True once money has moved, i.e. the repayment figures mean something.
  bool get isLive => isDisbursed || isClosed || status == 'defaulted';

  factory Loan.fromJson(Map<String, dynamic> json) => Loan(
        id: json['id'] as String,
        pigmyAccountId: json['pigmyAccountId'] as String? ?? '',
        loanNumber: json['loanNumber'] as String? ?? '',
        status: json['status'] as String? ?? 'pending',
        principal: Money.fromJson(json['principal']),
        purpose: json['purpose'] as String?,
        tenureMonths: (json['tenureMonths'] as num?)?.toInt() ?? 0,
        interestRatePercent: (json['interestRatePercent'] as num?)?.toDouble() ?? 0,
        totalInterest: Money.fromJson(json['totalInterest']),
        processingFee: Money.fromJson(json['processingFee']),
        totalPayable: Money.fromJson(json['totalPayable']),
        emiAmount: Money.fromJson(json['emiAmount']),
        outstanding: Money.fromJson(json['outstanding']),
        totalRepaid: Money.fromJson(json['totalRepaid']),
        disbursementMethod: json['disbursementMethod'] as String? ?? '',
        bankAccountMasked: json['bankAccountMasked'] as String?,
        bankIfsc: json['bankIfsc'] as String?,
        reference: json['reference'] as String?,
        note: json['note'] as String?,
        rejectionReason: json['rejectionReason'] as String?,
        requestedAt: DateTime.tryParse('${json['requestedAt']}') ?? DateTime.now(),
        decidedAt: DateTime.tryParse('${json['decidedAt']}'),
        disbursedAt: DateTime.tryParse('${json['disbursedAt']}'),
        firstDueDate: DateTime.tryParse('${json['firstDueDate']}'),
        closedAt: DateTime.tryParse('${json['closedAt']}'),
      );
}

/// One line of a loan's repayment schedule.
class LoanInstalment {
  const LoanInstalment({
    required this.id,
    required this.instalmentNo,
    required this.dueDate,
    required this.amountDue,
    required this.amountPaid,
    required this.outstanding,
    required this.status,
    required this.method,
    required this.reference,
    required this.paidAt,
    required this.waivedReason,
  });

  final String id;
  final int instalmentNo;
  final DateTime dueDate;
  final Money amountDue;
  final Money amountPaid;
  final Money outstanding;

  /// 'due' | 'paid' | 'overdue' | 'waived'
  final String status;
  final String? method; // 'cash' | 'bank_transfer' | 'from_savings'
  final String? reference;
  final DateTime? paidAt;
  final String? waivedReason;

  bool get isPaid => status == 'paid';
  bool get isOverdue => status == 'overdue';
  bool get isWaived => status == 'waived';

  factory LoanInstalment.fromJson(Map<String, dynamic> json) => LoanInstalment(
        id: json['id'] as String,
        instalmentNo: (json['instalmentNo'] as num?)?.toInt() ?? 0,
        dueDate: DateTime.tryParse('${json['dueDate']}') ?? DateTime.now(),
        amountDue: Money.fromJson(json['amountDue']),
        amountPaid: Money.fromJson(json['amountPaid']),
        outstanding: Money.fromJson(json['outstanding']),
        status: json['status'] as String? ?? 'due',
        method: json['method'] as String?,
        reference: json['reference'] as String?,
        paidAt: DateTime.tryParse('${json['paidAt']}'),
        waivedReason: json['waivedReason'] as String?,
      );
}

/// `GET /me/loans/:id` — the loan, its full schedule, and the next instalment
/// falling due. The server spreads all three into one object, so the loan fields
/// are decoded from the same map.
class LoanDetail {
  const LoanDetail({required this.loan, required this.instalments, required this.nextDue});

  final Loan loan;
  final List<LoanInstalment> instalments;
  final LoanInstalment? nextDue;

  factory LoanDetail.fromJson(Map<String, dynamic> json) => LoanDetail(
        loan: Loan.fromJson(json),
        instalments: ((json['instalments'] as List<dynamic>?) ?? const <dynamic>[])
            .map((dynamic e) => LoanInstalment.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList(growable: false),
        nextDue: json['nextDue'] == null
            ? null
            : LoanInstalment.fromJson(Map<String, dynamic>.from(json['nextDue'] as Map)),
      );
}
