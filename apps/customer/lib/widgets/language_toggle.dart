import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/theme.dart';
import '../state/locale_controller.dart';

/// Compact EN / हि / ಕ segmented toggle bound to [localeControllerProvider].
///
/// Built from [kSupportedLocales] rather than hardcoded segments, so shipping
/// another language needs no change here.
class LanguageToggle extends ConsumerWidget {
  const LanguageToggle({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final Locale locale = ref.watch(localeControllerProvider);

    Widget segment(Locale l) {
      final bool selected = l.languageCode == locale.languageCode;
      return GestureDetector(
        onTap: () => ref.read(localeControllerProvider.notifier).setLocale(l),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
          decoration: BoxDecoration(
            color: selected ? PigmeeColors.indigo : Colors.transparent,
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            kLocaleShortLabels[l.languageCode] ?? l.languageCode.toUpperCase(),
            style: TextStyle(
              color: selected ? Colors.white : PigmeeColors.inkMuted,
              fontWeight: FontWeight.w700,
              fontSize: 13,
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
        children: kSupportedLocales.map(segment).toList(),
      ),
    );
  }
}
