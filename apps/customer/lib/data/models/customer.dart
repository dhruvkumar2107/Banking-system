import 'money.dart';
import 'pigmy_account.dart';
import 'transaction.dart';
import 'village.dart';

/// A registered nominee for a customer.
class Nominee {
  const Nominee({
    required this.id,
    required this.name,
    required this.relation,
    required this.mobile,
    required this.address,
  });

  final String id;
  final String name;
  final String? relation;
  final String? mobile;
  final String? address;

  factory Nominee.fromJson(Map<String, dynamic> json) => Nominee(
        id: json['id'] as String,
        name: json['name'] as String? ?? '',
        relation: json['relation'] as String?,
        mobile: json['mobile'] as String?,
        address: json['address'] as String?,
      );
}

/// A KYC document reference.
class CustomerDocument {
  const CustomerDocument({
    required this.id,
    required this.docType,
    required this.fileUrl,
    required this.verifiedStatus,
    required this.uploadedAt,
  });

  final String id;
  final String docType;
  final String fileUrl;
  final String verifiedStatus; // 'pending' | 'verified' | 'rejected'
  final DateTime uploadedAt;

  factory CustomerDocument.fromJson(Map<String, dynamic> json) => CustomerDocument(
        id: json['id'] as String,
        docType: json['docType'] as String? ?? '',
        fileUrl: json['fileUrl'] as String? ?? '',
        verifiedStatus: json['verifiedStatus'] as String? ?? 'pending',
        uploadedAt: DateTime.tryParse('${json['uploadedAt']}') ?? DateTime.now(),
      );
}

/// Linked bank account. The full account number is only ever the owner's own
/// data; the UI still masks it to the last four digits.
class BankDetails {
  const BankDetails({
    required this.id,
    required this.accountNumber,
    required this.ifsc,
    required this.accountHolderName,
  });

  final String id;
  final String accountNumber;
  final String ifsc;
  final String accountHolderName;

  factory BankDetails.fromJson(Map<String, dynamic> json) => BankDetails(
        id: json['id'] as String,
        accountNumber: json['accountNumber'] as String? ?? '',
        ifsc: json['ifsc'] as String? ?? '',
        accountHolderName: json['accountHolderName'] as String? ?? '',
      );
}

/// Full customer profile (`GET /me/profile`).
class CustomerProfile {
  const CustomerProfile({
    required this.id,
    required this.name,
    required this.mobile,
    required this.address,
    required this.photoUrl,
    required this.kycStatus,
    required this.village,
    required this.createdAt,
    required this.pigmyAccounts,
    required this.nominees,
    required this.documents,
    required this.bankDetails,
  });

  final String id;
  final String name;
  final String mobile;
  final String? address;
  final String? photoUrl;
  final String kycStatus; // 'pending' | 'verified' | 'rejected'
  final Village? village;
  final DateTime createdAt;
  final List<PigmyAccount> pigmyAccounts;
  final List<Nominee> nominees;
  final List<CustomerDocument> documents;
  final BankDetails? bankDetails;

  factory CustomerProfile.fromJson(Map<String, dynamic> json) {
    List<T> list<T>(String key, T Function(Map<String, dynamic>) f) =>
        ((json[key] as List<dynamic>?) ?? const <dynamic>[])
            .map((dynamic e) => f(Map<String, dynamic>.from(e as Map)))
            .toList(growable: false);

    return CustomerProfile(
      id: json['id'] as String,
      name: json['name'] as String? ?? '',
      mobile: json['mobile'] as String? ?? '',
      address: json['address'] as String?,
      photoUrl: json['photoUrl'] as String?,
      kycStatus: json['kycStatus'] as String? ?? 'pending',
      village: json['village'] == null
          ? null
          : Village.fromJson(Map<String, dynamic>.from(json['village'] as Map)),
      createdAt: DateTime.tryParse('${json['createdAt']}') ?? DateTime.now(),
      pigmyAccounts: list('pigmyAccounts', PigmyAccount.fromJson),
      nominees: list('nominees', Nominee.fromJson),
      documents: list('documents', CustomerDocument.fromJson),
      bankDetails: json['bankDetails'] == null
          ? null
          : BankDetails.fromJson(Map<String, dynamic>.from(json['bankDetails'] as Map)),
    );
  }
}

/// Compact customer summary embedded in the dashboard payload.
class DashboardCustomer {
  const DashboardCustomer({
    required this.id,
    required this.name,
    required this.mobile,
    required this.kycStatus,
    required this.village,
  });

  final String id;
  final String name;
  final String mobile;
  final String kycStatus;
  final Village? village;

  factory DashboardCustomer.fromJson(Map<String, dynamic> json) => DashboardCustomer(
        id: json['id'] as String,
        name: json['name'] as String? ?? '',
        mobile: json['mobile'] as String? ?? '',
        kycStatus: json['kycStatus'] as String? ?? 'pending',
        village: json['village'] == null
            ? null
            : Village.fromJson(Map<String, dynamic>.from(json['village'] as Map)),
      );
}

/// Home dashboard (`GET /me/dashboard`).
class DashboardData {
  const DashboardData({
    required this.customer,
    required this.primaryAccount,
    required this.accounts,
    required this.totalBalance,
    required this.recentTransactions,
    required this.unreadNotifications,
  });

  final DashboardCustomer customer;
  final PigmyAccount? primaryAccount;
  final List<PigmyAccount> accounts;
  final Money totalBalance;
  final List<TransactionModel> recentTransactions;
  final int unreadNotifications;

  factory DashboardData.fromJson(Map<String, dynamic> json) => DashboardData(
        customer: DashboardCustomer.fromJson(Map<String, dynamic>.from(json['customer'] as Map)),
        primaryAccount: json['primaryAccount'] == null
            ? null
            : PigmyAccount.fromJson(Map<String, dynamic>.from(json['primaryAccount'] as Map)),
        accounts: ((json['accounts'] as List<dynamic>?) ?? const <dynamic>[])
            .map((dynamic e) => PigmyAccount.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList(growable: false),
        totalBalance: Money.fromJson(json['totalBalance']),
        recentTransactions: ((json['recentTransactions'] as List<dynamic>?) ?? const <dynamic>[])
            .map((dynamic e) => TransactionModel.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList(growable: false),
        unreadNotifications: (json['unreadNotifications'] as num?)?.toInt() ?? 0,
      );
}
