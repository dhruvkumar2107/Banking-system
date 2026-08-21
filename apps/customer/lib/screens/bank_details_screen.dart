import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../data/api_exception.dart';
import '../l10n/strings.dart';
import '../state/data_providers.dart';
import '../state/providers.dart';
import '../widgets/primary_button.dart';

/// Navigation arguments for [BankDetailsScreen] — existing linked-account values
/// to prefill, or null when adding for the first time.
class BankDetailsArgs {
  const BankDetailsArgs({
    required this.accountNumber,
    required this.ifsc,
    required this.accountHolderName,
  });
  final String accountNumber;
  final String ifsc;
  final String accountHolderName;
}

class BankDetailsScreen extends ConsumerStatefulWidget {
  const BankDetailsScreen({super.key, this.existing});
  final BankDetailsArgs? existing;

  @override
  ConsumerState<BankDetailsScreen> createState() => _BankDetailsScreenState();
}

class _BankDetailsScreenState extends ConsumerState<BankDetailsScreen> {
  static final RegExp _accountRe = RegExp(r'^\d{9,18}$');
  static final RegExp _ifscRe = RegExp(r'^[A-Z]{4}0[A-Z0-9]{6}$');

  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  late final TextEditingController _account;
  late final TextEditingController _ifsc;
  late final TextEditingController _holder;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _account = TextEditingController(text: widget.existing?.accountNumber ?? '');
    _ifsc = TextEditingController(text: widget.existing?.ifsc ?? '');
    _holder = TextEditingController(text: widget.existing?.accountHolderName ?? '');
  }

  @override
  void dispose() {
    _account.dispose();
    _ifsc.dispose();
    _holder.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final AppStrings s = AppStrings.of(context);
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    setState(() => _saving = true);
    try {
      await ref.read(meRepositoryProvider).upsertBankDetails(
            accountNumber: _account.text.trim(),
            ifsc: _ifsc.text.trim().toUpperCase(),
            accountHolderName: _holder.text.trim(),
          );
      if (!mounted) return;
      ref.invalidate(bankDetailsProvider);
      ref.invalidate(profileProvider);
      _snack(s.t('bankSaved'));
      context.pop();
    } on ApiException catch (e) {
      _snack(e.message);
    } catch (_) {
      _snack(s.t('somethingWrong'));
    } finally {
      if (mounted) setState(() => _saving = false);
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
    final bool editing = widget.existing != null;

    return Scaffold(
      appBar: AppBar(
        title: Text(s.t(editing ? 'updateBankDetails' : 'addBankDetails')),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                TextFormField(
                  controller: _holder,
                  textCapitalization: TextCapitalization.words,
                  decoration: InputDecoration(
                    labelText: s.t('accountHolder'),
                    prefixIcon: const Icon(Icons.person_rounded),
                  ),
                  validator: (String? v) =>
                      (v == null || v.trim().length < 2) ? s.t('holderRequired') : null,
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _account,
                  keyboardType: TextInputType.number,
                  inputFormatters: <TextInputFormatter>[
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(18),
                  ],
                  decoration: InputDecoration(
                    labelText: s.t('accountNumber'),
                    prefixIcon: const Icon(Icons.account_balance_rounded),
                  ),
                  validator: (String? v) =>
                      _accountRe.hasMatch(v?.trim() ?? '') ? null : s.t('accountNumberInvalid'),
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _ifsc,
                  textCapitalization: TextCapitalization.characters,
                  inputFormatters: <TextInputFormatter>[
                    LengthLimitingTextInputFormatter(11),
                    _UpperCaseFormatter(),
                  ],
                  decoration: InputDecoration(
                    labelText: s.t('ifsc'),
                    prefixIcon: const Icon(Icons.tag_rounded),
                  ),
                  validator: (String? v) =>
                      _ifscRe.hasMatch((v ?? '').trim().toUpperCase()) ? null : s.t('ifscInvalid'),
                ),
                const SizedBox(height: 32),
                PrimaryButton(
                  label: s.t('save'),
                  icon: Icons.check_rounded,
                  loading: _saving,
                  onPressed: _save,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Forces input to upper-case (used for the IFSC field).
class _UpperCaseFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    return newValue.copyWith(text: newValue.text.toUpperCase());
  }
}
