import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../screens/account_detail_screen.dart';
import '../screens/bank_details_screen.dart';
import '../screens/dashboard_screen.dart';
import '../screens/edit_profile_screen.dart';
import '../screens/help_screen.dart';
import '../screens/home_shell.dart';
import '../screens/login_screen.dart';
import '../screens/notifications_screen.dart';
import '../screens/onboarding_screen.dart';
import '../screens/otp_screen.dart';
import '../screens/pay_result_screen.dart';
import '../screens/pay_screen.dart';
import '../screens/profile_screen.dart';
import '../screens/receipt_screen.dart';
import '../screens/register_screen.dart';
import '../screens/splash_screen.dart';
import '../screens/transactions_screen.dart';
import '../state/auth_controller.dart';

/// Route path constants — referenced by screens instead of raw strings.
class Routes {
  Routes._();
  static const String splash = '/splash';
  static const String onboarding = '/onboarding';
  static const String login = '/login';
  static const String otp = '/otp';
  static const String register = '/register';
  static const String home = '/home';
  static const String history = '/history';
  static const String alerts = '/alerts';
  static const String profile = '/profile';
  static const String account = '/account'; // /account/:id
  static const String pay = '/pay';
  static const String payResult = '/pay-result';
  static const String receipt = '/receipt'; // /receipt/:id
  static const String help = '/help';
  static const String editProfile = '/edit-profile';
  static const String bankDetails = '/bank-details';
}

/// Routes reachable without authentication.
const Set<String> _publicRoutes = <String>{
  Routes.splash,
  Routes.onboarding,
  Routes.login,
  Routes.otp,
  Routes.register,
};

final _rootNavigatorKey = GlobalKey<NavigatorState>();
final _shellNavigatorKey = GlobalKey<NavigatorState>();

final routerProvider = Provider<GoRouter>((ref) {
  // Bridge Riverpod auth changes into a Listenable so the router re-evaluates
  // its redirect whenever the session state flips.
  final ValueNotifier<int> refresh = ValueNotifier<int>(0);
  ref.listen<AuthState>(authControllerProvider, (_, _) => refresh.value++);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: Routes.splash,
    refreshListenable: refresh,
    redirect: (BuildContext context, GoRouterState state) {
      final AuthState auth = ref.read(authControllerProvider);
      final String loc = state.matchedLocation;
      final bool isPublic = _publicRoutes.contains(loc);

      if (auth.status == AuthStatus.unknown) {
        return loc == Routes.splash ? null : Routes.splash;
      }
      if (!auth.isAuthenticated) {
        return isPublic ? null : Routes.login;
      }
      // Authenticated: keep them out of the pre-login funnel.
      if (isPublic) return Routes.home;
      return null;
    },
    routes: <RouteBase>[
      GoRoute(path: Routes.splash, builder: (_, _) => const SplashScreen()),
      GoRoute(path: Routes.onboarding, builder: (_, _) => const OnboardingScreen()),
      GoRoute(path: Routes.login, builder: (_, _) => const LoginScreen()),
      GoRoute(
        path: Routes.otp,
        builder: (_, GoRouterState s) => OtpScreen(args: s.extra as OtpArgs),
      ),
      GoRoute(
        path: Routes.register,
        builder: (_, GoRouterState s) => RegisterScreen(args: s.extra as RegisterArgs),
      ),

      // Main authenticated experience — 4 bottom-nav tabs with preserved state.
      StatefulShellRoute.indexedStack(
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, _, StatefulNavigationShell shell) => HomeShell(shell: shell),
        branches: <StatefulShellBranch>[
          StatefulShellBranch(
            navigatorKey: _shellNavigatorKey,
            routes: <RouteBase>[GoRoute(path: Routes.home, builder: (_, _) => const DashboardScreen())],
          ),
          StatefulShellBranch(
            routes: <RouteBase>[GoRoute(path: Routes.history, builder: (_, _) => const TransactionsScreen())],
          ),
          StatefulShellBranch(
            routes: <RouteBase>[GoRoute(path: Routes.alerts, builder: (_, _) => const NotificationsScreen())],
          ),
          StatefulShellBranch(
            routes: <RouteBase>[GoRoute(path: Routes.profile, builder: (_, _) => const ProfileScreen())],
          ),
        ],
      ),

      // Full-screen routes pushed above the shell.
      GoRoute(
        parentNavigatorKey: _rootNavigatorKey,
        path: '${Routes.account}/:id',
        builder: (_, GoRouterState s) => AccountDetailScreen(accountId: s.pathParameters['id']!),
      ),
      GoRoute(
        parentNavigatorKey: _rootNavigatorKey,
        path: Routes.pay,
        builder: (_, GoRouterState s) => PayScreen(args: s.extra as PayArgs?),
      ),
      GoRoute(
        parentNavigatorKey: _rootNavigatorKey,
        path: Routes.payResult,
        builder: (_, GoRouterState s) => PayResultScreen(args: s.extra as PayResultArgs),
      ),
      GoRoute(
        parentNavigatorKey: _rootNavigatorKey,
        path: '${Routes.receipt}/:id',
        builder: (_, GoRouterState s) => ReceiptScreen(transactionId: s.pathParameters['id']!),
      ),
      GoRoute(
        parentNavigatorKey: _rootNavigatorKey,
        path: Routes.help,
        builder: (_, _) => const HelpScreen(),
      ),
      GoRoute(
        parentNavigatorKey: _rootNavigatorKey,
        path: Routes.editProfile,
        builder: (_, GoRouterState s) => EditProfileScreen(args: s.extra as EditProfileArgs),
      ),
      GoRoute(
        parentNavigatorKey: _rootNavigatorKey,
        path: Routes.bankDetails,
        builder: (_, GoRouterState s) => BankDetailsScreen(existing: s.extra as BankDetailsArgs?),
      ),
    ],
  );
});
