import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'providers.dart';

final themeControllerProvider = StateNotifierProvider<ThemeController, ThemeMode>(
  (ref) => ThemeController(ref.watch(sharedPreferencesProvider)),
);

/// Persists the chosen appearance (light / dark / follow-system) in shared
/// preferences. Mirrors [LocaleController] so the two settings behave the same.
class ThemeController extends StateNotifier<ThemeMode> {
  ThemeController(this._prefs) : super(_initial(_prefs));

  final SharedPreferences _prefs;
  static const String _key = 'pigmee.themeMode';

  static ThemeMode _initial(SharedPreferences prefs) {
    switch (prefs.getString(_key)) {
      case 'light':
        return ThemeMode.light;
      case 'dark':
        return ThemeMode.dark;
      default:
        return ThemeMode.system;
    }
  }

  Future<void> setMode(ThemeMode mode) async {
    state = mode;
    await _prefs.setString(_key, mode.name);
  }
}
