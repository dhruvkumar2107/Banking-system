import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../l10n/strings.dart';
import '../state/data_providers.dart';

/// Bottom-navigation scaffold hosting the four primary tabs. The unread badge
/// on the alerts tab reflects [unreadCountProvider].
class HomeShell extends ConsumerWidget {
  const HomeShell({super.key, required this.shell});

  final StatefulNavigationShell shell;

  void _onTap(int index) {
    shell.goBranch(index, initialLocation: index == shell.currentIndex);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppStrings s = AppStrings.of(context);
    final ThemeData theme = Theme.of(context);
    final bool isDark = theme.brightness == Brightness.dark;
    final Color navBg =
        theme.bottomNavigationBarTheme.backgroundColor ?? theme.colorScheme.surface;
    final int unread = ref.watch(unreadCountProvider).maybeWhen(
          data: (int c) => c,
          orElse: () => 0,
        );

    return Scaffold(
      body: shell,
      // A floating "glass" bar: hairline top border + a soft upward shadow so
      // it reads as a distinct layer above the content on every screen.
      bottomNavigationBar: DecoratedBox(
        decoration: BoxDecoration(
          color: navBg,
          border: Border(top: BorderSide(color: theme.dividerColor)),
          boxShadow: <BoxShadow>[
            BoxShadow(
              color: Colors.black.withValues(alpha: isDark ? 0.32 : 0.06),
              blurRadius: 22,
              offset: const Offset(0, -4),
            ),
          ],
        ),
        child: BottomNavigationBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
          currentIndex: shell.currentIndex,
          onTap: _onTap,
          items: <BottomNavigationBarItem>[
            BottomNavigationBarItem(
              icon: const Icon(Icons.home_outlined),
              activeIcon: const Icon(Icons.home_rounded),
              label: s.t('home'),
            ),
            BottomNavigationBarItem(
              icon: const Icon(Icons.receipt_long_outlined),
              activeIcon: const Icon(Icons.receipt_long_rounded),
              label: s.t('history'),
            ),
            BottomNavigationBarItem(
              icon: Badge(
                isLabelVisible: unread > 0,
                label: Text(unread > 99 ? '99+' : '$unread'),
                child: const Icon(Icons.notifications_outlined),
              ),
              activeIcon: Badge(
                isLabelVisible: unread > 0,
                label: Text(unread > 99 ? '99+' : '$unread'),
                child: const Icon(Icons.notifications_rounded),
              ),
              label: s.t('notifications'),
            ),
            BottomNavigationBarItem(
              icon: const Icon(Icons.person_outline_rounded),
              activeIcon: const Icon(Icons.person_rounded),
              label: s.t('profile'),
            ),
          ],
        ),
      ),
    );
  }
}
