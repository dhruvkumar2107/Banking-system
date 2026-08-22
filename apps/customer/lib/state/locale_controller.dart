import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'providers.dart';

/// The languages the app ships. Order drives both the segmented toggle and the
/// [LocaleController.toggle] cycle, so adding a language here is the only change
/// needed — provided `AppStrings.supported` lists it too.
const List<Locale> kSupportedLocales = <Locale>[Locale('en'), Locale('hi'), Locale('kn')];

/// Short labels for the segmented toggle, in each language's own script.
const Map<String, String> kLocaleShortLabels = <String, String>{
  'en': 'EN',
  'hi': 'हि',
  'kn': 'ಕ',
};

final localeControllerProvider = StateNotifierProvider<LocaleController, Locale>(
  (ref) => LocaleController(ref.watch(sharedPreferencesProvider)),
);

/// Persists the chosen UI language (English / Hindi / Kannada) in shared preferences.
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

  /// Advances to the next supported language, wrapping at the end. An unknown
  /// stored code lands on index 0, so this never throws.
  Future<void> toggle() {
    final int i = kSupportedLocales.indexWhere(
      (Locale l) => l.languageCode == state.languageCode,
    );
    return setLocale(kSupportedLocales[(i + 1) % kSupportedLocales.length]);
  }
}
