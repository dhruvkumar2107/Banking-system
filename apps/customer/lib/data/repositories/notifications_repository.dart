import '../api_client.dart';
import '../models/notification.dart';
import '../models/paginated.dart';

/// Result of listing notifications — a page plus the total unread count.
class NotificationPage {
  const NotificationPage({required this.page, required this.unread});

  final Paginated<NotificationModel> page;
  final int unread;
}

/// Customer notifications (`/api/notifications`).
class NotificationsRepository {
  NotificationsRepository(this._api);

  final ApiClient _api;

  Future<NotificationPage> list({int page = 1, int limit = 20, bool unreadOnly = false}) async {
    final Map<String, dynamic> json = await _api.getJson(
      '/notifications',
      query: <String, dynamic>{
        'page': page,
        'limit': limit,
        if (unreadOnly) 'unreadOnly': true,
      },
    );
    return NotificationPage(
      page: Paginated<NotificationModel>.fromJson(json, NotificationModel.fromJson),
      unread: (json['unread'] as num?)?.toInt() ?? 0,
    );
  }

  Future<int> unreadCount() async {
    final Map<String, dynamic> json = await _api.getJson('/notifications/unread-count');
    return (json['unread'] as num?)?.toInt() ?? 0;
  }

  Future<void> markAllRead() => _api.patch('/notifications/read-all');

  Future<void> markRead(String id) => _api.patch('/notifications/$id/read');
}
