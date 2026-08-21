import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../data/models/transaction.dart';
import '../l10n/strings.dart';
import '../router/app_router.dart';
import '../state/data_providers.dart';
import '../widgets/paged_list_view.dart';
import '../widgets/transaction_tile.dart';

/// History tab — the full, paginated list of the customer's deposit
/// transactions. Tapping a row opens its digital receipt.
class TransactionsScreen extends ConsumerWidget {
  const TransactionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppStrings s = AppStrings.of(context);
    final state = ref.watch(transactionsProvider);

    return Scaffold(
      appBar: AppBar(title: Text(s.t('transactionHistory'))),
      body: SafeArea(
        child: PagedListView<TransactionModel>(
          state: state,
          onRefresh: () => ref.read(transactionsProvider.notifier).refresh(),
          onLoadMore: () => ref.read(transactionsProvider.notifier).loadMore(),
          onRetry: () => ref.read(transactionsProvider.notifier).refresh(),
          emptyMessage: s.t('noTransactions'),
          emptyIcon: Icons.receipt_long_rounded,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          itemBuilder: (BuildContext context, TransactionModel txn) => TransactionTile(
            txn: txn,
            onTap: () => context.push('${Routes.receipt}/${txn.id}'),
          ),
        ),
      ),
    );
  }
}
