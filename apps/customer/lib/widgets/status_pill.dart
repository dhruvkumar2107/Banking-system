import 'package:flutter/material.dart';

import '../core/theme.dart';

/// A small rounded status label (KYC state, transaction state, account state).
class StatusPill extends StatelessWidget {
  const StatusPill({super.key, required this.label, required this.color, this.icon});

  final String label;
  final Color color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: icon != null ? 10 : 12, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          if (icon != null) ...<Widget>[Icon(icon, size: 13, color: color), const SizedBox(width: 5)],
          Text(
            label,
            style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }

  /// Pill for a KYC status value (`pending` | `verified` | `rejected`).
  static StatusPill kyc(String status, String label) {
    switch (status) {
      case 'verified':
        return StatusPill(label: label, color: PigmeeColors.emerald, icon: Icons.verified_rounded);
      case 'rejected':
        return StatusPill(label: label, color: PigmeeColors.rose, icon: Icons.cancel_rounded);
      default:
        return StatusPill(label: label, color: PigmeeColors.amber, icon: Icons.hourglass_top_rounded);
    }
  }

  /// Pill for a transaction status value (`success` | `pending` | `failed`).
  static StatusPill transaction(String status, String label) {
    switch (status) {
      case 'success':
        return StatusPill(label: label, color: PigmeeColors.emerald, icon: Icons.check_circle_rounded);
      case 'failed':
        return StatusPill(label: label, color: PigmeeColors.rose, icon: Icons.error_rounded);
      default:
        return StatusPill(label: label, color: PigmeeColors.amber, icon: Icons.schedule_rounded);
    }
  }

  /// Pill for a loan status value (`pending` | `approved` | `rejected` |
  /// `cancelled` | `disbursed` | `closed` | `defaulted`).
  static StatusPill loan(String status, String label) {
    switch (status) {
      case 'approved':
        return StatusPill(label: label, color: PigmeeColors.indigo, icon: Icons.task_alt_rounded);
      case 'disbursed':
        return StatusPill(label: label, color: PigmeeColors.emerald, icon: Icons.payments_rounded);
      case 'closed':
        return StatusPill(
          label: label,
          color: PigmeeColors.inkMuted,
          icon: Icons.check_circle_rounded,
        );
      case 'rejected':
        return StatusPill(label: label, color: PigmeeColors.rose, icon: Icons.cancel_rounded);
      case 'cancelled':
        return StatusPill(
          label: label,
          color: PigmeeColors.inkMuted,
          icon: Icons.remove_circle_outline_rounded,
        );
      case 'defaulted':
        return StatusPill(label: label, color: PigmeeColors.rose, icon: Icons.warning_rounded);
      default:
        return StatusPill(label: label, color: PigmeeColors.amber, icon: Icons.hourglass_top_rounded);
    }
  }

  /// Pill for an instalment status value (`due` | `paid` | `overdue` | `waived`).
  static StatusPill instalment(String status, String label) {
    switch (status) {
      case 'paid':
        return StatusPill(label: label, color: PigmeeColors.emerald, icon: Icons.check_circle_rounded);
      case 'overdue':
        return StatusPill(label: label, color: PigmeeColors.rose, icon: Icons.error_rounded);
      case 'waived':
        return StatusPill(
          label: label,
          color: PigmeeColors.violet,
          icon: Icons.volunteer_activism_rounded,
        );
      default:
        return StatusPill(label: label, color: PigmeeColors.amber, icon: Icons.schedule_rounded);
    }
  }
}
