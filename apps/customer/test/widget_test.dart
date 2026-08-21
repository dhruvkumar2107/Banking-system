// Smoke test: the app boots through the splash screen and, when no session is
// present, lands on the mobile-login screen.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:pigmee_customer/data/token_storage.dart';
import 'package:pigmee_customer/main.dart';
import 'package:pigmee_customer/state/providers.dart';

void main() {
  testWidgets('Boots to the login screen when not signed in', (WidgetTester tester) async {
    // Onboarding already seen + no tokens → splash should route to /login.
    SharedPreferences.setMockInitialValues(<String, Object>{'pigmee.onboardingSeen': true});
    final SharedPreferences prefs = await SharedPreferences.getInstance();

    await tester.pumpWidget(
      ProviderScope(
        overrides: <Override>[
          sharedPreferencesProvider.overrideWithValue(prefs),
          tokenStorageProvider.overrideWithValue(TokenStorage()),
        ],
        child: const PigmeeApp(),
      ),
    );

    // The localization delegate loads asynchronously, so the first frame after
    // pumpWidget renders an empty placeholder; one pump resolves it and builds
    // the branded splash.
    await tester.pump();
    expect(find.text('Digital Pigmee'), findsOneWidget);

    // Let the ~850ms splash timer fire and route forward.
    await tester.pump(const Duration(seconds: 1));
    await tester.pump();

    // We should now be on the mobile-login screen.
    expect(find.text('Send OTP'), findsOneWidget);
  });
}
