import 'customer.dart';

/// Where the customer stands in the KYC journey (`GET /me/kyc`).
///
/// [stage] is the single source of truth for what the UI may offer, and [passes]
/// says outright whether the customer is allowed to transact — the client never
/// re-derives that from the stage.
class KycStatus {
  const KycStatus({
    required this.stage,
    required this.passes,
    required this.hint,
    required this.legacyStatus,
    required this.photoUrl,
    required this.photoIsLive,
    required this.photoCapturedAt,
    required this.aadhaarMasked,
    required this.submittedAt,
    required this.verifiedAt,
    required this.rejectionReason,
    required this.bypassedAt,
    required this.bypassReason,
    required this.nominees,
    required this.documents,
    required this.requirements,
  });

  /// 'not_started' | 'submitted' | 'verified' | 'rejected' | 'bypassed'
  final String stage;

  /// Whether the customer may transact. Only `verified` and `bypassed` pass, but
  /// the server decides — trust this rather than comparing [stage].
  final bool passes;

  /// One-line, server-authored next step for the customer.
  final String hint;

  /// The older three-state customer flag ('pending' | 'verified' | 'rejected'),
  /// kept for the pill widgets that already speak it.
  final String legacyStatus;

  final String? photoUrl;

  /// True when the stored photo was captured live on the camera rather than
  /// picked from the gallery.
  final bool photoIsLive;
  final DateTime? photoCapturedAt;

  /// `XXXX-XXXX-1234`. The only Aadhaar form the app ever holds or shows.
  final String? aadhaarMasked;

  final DateTime? submittedAt;
  final DateTime? verifiedAt;
  final String? rejectionReason;
  final DateTime? bypassedAt;
  final String? bypassReason;

  final List<Nominee> nominees;
  final List<CustomerDocument> documents;
  final KycRequirements requirements;

  bool get isNotStarted => stage == 'not_started';
  bool get isSubmitted => stage == 'submitted';
  bool get isVerified => stage == 'verified';
  bool get isRejected => stage == 'rejected';
  bool get isBypassed => stage == 'bypassed';

  /// The customer may send documents when they have never submitted, or when a
  /// reviewer rejected the last attempt and wants a fresh one.
  bool get canSubmit => isNotStarted || isRejected;

  factory KycStatus.fromJson(Map<String, dynamic> json) {
    List<T> list<T>(String key, T Function(Map<String, dynamic>) f) =>
        ((json[key] as List<dynamic>?) ?? const <dynamic>[])
            .map((dynamic e) => f(Map<String, dynamic>.from(e as Map)))
            .toList(growable: false);

    return KycStatus(
      stage: json['stage'] as String? ?? 'not_started',
      passes: json['passes'] as bool? ?? false,
      hint: json['hint'] as String? ?? '',
      legacyStatus: json['legacyStatus'] as String? ?? 'pending',
      photoUrl: json['photoUrl'] as String?,
      photoIsLive: json['photoIsLive'] as bool? ?? false,
      photoCapturedAt: DateTime.tryParse('${json['photoCapturedAt']}'),
      aadhaarMasked: json['aadhaarMasked'] as String?,
      submittedAt: DateTime.tryParse('${json['submittedAt']}'),
      verifiedAt: DateTime.tryParse('${json['verifiedAt']}'),
      rejectionReason: json['rejectionReason'] as String?,
      bypassedAt: DateTime.tryParse('${json['bypassedAt']}'),
      bypassReason: json['bypassReason'] as String?,
      nominees: list('nominees', Nominee.fromJson),
      documents: list('documents', CustomerDocument.fromJson),
      requirements: KycRequirements.fromJson(
        json['requirements'] == null
            ? const <String, dynamic>{}
            : Map<String, dynamic>.from(json['requirements'] as Map),
      ),
    );
  }
}

/// Server-authored guidance for each part of the submission, shown inline next
/// to the matching field so the wording always matches the reviewer's rules.
class KycRequirements {
  const KycRequirements({required this.photo, required this.aadhaar, required this.nominee});

  final String photo;
  final String aadhaar;
  final String nominee;

  factory KycRequirements.fromJson(Map<String, dynamic> json) => KycRequirements(
        photo: json['photo'] as String? ?? '',
        aadhaar: json['aadhaar'] as String? ?? '',
        nominee: json['nominee'] as String? ?? '',
      );
}

/// One nominee as sent up with a KYC submission. Separate from [Nominee], which
/// is a saved record with an id — this is only ever a request payload.
class NomineeInput {
  const NomineeInput({
    required this.name,
    required this.relation,
    this.mobile,
    this.address,
  });

  final String name;
  final String relation;
  final String? mobile;
  final String? address;

  /// Blank optionals are dropped rather than sent as empty strings, which the
  /// server's validators reject.
  Map<String, dynamic> toJson() => <String, dynamic>{
        'name': name.trim(),
        'relation': relation.trim(),
        if (mobile != null && mobile!.trim().isNotEmpty) 'mobile': mobile!.trim(),
        if (address != null && address!.trim().isNotEmpty) 'address': address!.trim(),
      };
}
