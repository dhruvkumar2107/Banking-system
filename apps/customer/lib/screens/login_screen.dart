import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/theme.dart';
import '../data/api_exception.dart';
import '../data/models/auth.dart';
import '../l10n/strings.dart';
import '../router/app_router.dart';
import '../state/providers.dart';
import '../widgets/language_toggle.dart';
import '../widgets/primary_button.dart';
import 'otp_screen.dart';

/// Mobile-number entry — the entry point of the auth funnel.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final TextEditingController _mobile = TextEditingController();
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  bool _loading = false;

  @override
  void dispose() {
    _mobile.dispose();
    super.dispose();
  }

  String get _normalized => _mobile.text.replaceAll(RegExp(r'\D'), '');

  Future<void> _sendOtp() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    setState(() => _loading = true);
    final AppStrings s = AppStrings.of(context);
    try {
      final OtpRequestResult result =
          await ref.read(authRepositoryProvider).requestOtp(_normalized);
      if (!mounted) return;
      context.push(
        Routes.otp,
        extra: OtpArgs(
          mobile: _normalized,
          isRegistered: result.isRegistered,
          devCode: result.devCode,
        ),
      );
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

    return Scaffold(
      appBar: AppBar(actions: const <Widget>[Padding(padding: EdgeInsets.only(right: 12), child: Center(child: LanguageToggle()))]),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Container(
                  height: 76,
                  width: 76,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: PigmeeColors.heroGradient,
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(24),
                    boxShadow: <BoxShadow>[
                      BoxShadow(
                        color: PigmeeColors.violet.withValues(alpha: 0.4),
                        blurRadius: 26,
                        offset: const Offset(0, 12),
                      ),
                    ],
                  ),
                  child: const Icon(Icons.savings_rounded, color: Colors.white, size: 40),
                ),
                const SizedBox(height: 28),
                Text(
                  s.t('welcome'),
                  style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 8),
                Text(
                  s.t('loginSubtitle'),
                  style: theme.textTheme.bodyLarge?.copyWith(color: theme.colorScheme.outline),
                ),
                const SizedBox(height: 32),
                TextFormField(
                  controller: _mobile,
                  keyboardType: TextInputType.phone,
                  autofocus: true,
                  inputFormatters: <TextInputFormatter>[
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(10),
                  ],
                  decoration: InputDecoration(
                    labelText: s.t('mobileNumber'),
                    hintText: s.t('mobileHint'),
                    prefixIcon: const Icon(Icons.phone_rounded),
                    prefixText: '+91  ',
                  ),
                  validator: (String? v) {
                    final String digits = (v ?? '').replaceAll(RegExp(r'\D'), '');
                    if (!RegExp(r'^[6-9]\d{9}$').hasMatch(digits)) {
                      return s.t('enterValidMobile');
                    }
                    return null;
                  },
                  onFieldSubmitted: (_) => _sendOtp(),
                ),
                const SizedBox(height: 24),
                PrimaryButton(
                  label: s.t('sendOtp'),
                  icon: Icons.arrow_forward_rounded,
                  loading: _loading,
                  onPressed: _sendOtp,
                ),
                const SizedBox(height: 16),
                Center(
                  child: Text(
                    s.t('byContinuing'),
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
