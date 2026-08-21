import 'package:flutter/material.dart';

import '../core/theme.dart';
import '../data/models/transaction.dart';
import '../l10n/strings.dart';
import '../core/formatters.dart';
import 'money_text.dart';
import 'status_pill.dart';

/// A single transaction row used on the dashboard and the history screen.
class TransactionTile extends StatelessWidget {
  const TransactionTile({super.key, required this.txn, this.onTap});

  final TransactionModel txn;
  final VoidCallback? onTap;

  ({IconData icon, Color color}) get _visual {
    if (txn.isSuccess) return (icon: Icons.arrow_downward_rounded, color: PigmeeColors.emerald);
    if (txn.isFailed) return (icon: Icons.close_rounded, color: PigmeeColors.rose);
    return (icon: Icons.schedule_rounded, color: PigmeeColors.amber);
  }

  @override
  Widget build(BuildContext context) {
    final AppStrings s = AppStrings.of(context);
    final ThemeData theme = Theme.of(context);
    final ({IconData icon, Color color}) v = _visual;
    final String statusLabel = s.t(
      txn.isSuccess ? 'success' : (txn.isFailed ? 'failed' : 'pending'),
    );

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
        child: Row(
          children: <Widget>[
            Container(
              height: 42,
              width: 42,
              decoration: BoxDecoration(
                color: v.color.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(v.icon, color: v.color, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(
                    s.t('deposit'),
                    style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    Formatters.dateTime(txn.createdAt),
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
                  txn.amount,
                  signed: txn.isSuccess,
                  credit: true,
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                    color: txn.isSuccess ? PigmeeColors.emeraldDark : theme.colorScheme.onSurface,
                  ),
                ),
                const SizedBox(height: 4),
                StatusPill.transaction(txn.status, statusLabel),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
