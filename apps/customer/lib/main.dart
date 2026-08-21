import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'core/theme.dart';
import 'data/token_storage.dart';
import 'l10n/strings.dart';
import 'router/app_router.dart';
import 'state/locale_controller.dart';
import 'state/providers.dart';
import 'state/theme_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Hydrate the two things the provider graph needs synchronously at startup:
  // persisted preferences (locale, onboarding flag) and the secure token cache.
  final SharedPreferences prefs = await SharedPreferences.getInstance();
  final TokenStorage tokenStorage = TokenStorage();
  await tokenStorage.load();

  runApp(
    ProviderScope(
      overrides: <Override>[
        sharedPreferencesProvider.overrideWithValue(prefs),
        tokenStorageProvider.overrideWithValue(tokenStorage),
      ],
      child: const PigmeeApp(),
    ),
  );
}

/// Root widget. Wires the GoRouter, theme, and locale into a [MaterialApp.router].
class PigmeeApp extends ConsumerWidget {
  const PigmeeApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final GoRouter router = ref.watch(routerProvider);
    final Locale locale = ref.watch(localeControllerProvider);
    final ThemeMode themeMode = ref.watch(themeControllerProvider);

    return MaterialApp.router(
      title: 'Digital Pigmee',
      debugShowCheckedModeBanner: false,
      theme: PigmeeTheme.light(),
      darkTheme: PigmeeTheme.dark(),
      themeMode: themeMode,
      locale: locale,
      supportedLocales: kSupportedLocales,
      localizationsDelegates: const <LocalizationsDelegate<dynamic>>[
        AppStrings.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      routerConfig: router,
      builder: (BuildContext context, Widget? child) {
        if (child == null) return const SizedBox.shrink();
        return LayoutBuilder(
          builder: (BuildContext context, BoxConstraints constraints) {
            if (constraints.maxWidth > 500) {
              return Container(
                color: const Color(0xFF0D1117),
                child: Center(
                  child: Container(
                    constraints: const BoxConstraints(
                      maxWidth: 430,
                      maxHeight: 900,
                    ),
                    margin: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(32),
                      boxShadow: <BoxShadow>[
                        BoxShadow(
                          color: Colors.black.withOpacity(0.5),
                          blurRadius: 40,
                          spreadRadius: 4,
                          offset: const Offset(0, 16),
                        ),
                      ],
                      border: Border.all(
                        color: const Color(0xFF30363D),
                        width: 3,
                      ),
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: child,
                  ),
                ),
              );
            }
            return child;
          },
        );
      },
    );
  }
}
