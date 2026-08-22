import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/formatters.dart';
import '../core/theme.dart';
import '../data/models/loan_models.dart';
import '../l10n/strings.dart';
import '../router/app_router.dart';
import '../state/loan_providers.dart';
import '../state/paged_notifier.dart';
import '../widgets/paged_list_view.dart';
import '../widgets/primary_button.dart';
import '../widgets/section_card.dart';
import '../widgets/status_pill.dart';

/// Label for a loan status. Top-level so the list, the detail screen and the
/// apply flow never word the same status differently.
String loanStatusLabel(AppStrings s, String status) => switch (status) {
      'approved' => s.t('loanStatusApproved'),
      'rejected' => s.t('loanStatusRejected'),
      'cancelled' => s.t('loanStatusCancelled'),
      'disbursed' => s.t('loanStatusDisbursed'),
      'closed' => s.t('loanStatusClosed'),
      'defaulted' => s.t('loanStatusDefaulted'),
      _ => s.t('loanStatusPending'),
    };

/// Label for one instalment's status.
String instalmentStatusLabel(AppStrings s, String status) => switch (status) {
      'paid' => s.t('instalmentStatusPaid'),
      'overdue' => s.t('instalmentStatusOverdue'),
      'waived' => s.t('instalmentStatusWaived'),
      _ => s.t('instalmentStatusDue'),
    };

/// A rate as the branch quotes it: `12%`, not `12.0%`.
String loanPercent(double value) =>
    value == value.roundToDouble() ? '${value.round()}%' : '${value.toStringAsFixed(2)}%';

/// "My loans": the product terms and an apply button on top, then every loan the
/// customer has ever taken, newest first.
class LoansScreen extends ConsumerWidget {
  const LoansScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppStrings s = AppStrings.of(context);
    final AsyncValue<PagedState<Loan>> state = ref.watch(loansProvider);

    return Scaffold(
      appBar: AppBar(title: Text(s.t('loansTitle'))),
      body: SafeArea(
        child: PagedListView<Loan>(
          state: state,
          onRefresh: () => ref.read(loansProvider.notifier).refresh(),
          onLoadMore: () => ref.read(loansProvider.notifier).loadMore(),
          onRetry: () => ref.read(loansProvider.notifier).refresh(),
          emptyMessage: s.t('loansEmpty'),
          emptyIcon: Icons.request_quote_outlined,
          header: const _ApplyCard(),
          itemBuilder: (BuildContext context, Loan loan) => _LoanTile(
            loan: loan,
            onTap: () => context.push('${Routes.loans}/${loan.id}'),
          ),
        ),
      ),
    );
  }
}

/// The product pitch and the way in. Always on screen — with no loans yet this
/// card is the explanation, and afterwards it is the way to take another.
class _ApplyCard extends ConsumerWidget {
  const _ApplyCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppStrings s = AppStrings.of(context);
    final ThemeData theme = Theme.of(context);
    final LoanSettings? cfg = ref.watch(loanSettingsProvider).valueOrNull;
    final bool off = cfg != null && !cfg.enabled;

    return SectionCard(
      title: s.t('applyForLoan'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Text(s.t('loansEmptyBody'), style: theme.textTheme.bodyMedium),
          if (cfg != null) ...<Widget>[
            const SizedBox(height: 10),
            InfoRow(
              label: s.t('loanInterestRate'),
              value: loanPercent(cfg.interestRatePercent),
            ),
            InfoRow(
              label: s.t('loanPrincipal'),
              value: s.f('loanAmountRange', <Object>[
                cfg.minAmount.display,
                cfg.maxAmount.display,
              ]),
            ),
            InfoRow(
              label: s.t('loanTenure'),
              value: s.f('loanTenureRange', <Object>[cfg.minTenureMonths, cfg.maxTenureMonths]),
            ),
          ],
          const SizedBox(height: 14),
          if (off)
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                const Icon(Icons.info_outline_rounded, size: 18, color: PigmeeColors.amber),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    s.t('loansDisabled'),
                    style: theme.textTheme.bodyMedium?.copyWith(color: PigmeeColors.amber),
                  ),
                ),
              ],
            )
          else
            SecondaryButton(
              label: s.t('applyForLoan'),
              icon: Icons.add_rounded,
              onPressed: () => context.push(Routes.loanApply),
            ),
        ],
      ),
    );
  }
}

class _LoanTile extends StatelessWidget {
  const _LoanTile({required this.loan, required this.onTap});

  final Loan loan;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final AppStrings s = AppStrings.of(context);
    final ThemeData theme = Theme.of(context);
    final List<String> meta = <String>[
      if (loan.loanNumber.isNotEmpty) loan.loanNumber,
      Formatters.date(loan.requestedAt),
      s.f('loanTenureMonths', <Object>[loan.tenureMonths]),
    ];

    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 14),
        child: Row(
          children: <Widget>[
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Row(
                    children: <Widget>[
                      Expanded(
                        child: Text(
                          loan.principal.display,
                          style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                        ),
                      ),
                      StatusPill.loan(loan.status, loanStatusLabel(s, loan.status)),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    meta.join(' · '),
                    style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                  ),
                  // Repayment figures only mean something once money has moved.
                  if (loan.isLive) ...<Widget>[
                    const SizedBox(height: 8),
                    Row(
                      children: <Widget>[
                        Expanded(
                          child: _Figure(
                            label: s.t('loanEmi'),
                            value: loan.emiAmount.display,
                          ),
                        ),
                        Expanded(
                          child: _Figure(
                            label: s.t('loanOutstanding'),
                            value: loan.outstanding.display,
                            valueColor:
                                loan.outstanding.paise > 0 ? PigmeeColors.rose : PigmeeColors.emerald,
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, color: theme.colorScheme.outline),
          ],
        ),
      ),
    );
  }
}

/// A small label-over-value pair, for figures that sit side by side.
class _Figure extends StatelessWidget {
  const _Figure({required this.label, required this.value, this.valueColor});

  final String label;
  final String value;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          label,
          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: theme.textTheme.bodyMedium?.copyWith(
            fontWeight: FontWeight.w700,
            color: valueColor,
          ),
        ),
      ],
    );
  }
}
