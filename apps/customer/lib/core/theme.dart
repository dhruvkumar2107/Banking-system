import 'package:flutter/material.dart';

/// Digital Pigmee visual identity — a calm, premium fintech palette built around
/// a deep indigo primary with an emerald "money-positive" accent.
class PigmeeColors {
  PigmeeColors._();

  static const Color indigo = Color(0xFF4F46E5);
  static const Color indigoDark = Color(0xFF3730A3);
  static const Color indigoDeep = Color(0xFF1E1B4B);
  static const Color violet = Color(0xFF7C3AED);
  static const Color violetLight = Color(0xFFA78BFA);
  static const Color cyan = Color(0xFF22D3EE);
  static const Color cyanDeep = Color(0xFF06B6D4);
  static const Color emerald = Color(0xFF10B981);
  static const Color emeraldDark = Color(0xFF047857);
  static const Color amber = Color(0xFFF59E0B);
  static const Color rose = Color(0xFFE11D48);
  static const Color ink = Color(0xFF0F172A);
  static const Color inkSoft = Color(0xFF475569);
  static const Color inkMuted = Color(0xFF94A3B8);
  static const Color canvas = Color(0xFFF5F6FB);
  static const Color surface = Color(0xFFFFFFFF);

  /// Deep-space neutrals for dark mode (aligned with the admin console).
  static const Color darkCanvas = Color(0xFF080B18);
  static const Color darkSurface = Color(0xFF12182B);

  /// Gradient used behind the headline balance card.
  static const List<Color> balanceGradient = <Color>[
    Color(0xFF4338CA),
    Color(0xFF5B4BE6),
    Color(0xFF7C3AED),
  ];

  /// Gradient for the primary call-to-action button.
  static const List<Color> buttonGradient = <Color>[
    Color(0xFF4F46E5),
    Color(0xFF6366F1),
    Color(0xFF7C3AED),
  ];

  static const List<Color> heroGradient = <Color>[
    Color(0xFF312E81),
    Color(0xFF4F46E5),
    Color(0xFF7C3AED),
  ];
}

/// Builds the light / dark [ThemeData] used across the app.
class PigmeeTheme {
  PigmeeTheme._();

  static ThemeData light() => _build(Brightness.light);
  static ThemeData dark() => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final bool isDark = brightness == Brightness.dark;
    final ColorScheme scheme = ColorScheme.fromSeed(
      seedColor: PigmeeColors.indigo,
      brightness: brightness,
      primary: PigmeeColors.indigo,
      secondary: PigmeeColors.emerald,
      error: PigmeeColors.rose,
    );

    final Color canvas = isDark ? PigmeeColors.darkCanvas : PigmeeColors.canvas;
    final Color surface = isDark ? PigmeeColors.darkSurface : PigmeeColors.surface;

    final TextTheme baseText = Typography.material2021(platform: TargetPlatform.android)
        .black
        .apply(
          bodyColor: isDark ? Colors.white : PigmeeColors.ink,
          displayColor: isDark ? Colors.white : PigmeeColors.ink,
        );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: canvas,
      canvasColor: canvas,
      textTheme: baseText,
      fontFamily: 'Roboto',
      appBarTheme: AppBarTheme(
        elevation: 0,
        centerTitle: false,
        backgroundColor: canvas,
        foregroundColor: isDark ? Colors.white : PigmeeColors.ink,
        titleTextStyle: baseText.titleLarge?.copyWith(
          fontWeight: FontWeight.w700,
          color: isDark ? Colors.white : PigmeeColors.ink,
        ),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        color: surface,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: BorderSide(
            color: isDark ? const Color(0xFF223052) : const Color(0xFFEAECF4),
          ),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: PigmeeColors.indigo,
          foregroundColor: Colors.white,
          elevation: 0,
          minimumSize: const Size.fromHeight(54),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: PigmeeColors.indigo,
          minimumSize: const Size.fromHeight(54),
          side: const BorderSide(color: PigmeeColors.indigo, width: 1.4),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: PigmeeColors.indigo),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: isDark ? const Color(0xFF161D34) : Colors.white,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(
            color: isDark ? const Color(0xFF2A3557) : const Color(0xFFD8DCEA),
          ),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(
            color: isDark ? const Color(0xFF2A3557) : const Color(0xFFD8DCEA),
          ),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: PigmeeColors.indigo, width: 1.8),
        ),
        labelStyle: const TextStyle(color: PigmeeColors.inkSoft),
        prefixIconColor: PigmeeColors.inkMuted,
      ),
      chipTheme: ChipThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        side: BorderSide.none,
      ),
      dividerTheme: DividerThemeData(
        color: isDark ? const Color(0xFF223052) : const Color(0xFFEAECF4),
        thickness: 1,
        space: 1,
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: surface,
        selectedItemColor: PigmeeColors.indigo,
        unselectedItemColor: PigmeeColors.inkMuted,
        type: BottomNavigationBarType.fixed,
        showUnselectedLabels: true,
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }
}
