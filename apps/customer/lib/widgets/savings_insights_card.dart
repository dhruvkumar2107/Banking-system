import 'package:flutter/material.dart';

import '../core/theme.dart';
import '../data/models/money.dart';
import 'money_text.dart';

/// A card displaying savings insights: streak, monthly savings, and quick stats.
class SavingsInsightsCard extends StatelessWidget {
  const SavingsInsightsCard({
    super.key,
    required this.monthlySavings,
    required this.streakDays,
    required this.todayContribution,
    required this.totalDeposited,
  });

  final Money monthlySavings;
  final int streakDays;
  final Money todayContribution;
  final Money totalDeposited;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                Icon(Icons.insights_rounded, size: 20, color: theme.colorScheme.primary),
                const SizedBox(width: 8),
                Text(
                  'Savings Insights',
                  style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              children: <Widget>[
                Expanded(
                  child: _InsightTile(
                    label: 'Streak',
                    value: '$streakDays days',
                    icon: Icons.local_fire_department_rounded,
                    color: PigmeeColors.amber,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _InsightTile(
                    label: 'This month',
                    value: monthlySavings.display,
                    icon: Icons.calendar_month_rounded,
                    color: PigmeeColors.indigo,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: <Widget>[
                Expanded(
                  child: _InsightTile(
                    label: 'Today',
                    value: todayContribution.display,
                    icon: Icons.today_rounded,
                    color: PigmeeColors.emerald,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _InsightTile(
                    label: 'All time',
                    value: totalDeposited.display,
                    icon: Icons.account_balance_rounded,
                    color: PigmeeColors.violet,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _InsightTile extends StatelessWidget {
  const _InsightTile({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(icon, size: 18, color: color),
          const SizedBox(height: 8),
          Text(
            label,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.outline,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            value,
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w700,
              color: color,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}
