import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/theme.dart';
import '../l10n/strings.dart';
import '../state/theme_controller.dart';

/// Compact Light / Dark / System segmented toggle bound to
/// [themeControllerProvider]. Mirrors the visual language of [LanguageToggle].
class ThemeModeToggle extends ConsumerWidget {
  const ThemeModeToggle({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppStrings s = AppStrings.of(context);
    final ThemeMode mode = ref.watch(themeControllerProvider);

    Widget segment(ThemeMode value, IconData icon, String tooltip) {
      final bool selected = mode == value;
      return Tooltip(
        message: tooltip,
        child: GestureDetector(
          onTap: () => ref.read(themeControllerProvider.notifier).setMode(value),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
            decoration: BoxDecoration(
              color: selected ? PigmeeColors.indigo : Colors.transparent,
              borderRadius: BorderRadius.circular(999),
            ),
            child: Icon(
              icon,
              size: 18,
              color: selected ? Colors.white : PigmeeColors.inkMuted,
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: PigmeeColors.inkMuted.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          segment(ThemeMode.light, Icons.light_mode_rounded, s.t('themeLight')),
          segment(ThemeMode.dark, Icons.dark_mode_rounded, s.t('themeDark')),
          segment(ThemeMode.system, Icons.brightness_auto_rounded, s.t('themeSystem')),
        ],
      ),
    );
  }
}
