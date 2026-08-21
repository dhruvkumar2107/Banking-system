/// A monetary value as returned by the API: integer paise plus convenience
/// `rupees` and a preformatted `en-IN` `display` string. Money is never a raw
/// double in this app — paise is the source of truth.
class Money {
  const Money({required this.paise, required this.rupees, required this.display});

  final int paise;
  final double rupees;
  final String display;

  static const Money zero = Money(paise: 0, rupees: 0, display: '₹0.00');

  factory Money.fromJson(dynamic json) {
    if (json == null) return Money.zero;
    if (json is num) {
      // Tolerate a bare paise number.
      return Money(paise: json.toInt(), rupees: json / 100, display: '₹${(json / 100).toStringAsFixed(2)}');
    }
    final Map<String, dynamic> m = Map<String, dynamic>.from(json as Map);
    return Money(
      paise: (m['paise'] as num?)?.toInt() ?? 0,
      rupees: (m['rupees'] as num?)?.toDouble() ?? 0,
      display: m['display'] as String? ?? '₹0.00',
    );
  }
}
