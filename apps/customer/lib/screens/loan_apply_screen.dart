import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/theme.dart';
import '../data/api_exception.dart';
import '../data/models/loan_models.dart';
import '../l10n/strings.dart';
import '../router/app_router.dart';
import '../state/loan_providers.dart';
import '../state/providers.dart';
import '../widgets/primary_button.dart';
import '../widgets/section_card.dart';
import '../widgets/state_views.dart';
import 'kyc_status_screen.dart';
import 'loans_screen.dart';

/// Apply for a loan against the customer's pigmy savings.
///
/// Every rupee shown here is quoted by the server: typing an amount settles for a
/// moment, then a quote is fetched and the instalment plan appears. The client
/// never computes interest or EMI itself.
class LoanApplyScreen extends ConsumerStatefulWidget {
  const LoanApplyScreen({super.key});

  @override
  ConsumerState<LoanApplyScreen> createState() => _LoanApplyScreenState();
}

class _LoanApplyScreenState extends ConsumerState<LoanApplyScreen> {
  /// Long enough that a slow typist is not billed a request per keystroke, short
  /// enough that the plan feels live.
  static const Duration _settleDelay = Duration(milliseconds: 450);

  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final TextEditingController _amount = TextEditingController();
  final TextEditingController _purpose = TextEditingController();

  Timer? _debounce;
  int? _tenure;

  /// The last settled input. A record, so an identical amount and tenure is the
  /// same provider family key and no refetch happens on a rebuild.
  LoanQuoteRequest? _request;

  bool _saving = false;

  @override
  void dispose() {
    _debounce?.cancel();
    _amount.dispose();
    _purpose.dispose();
    super.dispose();
  }

  // ── Quote ────────────────────────────────────────────────────────────────

  void _onChanged() {
    _debounce?.cancel();
    _debounce = Timer(_settleDelay, _settle);
  }

  /// Publishes the typed values once they stop moving, or clears the panel when
  /// the amount is not something the server would quote on.
  void _settle() {
    if (!mounted) return;
    final LoanSettings? cfg = ref.read(loanSettingsProvider).valueOrNull;
    if (cfg == null) return;
    final num? amount = num.tryParse(_amount.text.trim());
    final LoanQuoteRequest? next = (amount == null ||
            amount < cfg.minAmount.rupees ||
            amount > cfg.maxAmount.rupees)
        ? null
        : (amountRupees: amount, tenureMonths: _tenure ?? cfg.minTenureMonths);
    if (next == _request) return;
    setState(() => _request = next);
  }

  // ── Submit ───────────────────────────────────────────────────────────────

  Future<void> _apply() async {
    final AppStrings s = AppStrings.of(context);
    final LoanQuoteRequest? request = _request;
    if (request == null) return;
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    setState(() => _saving = true);
    try {
      final Loan loan = await ref.read(loansRepositoryProvider).apply(
            amountRupees: request.amountRupees,
            tenureMonths: request.tenureMonths,
            purpose: _purpose.text.trim().isEmpty ? null : _purpose.text.trim(),
          );
      if (!mounted) return;
      ref.invalidate(loansProvider);
      _snack(s.t('loanApplied'));
      // Straight to the application they just filed, replacing this form.
      context.pushReplacement('${Routes.loans}/${loan.id}');
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.isKycRequired) {
        context.push(Routes.kyc, extra: KycArgs(message: e.message));
      } else {
        _snack(e.message);
      }
    } catch (_) {
      _snack(s.t('somethingWrong'));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _snack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  // ── Build ────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final AppStrings s = AppStrings.of(context);

    return Scaffold(
      appBar: AppBar(title: Text(s.t('loanApplyTitle'))),
      body: SafeArea(
        child: AsyncValueView<LoanSettings>(
          value: ref.watch(loanSettingsProvider),
          onRetry: () => ref.invalidate(loanSettingsProvider),
          data: (LoanSettings cfg) => cfg.enabled
              ? _form(cfg)
              : EmptyView(message: s.t('loansDisabled'), icon: Icons.info_outline_rounded),
        ),
      ),
    );
  }

  Widget _form(LoanSettings cfg) {
    final AppStrings s = AppStrings.of(context);
    final ThemeData theme = Theme.of(context);
    final int tenure = _tenure ?? cfg.minTenureMonths;
    final int span = cfg.maxTenureMonths - cfg.minTenureMonths;

    return Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 40),
        children: <Widget>[
          SectionCard(
            title: s.t('loanAmountLabel'),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                TextFormField(
                  controller: _amount,
                  keyboardType: TextInputType.number,
                  autofocus: true,
                  style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
                  decoration: InputDecoration(
                    prefixText: '₹ ',
                    hintText: '0',
                    helperText: s.f('loanAmountRange', <Object>[
                      cfg.minAmount.display,
                      cfg.maxAmount.display,
                    ]),
                  ),
                  onChanged: (_) => _onChanged(),
                  validator: (String? v) {
                    final num? amount = num.tryParse((v ?? '').trim());
                    if (amount == null ||
                        amount < cfg.minAmount.rupees ||
                        amount > cfg.maxAmount.rupees) {
                      return s.f('loanAmountInvalid', <Object>[
                        cfg.minAmount.display,
                        cfg.maxAmount.display,
                      ]);
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 20),
                Row(
                  children: <Widget>[
                    Expanded(
                      child: Text(
                        s.t('loanTenureLabel'),
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: theme.colorScheme.outline,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    Text(
                      s.f('loanTenureMonths', <Object>[tenure]),
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ],
                ),
                if (span > 0)
                  Slider(
                    value: tenure.toDouble(),
                    min: cfg.minTenureMonths.toDouble(),
                    max: cfg.maxTenureMonths.toDouble(),
                    divisions: span,
                    label: s.f('loanTenureMonths', <Object>[tenure]),
                    onChanged: (double v) {
                      setState(() => _tenure = v.round());
                      _onChanged();
                    },
                  )
                else
                  const SizedBox(height: 6),
                Text(
                  s.f('loanTenureRange', <Object>[cfg.minTenureMonths, cfg.maxTenureMonths]),
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                ),
                const SizedBox(height: 18),
                TextFormField(
                  controller: _purpose,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: InputDecoration(
                    labelText: '${s.t('loanPurpose')} (${s.t('optional')})',
                    hintText: s.t('loanPurposeHint'),
                    prefixIcon: const Icon(Icons.label_outline_rounded),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          _quotePanel(cfg),
        ],
      ),
    );
  }

  Widget _quotePanel(LoanSettings cfg) {
    final AppStrings s = AppStrings.of(context);
    final ThemeData theme = Theme.of(context);
    final LoanQuoteRequest? request = _request;

    if (request == null) {
      return SectionCard(
        title: s.t('loanQuoteTitle'),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Text(
              s.t('loanQuoteHint'),
              style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.outline),
            ),
            if (cfg.interestBasis.isNotEmpty) ...<Widget>[
              const SizedBox(height: 12),
              InfoRow(label: s.t('loanInterestBasis'), value: cfg.interestBasis),
            ],
          ],
        ),
      );
    }

    final AsyncValue<LoanQuoteResult> quote = ref.watch(loanQuoteProvider(request));
    return SectionCard(
      title: s.t('loanQuoteTitle'),
      child: quote.when(
        loading: () => const Padding(
          padding: EdgeInsets.symmetric(vertical: 28),
          child: Center(
            child: SizedBox(height: 24, width: 24, child: CircularProgressIndicator(strokeWidth: 2.4)),
          ),
        ),
        error: (Object e, _) => _quoteError(e, request),
        data: (LoanQuoteResult result) => _quoteBody(cfg, result),
      ),
    );
  }

  Widget _quoteError(Object error, LoanQuoteRequest request) {
    final AppStrings s = AppStrings.of(context);
    if (error is ApiException && error.isKycRequired) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Text(error.message),
          const SizedBox(height: 14),
          SecondaryButton(
            label: s.t('kycStartVerification'),
            icon: Icons.badge_rounded,
            onPressed: () => context.push(Routes.kyc, extra: KycArgs(message: error.message)),
          ),
        ],
      );
    }
    return ErrorView(
      message: error is ApiException ? error.message : s.t('somethingWrong'),
      compact: true,
      onRetry: () => ref.invalidate(loanQuoteProvider(request)),
    );
  }

  Widget _quoteBody(LoanSettings cfg, LoanQuoteResult result) {
    final AppStrings s = AppStrings.of(context);
    final ThemeData theme = Theme.of(context);
    final LoanQuote? q = result.quote;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        if (q != null) ...<Widget>[
          // The EMI is the number the customer actually decides on.
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: PigmeeColors.indigo.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Row(
              children: <Widget>[
                Expanded(
                  child: Text(
                    s.t('loanEmi'),
                    style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
                Text(
                  q.emiAmount.display,
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: PigmeeColors.indigo,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          InfoRow(label: s.t('loanPrincipal'), value: q.principal.display),
          InfoRow(
            label: s.t('loanTenure'),
            value: s.f('loanTenureMonths', <Object>[q.tenureMonths]),
          ),
          InfoRow(label: s.t('loanInterestRate'), value: loanPercent(q.interestRatePercent)),
          InfoRow(label: s.t('loanTotalInterest'), value: q.totalInterest.display),
          InfoRow(label: s.t('loanProcessingFee'), value: q.processingFee.display),
          InfoRow(label: s.t('loanTotalPayable'), value: q.totalPayable.display),
          InfoRow(
            label: s.t('loanNetDisbursed'),
            value: q.netDisbursed.display,
            valueColor: PigmeeColors.emerald,
          ),
          if (cfg.interestBasis.isNotEmpty) ...<Widget>[
            const SizedBox(height: 6),
            Text(
              cfg.interestBasis,
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
            ),
          ],
          const SizedBox(height: 14),
        ],
        InfoRow(label: s.t('loanSavingsBalance'), value: result.savingsBalance.display),
        const SizedBox(height: 4),
        Text(
          s.f('loanMaxEligible', <Object>[result.maxEligible.display]),
          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
        ),
        if (!result.eligible) ...<Widget>[
          const SizedBox(height: 12),
          _Blockers(reasons: result.reasons),
        ],
        const SizedBox(height: 18),
        PrimaryButton(
          label: s.t('loanApplyCta'),
          icon: Icons.send_rounded,
          loading: _saving,
          onPressed: (result.eligible && q != null) ? _apply : null,
        ),
        if (result.eligible) ...<Widget>[
          const SizedBox(height: 10),
          Text(
            s.t('loanEligibleNote'),
            textAlign: TextAlign.center,
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
          ),
        ],
      ],
    );
  }
}

/// Every reason the server gave for refusing, verbatim — the customer needs the
/// whole list to know what to fix, not just the first blocker.
class _Blockers extends StatelessWidget {
  const _Blockers({required this.reasons});

  final List<String> reasons;

  @override
  Widget build(BuildContext context) {
    final AppStrings s = AppStrings.of(context);
    final ThemeData theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: PigmeeColors.rose.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: PigmeeColors.rose.withValues(alpha: 0.30)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              const Icon(Icons.block_rounded, size: 18, color: PigmeeColors.rose),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  s.t('loanNotEligible'),
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
            ],
          ),
          for (final String reason in reasons) ...<Widget>[
            const SizedBox(height: 8),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                const Text('•  '),
                Expanded(child: Text(reason, style: theme.textTheme.bodyMedium)),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
