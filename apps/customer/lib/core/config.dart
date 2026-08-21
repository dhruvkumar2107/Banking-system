import 'package:flutter/foundation.dart';

/// App-wide configuration and compile-time constants.
class AppConfig {
  AppConfig._();

  /// Base URL of the Digital Pigmee API (already includes the `/api` prefix).
  ///
  /// Defaults to `localhost` on web/desktop, and Android emulator loopback (`10.0.2.2`) on mobile.
  static String get apiBaseUrl {
    const fromEnv = String.fromEnvironment('API_BASE_URL');
    if (fromEnv.isNotEmpty) return fromEnv;
    return kIsWeb ? 'http://localhost:4000/api' : 'http://10.0.2.2:4000/api';
  }

  static const Duration connectTimeout = Duration(seconds: 15);
  static const Duration receiveTimeout = Duration(seconds: 25);

  /// Default daily deposit suggestion (rupees) shown on the registration screen.
  static const int defaultDailyRupees = 100;

  /// Quick-pick daily amounts (rupees) offered during registration.
  static const List<int> dailyAmountPresets = <int>[50, 100, 200, 500, 1000];
}
