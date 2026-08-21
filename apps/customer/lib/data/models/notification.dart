/// A customer notification. `readAt == null` means unread.
class NotificationModel {
  const NotificationModel({
    required this.id,
    required this.title,
    required this.body,
    required this.category,
    required this.readAt,
    required this.createdAt,
  });

  final String id;
  final String title;
  final String body;
  final String category; // 'system' | 'transaction' | 'broadcast'
  final DateTime? readAt;
  final DateTime createdAt;

  bool get isRead => readAt != null;

  factory NotificationModel.fromJson(Map<String, dynamic> json) => NotificationModel(
        id: json['id'] as String,
        title: json['title'] as String? ?? '',
        body: json['body'] as String? ?? '',
        category: json['category'] as String? ?? 'system',
        readAt: json['readAt'] == null ? null : DateTime.tryParse('${json['readAt']}'),
        createdAt: DateTime.tryParse('${json['createdAt']}') ?? DateTime.now(),
      );
}
