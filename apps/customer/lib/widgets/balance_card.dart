import 'package:flutter/material.dart';

import '../core/theme.dart';
import '../data/models/money.dart';
import 'money_text.dart';

/// The headline gradient card on the dashboard showing the customer's total
/// balance, with an optional account line and a prominent "Pay now" action.
///
/// Decorative aurora orbs (clipped to the rounded rect) give it a premium,
/// futuristic depth without hurting the white text's contrast.
class BalanceCard extends StatelessWidget {
  const BalanceCard({
    super.key,
    required this.label,
    required this.amount,
    this.accountLabel,
    this.accountNumber,
    this.onPay,
    this.payLabel,
  });

  final String label;
  final Money amount;
  final String? accountLabel;
  final String? accountNumber;
  final VoidCallback? onPay;
  final String? payLabel;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(24),
          boxShadow: <BoxShadow>[
            BoxShadow(
              color: PigmeeColors.violet.withValues(alpha: 0.38),
              blurRadius: 32,
              offset: const Offset(0, 16),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(24),
          child: Stack(
            children: <Widget>[
              // Base gradient.
              Positioned.fill(
                child: DecoratedBox(
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      colors: PigmeeColors.balanceGradient,
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                  ),
                ),
              ),
              // Aurora orbs.
              Positioned(
                top: -46,
                right: -30,
                child: _orb(150, Colors.white.withValues(alpha: 0.16)),
              ),
              Positioned(
                bottom: -60,
                left: -20,
                child: _orb(160, PigmeeColors.cyan.withValues(alpha: 0.22)),
              ),
              // Content.
              Padding(
                padding: const EdgeInsets.all(22),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Row(
                      children: <Widget>[
                        Container(
                          padding: const EdgeInsets.all(7),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.16),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Icon(Icons.savings_rounded, color: Colors.white, size: 16),
                        ),
                        const SizedBox(width: 10),
                        Text(
                          label,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 0.2,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    MoneyText(
                      amount,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 40,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.5,
                      ),
                    ),
                    if (accountNumber != null) ...<Widget>[
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.14),
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
                        ),
                        child: Text(
                          '${accountLabel ?? ''} ${accountNumber!}'.trim(),
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 12.5,
                            letterSpacing: 0.6,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                    if (onPay != null) ...<Widget>[
                      const SizedBox(height: 20),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton.icon(
                          onPressed: onPay,
                          icon: const Icon(Icons.add_rounded),
                          label: Text(payLabel ?? 'Pay now'),
                          style: FilledButton.styleFrom(
                            backgroundColor: Colors.white,
                            foregroundColor: PigmeeColors.indigoDark,
                            minimumSize: const Size.fromHeight(50),
                            textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// A soft circular glow used as a decorative backdrop element.
  static Widget _orb(double size, Color color) => Container(
        height: size,
        width: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(
            colors: <Color>[color, color.withValues(alpha: 0)],
          ),
        ),
      );
}
