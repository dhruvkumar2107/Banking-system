import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/file_saver.dart';
import '../core/formatters.dart';
import '../core/theme.dart';
import '../data/api_exception.dart';
import '../data/models/transaction.dart';
import '../l10n/strings.dart';
import '../state/data_providers.dart';
import '../state/providers.dart';
import '../widgets/money_text.dart';
import '../widgets/primary_button.dart';
import '../widgets/state_views.dart';
import '../widgets/status_pill.dart';

/// A digital receipt for a single deposit, with an option to download the
/// server-generated PDF on native platforms.
class ReceiptScreen extends ConsumerStatefulWidget {
  const ReceiptScreen({super.key, required this.transactionId});
  final String transactionId;

  @override
  ConsumerState<ReceiptScreen> createState() => _ReceiptScreenState();
}

class _ReceiptScreenState extends ConsumerState<ReceiptScreen> {
  bool _downloading = false;
  bool _sharing = false;

  /// Downloads the server-generated PDF and writes it to the device, returning
  /// the saved path. Both the download and share actions go through here — the
  /// share sheet needs a real file on disk to hand to the receiving app.
  Future<String> _saveReceipt() async {
    final List<int> bytes =
        await ref.read(paymentsRepositoryProvider).receiptPdf(widget.transactionId);
    return savePdfToDevice('pigmee_receipt_${widget.transactionId}.pdf', bytes);
  }

  Future<void> _download() async {
    final AppStrings s = AppStrings.of(context);
    setState(() => _downloading = true);
    try {
      final String path = await _saveReceipt();
      if (!mounted) return;
      _snack(s.f('receiptSaved', <Object>[path]));
    } on ApiException catch (e) {
      _snack(e.message);
    } catch (_) {
      _snack(s.t('somethingWrong'));
    } finally {
      if (mounted) setState(() => _downloading = false);
    }
  }

  Future<void> _share() async {
    final AppStrings s = AppStrings.of(context);
    setState(() => _sharing = true);
    try {
      final String path = await _saveReceipt();
      await shareLocalFile(
        path,
        subject: s.t('digitalReceipt'),
        text: s.t('receiptFooter'),
      );
    } on ApiException catch (e) {
      _snack(e.message);
    } catch (_) {
      _snack(s.t('somethingWrong'));
    } finally {
      if (mounted) setState(() => _sharing = false);
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
    final AsyncValue<TransactionModel> txn =
        ref.watch(transactionDetailProvider(widget.transactionId));

    return Scaffold(
      appBar: AppBar(title: Text(s.t('digitalReceipt'))),
      body: SafeArea(
        child: AsyncValueView<TransactionModel>(
          value: txn,
          onRetry: () => ref.invalidate(transactionDetailProvider(widget.transactionId)),
          data: (TransactionModel t) => _Content(
            txn: t,
            downloading: _downloading,
            sharing: _sharing,
            // Both need a writable filesystem and a receipt worth keeping.
            onDownload: (!kIsWeb && t.isSuccess) ? _download : null,
            onShare: (!kIsWeb && t.isSuccess) ? _share : null,
          ),
        ),
      ),
    );
  }
}

class _Content extends StatelessWidget {
  const _Content({
    required this.txn,
    required this.downloading,
    required this.sharing,
    this.onDownload,
    this.onShare,
  });

  final TransactionModel txn;
  final bool downloading;
  final bool sharing;
  final VoidCallback? onDownload;
  final VoidCallback? onShare;

  @override
  Widget build(BuildContext context) {
    final AppStrings s = AppStrings.of(context);
    final ThemeData theme = Theme.of(context);
    final String statusLabel = s.t(
      txn.isSuccess ? 'success' : (txn.isFailed ? 'failed' : 'pending'),
    );

    return ListView(
      padding: const EdgeInsets.all(20),
      children: <Widget>[
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                // Brand header
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: <Widget>[
                    Row(
                      children: <Widget>[
                        Container(
                          height: 38,
                          width: 38,
                          decoration: BoxDecoration(
                            gradient: const LinearGradient(colors: PigmeeColors.heroGradient),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Icon(Icons.savings_rounded, color: Colors.white, size: 20),
                        ),
                        const SizedBox(width: 10),
                        Text(
                          s.t('appName'),
                          style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                        ),
                      ],
                    ),
                    StatusPill.transaction(txn.status, statusLabel),
                  ],
                ),
                const SizedBox(height: 20),
                // Amount
                Center(
                  child: Column(
                    children: <Widget>[
                      Text(
                        s.t('deposit'),
                        style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.outline),
                      ),
                      const SizedBox(height: 4),
                      MoneyText(
                        txn.amount,
                        style: theme.textTheme.headlineMedium?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: txn.isSuccess ? PigmeeColors.emeraldDark : theme.colorScheme.onSurface,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                const _DashedLine(),
                const SizedBox(height: 8),
                _Row(label: s.t('receiptNo'), value: _shortId(txn.id)),
                _Row(label: s.t('date'), value: Formatters.dateTime(txn.createdAt)),
                if (txn.gatewayPaymentId != null)
                  _Row(label: s.t('paymentId'), value: txn.gatewayPaymentId!),
                if (txn.gatewayOrderId != null)
                  _Row(label: s.t('orderId'), value: txn.gatewayOrderId!),
                _Row(label: s.t('status'), value: statusLabel),
                if (txn.isFailed && txn.failureReason != null)
                  _Row(label: s.t('error'), value: txn.failureReason!),
                const SizedBox(height: 8),
                const _DashedLine(),
                const SizedBox(height: 16),
                Text(
                  s.t('receiptFooter'),
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),
        if (onDownload != null)
          PrimaryButton(
            label: s.t('downloadPdf'),
            icon: Icons.download_rounded,
            loading: downloading,
            onPressed: (downloading || sharing) ? null : onDownload,
          ),
        if (onShare != null) ...<Widget>[
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: (downloading || sharing) ? null : onShare,
            icon: sharing
                ? const SizedBox(
                    height: 16,
                    width: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.ios_share_rounded, size: 18),
            label: Text(s.t('share')),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(52),
            ),
          ),
        ],
      ],
    );
  }

  static String _shortId(String id) => id.length <= 12 ? id : id.substring(0, 12).toUpperCase();
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Expanded(
            child: Text(
              label,
              style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.outline),
            ),
          ),
          const SizedBox(width: 16),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }
}

/// A thin dashed separator, receipt-style.
class _DashedLine extends StatelessWidget {
  const _DashedLine();

  @override
  Widget build(BuildContext context) {
    final Color color = Theme.of(context).dividerColor;
    return LayoutBuilder(
      builder: (BuildContext context, BoxConstraints constraints) {
        const double dash = 5;
        const double gap = 4;
        final int count = (constraints.maxWidth / (dash + gap)).floor();
        return Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: List<Widget>.generate(
            count,
            (_) => SizedBox(width: dash, height: 1, child: ColoredBox(color: color)),
          ),
        );
      },
    );
  }
}
