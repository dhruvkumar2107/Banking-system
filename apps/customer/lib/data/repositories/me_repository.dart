import '../api_client.dart';
import '../models/customer.dart';
import '../models/paginated.dart';
import '../models/pigmy_account.dart';
import '../models/transaction.dart';
import '../models/upload.dart';

/// Customer self-service data (`/api/me/*`). Every route is scoped server-side
/// to the authenticated caller — there are no customer-id parameters.
class MeRepository {
  MeRepository(this._api);

  final ApiClient _api;

  Future<DashboardData> dashboard() async {
    final Map<String, dynamic> json = await _api.getJson('/me/dashboard');
    return DashboardData.fromJson(json);
  }

  Future<CustomerProfile> profile() async {
    final Map<String, dynamic> json = await _api.getJson('/me/profile');
    return CustomerProfile.fromJson(json);
  }

  Future<CustomerProfile> updateProfile({String? name, String? address, String? photoUrl}) async {
    final Map<String, dynamic> body = <String, dynamic>{
      'name': ?name,
      'address': ?address,
      'photoUrl': ?photoUrl,
    };
    final Map<String, dynamic> json = await _api.patch('/me/profile', body: body);
    return CustomerProfile.fromJson(json);
  }

  Future<List<PigmyAccount>> accounts() async {
    final List<dynamic> list = await _api.getList('/me/accounts');
    return list
        .map((dynamic e) => PigmyAccount.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList(growable: false);
  }

  Future<Paginated<LedgerEntry>> ledger(String accountId, {int page = 1, int limit = 20}) async {
    final Map<String, dynamic> json = await _api.getJson(
      '/me/accounts/$accountId/ledger',
      query: <String, dynamic>{'page': page, 'limit': limit},
    );
    return Paginated<LedgerEntry>.fromJson(json, LedgerEntry.fromJson);
  }

  // ── Nominees ───────────────────────────────────────────────────────────────
  Future<List<Nominee>> nominees() async {
    final List<dynamic> list = await _api.getList('/me/nominees');
    return list
        .map((dynamic e) => Nominee.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList(growable: false);
  }

  Future<Nominee> addNominee({
    required String name,
    String? relation,
    String? mobile,
    String? address,
  }) async {
    final Map<String, dynamic> body = <String, dynamic>{
      'name': name,
      if (relation != null && relation.trim().isNotEmpty) 'relation': relation.trim(),
      if (mobile != null && mobile.trim().isNotEmpty) 'mobile': mobile.trim(),
      if (address != null && address.trim().isNotEmpty) 'address': address.trim(),
    };
    final Map<String, dynamic> json = await _api.post('/me/nominees', body: body);
    return Nominee.fromJson(json);
  }

  Future<void> deleteNominee(String id) => _api.delete('/me/nominees/$id');

  // ── Documents (KYC) ──────────────────────────────────────────────────────────
  Future<List<CustomerDocument>> documents() async {
    final List<dynamic> list = await _api.getList('/me/documents');
    return list
        .map((dynamic e) => CustomerDocument.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList(growable: false);
  }

  Future<CustomerDocument> addDocument({required String docType, required String fileUrl}) async {
    final Map<String, dynamic> json = await _api.post(
      '/me/documents',
      body: <String, dynamic>{'docType': docType, 'fileUrl': fileUrl},
    );
    return CustomerDocument.fromJson(json);
  }

  // ── KYC file storage ─────────────────────────────────────────────────────────

  /// Uploads a photo or document and returns the stored reference. The returned
  /// [UploadedFile.url] is what gets saved on the profile (`photoUrl`) or the
  /// document record (`fileUrl`) — the server keeps the bytes.
  Future<UploadedFile> uploadFile({
    required List<int> bytes,
    required String fileName,
    required String mimeType,
  }) async {
    final Map<String, dynamic> json = await _api.postFile(
      '/uploads',
      bytes: bytes,
      fileName: fileName,
      contentType: mimeType,
    );
    return UploadedFile.fromJson(json);
  }

  /// Fetches a stored KYC file's bytes. Goes through the authenticated client
  /// because `/api/uploads/...` is access-controlled, never a static path — so a
  /// plain `Image.network` would get a 403.
  Future<List<int>> fileBytes(String url) => _api.getBytes(ApiClient.stripApiPrefix(url));

  // ── Bank details ─────────────────────────────────────────────────────────────
  Future<BankDetails?> bankDetails() async {
    final Map<String, dynamic>? json = await _api.getJsonOrNull('/me/bank-details');
    if (json == null || json['id'] == null) return null;
    return BankDetails.fromJson(json);
  }

  Future<BankDetails> upsertBankDetails({
    required String accountNumber,
    required String ifsc,
    required String accountHolderName,
  }) async {
    final Map<String, dynamic> json = await _api.put(
      '/me/bank-details',
      body: <String, dynamic>{
        'accountNumber': accountNumber,
        'ifsc': ifsc,
        'accountHolderName': accountHolderName,
      },
    );
    return BankDetails.fromJson(json);
  }
}
