import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'providers.dart';

const List<Locale> kSupportedLocales = <Locale>[Locale('en'), Locale('hi')];

final localeControllerProvider = StateNotifierProvider<LocaleController, Locale>(
  (ref) => LocaleController(ref.watch(sharedPreferencesProvider)),
);

/// Persists the chosen UI language (English / Hindi) in shared preferences.
class LocaleController extends StateNotifier<Locale> {
  LocaleController(this._prefs) : super(_initial(_prefs));

  final SharedPreferences _prefs;
  static const String _key = 'pigmee.locale';

  static Locale _initial(SharedPreferences prefs) {
    final String code = prefs.getString(_key) ?? 'en';
    return kSupportedLocales.firstWhere(
      (Locale l) => l.languageCode == code,
      orElse: () => const Locale('en'),
    );
  }

  Future<void> setLocale(Locale locale) async {
    state = locale;
    await _prefs.setString(_key, locale.languageCode);
  }

  Future<void> toggle() =>
      setLocale(state.languageCode == 'en' ? const Locale('hi') : const Locale('en'));
}
