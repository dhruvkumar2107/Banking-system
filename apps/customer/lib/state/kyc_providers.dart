import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/models/kyc_models.dart';
import 'providers.dart';

/// The customer's KYC standing (`GET /me/kyc`).
///
/// autoDispose so every visit re-reads the stage — a reviewer may have verified
/// or rejected the submission since the screen was last open. Invalidate this
/// after a submission, and after any gated action that comes back blocked.
final kycStatusProvider = FutureProvider.autoDispose<KycStatus>(
  (ref) => ref.watch(kycRepositoryProvider).status(),
);
