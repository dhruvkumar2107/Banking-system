import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/models/customer.dart';
import '../data/models/notification.dart';
import '../data/models/pigmy_account.dart';
import '../data/models/transaction.dart';
import '../data/models/village.dart';
import '../data/repositories/notifications_repository.dart';
import 'paged_notifier.dart';
import 'providers.dart';

/// Home dashboard. autoDispose so it re-fetches fresh on each visit; invalidate
/// after a successful deposit to refresh balances.
final dashboardProvider = FutureProvider.autoDispose<DashboardData>(
  (ref) => ref.watch(meRepositoryProvider).dashboard(),
);

final profileProvider = FutureProvider.autoDispose<CustomerProfile>(
  (ref) => ref.watch(meRepositoryProvider).profile(),
);

final accountsProvider = FutureProvider.autoDispose<List<PigmyAccount>>(
  (ref) => ref.watch(meRepositoryProvider).accounts(),
);

/// Public village list for the registration picker.
final villagesProvider = FutureProvider.autoDispose<List<Village>>(
  (ref) => ref.watch(villagesRepositoryProvider).list(),
);

final nomineesProvider = FutureProvider.autoDispose<List<Nominee>>(
  (ref) => ref.watch(meRepositoryProvider).nominees(),
);

final documentsProvider = FutureProvider.autoDispose<List<CustomerDocument>>(
  (ref) => ref.watch(meRepositoryProvider).documents(),
);

final bankDetailsProvider = FutureProvider.autoDispose<BankDetails?>(
  (ref) => ref.watch(meRepositoryProvider).bankDetails(),
);

/// Paginated passbook for a single account (keyed by account id).
final ledgerProvider = StateNotifierProvider.autoDispose
    .family<PagedNotifier<LedgerEntry>, AsyncValue<PagedState<LedgerEntry>>, String>(
  (ref, String accountId) => PagedNotifier<LedgerEntry>(
    (int page) => ref.watch(meRepositoryProvider).ledger(accountId, page: page),
  ),
);

/// Paginated transaction history across all of the customer's accounts.
final transactionsProvider = StateNotifierProvider.autoDispose<
    PagedNotifier<TransactionModel>, AsyncValue<PagedState<TransactionModel>>>(
  (ref) => PagedNotifier<TransactionModel>(
    (int page) => ref.watch(paymentsRepositoryProvider).transactions(page: page),
  ),
);

/// A single transaction's detail, for the receipt screen (keyed by id).
final transactionDetailProvider = FutureProvider.autoDispose.family<TransactionModel, String>(
  (ref, String id) => ref.watch(paymentsRepositoryProvider).transaction(id),
);

/// Notifications list plus the unread count carried alongside the page.
final notificationsProvider =
    FutureProvider.autoDispose<NotificationPage>((ref) => ref.watch(notificationsRepositoryProvider).list());

/// Lightweight unread badge count for the dashboard / nav.
final unreadCountProvider = FutureProvider.autoDispose<int>(
  (ref) => ref.watch(notificationsRepositoryProvider).unreadCount(),
);

/// Convenience: the current list of notifications for widgets that only need
/// the items (delegates to [notificationsProvider]).
final notificationItemsProvider = Provider.autoDispose<AsyncValue<List<NotificationModel>>>(
  (ref) => ref.watch(notificationsProvider).whenData((NotificationPage p) => p.page.data),
);
