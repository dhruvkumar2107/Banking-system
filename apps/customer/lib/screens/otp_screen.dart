import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/theme.dart';
import '../data/api_exception.dart';
import '../data/models/auth.dart';
import '../l10n/strings.dart';
import '../router/app_router.dart';
import '../state/auth_controller.dart';
import '../state/providers.dart';
import '../widgets/otp_input.dart';
import '../widgets/primary_button.dart';
import 'register_screen.dart';

/// Navigation arguments for [OtpScreen].
class OtpArgs {
  const OtpArgs({required this.mobile, required this.isRegistered, this.devCode});
  final String mobile;
  final bool isRegistered;
  final String? devCode;
}

class OtpScreen extends ConsumerStatefulWidget {
  const OtpScreen({super.key, required this.args});
  final OtpArgs args;

  @override
  ConsumerState<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends ConsumerState<OtpScreen> {
  final TextEditingController _otp = TextEditingController();
  bool _loading = false;
  int _resendIn = 30;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    // Prefill the dev OTP in sandbox mode for a frictionless demo.
    if (widget.args.devCode != null) _otp.text = widget.args.devCode!;
    _startResendTimer();
  }

  void _startResendTimer() {
    _timer?.cancel();
    setState(() => _resendIn = 30);
    _timer = Timer.periodic(const Duration(seconds: 1), (Timer t) {
      if (_resendIn <= 1) {
        t.cancel();
        setState(() => _resendIn = 0);
      } else {
        setState(() => _resendIn--);
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _otp.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    final String code = _otp.text.trim();
    if (code.length < 4) return;
    FocusScope.of(context).unfocus();
    setState(() => _loading = true);
    final AppStrings s = AppStrings.of(context);
    try {
      final OtpVerifyResult result =
          await ref.read(authControllerProvider.notifier).verifyOtp(widget.args.mobile, code);
      if (!mounted) return;
      if (result.registered) {
        // Auth state flipped to authenticated → router redirects to /home.
        context.go(Routes.home);
      } else {
        context.pushReplacement(
          Routes.register,
          extra: RegisterArgs(
            registrationToken: result.registrationToken ?? '',
            mobile: widget.args.mobile,
          ),
        );
      }
    } on ApiException catch (e) {
      _showError(e.statusCode == 400 || e.statusCode == 401 ? s.t('invalidOtp') : e.message);
    } catch (_) {
      _showError(s.t('somethingWrong'));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _resend() async {
    final AppStrings s = AppStrings.of(context);
    try {
      final OtpRequestResult r = await ref.read(authRepositoryProvider).requestOtp(widget.args.mobile);
      if (!mounted) return;
      if (r.devCode != null) _otp.text = r.devCode!;
      _startResendTimer();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s.t('sendOtp'))));
    } on ApiException catch (e) {
      _showError(e.message);
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
      appBar: AppBar(title: Text(s.t('verifyOtp'))),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                s.f('otpSentTo', <Object>['+91 ${widget.args.mobile}']),
                style: theme.textTheme.bodyLarge?.copyWith(color: theme.colorScheme.outline),
              ),
              const SizedBox(height: 28),
              OtpInput(
                controller: _otp,
                onCompleted: (_) => _verify(),
              ),
              if (widget.args.devCode != null) ...<Widget>[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: PigmeeColors.amber.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: PigmeeColors.amber.withValues(alpha: 0.4)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: <Widget>[
                      const Icon(Icons.info_outline_rounded, size: 16, color: PigmeeColors.amber),
                      const SizedBox(width: 8),
                      Text(
                        '${s.t('devOtpPrefix')}: ${widget.args.devCode}',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 28),
              PrimaryButton(
                label: s.t('verify'),
                loading: _loading,
                onPressed: _verify,
              ),
              const SizedBox(height: 16),
              Center(
                child: _resendIn > 0
                    ? Text(
                        s.f('resendIn', <Object>[_resendIn]),
                        style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.outline),
                      )
                    : TextButton(onPressed: _resend, child: Text(s.t('resendOtp'))),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
