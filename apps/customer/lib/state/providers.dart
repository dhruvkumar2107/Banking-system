import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../data/api_client.dart';
import '../data/repositories/auth_repository.dart';
import '../data/repositories/me_repository.dart';
import '../data/repositories/notifications_repository.dart';
import '../data/repositories/payments_repository.dart';
import '../data/repositories/villages_repository.dart';
import '../data/token_storage.dart';
import 'auth_controller.dart';

/// Overridden in `main()` with the instance loaded before `runApp`.
final sharedPreferencesProvider = Provider<SharedPreferences>(
  (ref) => throw UnimplementedError('sharedPreferencesProvider must be overridden in main()'),
);

/// Overridden in `main()` with the already-hydrated [TokenStorage].
final tokenStorageProvider = Provider<TokenStorage>(
  (ref) => throw UnimplementedError('tokenStorageProvider must be overridden in main()'),
);

/// The single [ApiClient]. Its `onUnauthorized` is wired lazily to the auth
/// controller — `ref.read` runs only when a refresh actually fails, so there is
/// no construction-time dependency cycle between the client and the controller.
final Provider<ApiClient> apiClientProvider = Provider<ApiClient>((ref) {
  final ApiClient client = ApiClient(ref.watch(tokenStorageProvider));
  client.onUnauthorized = () => ref.read(authControllerProvider.notifier).onSessionExpired();
  return client;
});

final Provider<AuthRepository> authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepository(ref.watch(apiClientProvider), ref.watch(tokenStorageProvider)),
);

final meRepositoryProvider = Provider<MeRepository>(
  (ref) => MeRepository(ref.watch(apiClientProvider)),
);

final paymentsRepositoryProvider = Provider<PaymentsRepository>(
  (ref) => PaymentsRepository(ref.watch(apiClientProvider)),
);

final notificationsRepositoryProvider = Provider<NotificationsRepository>(
  (ref) => NotificationsRepository(ref.watch(apiClientProvider)),
);

final villagesRepositoryProvider = Provider<VillagesRepository>(
  (ref) => VillagesRepository(ref.watch(apiClientProvider)),
);
