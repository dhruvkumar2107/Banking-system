import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/theme.dart';
import '../data/models/customer.dart';
import '../data/models/pigmy_account.dart';
import '../l10n/strings.dart';
import '../router/app_router.dart';
import '../state/data_providers.dart';
import '../widgets/balance_card.dart';
import '../widgets/language_toggle.dart';
import '../widgets/state_views.dart';
import '../widgets/transaction_tile.dart';
import 'pay_screen.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  Future<void> _openPay(BuildContext context, WidgetRef ref, PigmyAccount? account) async {
    await context.push(
      Routes.pay,
      extra: account == null ? null : PayArgs(accountId: account.id),
    );
    // Refresh balances / activity after returning from the pay flow.
    ref.invalidate(dashboardProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<DashboardData> dash = ref.watch(dashboardProvider);

    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async => ref.invalidate(dashboardProvider),
          child: AsyncValueView<DashboardData>(
            value: dash,
            onRetry: () => ref.invalidate(dashboardProvider),
            data: (DashboardData data) => _Content(
              data: data,
              onPay: () => _openPay(context, ref, data.primaryAccount),
            ),
          ),
        ),
      ),
    );
  }
}

class _Content extends StatelessWidget {
  const _Content({required this.data, required this.onPay});

  final DashboardData data;
  final VoidCallback onPay;

  @override
  Widget build(BuildContext context) {
    final AppStrings s = AppStrings.of(context);
    final ThemeData theme = Theme.of(context);
    final PigmyAccount? primary = data.primaryAccount;
    final int hour = DateTime.now().hour;
    final String greetKey =
        hour < 12 ? 'goodMorning' : (hour < 17 ? 'goodAfternoon' : 'goodEvening');

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
      children: <Widget>[
        // Greeting row
        Row(
          children: <Widget>[
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(
                    s.t(greetKey),
                    style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.outline),
                  ),
                  Text(
                    data.customer.name,
                    style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            const LanguageToggle(),
          ],
        ),
        const SizedBox(height: 20),

        // KYC banner
        if (data.customer.kycStatus != 'verified') ...<Widget>[
          _KycBanner(status: data.customer.kycStatus),
          const SizedBox(height: 16),
        ],

        // Balance card
        BalanceCard(
          label: s.t('totalBalance'),
          amount: data.totalBalance,
          accountLabel: primary != null ? s.t('accountNumber') : null,
          accountNumber: primary?.accountNumber,
          payLabel: s.t('payNow'),
          onPay: onPay,
        ),
        const SizedBox(height: 24),

        // Quick actions
        Text(
          s.t('quickActions'),
          style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 12),
        Row(
          children: <Widget>[
            _QuickAction(
              icon: Icons.add_card_rounded,
              label: s.t('payNow'),
              gradient: const <Color>[PigmeeColors.indigo, PigmeeColors.violet],
              onTap: onPay,
            ),
            _QuickAction(
              icon: Icons.menu_book_rounded,
              label: s.t('passbook'),
              gradient: const <Color>[PigmeeColors.violet, PigmeeColors.violetLight],
              onTap: primary == null ? null : () => context.push('${Routes.account}/${primary.id}'),
            ),
            _QuickAction(
              icon: Icons.history_rounded,
              label: s.t('history'),
              gradient: const <Color>[PigmeeColors.cyanDeep, PigmeeColors.cyan],
              onTap: () => context.go(Routes.history),
            ),
            _QuickAction(
              icon: Icons.request_quote_rounded,
              label: s.t('loans'),
              gradient: const <Color>[PigmeeColors.amber, Color(0xFFFBBF24)],
              onTap: () => context.push(Routes.loans),
            ),
            _QuickAction(
              icon: Icons.help_outline_rounded,
              label: s.t('helpSupport'),
              gradient: const <Color>[PigmeeColors.emerald, Color(0xFF34D399)],
              onTap: () => context.push(Routes.help),
            ),
          ],
        ),
        const SizedBox(height: 24),

        // Recent activity
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: <Widget>[
            Text(
              s.t('recentActivity'),
              style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
            ),
            if (data.recentTransactions.isNotEmpty)
              TextButton(
                onPressed: () => context.go(Routes.history),
                child: Text(s.t('seeAll')),
              ),
          ],
        ),
        const SizedBox(height: 4),
        if (data.recentTransactions.isEmpty)
          Card(
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 28),
              child: EmptyView(message: s.t('noTransactions'), icon: Icons.receipt_long_rounded),
            ),
          )
        else
          Card(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              child: Column(
                children: <Widget>[
                  for (int i = 0; i < data.recentTransactions.length; i++) ...<Widget>[
                    TransactionTile(
                      txn: data.recentTransactions[i],
                      onTap: () => context.push('${Routes.receipt}/${data.recentTransactions[i].id}'),
                    ),
                    if (i != data.recentTransactions.length - 1) const Divider(height: 1),
                  ],
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class _QuickAction extends StatelessWidget {
  const _QuickAction({
    required this.icon,
    required this.label,
    required this.gradient,
    this.onTap,
  });

  final IconData icon;
  final String label;
  final List<Color> gradient;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final bool enabled = onTap != null;
    return Expanded(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
          child: Column(
            children: <Widget>[
              Container(
                height: 54,
                width: 54,
                decoration: BoxDecoration(
                  gradient: enabled
                      ? LinearGradient(
                          colors: gradient,
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        )
                      : null,
                  color: enabled ? null : theme.colorScheme.onSurface.withValues(alpha: 0.06),
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: enabled
                      ? <BoxShadow>[
                          BoxShadow(
                            color: gradient.last.withValues(alpha: 0.35),
                            blurRadius: 14,
                            offset: const Offset(0, 6),
                          ),
                        ]
                      : null,
                ),
                child: Icon(
                  icon,
                  size: 24,
                  color: enabled ? Colors.white : theme.colorScheme.outline,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                label,
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _KycBanner extends StatelessWidget {
  const _KycBanner({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final AppStrings s = AppStrings.of(context);
    final bool rejected = status == 'rejected';
    final Color color = rejected ? PigmeeColors.rose : PigmeeColors.amber;
    return InkWell(
      // The banner is the shortest route to the KYC screen from the home tab.
      onTap: () => context.push(Routes.kyc),
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withValues(alpha: 0.35)),
        ),
        child: Row(
          children: <Widget>[
            Icon(rejected ? Icons.error_rounded : Icons.info_rounded, color: color),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(
                    s.t(rejected ? 'kycRejected' : 'kycPending'),
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    s.t('completeKycBody'),
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, color: color),
          ],
        ),
      ),
    );
  }
}
