import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/formatters.dart';
import '../core/theme.dart';
import '../data/models/money.dart';
import '../data/models/pigmy_account.dart';
import '../data/models/transaction.dart';
import '../l10n/strings.dart';
import '../state/data_providers.dart';
import '../widgets/money_text.dart';
import '../widgets/paged_list_view.dart';
import '../widgets/status_pill.dart';

/// Passbook for a single pigmy account: a balance summary header followed by the
/// paginated, append-only ledger.
class AccountDetailScreen extends ConsumerWidget {
  const AccountDetailScreen({super.key, required this.accountId});

  final String accountId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppStrings s = AppStrings.of(context);
    final ledger = ref.watch(ledgerProvider(accountId));
    final AsyncValue<List<PigmyAccount>> accounts = ref.watch(accountsProvider);

    final PigmyAccount? account = accounts.maybeWhen(
      data: (List<PigmyAccount> list) {
        for (final PigmyAccount a in list) {
          if (a.id == accountId) return a;
        }
        return list.isNotEmpty ? list.first : null;
      },
      orElse: () => null,
    );

    return Scaffold(
      appBar: AppBar(title: Text(s.t('accountDetails'))),
      body: SafeArea(
        child: PagedListView<LedgerEntry>(
          state: ledger,
          onRefresh: () async {
            ref.invalidate(accountsProvider);
            await ref.read(ledgerProvider(accountId).notifier).refresh();
          },
          onLoadMore: () => ref.read(ledgerProvider(accountId).notifier).loadMore(),
          onRetry: () => ref.read(ledgerProvider(accountId).notifier).refresh(),
          emptyMessage: s.t('noLedger'),
          emptyIcon: Icons.menu_book_rounded,
          separated: false,
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          header: account == null ? null : _AccountHeader(account: account),
          itemBuilder: (BuildContext context, LedgerEntry e) => _LedgerTile(entry: e),
        ),
      ),
    );
  }
}

class _AccountHeader extends StatelessWidget {
  const _AccountHeader({required this.account});
  final PigmyAccount account;

  ({String labelKey, Color color, IconData icon}) get _status {
    switch (account.status) {
      case PigmyStatus.inactive:
        return (labelKey: 'statusInactive', color: PigmeeColors.amber, icon: Icons.pause_circle_rounded);
      case PigmyStatus.closed:
        return (labelKey: 'statusClosed', color: PigmeeColors.rose, icon: Icons.lock_rounded);
      case PigmyStatus.active:
        return (labelKey: 'statusActive', color: PigmeeColors.emerald, icon: Icons.check_circle_rounded);
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppStrings s = AppStrings.of(context);
    final ThemeData theme = Theme.of(context);
    final ({String labelKey, Color color, IconData icon}) st = _status;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        // Balance hero
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: PigmeeColors.balanceGradient,
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: <Widget>[
                  Text(
                    s.t('currentBalance'),
                    style: theme.textTheme.bodyMedium?.copyWith(color: Colors.white70),
                  ),
                  StatusPill(label: s.t(st.labelKey), color: st.color, icon: st.icon),
                ],
              ),
              const SizedBox(height: 6),
              MoneyText(
                account.currentBalance,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 34,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                account.accountNumber,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: Colors.white70,
                  letterSpacing: 1.5,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        Row(
          children: <Widget>[
            Expanded(
              child: _MiniStat(
                label: s.t('totalDeposited'),
                money: account.totalDeposited,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _MiniStat(
                label: s.t('dailyDeposit'),
                money: account.dailyAmount,
              ),
            ),
          ],
        ),
        const SizedBox(height: 18),
        Text(
          s.t('ledger'),
          style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
        ),
        Padding(
          padding: const EdgeInsets.only(top: 2, bottom: 4),
          child: Text(
            s.f('openedOn', <Object>[Formatters.date(account.createdAt)]),
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
          ),
        ),
      ],
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat({required this.label, required this.money});
  final String label;
  final Money money;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: theme.cardColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: theme.dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            label,
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
          ),
          const SizedBox(height: 6),
          MoneyText(
            money,
            style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
          ),
        ],
      ),
    );
  }
}

class _LedgerTile extends StatelessWidget {
  const _LedgerTile({required this.entry});
  final LedgerEntry entry;

  @override
  Widget build(BuildContext context) {
    final AppStrings s = AppStrings.of(context);
    final ThemeData theme = Theme.of(context);
    final bool credit = entry.isCredit;
    final Color color = credit ? PigmeeColors.emerald : PigmeeColors.rose;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: <Widget>[
          Container(
            height: 40,
            width: 40,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              credit ? Icons.arrow_downward_rounded : Icons.arrow_upward_rounded,
              color: color,
              size: 18,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  entry.note?.trim().isNotEmpty == true
                      ? entry.note!
                      : s.t(credit ? 'credit' : 'debit'),
                  style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 2),
                Text(
                  Formatters.dateTime(entry.createdAt),
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: <Widget>[
              MoneyText(
                entry.amount,
                signed: true,
                credit: credit,
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 15,
                  color: credit ? PigmeeColors.emeraldDark : PigmeeColors.rose,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                s.f('balanceAfter', <Object>[entry.balanceAfter.display]),
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
