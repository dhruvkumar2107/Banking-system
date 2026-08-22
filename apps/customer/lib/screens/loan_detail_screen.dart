import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/formatters.dart';
import '../core/theme.dart';
import '../data/api_exception.dart';
import '../data/models/loan_models.dart';
import '../l10n/strings.dart';
import '../state/loan_providers.dart';
import '../state/providers.dart';
import '../widgets/section_card.dart';
import '../widgets/state_views.dart';
import '../widgets/status_pill.dart';
import 'loans_screen.dart';

/// One loan end to end: what it costs, what is left to pay, the full instalment
/// schedule, and — while it still awaits a decision — the way to withdraw it.
class LoanDetailScreen extends ConsumerStatefulWidget {
  const LoanDetailScreen({super.key, required this.loanId});

  final String loanId;

  @override
  ConsumerState<LoanDetailScreen> createState() => _LoanDetailScreenState();
}

class _LoanDetailScreenState extends ConsumerState<LoanDetailScreen> {
  bool _cancelling = false;

  Future<void> _cancel(Loan loan) async {
    final AppStrings s = AppStrings.of(context);
    final bool? confirmed = await showDialog<bool>(
      context: context,
      builder: (BuildContext ctx) => AlertDialog(
        title: Text(s.t('loanCancelConfirm')),
        content: Text(s.f('loanCancelConfirmBody', <Object>[loan.principal.display])),
        actions: <Widget>[
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(s.t('close'))),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: PigmeeColors.rose),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(s.t('loanCancel')),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _cancelling = true);
    try {
      await ref.read(loansRepositoryProvider).cancel(loan.id);
      if (!mounted) return;
      ref.invalidate(loanDetailProvider(widget.loanId));
      ref.invalidate(loansProvider);
      _snack(s.t('loanCancelled'));
    } on ApiException catch (e) {
      _snack(e.message);
    } catch (_) {
      _snack(s.t('somethingWrong'));
    } finally {
      if (mounted) setState(() => _cancelling = false);
    }
  }

  void _snack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final AppStrings s = AppStrings.of(context);
    final AsyncValue<LoanDetail> detail = ref.watch(loanDetailProvider(widget.loanId));

    return Scaffold(
      appBar: AppBar(title: Text(s.t('loanDetailTitle'))),
      body: SafeArea(
        child: AsyncValueView<LoanDetail>(
          value: detail,
          onRetry: () => ref.invalidate(loanDetailProvider(widget.loanId)),
          data: (LoanDetail d) => RefreshIndicator(
            onRefresh: () async => ref.invalidate(loanDetailProvider(widget.loanId)),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 40),
              children: <Widget>[
                _header(d.loan),
                const SizedBox(height: 20),
                _summary(d.loan),
                if (d.nextDue != null && !d.loan.isClosed) ...<Widget>[
                  const SizedBox(height: 20),
                  _nextDue(d.nextDue!),
                ],
                const SizedBox(height: 20),
                _schedule(d),
                if (d.loan.canCancel) ...<Widget>[
                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      style: FilledButton.styleFrom(backgroundColor: PigmeeColors.rose),
                      onPressed: _cancelling ? null : () => _cancel(d.loan),
                      icon: const Icon(Icons.close_rounded, size: 18),
                      label: Text(s.t('loanCancel')),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ── Sections ─────────────────────────────────────────────────────────────

  Widget _header(Loan loan) {
    final AppStrings s = AppStrings.of(context);
    final ThemeData theme = Theme.of(context);
    return Column(
      children: <Widget>[
        Text(
          loan.principal.display,
          style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        StatusPill.loan(loan.status, loanStatusLabel(s, loan.status)),
        const SizedBox(height: 10),
        Text(
          <String>[
            if (loan.loanNumber.isNotEmpty) loan.loanNumber,
            s.f('loanRequestedOn', <Object>[Formatters.date(loan.requestedAt)]),
          ].join(' · '),
          textAlign: TextAlign.center,
          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
        ),
      ],
    );
  }

  Widget _summary(Loan loan) {
    final AppStrings s = AppStrings.of(context);
    return SectionCard(
      title: s.t('loanQuoteTitle'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          InfoRow(label: s.t('loanEmi'), value: loan.emiAmount.display),
          InfoRow(
            label: s.t('loanTenure'),
            value: s.f('loanTenureMonths', <Object>[loan.tenureMonths]),
          ),
          InfoRow(label: s.t('loanInterestRate'), value: loanPercent(loan.interestRatePercent)),
          InfoRow(label: s.t('loanTotalInterest'), value: loan.totalInterest.display),
          InfoRow(label: s.t('loanProcessingFee'), value: loan.processingFee.display),
          InfoRow(label: s.t('loanTotalPayable'), value: loan.totalPayable.display),
          // Before disbursement these two are placeholders, not facts.
          if (loan.isLive) ...<Widget>[
            InfoRow(label: s.t('loanTotalRepaid'), value: loan.totalRepaid.display),
            InfoRow(
              label: s.t('loanOutstanding'),
              value: loan.outstanding.display,
              valueColor:
                  loan.outstanding.paise > 0 ? PigmeeColors.rose : PigmeeColors.emerald,
            ),
          ],
          if (loan.purpose != null && loan.purpose!.trim().isNotEmpty)
            InfoRow(label: s.t('loanPurpose'), value: loan.purpose!),
          if (loan.firstDueDate != null)
            InfoRow(
              label: s.t('loanFirstDue'),
              value: Formatters.date(loan.firstDueDate!),
            ),
          if (loan.disbursedAt != null)
            InfoRow(
              label: s.t('loanDisbursedOn'),
              value: Formatters.date(loan.disbursedAt!),
            ),
          if (loan.bankAccountMasked != null && loan.bankAccountMasked!.isNotEmpty)
            InfoRow(label: s.t('loanBankAccount'), value: loan.bankAccountMasked!),
          if (loan.closedAt != null)
            InfoRow(label: s.t('loanClosedOn'), value: Formatters.date(loan.closedAt!)),
          if (loan.rejectionReason != null && loan.rejectionReason!.trim().isNotEmpty)
            InfoRow(
              label: s.t('loanRejectionReason'),
              value: loan.rejectionReason!,
              valueColor: PigmeeColors.rose,
            ),
        ],
      ),
    );
  }

  Widget _nextDue(LoanInstalment next) {
    final AppStrings s = AppStrings.of(context);
    final ThemeData theme = Theme.of(context);
    final Color color = next.isOverdue ? PigmeeColors.rose : PigmeeColors.indigo;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: color.withValues(alpha: 0.30)),
      ),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  s.t('loanNextDue'),
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                ),
                const SizedBox(height: 2),
                Text(
                  next.amountDue.display,
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: color,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  s.f('loanDueOn', <Object>[Formatters.date(next.dueDate)]),
                  style: theme.textTheme.bodyMedium,
                ),
              ],
            ),
          ),
          StatusPill.instalment(next.status, instalmentStatusLabel(s, next.status)),
        ],
      ),
    );
  }

  Widget _schedule(LoanDetail d) {
    final AppStrings s = AppStrings.of(context);
    final ThemeData theme = Theme.of(context);
    if (d.instalments.isEmpty) {
      return SectionCard(
        title: s.t('loanSchedule'),
        child: Text(
          s.t('loanNoSchedule'),
          style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.outline),
        ),
      );
    }
    return SectionCard(
      title: s.t('loanSchedule'),
      padding: EdgeInsets.zero,
      child: Column(
        children: <Widget>[
          for (int i = 0; i < d.instalments.length; i++) ...<Widget>[
            if (i > 0) const Divider(height: 1),
            _InstalmentRow(
              instalment: d.instalments[i],
              isNext: d.nextDue?.id == d.instalments[i].id,
            ),
          ],
        ],
      ),
    );
  }
}

class _InstalmentRow extends StatelessWidget {
  const _InstalmentRow({required this.instalment, required this.isNext});

  final LoanInstalment instalment;

  /// The one the customer owes next — tinted so it is findable at a glance.
  final bool isNext;

  @override
  Widget build(BuildContext context) {
    final AppStrings s = AppStrings.of(context);
    final ThemeData theme = Theme.of(context);
    final String when = instalment.isPaid && instalment.paidAt != null
        ? s.f('loanPaidOn', <Object>[Formatters.date(instalment.paidAt!)])
        : s.f('loanDueOn', <Object>[Formatters.date(instalment.dueDate)]);

    return Container(
      color: isNext ? PigmeeColors.indigo.withValues(alpha: 0.06) : null,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  s.f('loanInstalmentNo', <Object>[instalment.instalmentNo]),
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 2),
                Text(
                  when,
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                ),
                if (instalment.isWaived &&
                    instalment.waivedReason != null &&
                    instalment.waivedReason!.isNotEmpty) ...<Widget>[
                  const SizedBox(height: 2),
                  Text(
                    instalment.waivedReason!,
                    style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: <Widget>[
              Text(
                instalment.amountDue.display,
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 4),
              StatusPill.instalment(
                instalment.status,
                instalmentStatusLabel(s, instalment.status),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
