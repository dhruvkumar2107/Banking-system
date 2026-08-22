import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/formatters.dart';
import '../core/theme.dart';
import '../data/models/customer.dart';
import '../data/models/kyc_models.dart';
import '../l10n/strings.dart';
import '../router/app_router.dart';
import '../state/data_providers.dart';
import '../state/kyc_providers.dart';
import '../widgets/kyc_image.dart';
import '../widgets/primary_button.dart';
import '../widgets/section_card.dart';
import '../widgets/state_views.dart';
import '../widgets/status_pill.dart';

/// Passed when the customer lands here because the server refused a gated action
/// (`403 KYC_REQUIRED`): [message] is the server's own wording, shown verbatim so
/// the explanation always matches the rule that blocked them.
class KycArgs {
  const KycArgs({this.message});
  final String? message;
}

/// "KYC verification": where the customer stands, what the reviewer still needs,
/// and what they last sent in.
class KycStatusScreen extends ConsumerWidget {
  const KycStatusScreen({super.key, this.args});

  final KycArgs? args;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppStrings s = AppStrings.of(context);
    final AsyncValue<KycStatus> status = ref.watch(kycStatusProvider);

    return Scaffold(
      appBar: AppBar(title: Text(s.t('kycTitle'))),
      body: SafeArea(
        child: AsyncValueView<KycStatus>(
          value: status,
          onRetry: () => ref.invalidate(kycStatusProvider),
          data: (KycStatus k) => RefreshIndicator(
            onRefresh: () async => ref.invalidate(kycStatusProvider),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 40),
              children: <Widget>[
                if (args?.message != null) ...<Widget>[
                  _BlockedNotice(message: args!.message!),
                  const SizedBox(height: 16),
                ],
                _StageBanner(status: k),
                if (k.canSubmit) ...<Widget>[
                  const SizedBox(height: 20),
                  _requirements(context, k),
                  const SizedBox(height: 20),
                  PrimaryButton(
                    label: k.isRejected ? s.t('kycResubmit') : s.t('kycStartVerification'),
                    icon: Icons.badge_rounded,
                    onPressed: () => _submit(context, ref),
                  ),
                ],
                if (!k.isNotStarted) ...<Widget>[
                  const SizedBox(height: 20),
                  _submitted(context, k),
                ],
                if (k.nominees.isNotEmpty) ...<Widget>[
                  const SizedBox(height: 20),
                  _nominees(context, k),
                ],
                if (k.documents.isNotEmpty) ...<Widget>[
                  const SizedBox(height: 20),
                  _documents(context, k),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ── Sections ─────────────────────────────────────────────────────────────

  Widget _requirements(BuildContext context, KycStatus k) {
    final AppStrings s = AppStrings.of(context);
    final KycRequirements r = k.requirements;
    return SectionCard(
      title: s.t('kycWhatWeNeed'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          _NeedLine(
            icon: Icons.face_rounded,
            label: s.t('kycPhotoLabel'),
            hint: r.photo,
          ),
          const SizedBox(height: 14),
          _NeedLine(
            icon: Icons.credit_card_rounded,
            label: s.t('kycAadhaarLabel'),
            hint: r.aadhaar,
          ),
          const SizedBox(height: 14),
          _NeedLine(
            icon: Icons.diversity_1_rounded,
            label: s.t('kycNomineeLabel'),
            hint: r.nominee,
          ),
        ],
      ),
    );
  }

  Widget _submitted(BuildContext context, KycStatus k) {
    final AppStrings s = AppStrings.of(context);
    final String? photo = k.photoUrl;
    return SectionCard(
      title: s.t('kycYourDetails'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          if (photo != null && photo.isNotEmpty) ...<Widget>[
            Row(
              children: <Widget>[
                ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: SizedBox(
                    height: 64,
                    width: 64,
                    child: KycImage(
                      url: photo,
                      errorWidget: const Icon(Icons.person_rounded, color: PigmeeColors.indigo),
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(
                        k.photoIsLive ? s.t('kycPhotoLive') : s.t('kycPhotoGallery'),
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      if (k.photoCapturedAt != null) ...<Widget>[
                        const SizedBox(height: 2),
                        Text(
                          Formatters.date(k.photoCapturedAt!),
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                color: Theme.of(context).colorScheme.outline,
                              ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
          ],
          // Only ever the masked form — the app never holds the full number.
          if (k.aadhaarMasked != null && k.aadhaarMasked!.isNotEmpty)
            InfoRow(label: s.t('kycAadhaarMasked'), value: k.aadhaarMasked!),
          if (k.submittedAt != null)
            InfoRow(
              label: s.t('kycStageSubmitted'),
              value: Formatters.dateTime(k.submittedAt!),
            ),
          if (k.verifiedAt != null)
            InfoRow(
              label: s.t('kycVerified'),
              value: Formatters.dateTime(k.verifiedAt!),
              valueColor: PigmeeColors.emerald,
            ),
        ],
      ),
    );
  }

  Widget _nominees(BuildContext context, KycStatus k) {
    final AppStrings s = AppStrings.of(context);
    final ThemeData theme = Theme.of(context);
    return SectionCard(
      title: s.t('nominees'),
      padding: EdgeInsets.zero,
      child: Column(
        children: <Widget>[
          for (int i = 0; i < k.nominees.length; i++) ...<Widget>[
            if (i > 0) const Divider(height: 1),
            _nomineeTile(theme, k.nominees[i]),
          ],
        ],
      ),
    );
  }

  Widget _nomineeTile(ThemeData theme, Nominee n) {
    final List<String> meta = <String>[
      if (n.relation != null && n.relation!.isNotEmpty) n.relation!,
      if (n.mobile != null && n.mobile!.isNotEmpty) n.mobile!,
    ];
    return ListTile(
      leading: const CircleAvatar(
        backgroundColor: Color(0x1A4F46E5),
        child: Icon(Icons.person_rounded, color: PigmeeColors.indigo),
      ),
      title: Text(n.name, style: const TextStyle(fontWeight: FontWeight.w700)),
      subtitle: meta.isEmpty
          ? null
          : Text(meta.join(' · '), style: TextStyle(color: theme.colorScheme.outline)),
    );
  }

  Widget _documents(BuildContext context, KycStatus k) {
    final AppStrings s = AppStrings.of(context);
    final ThemeData theme = Theme.of(context);
    return SectionCard(
      title: s.t('documents'),
      padding: EdgeInsets.zero,
      child: Column(
        children: <Widget>[
          for (int i = 0; i < k.documents.length; i++) ...<Widget>[
            if (i > 0) const Divider(height: 1),
            _documentTile(context, theme, k.documents[i]),
          ],
        ],
      ),
    );
  }

  Widget _documentTile(BuildContext context, ThemeData theme, CustomerDocument d) {
    final AppStrings s = AppStrings.of(context);
    final String label = switch (d.verifiedStatus) {
      'verified' => s.t('kycVerified'),
      'rejected' => s.t('kycRejected'),
      _ => s.t('kycPending'),
    };
    final bool isPdf = d.fileUrl.toLowerCase().endsWith('.pdf');
    return ListTile(
      leading: CircleAvatar(
        backgroundColor: const Color(0x1A4F46E5),
        child: Icon(
          isPdf ? Icons.picture_as_pdf_rounded : Icons.description_rounded,
          color: PigmeeColors.indigo,
        ),
      ),
      title: Text(_prettyType(d.docType), style: const TextStyle(fontWeight: FontWeight.w700)),
      subtitle: Text(
        Formatters.date(d.uploadedAt),
        style: TextStyle(color: theme.colorScheme.outline),
      ),
      trailing: StatusPill.kyc(d.verifiedStatus, label),
    );
  }

  static String _prettyType(String raw) {
    if (raw.isEmpty) return raw;
    return raw
        .split(RegExp(r'[_\s]+'))
        .where((String w) => w.isNotEmpty)
        .map((String w) => w[0].toUpperCase() + w.substring(1))
        .join(' ');
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  Future<void> _submit(BuildContext context, WidgetRef ref) async {
    final AppStrings s = AppStrings.of(context);
    final bool? sent = await context.push<bool>(Routes.kycSubmit);
    if (sent != true || !context.mounted) return;
    // The stage moved to `submitted`, and the profile tab shows the same flag.
    ref.invalidate(kycStatusProvider);
    ref.invalidate(profileProvider);
    _snack(context, s.t('kycSubmitted'));
  }

  void _snack(BuildContext context, String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }
}

// ── Banner ───────────────────────────────────────────────────────────────────

/// The one thing the customer came to see: which stage they are at, in the
/// stage's colour, with the server's own next step underneath.
class _StageBanner extends StatelessWidget {
  const _StageBanner({required this.status});

  final KycStatus status;

  ({Color color, IconData icon, String title, String body}) _copy(AppStrings s) {
    switch (status.stage) {
      case 'submitted':
        return (
          color: PigmeeColors.amber,
          icon: Icons.hourglass_top_rounded,
          title: s.t('kycBannerSubmittedTitle'),
          body: s.t('kycBannerSubmittedBody'),
        );
      case 'verified':
        return (
          color: PigmeeColors.emerald,
          icon: Icons.verified_rounded,
          title: s.t('kycBannerVerifiedTitle'),
          body: s.t('kycBannerVerifiedBody'),
        );
      case 'rejected':
        return (
          color: PigmeeColors.rose,
          icon: Icons.cancel_rounded,
          title: s.t('kycBannerRejectedTitle'),
          // The reason gets its own labelled line below.
          body: '',
        );
      case 'bypassed':
        return (
          color: PigmeeColors.violet,
          icon: Icons.workspace_premium_rounded,
          title: s.t('kycBannerBypassedTitle'),
          body: status.bypassReason ?? s.t('kycBannerVerifiedBody'),
        );
      default:
        return (
          color: PigmeeColors.indigo,
          icon: Icons.badge_outlined,
          title: s.t('kycBannerNotStartedTitle'),
          body: s.t('kycBannerNotStartedBody'),
        );
    }
  }

  String _pillLabel(AppStrings s) => switch (status.stage) {
        'submitted' => s.t('kycStageSubmitted'),
        'verified' => s.t('kycVerified'),
        'rejected' => s.t('kycRejected'),
        'bypassed' => s.t('kycStageBypassed'),
        _ => s.t('kycStageNotStarted'),
      };

  @override
  Widget build(BuildContext context) {
    final AppStrings s = AppStrings.of(context);
    final ThemeData theme = Theme.of(context);
    final ({Color color, IconData icon, String title, String body}) c = _copy(s);
    final String when = switch (status.stage) {
      'verified' when status.verifiedAt != null =>
        s.f('kycVerifiedOn', <Object>[Formatters.date(status.verifiedAt!)]),
      'submitted' when status.submittedAt != null =>
        s.f('kycSubmittedOn', <Object>[Formatters.date(status.submittedAt!)]),
      _ => '',
    };

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: c.color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: c.color.withValues(alpha: 0.30)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Icon(c.icon, color: c.color, size: 26),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  c.title,
                  style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                ),
              ),
            ],
          ),
          if (c.body.isNotEmpty) ...<Widget>[
            const SizedBox(height: 10),
            Text(c.body, style: theme.textTheme.bodyMedium),
          ],
          if (status.rejectionReason != null && status.rejectionReason!.isNotEmpty) ...<Widget>[
            const SizedBox(height: 10),
            Text(
              s.t('kycRejectionReason'),
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
            ),
            const SizedBox(height: 2),
            Text(status.rejectionReason!, style: theme.textTheme.bodyMedium),
          ],
          if (status.hint.isNotEmpty) ...<Widget>[
            const SizedBox(height: 12),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Icon(Icons.arrow_forward_rounded, size: 16, color: c.color),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    status.hint,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: c.color,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
          ],
          const SizedBox(height: 14),
          Row(
            children: <Widget>[
              StatusPill.kyc(status.legacyStatus, _pillLabel(s)),
              if (when.isNotEmpty) ...<Widget>[
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    when,
                    style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

/// Why the customer is suddenly looking at this screen: the server's refusal
/// message from the action they just tried.
class _BlockedNotice extends StatelessWidget {
  const _BlockedNotice({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final AppStrings s = AppStrings.of(context);
    final ThemeData theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: PigmeeColors.amber.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: PigmeeColors.amber.withValues(alpha: 0.35)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const Icon(Icons.lock_outline_rounded, color: PigmeeColors.amber, size: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  s.t('kycActionBlocked'),
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 4),
                Text(message, style: theme.textTheme.bodyMedium),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// One line of the checklist: what to send, and the reviewer's rule for it.
class _NeedLine extends StatelessWidget {
  const _NeedLine({required this.icon, required this.label, required this.hint});

  final IconData icon;
  final String label;
  final String hint;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        CircleAvatar(
          radius: 16,
          backgroundColor: const Color(0x1A4F46E5),
          child: Icon(icon, size: 17, color: PigmeeColors.indigo),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
              if (hint.isNotEmpty) ...<Widget>[
                const SizedBox(height: 2),
                Text(
                  hint,
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}
