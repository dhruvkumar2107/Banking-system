import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/models/loan_models.dart';
import 'paged_notifier.dart';
import 'providers.dart';

/// What a quote is asked for. A record, so two identical requests are the same
/// family key and the answer is reused instead of re-fetched.
typedef LoanQuoteRequest = ({num amountRupees, int tenureMonths});

/// Lending rules for this branch — bounds the apply form and explains the
/// product. Not autoDispose: the numbers are effectively static for a session.
final loanSettingsProvider = FutureProvider<LoanSettings>(
  (ref) => ref.watch(loansRepositoryProvider).settings(),
);

/// The customer's loans, newest first, paginated.
final loansProvider =
    StateNotifierProvider.autoDispose<PagedNotifier<Loan>, AsyncValue<PagedState<Loan>>>(
  (ref) => PagedNotifier<Loan>(
    (int page) => ref.watch(loansRepositoryProvider).list(page: page),
  ),
);

/// A single loan with its instalment schedule (keyed by loan id).
final loanDetailProvider = FutureProvider.autoDispose.family<LoanDetail, String>(
  (ref, String id) => ref.watch(loansRepositoryProvider).detail(id),
);

/// A costed quote for an amount / tenure pair. The apply screen debounces the
/// keystrokes before it starts watching a new request, so one settled figure
/// costs one call.
final loanQuoteProvider = FutureProvider.autoDispose.family<LoanQuoteResult, LoanQuoteRequest>(
  (ref, LoanQuoteRequest req) => ref.watch(loansRepositoryProvider).quote(
        amountRupees: req.amountRupees,
        tenureMonths: req.tenureMonths,
      ),
);
