import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/config.dart';
import '../data/api_exception.dart';
import '../data/models/village.dart';
import '../l10n/strings.dart';
import '../router/app_router.dart';
import '../state/auth_controller.dart';
import '../state/data_providers.dart';
import '../widgets/primary_button.dart';
import '../widgets/state_views.dart';

/// Navigation arguments for [RegisterScreen].
class RegisterArgs {
  const RegisterArgs({required this.registrationToken, required this.mobile});
  final String registrationToken;
  final String mobile;
}

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key, required this.args});
  final RegisterArgs args;

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final TextEditingController _name = TextEditingController();
  final TextEditingController _address = TextEditingController();
  final TextEditingController _customAmount = TextEditingController();

  Village? _village;
  int _dailyAmount = AppConfig.defaultDailyRupees;
  bool _customSelected = false;
  bool _loading = false;

  @override
  void dispose() {
    _name.dispose();
    _address.dispose();
    _customAmount.dispose();
    super.dispose();
  }

  int? get _effectiveAmount {
    if (_customSelected) {
      final int? v = int.tryParse(_customAmount.text.trim());
      return (v != null && v > 0) ? v : null;
    }
    return _dailyAmount;
  }

  Future<void> _submit() async {
    final AppStrings s = AppStrings.of(context);
    if (!(_formKey.currentState?.validate() ?? false)) return;
    if (_village == null) {
      _showError(s.t('villageRequired'));
      return;
    }
    final int? amount = _effectiveAmount;
    if (amount == null) {
      _showError(s.t('amountRequired'));
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() => _loading = true);
    try {
      await ref.read(authControllerProvider.notifier).register(
            registrationToken: widget.args.registrationToken,
            name: _name.text.trim(),
            villageId: _village!.id,
            address: _address.text.trim(),
            dailyAmountRupees: amount,
          );
      if (!mounted) return;
      // Auth state flipped → router redirect handles it, but be explicit.
      context.go(Routes.home);
    } on ApiException catch (e) {
      _showError(e.message);
    } catch (_) {
      _showError(s.t('somethingWrong'));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final AppStrings s = AppStrings.of(context);
    final ThemeData theme = Theme.of(context);
    final AsyncValue<List<Village>> villages = ref.watch(villagesProvider);

    return Scaffold(
      appBar: AppBar(title: Text(s.t('createAccount'))),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  s.t('registerSubtitle'),
                  style: theme.textTheme.bodyLarge?.copyWith(color: theme.colorScheme.outline),
                ),
                const SizedBox(height: 24),

                // Name
                TextFormField(
                  controller: _name,
                  textCapitalization: TextCapitalization.words,
                  decoration: InputDecoration(
                    labelText: s.t('fullName'),
                    hintText: s.t('nameHint'),
                    prefixIcon: const Icon(Icons.person_rounded),
                  ),
                  validator: (String? v) =>
                      (v == null || v.trim().length < 2) ? s.t('nameRequired') : null,
                ),
                const SizedBox(height: 16),

                // Address (optional)
                TextFormField(
                  controller: _address,
                  textCapitalization: TextCapitalization.sentences,
                  maxLines: 2,
                  decoration: InputDecoration(
                    labelText: '${s.t('address')} (${s.t('optional')})',
                    hintText: s.t('addressHint'),
                    prefixIcon: const Icon(Icons.home_rounded),
                  ),
                ),
                const SizedBox(height: 16),

                // Village picker
                villages.when(
                  loading: () => const Padding(
                    padding: EdgeInsets.symmetric(vertical: 12),
                    child: LinearProgressIndicator(),
                  ),
                  error: (Object e, _) => ErrorView(
                    compact: true,
                    message: e is ApiException ? e.message : s.t('somethingWrong'),
                    onRetry: () => ref.invalidate(villagesProvider),
                  ),
                  data: (List<Village> list) => DropdownButtonFormField<Village>(
                    initialValue: _village,
                    isExpanded: true,
                    decoration: InputDecoration(
                      labelText: s.t('selectVillage'),
                      prefixIcon: const Icon(Icons.location_on_rounded),
                    ),
                    items: list
                        .map((Village v) => DropdownMenuItem<Village>(
                              value: v,
                              child: Text('${v.name} (${v.code})'),
                            ))
                        .toList(),
                    onChanged: (Village? v) => setState(() => _village = v),
                  ),
                ),
                const SizedBox(height: 24),

                // Daily amount
                Text(
                  s.t('dailyDeposit'),
                  style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 4),
                Text(
                  s.t('dailyDepositHelp'),
                  style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.outline),
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: <Widget>[
                    ...AppConfig.dailyAmountPresets.map((int amt) {
                      final bool selected = !_customSelected && _dailyAmount == amt;
                      return ChoiceChip(
                        label: Text('₹$amt'),
                        selected: selected,
                        onSelected: (_) => setState(() {
                          _customSelected = false;
                          _dailyAmount = amt;
                        }),
                      );
                    }),
                    ChoiceChip(
                      label: Text(s.t('customAmount')),
                      selected: _customSelected,
                      onSelected: (_) => setState(() => _customSelected = true),
                    ),
                  ],
                ),
                if (_customSelected) ...<Widget>[
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _customAmount,
                    keyboardType: TextInputType.number,
                    inputFormatters: <TextInputFormatter>[FilteringTextInputFormatter.digitsOnly],
                    decoration: InputDecoration(
                      labelText: s.t('customAmount'),
                      prefixText: '₹ ',
                      prefixIcon: const Icon(Icons.currency_rupee_rounded),
                    ),
                  ),
                ],
                const SizedBox(height: 32),
                PrimaryButton(
                  label: s.t('completeRegistration'),
                  icon: Icons.check_rounded,
                  loading: _loading,
                  onPressed: _submit,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
