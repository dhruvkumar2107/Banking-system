import '../api_client.dart';
import '../models/village.dart';

/// Public village list for the registration village picker (`/api/public/villages`).
class VillagesRepository {
  VillagesRepository(this._api);

  final ApiClient _api;

  Future<List<Village>> list() async {
    final List<dynamic> raw = await _api.getList('/public/villages');
    return raw
        .map((dynamic e) => Village.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList(growable: false);
  }
}
