import 'package:intl/intl.dart';

/// Date / time / number formatting helpers.
///
/// Money is almost always rendered from the server-provided `display` string
/// (already `en-IN` formatted), but these helpers cover client-only amounts and
/// timestamps, honouring the active locale.
class Formatters {
  Formatters._();

  static final NumberFormat _inr = NumberFormat.currency(
    locale: 'en_IN',
    symbol: '₹',
    decimalDigits: 2,
  );

  /// Format a rupee amount (double) as an `en-IN` currency string.
  static String rupees(num value) => _inr.format(value);

  /// Format integer paise as a currency string.
  static String paise(int value) => _inr.format(value / 100);

  static String dateTime(DateTime dt, {String? locale}) =>
      DateFormat('dd MMM yyyy, hh:mm a', locale).format(dt.toLocal());

  static String date(DateTime dt, {String? locale}) =>
      DateFormat('dd MMM yyyy', locale).format(dt.toLocal());

  static String dayMonth(DateTime dt, {String? locale}) =>
      DateFormat('dd MMM', locale).format(dt.toLocal());

  static String time(DateTime dt, {String? locale}) =>
      DateFormat('hh:mm a', locale).format(dt.toLocal());

  /// Best-effort parse of an ISO-8601 timestamp coming from the API.
  static DateTime parse(dynamic value) {
    if (value is DateTime) return value;
    if (value is String) {
      return DateTime.tryParse(value)?.toLocal() ?? DateTime.fromMillisecondsSinceEpoch(0);
    }
    return DateTime.fromMillisecondsSinceEpoch(0);
  }

  /// "2 hours ago" style relative label (locale-independent, English words).
  static String relative(DateTime dt) {
    final Duration diff = DateTime.now().difference(dt.toLocal());
    if (diff.inSeconds < 60) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return date(dt);
  }

  /// Mask a bank account number to its last four digits, e.g. `••••3421`.
  static String maskAccount(String accountNumber) {
    if (accountNumber.length <= 4) return accountNumber;
    return '••••${accountNumber.substring(accountNumber.length - 4)}';
  }
}
