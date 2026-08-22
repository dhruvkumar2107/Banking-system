import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';

import '../core/config.dart';
import '../core/theme.dart';
import '../data/api_exception.dart';
import '../data/models/customer.dart';
import '../data/models/pigmy_account.dart';
import '../data/models/transaction.dart';
import '../l10n/strings.dart';
import '../router/app_router.dart';
import '../state/data_providers.dart';
import '../state/providers.dart';
import '../widgets/primary_button.dart';
import '../widgets/state_views.dart';
import 'kyc_status_screen.dart';
import 'pay_result_screen.dart';

/// Navigation arguments for [PayScreen].
class PayArgs {
  const PayArgs({this.accountId});
  final String? accountId;
}

class PayScreen extends ConsumerStatefulWidget {
  const PayScreen({super.key, this.args});
  final PayArgs? args;

  @override
  ConsumerState<PayScreen> createState() => _PayScreenState();
}

class _PayScreenState extends ConsumerState<PayScreen> {
  final TextEditingController _custom = TextEditingController();
  late final Razorpay _razorpay;
  int? _selected;
  bool _customSelected = false;
  bool _processing = false;
  // The order awaiting a native-checkout result (live mode); the Razorpay
  // callbacks settle it. Null when no live checkout is in flight.
  PaymentOrder? _pendingOrder;

  @override
  void initState() {
    super.initState();
    _razorpay = Razorpay();
    _razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, _handlePaymentSuccess);
    _razorpay.on(Razorpay.EVENT_PAYMENT_ERROR, _handlePaymentError);
    _razorpay.on(Razorpay.EVENT_EXTERNAL_WALLET, _handleExternalWallet);
  }

  @override
  void dispose() {
    _custom.dispose();
    _razorpay.clear();
    super.dispose();
  }

  int? get _amount {
    if (_customSelected) {
      final int? v = int.tryParse(_custom.text.trim());
      return (v != null && v > 0) ? v : null;
    }
    return _selected;
  }

  PigmyAccount? _resolveAccount(List<PigmyAccount> accounts) {
    if (accounts.isEmpty) return null;
    final String? id = widget.args?.accountId;
    if (id != null) {
      for (final PigmyAccount a in accounts) {
        if (a.id == id) return a;
      }
    }
    return accounts.first;
  }

  Future<void> _pay(PigmyAccount account) async {
    // Guard against a rapid double-tap firing two orders before the overlay shows.
    if (_processing) return;
    final AppStrings s = AppStrings.of(context);
    final int? amount = _amount;
    if (amount == null) {
      _snack(s.t('amountRequired'));
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() => _processing = true);
    try {
      final PaymentOrder order = await ref
          .read(paymentsRepositoryProvider)
          .createOrder(accountId: account.id, amountRupees: amount);

      // Mock/sandbox mode hands back ready-made credentials — confirm at once.
      if (order.isMock && order.mock != null) {
        await _verifyAndNavigate(order, order.mock!.paymentId, order.mock!.signature);
        return;
      }

      // Live mode: launch the native Razorpay checkout. The result arrives in
      // the success/error callbacks registered in initState.
      _pendingOrder = order;
      _openCheckout(order);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _processing = false);
      // Deposits stay shut until an admin verifies the customer — send them to
      // the one screen that can open the gate, with the server's own reason.
      if (e.isKycRequired) {
        context.push(Routes.kyc, extra: KycArgs(message: e.message));
        return;
      }
      context.pushReplacement(
        Routes.payResult,
        extra: PayResultArgs(success: false, failureMessage: e.message),
      );
    } catch (_) {
      if (mounted) setState(() => _processing = false);
      _snack(s.t('somethingWrong'));
    }
  }

  /// Opens the Razorpay checkout sheet for a live order. Prefills the customer's
  /// name/contact when the profile is already loaded (best effort).
  void _openCheckout(PaymentOrder order) {
    final AppStrings s = AppStrings.of(context);
    final CustomerProfile? profile = ref.read(profileProvider).valueOrNull;
    final Map<String, dynamic> options = <String, dynamic>{
      'key': order.keyId,
      'amount': order.amount.paise, // paise, integer
      'order_id': order.orderId,
      'currency': order.currency,
      'name': 'Digital Pigmee',
      'description': s.t('makeDeposit'),
      'timeout': 300,
      'theme': <String, dynamic>{'color': '#4F46E5'},
      if (profile != null)
        'prefill': <String, dynamic>{'name': profile.name, 'contact': profile.mobile},
    };
    try {
      _razorpay.open(options);
    } catch (_) {
      _pendingOrder = null;
      if (mounted) setState(() => _processing = false);
      _snack(s.t('somethingWrong'));
    }
  }

  Future<void> _handlePaymentSuccess(PaymentSuccessResponse response) async {
    final PaymentOrder? order = _pendingOrder;
    _pendingOrder = null;
    if (order == null) return;
    await _verifyAndNavigate(order, response.paymentId ?? '', response.signature ?? '');
  }

  void _handlePaymentError(PaymentFailureResponse response) {
    _pendingOrder = null;
    if (!mounted) return;
    setState(() => _processing = false);
    final AppStrings s = AppStrings.of(context);
    final bool cancelled = response.code == Razorpay.PAYMENT_CANCELLED;
    context.pushReplacement(
      Routes.payResult,
      extra: PayResultArgs(
        success: false,
        failureMessage: cancelled ? s.t('paymentCancelled') : (response.message ?? s.t('somethingWrong')),
      ),
    );
  }

  void _handleExternalWallet(ExternalWalletResponse response) {
    // The wallet's actual result still arrives via the success/error callback,
    // so there is nothing to settle here.
  }

  /// Verifies a completed payment server-side and routes to the result screen.
  /// Shared by mock mode and the live-checkout success callback.
  Future<void> _verifyAndNavigate(PaymentOrder order, String paymentId, String signature) async {
    final AppStrings s = AppStrings.of(context);
    try {
      final VerifyResult result = await ref.read(paymentsRepositoryProvider).verifyPayment(
            orderId: order.orderId,
            paymentId: paymentId,
            signature: signature,
          );

      if (!mounted) return;
      // Balances changed — refresh dependent views.
      ref.invalidate(dashboardProvider);
      ref.invalidate(accountsProvider);
      ref.invalidate(transactionsProvider);

      context.pushReplacement(
        Routes.payResult,
        extra: PayResultArgs(
          success: result.verified && result.status == 'success',
          amount: order.amount,
          newBalance: result.newBalance,
          transactionId: result.transactionId,
        ),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _processing = false);
      context.pushReplacement(
        Routes.payResult,
        extra: PayResultArgs(success: false, failureMessage: e.message),
      );
    } catch (_) {
      if (mounted) setState(() => _processing = false);
      _snack(s.t('somethingWrong'));
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
    final AsyncValue<List<PigmyAccount>> accounts = ref.watch(accountsProvider);

    return Scaffold(
      appBar: AppBar(title: Text(s.t('makeDeposit'))),
      body: Stack(
        children: <Widget>[
          SafeArea(
            child: AsyncValueView<List<PigmyAccount>>(
              value: accounts,
              onRetry: () => ref.invalidate(accountsProvider),
              data: (List<PigmyAccount> list) {
                final PigmyAccount? account = _resolveAccount(list);
                if (account == null) {
                  return EmptyView(message: s.t('noData'), icon: Icons.account_balance_wallet_rounded);
                }
                // Initialise default amount from the account's daily amount once.
                _selected ??= (account.dailyAmount.paise / 100).round().clamp(1, 1 << 31);
                return _Form(
                  account: account,
                  selected: _selected,
                  customSelected: _customSelected,
                  customController: _custom,
                  processing: _processing,
                  onPreset: (int amt) => setState(() {
                    _customSelected = false;
                    _selected = amt;
                  }),
                  onCustom: () => setState(() => _customSelected = true),
                  onPay: () => _pay(account),
                );
              },
            ),
          ),
          if (_processing) const _ProcessingOverlay(),
        ],
      ),
    );
  }
}

class _Form extends StatelessWidget {
  const _Form({
    required this.account,
    required this.selected,
    required this.customSelected,
    required this.customController,
    required this.processing,
    required this.onPreset,
    required this.onCustom,
    required this.onPay,
  });

  final PigmyAccount account;
  final int? selected;
  final bool customSelected;
  final TextEditingController customController;
  final bool processing;
  final ValueChanged<int> onPreset;
  final VoidCallback onCustom;
  final VoidCallback onPay;

  @override
  Widget build(BuildContext context) {
    final AppStrings s = AppStrings.of(context);
    final ThemeData theme = Theme.of(context);

    // Presets = configured presets plus the account's own daily amount.
    final int daily = (account.dailyAmount.paise / 100).round();
    final List<int> presets = <int>{daily, ...AppConfig.dailyAmountPresets}.toList()..sort();

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          // Paying to
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: <Widget>[
                  Container(
                    height: 44,
                    width: 44,
                    decoration: BoxDecoration(
                      color: PigmeeColors.indigo.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(Icons.account_balance_wallet_rounded, color: PigmeeColors.indigo),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(
                          s.t('payingTo'),
                          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                        ),
                        Text(
                          account.accountNumber,
                          style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          Text(
            s.t('chooseAmount'),
            style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: <Widget>[
              ...presets.map((int amt) {
                final bool sel = !customSelected && selected == amt;
                return ChoiceChip(
                  label: Text('₹$amt'),
                  selected: sel,
                  onSelected: (_) => onPreset(amt),
                );
              }),
              ChoiceChip(
                label: Text(s.t('customAmount')),
                selected: customSelected,
                onSelected: (_) => onCustom(),
              ),
            ],
          ),
          if (customSelected) ...<Widget>[
            const SizedBox(height: 12),
            TextField(
              controller: customController,
              keyboardType: TextInputType.number,
              autofocus: true,
              inputFormatters: <TextInputFormatter>[FilteringTextInputFormatter.digitsOnly],
              decoration: InputDecoration(
                labelText: s.t('amount'),
                prefixText: '₹ ',
                prefixIcon: const Icon(Icons.currency_rupee_rounded),
              ),
            ),
          ],
          const SizedBox(height: 28),
          _SecurityNote(text: s.t('paymentSecure')),
          const SizedBox(height: 8),
          _SecurityNote(text: s.t('mockModeNote'), icon: Icons.science_rounded),
          const SizedBox(height: 24),
          PrimaryButton(
            label: s.t('proceedToPay'),
            icon: Icons.lock_rounded,
            loading: processing,
            onPressed: onPay,
          ),
        ],
      ),
    );
  }
}

class _SecurityNote extends StatelessWidget {
  const _SecurityNote({required this.text, this.icon = Icons.verified_user_rounded});
  final String text;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Row(
      children: <Widget>[
        Icon(icon, size: 16, color: theme.colorScheme.outline),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
          ),
        ),
      ],
    );
  }
}

class _ProcessingOverlay extends StatelessWidget {
  const _ProcessingOverlay();

  @override
  Widget build(BuildContext context) {
    final AppStrings s = AppStrings.of(context);
    return Positioned.fill(
      child: ColoredBox(
        color: Colors.black.withValues(alpha: 0.55),
        child: Center(
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(28),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  const CircularProgressIndicator(strokeWidth: 2.6),
                  const SizedBox(height: 20),
                  Text(
                    s.t('processingPayment'),
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    s.t('doNotClose'),
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
