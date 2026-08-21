/// Generic paginated envelope: `{ data, total, page, limit, pages }`.
class Paginated<T> {
  const Paginated({
    required this.data,
    required this.total,
    required this.page,
    required this.limit,
    required this.pages,
  });

  final List<T> data;
  final int total;
  final int page;
  final int limit;
  final int pages;

  bool get hasMore => page < pages;

  factory Paginated.fromJson(
    Map<String, dynamic> json,
    T Function(Map<String, dynamic>) item,
  ) {
    final List<dynamic> raw = (json['data'] as List<dynamic>?) ?? const <dynamic>[];
    return Paginated<T>(
      data: raw
          .map((dynamic e) => item(Map<String, dynamic>.from(e as Map)))
          .toList(growable: false),
      total: (json['total'] as num?)?.toInt() ?? raw.length,
      page: (json['page'] as num?)?.toInt() ?? 1,
      limit: (json['limit'] as num?)?.toInt() ?? raw.length,
      pages: (json['pages'] as num?)?.toInt() ?? 1,
    );
  }

  static Paginated<T> empty<T>() =>
      Paginated<T>(data: const [], total: 0, page: 1, limit: 0, pages: 1);
}
