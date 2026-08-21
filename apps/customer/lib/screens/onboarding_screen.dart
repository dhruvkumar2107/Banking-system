import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/theme.dart';
import '../l10n/strings.dart';
import '../router/app_router.dart';
import '../state/providers.dart';
import '../widgets/primary_button.dart';
import 'splash_screen.dart' show kOnboardingSeenKey;

class _Slide {
  const _Slide(this.icon, this.titleKey, this.bodyKey);
  final IconData icon;
  final String titleKey;
  final String bodyKey;
}

const List<_Slide> _slides = <_Slide>[
  _Slide(Icons.savings_rounded, 'onboard1Title', 'onboard1Body'),
  _Slide(Icons.bolt_rounded, 'onboard2Title', 'onboard2Body'),
  _Slide(Icons.receipt_long_rounded, 'onboard3Title', 'onboard3Body'),
];

/// Three-slide introduction shown on first launch.
class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final PageController _controller = PageController();
  int _index = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _finish() async {
    await ref.read(sharedPreferencesProvider).setBool(kOnboardingSeenKey, true);
    if (mounted) context.go(Routes.login);
  }

  void _next() {
    if (_index >= _slides.length - 1) {
      _finish();
    } else {
      _controller.nextPage(duration: const Duration(milliseconds: 280), curve: Curves.easeOut);
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppStrings s = AppStrings.of(context);
    final bool isLast = _index == _slides.length - 1;

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: <Widget>[
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: _finish,
                child: Text(s.t('skip')),
              ),
            ),
            Expanded(
              child: PageView.builder(
                controller: _controller,
                onPageChanged: (int i) => setState(() => _index = i),
                itemCount: _slides.length,
                itemBuilder: (_, int i) {
                  final _Slide slide = _slides[i];
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 32),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: <Widget>[
                        Container(
                          height: 140,
                          width: 140,
                          decoration: BoxDecoration(
                            gradient: const LinearGradient(colors: PigmeeColors.heroGradient),
                            borderRadius: BorderRadius.circular(40),
                          ),
                          child: Icon(slide.icon, size: 68, color: Colors.white),
                        ),
                        const SizedBox(height: 40),
                        Text(
                          s.t(slide.titleKey),
                          textAlign: TextAlign.center,
                          style: Theme.of(context)
                              .textTheme
                              .headlineSmall
                              ?.copyWith(fontWeight: FontWeight.w800),
                        ),
                        const SizedBox(height: 14),
                        Text(
                          s.t(slide.bodyKey),
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                                color: Theme.of(context).colorScheme.outline,
                                height: 1.5,
                              ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List<Widget>.generate(
                _slides.length,
                (int i) => AnimatedContainer(
                  duration: const Duration(milliseconds: 220),
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  height: 8,
                  width: i == _index ? 24 : 8,
                  decoration: BoxDecoration(
                    color: i == _index ? PigmeeColors.indigo : PigmeeColors.inkMuted.withValues(alpha: 0.4),
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(24),
              child: PrimaryButton(
                label: s.t(isLast ? 'getStarted' : 'next'),
                onPressed: _next,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
