import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/theme.dart';
import '../data/models/money.dart';
import '../l10n/strings.dart';
import '../router/app_router.dart';
import '../widgets/money_text.dart';
import '../widgets/primary_button.dart';
import '../widgets/section_card.dart';

/// Navigation arguments for [PayResultScreen].
class PayResultArgs {
  const PayResultArgs({
    required this.success,
    this.amount,
    this.newBalance,
    this.transactionId,
    this.failureMessage,
  });

  final bool success;
  final Money? amount;
  final Money? newBalance;
  final String? transactionId;
  final String? failureMessage;
}

class PayResultScreen extends StatelessWidget {
  const PayResultScreen({super.key, required this.args});
  final PayResultArgs args;

  @override
  Widget build(BuildContext context) {
    final AppStrings s = AppStrings.of(context);
    final ThemeData theme = Theme.of(context);
    final bool ok = args.success;
    final Color accent = ok ? PigmeeColors.emerald : PigmeeColors.rose;

    return Scaffold(
      // Block the hardware back button — the flow ends by an explicit choice.
      body: PopScope(
        canPop: false,
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              children: <Widget>[
                const Spacer(),
                // Result glyph
                Container(
                  height: 108,
                  width: 108,
                  decoration: BoxDecoration(
                    color: accent.withValues(alpha: 0.12),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    ok ? Icons.check_circle_rounded : Icons.cancel_rounded,
                    color: accent,
                    size: 68,
                  ),
                ),
                const SizedBox(height: 24),
                Text(
                  s.t(ok ? 'paymentSuccessful' : 'paymentFailed'),
                  style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 10),
                if (ok && args.amount != null)
                  Text(
                    s.f('amountCredited', <Object>[args.amount!.display]),
                    style: theme.textTheme.bodyLarge?.copyWith(color: theme.colorScheme.outline),
                    textAlign: TextAlign.center,
                  )
                else
                  Text(
                    args.failureMessage ?? s.t('paymentFailedBody'),
                    style: theme.textTheme.bodyLarge?.copyWith(color: theme.colorScheme.outline),
                    textAlign: TextAlign.center,
                  ),
                const SizedBox(height: 28),
                if (ok && args.newBalance != null)
                  SectionCard(
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: <Widget>[
                        Text(
                          s.t('newBalance'),
                          style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.outline),
                        ),
                        MoneyText(
                          args.newBalance!,
                          style: theme.textTheme.titleLarge?.copyWith(
                            fontWeight: FontWeight.w800,
                            color: PigmeeColors.emeraldDark,
                          ),
                        ),
                      ],
                    ),
                  ),
                const Spacer(),
                if (ok && args.transactionId != null) ...<Widget>[
                  PrimaryButton(
                    label: s.t('viewReceipt'),
                    icon: Icons.receipt_long_rounded,
                    onPressed: () =>
                        context.pushReplacement('${Routes.receipt}/${args.transactionId}'),
                  ),
                  const SizedBox(height: 12),
                  SecondaryButton(
                    label: s.t('backToHome'),
                    onPressed: () => context.go(Routes.home),
                  ),
                ] else
                  PrimaryButton(
                    label: s.t('backToHome'),
                    icon: Icons.home_rounded,
                    onPressed: () => context.go(Routes.home),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
