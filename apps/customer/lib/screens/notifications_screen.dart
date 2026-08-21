import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/formatters.dart';
import '../core/theme.dart';
import '../data/models/notification.dart';
import '../data/repositories/notifications_repository.dart';
import '../l10n/strings.dart';
import '../state/data_providers.dart';
import '../state/providers.dart';
import '../widgets/state_views.dart';

/// Alerts tab — the customer's notification inbox with mark-as-read support.
class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  void _refresh(WidgetRef ref) {
    ref.invalidate(notificationsProvider);
    ref.invalidate(unreadCountProvider);
  }

  Future<void> _markAll(BuildContext context, WidgetRef ref) async {
    try {
      await ref.read(notificationsRepositoryProvider).markAllRead();
    } catch (_) {
      // Non-fatal — a failed mark-all simply leaves the badge as-is.
    }
    _refresh(ref);
  }

  Future<void> _markOne(WidgetRef ref, NotificationModel n) async {
    if (n.isRead) return;
    try {
      await ref.read(notificationsRepositoryProvider).markRead(n.id);
    } catch (_) {
      // ignore — will be retried on next open
    }
    _refresh(ref);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppStrings s = AppStrings.of(context);
    final AsyncValue<NotificationPage> page = ref.watch(notificationsProvider);
    final int unread = page.valueOrNull?.unread ?? 0;

    return Scaffold(
      appBar: AppBar(
        title: Text(s.t('notifications')),
        actions: <Widget>[
          if (unread > 0)
            TextButton.icon(
              onPressed: () => _markAll(context, ref),
              icon: const Icon(Icons.done_all_rounded, size: 18),
              label: Text(s.t('markAllRead')),
            ),
        ],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async => _refresh(ref),
          child: AsyncValueView<NotificationPage>(
            value: page,
            onRetry: () => _refresh(ref),
            data: (NotificationPage data) {
              final List<NotificationModel> items = data.page.data;
              if (items.isEmpty) {
                return ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  children: <Widget>[
                    const SizedBox(height: 100),
                    EmptyView(message: s.t('noNotifications'), icon: Icons.notifications_none_rounded),
                  ],
                );
              }
              return ListView.separated(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                itemCount: items.length,
                separatorBuilder: (_, _) => const SizedBox(height: 10),
                itemBuilder: (BuildContext context, int i) => _NotificationCard(
                  item: items[i],
                  onTap: () => _markOne(ref, items[i]),
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}

class _NotificationCard extends StatelessWidget {
  const _NotificationCard({required this.item, required this.onTap});

  final NotificationModel item;
  final VoidCallback onTap;

  ({IconData icon, Color color}) get _visual {
    switch (item.category) {
      case 'transaction':
        return (icon: Icons.account_balance_wallet_rounded, color: PigmeeColors.emerald);
      case 'broadcast':
        return (icon: Icons.campaign_rounded, color: PigmeeColors.indigo);
      default:
        return (icon: Icons.info_rounded, color: PigmeeColors.amber);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final ({IconData icon, Color color}) v = _visual;
    final bool unread = !item.isRead;

    return Material(
      color: unread ? PigmeeColors.indigo.withValues(alpha: 0.06) : theme.cardColor,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: unread
              ? PigmeeColors.indigo.withValues(alpha: 0.25)
              : theme.dividerColor,
        ),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Container(
                height: 40,
                width: 40,
                decoration: BoxDecoration(
                  color: v.color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(v.icon, color: v.color, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Row(
                      children: <Widget>[
                        Expanded(
                          child: Text(
                            item.title,
                            style: theme.textTheme.bodyLarge?.copyWith(
                              fontWeight: unread ? FontWeight.w800 : FontWeight.w600,
                            ),
                          ),
                        ),
                        if (unread)
                          Container(
                            height: 9,
                            width: 9,
                            margin: const EdgeInsets.only(left: 8, top: 4),
                            decoration: const BoxDecoration(
                              color: PigmeeColors.indigo,
                              shape: BoxShape.circle,
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 3),
                    Text(
                      item.body,
                      style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurface),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      Formatters.relative(item.createdAt),
                      style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
