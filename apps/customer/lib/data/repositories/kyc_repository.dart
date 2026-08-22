import '../api_client.dart';
import '../models/kyc_models.dart';

/// KYC status and submission (`/api/me/kyc`).
///
/// Both routes sit deliberately outside the KYC gate — this is the one flow a
/// blocked customer must always be able to reach in order to get unblocked.
class KycRepository {
  KycRepository(this._api);

  final ApiClient _api;

  Future<KycStatus> status() async {
    final Map<String, dynamic> json = await _api.getJson('/me/kyc');
    return KycStatus.fromJson(json);
  }

  /// Sends the whole packet in one call: photo, Aadhaar card image and at least
  /// one nominee. The reply is the bare KYC record — no nominees, documents or
  /// requirements — so callers refresh [status] rather than trusting it wholesale.
  ///
  /// [aadhaarNumber] must be the full 12 digits. The server derives the last
  /// four and a salted hash from it and persists nothing else, so the masked
  /// form is all that ever comes back — but it is genuinely required: the last
  /// four are what a reviewer checks against the card image, and the hash is
  /// what stops one Aadhaar opening two accounts. Required here rather than
  /// optional so omitting it is a compile error, not a 400 in the field.
  Future<KycStatus> submit({
    required String photoUrl,
    required bool photoIsLive,
    required String aadhaarFileUrl,
    required String aadhaarNumber,
    required List<NomineeInput> nominees,
    String? address,
  }) async {
    final Map<String, dynamic> body = <String, dynamic>{
      'photoUrl': photoUrl,
      'photoIsLive': photoIsLive,
      'aadhaarFileUrl': aadhaarFileUrl,
      'nominees': nominees.map((NomineeInput n) => n.toJson()).toList(growable: false),
      'aadhaarNumber': aadhaarNumber.trim(),
      if (address != null && address.trim().isNotEmpty) 'address': address.trim(),
    };
    final Map<String, dynamic> json = await _api.post('/me/kyc', body: body);
    return KycStatus.fromJson(json);
  }
}
