/// A village as exposed by the public registration endpoint (`id/name/code/district/taluk`).
class Village {
  const Village({
    required this.id,
    required this.name,
    required this.code,
    required this.district,
    required this.taluk,
  });

  final String id;
  final String name;
  final String code;
  final String district;
  final String taluk;

  factory Village.fromJson(Map<String, dynamic> json) => Village(
        id: json['id'] as String,
        name: json['name'] as String? ?? '',
        code: json['code'] as String? ?? '',
        district: json['district'] as String? ?? '',
        taluk: json['taluk'] as String? ?? '',
      );

  @override
  bool operator ==(Object other) => other is Village && other.id == id;

  @override
  int get hashCode => id.hashCode;
}
