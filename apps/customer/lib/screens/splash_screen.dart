import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/theme.dart';
import '../l10n/strings.dart';
import '../router/app_router.dart';
import '../state/auth_controller.dart';
import '../state/providers.dart';

/// Preference key marking that the onboarding carousel has been completed.
const String kOnboardingSeenKey = 'pigmee.onboardingSeen';

/// Branded launch screen. Authenticated users are whisked to /home by the
/// router redirect; everyone else is routed to onboarding (first run) or login.
class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> {
  @override
  void initState() {
    super.initState();
    Timer(const Duration(milliseconds: 1100), _decideNext);
  }

  void _decideNext() {
    if (!mounted) return;
    final AuthState auth = ref.read(authControllerProvider);
    if (auth.isAuthenticated) {
      context.go(Routes.home);
      return;
    }
    final bool seen = ref.read(sharedPreferencesProvider).getBool(kOnboardingSeenKey) ?? false;
    context.go(seen ? Routes.login : Routes.onboarding);
  }

  @override
  Widget build(BuildContext context) {
    final AppStrings s = AppStrings.of(context);
    return Scaffold(
      body: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: PigmeeColors.heroGradient,
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: Stack(
          children: <Widget>[
            // Drifting aurora orbs give the flat gradient depth.
            Positioned(
              top: -80,
              right: -60,
              child: _orb(240, PigmeeColors.violetLight.withValues(alpha: 0.35)),
            ),
            Positioned(
              bottom: -70,
              left: -50,
              child: _orb(260, PigmeeColors.cyan.withValues(alpha: 0.28)),
            ),
            Positioned(
              bottom: 120,
              right: -30,
              child: _orb(140, Colors.white.withValues(alpha: 0.10)),
            ),
            // Animated brand lockup.
            Center(
              child: TweenAnimationBuilder<double>(
                tween: Tween<double>(begin: 0, end: 1),
                duration: const Duration(milliseconds: 720),
                curve: Curves.easeOutCubic,
                builder: (BuildContext context, double t, Widget? child) {
                  return Opacity(
                    opacity: t.clamp(0.0, 1.0),
                    child: Transform.scale(scale: 0.85 + (0.15 * t), child: child),
                  );
                },
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    Container(
                      height: 104,
                      width: 104,
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.16),
                        borderRadius: BorderRadius.circular(30),
                        border: Border.all(color: Colors.white.withValues(alpha: 0.35), width: 1.4),
                        boxShadow: <BoxShadow>[
                          BoxShadow(
                            color: PigmeeColors.violet.withValues(alpha: 0.45),
                            blurRadius: 40,
                            spreadRadius: 4,
                          ),
                        ],
                      ),
                      child: const Icon(Icons.savings_rounded, color: Colors.white, size: 56),
                    ),
                    const SizedBox(height: 26),
                    Text(
                      s.t('appName'),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 27,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.4,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      s.t('appTagline'),
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.78),
                        fontSize: 13.5,
                        fontWeight: FontWeight.w500,
                        letterSpacing: 0.2,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            // Progress indicator pinned near the bottom.
            Positioned(
              left: 0,
              right: 0,
              bottom: 56,
              child: Center(
                child: SizedBox(
                  height: 22,
                  width: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.4,
                    color: Colors.white.withValues(alpha: 0.85),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// A soft circular glow used as a decorative backdrop element.
  static Widget _orb(double size, Color color) => Container(
        height: size,
        width: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(
            colors: <Color>[color, color.withValues(alpha: 0)],
          ),
        ),
      );
}
