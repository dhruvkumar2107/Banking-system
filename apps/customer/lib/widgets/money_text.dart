import 'package:flutter/material.dart';

import '../data/models/money.dart';

/// Renders a [Money] value using the server-formatted `en-IN` display string,
/// so what the customer sees exactly matches the API's source of truth.
class MoneyText extends StatelessWidget {
  const MoneyText(
    this.money, {
    super.key,
    this.style,
    this.color,
    this.signed = false,
    this.credit = true,
  });

  final Money money;
  final TextStyle? style;
  final Color? color;

  /// When true, prefixes a `+` / `−` sign (for ledger rows).
  final bool signed;
  final bool credit;

  @override
  Widget build(BuildContext context) {
    final String prefix = signed ? (credit ? '+ ' : '− ') : '';
    return Text(
      '$prefix${money.display}',
      style: (style ?? const TextStyle()).copyWith(color: color),
    );
  }
}
