import 'dart:typed_data';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/file_saver.dart';
import '../core/formatters.dart';
import '../core/media_picker.dart';
import '../core/theme.dart';
import '../data/api_exception.dart';
import '../data/models/customer.dart';
import '../data/models/upload.dart';
import '../l10n/strings.dart';
import '../router/app_router.dart';
import '../state/auth_controller.dart';
import '../state/data_providers.dart';
import '../state/providers.dart';
import '../widgets/kyc_image.dart';
import '../widgets/language_toggle.dart';
import '../widgets/media_source_sheet.dart';
import '../widgets/primary_button.dart';
import '../widgets/section_card.dart';
import '../widgets/state_views.dart';
import '../widgets/status_pill.dart';
import '../widgets/theme_mode_toggle.dart';
import 'bank_details_screen.dart';
import 'edit_profile_screen.dart';

/// The "Profile" tab: identity header plus editable sections for personal info,
/// nominees, KYC documents, bank details, and app settings.
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppStrings s = AppStrings.of(context);
    final AsyncValue<CustomerProfile> profile = ref.watch(profileProvider);

    return Scaffold(
      appBar: AppBar(title: Text(s.t('profile'))),
      body: SafeArea(
        child: AsyncValueView<CustomerProfile>(
          value: profile,
          onRetry: () => ref.invalidate(profileProvider),
          data: (CustomerProfile p) => RefreshIndicator(
            onRefresh: () async => ref.invalidate(profileProvider),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 40),
              children: <Widget>[
                _Header(profile: p),
                const SizedBox(height: 24),
                _services(context, p),
                const SizedBox(height: 20),
                _personalInfo(context, p),
                const SizedBox(height: 20),
                _nominees(context, ref, p),
                const SizedBox(height: 20),
                _documents(context, ref, p),
                const SizedBox(height: 20),
                _bank(context, p),
                const SizedBox(height: 20),
                _settings(context, ref),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ── Sections ─────────────────────────────────────────────────────────────

  /// The two flows that live outside this tab: KYC verification (which the pill
  /// in the header hints at) and loans.
  Widget _services(BuildContext context, CustomerProfile p) {
    final AppStrings s = AppStrings.of(context);
    return SectionCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: <Widget>[
          ListTile(
            leading: const Icon(Icons.badge_outlined, color: PigmeeColors.indigo),
            title: Text(s.t('kycTitle')),
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                StatusPill.kyc(p.kycStatus, _kycShort(s, p.kycStatus)),
                const Icon(Icons.chevron_right_rounded),
              ],
            ),
            onTap: () => context.push(Routes.kyc),
          ),
          const Divider(height: 1),
          ListTile(
            leading: const Icon(Icons.request_quote_outlined, color: PigmeeColors.indigo),
            title: Text(s.t('loansTitle')),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: () => context.push(Routes.loans),
          ),
        ],
      ),
    );
  }

  String _kycShort(AppStrings s, String status) => switch (status) {
        'verified' => s.t('kycVerified'),
        'rejected' => s.t('kycRejected'),
        _ => s.t('kycPending'),
      };

  Widget _personalInfo(BuildContext context, CustomerProfile p) {
    final AppStrings s = AppStrings.of(context);
    return SectionCard(
      title: s.t('personalInfo'),
      trailing: TextButton.icon(
        onPressed: () => context.push(
          Routes.editProfile,
          extra: EditProfileArgs(name: p.name, address: p.address, photoUrl: p.photoUrl),
        ),
        icon: const Icon(Icons.edit_rounded, size: 16),
        label: Text(s.t('editProfile')),
      ),
      child: Column(
        children: <Widget>[
          InfoRow(label: s.t('name'), value: p.name),
          InfoRow(label: s.t('mobile'), value: p.mobile),
          if (p.address != null && p.address!.trim().isNotEmpty)
            InfoRow(label: s.t('address'), value: p.address!),
          if (p.village != null) InfoRow(label: s.t('village'), value: p.village!.name),
        ],
      ),
    );
  }

  Widget _nominees(BuildContext context, WidgetRef ref, CustomerProfile p) {
    final AppStrings s = AppStrings.of(context);
    final bool empty = p.nominees.isEmpty;
    return SectionCard(
      title: s.t('nominees'),
      trailing: TextButton.icon(
        onPressed: () => _addNominee(context, ref),
        icon: const Icon(Icons.add_rounded, size: 18),
        label: Text(s.t('addNominee')),
      ),
      padding: empty ? const EdgeInsets.all(16) : EdgeInsets.zero,
      child: empty
          ? _EmptyLine(message: s.t('noNominees'), icon: Icons.group_outlined)
          : Column(
              children: <Widget>[
                for (int i = 0; i < p.nominees.length; i++) ...<Widget>[
                  if (i > 0) const Divider(height: 1),
                  _NomineeTile(
                    nominee: p.nominees[i],
                    onDelete: () => _deleteNominee(context, ref, p.nominees[i]),
                  ),
                ],
              ],
            ),
    );
  }

  Widget _documents(BuildContext context, WidgetRef ref, CustomerProfile p) {
    final AppStrings s = AppStrings.of(context);
    final bool empty = p.documents.isEmpty;
    return SectionCard(
      title: s.t('documents'),
      trailing: TextButton.icon(
        onPressed: () => _addDocument(context, ref),
        icon: const Icon(Icons.add_rounded, size: 18),
        label: Text(s.t('addDocument')),
      ),
      padding: empty ? const EdgeInsets.all(16) : EdgeInsets.zero,
      child: empty
          ? _EmptyLine(message: s.t('noDocuments'), icon: Icons.description_outlined)
          : Column(
              children: <Widget>[
                for (int i = 0; i < p.documents.length; i++) ...<Widget>[
                  if (i > 0) const Divider(height: 1),
                  _DocumentTile(document: p.documents[i]),
                ],
              ],
            ),
    );
  }

  Widget _bank(BuildContext context, CustomerProfile p) {
    final AppStrings s = AppStrings.of(context);
    final BankDetails? b = p.bankDetails;
    return SectionCard(
      title: s.t('bankDetails'),
      child: b == null
          ? Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                _EmptyLine(message: s.t('noBank'), icon: Icons.account_balance_outlined),
                const SizedBox(height: 14),
                SecondaryButton(
                  label: s.t('addBankDetails'),
                  icon: Icons.add_rounded,
                  onPressed: () => context.push(Routes.bankDetails),
                ),
              ],
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                InfoRow(label: s.t('accountHolder'), value: b.accountHolderName),
                InfoRow(label: s.t('accountNumber'), value: Formatters.maskAccount(b.accountNumber)),
                InfoRow(label: s.t('ifsc'), value: b.ifsc),
                const SizedBox(height: 14),
                SecondaryButton(
                  label: s.t('updateBankDetails'),
                  icon: Icons.edit_rounded,
                  onPressed: () => context.push(
                    Routes.bankDetails,
                    extra: BankDetailsArgs(
                      accountNumber: b.accountNumber,
                      ifsc: b.ifsc,
                      accountHolderName: b.accountHolderName,
                    ),
                  ),
                ),
              ],
            ),
    );
  }

  Widget _settings(BuildContext context, WidgetRef ref) {
    final AppStrings s = AppStrings.of(context);
    return SectionCard(
      title: s.t('settings'),
      padding: EdgeInsets.zero,
      child: Column(
        children: <Widget>[
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: <Widget>[
                Row(
                  children: <Widget>[
                    const Icon(Icons.palette_outlined, color: PigmeeColors.indigo),
                    const SizedBox(width: 12),
                    Text(s.t('appearance')),
                  ],
                ),
                const ThemeModeToggle(),
              ],
            ),
          ),
          const Divider(height: 1),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: <Widget>[
                Row(
                  children: <Widget>[
                    const Icon(Icons.translate_rounded, color: PigmeeColors.indigo),
                    const SizedBox(width: 12),
                    Text(s.t('appLanguage')),
                  ],
                ),
                const LanguageToggle(),
              ],
            ),
          ),
          const Divider(height: 1),
          ListTile(
            leading: const Icon(Icons.help_outline_rounded, color: PigmeeColors.indigo),
            title: Text(s.t('helpSupport')),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: () => context.push(Routes.help),
          ),
          const Divider(height: 1),
          ListTile(
            leading: const Icon(Icons.logout_rounded, color: PigmeeColors.rose),
            title: Text(
              s.t('logout'),
              style: const TextStyle(color: PigmeeColors.rose, fontWeight: FontWeight.w700),
            ),
            onTap: () => _logout(context, ref),
          ),
        ],
      ),
    );
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  Future<void> _addNominee(BuildContext context, WidgetRef ref) async {
    final AppStrings s = AppStrings.of(context);
    final bool? added = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _AddNomineeSheet(),
    );
    if (added == true && context.mounted) {
      ref.invalidate(profileProvider);
      _snack(context, s.t('nomineeAdded'));
    }
  }

  Future<void> _deleteNominee(BuildContext context, WidgetRef ref, Nominee n) async {
    final AppStrings s = AppStrings.of(context);
    final bool? confirmed = await showDialog<bool>(
      context: context,
      builder: (BuildContext ctx) => AlertDialog(
        title: Text(s.t('removeNominee')),
        content: Text(s.f('removeNomineeBody', <Object>[n.name])),
        actions: <Widget>[
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(s.t('cancel'))),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: PigmeeColors.rose),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(s.t('remove')),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(meRepositoryProvider).deleteNominee(n.id);
      if (!context.mounted) return;
      ref.invalidate(profileProvider);
    } on ApiException catch (e) {
      if (context.mounted) _snack(context, e.message);
    } catch (_) {
      if (context.mounted) _snack(context, s.t('somethingWrong'));
    }
  }

  Future<void> _addDocument(BuildContext context, WidgetRef ref) async {
    final AppStrings s = AppStrings.of(context);
    final bool? added = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _AddDocumentSheet(),
    );
    if (added == true && context.mounted) {
      ref.invalidate(profileProvider);
      _snack(context, s.t('documentAdded'));
    }
  }

  Future<void> _logout(BuildContext context, WidgetRef ref) async {
    final AppStrings s = AppStrings.of(context);
    final bool? confirmed = await showDialog<bool>(
      context: context,
      builder: (BuildContext ctx) => AlertDialog(
        title: Text(s.t('logoutConfirm')),
        content: Text(s.t('logoutConfirmBody')),
        actions: <Widget>[
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(s.t('cancel'))),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: PigmeeColors.rose),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(s.t('logout')),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    // The router redirect reacts to the auth-state change and returns to login.
    await ref.read(authControllerProvider.notifier).logout();
  }

  void _snack(BuildContext context, String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }
}

// ── Header ───────────────────────────────────────────────────────────────────

class _Header extends StatelessWidget {
  const _Header({required this.profile});
  final CustomerProfile profile;

  String get _initials {
    final List<String> parts =
        profile.name.trim().split(RegExp(r'\s+')).where((String p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.characters.first.toUpperCase();
    return (parts.first.characters.first + parts.last.characters.first).toUpperCase();
  }

  Widget get _initialsText => Center(
        child: Text(
          _initials,
          style: const TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.w800),
        ),
      );

  String _kycLabel(AppStrings s) {
    switch (profile.kycStatus) {
      case 'verified':
        return s.t('kycVerified');
      case 'rejected':
        return s.t('kycRejected');
      default:
        return s.t('kycPending');
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppStrings s = AppStrings.of(context);
    final ThemeData theme = Theme.of(context);
    final String? photo = profile.photoUrl;

    return Column(
      children: <Widget>[
        Container(
          height: 88,
          width: 88,
          clipBehavior: Clip.antiAlias,
          decoration: const BoxDecoration(
            shape: BoxShape.circle,
            gradient: LinearGradient(colors: PigmeeColors.heroGradient),
          ),
          alignment: Alignment.center,
          // Uploaded photos live behind the authenticated /api/uploads route, so
          // they load through the API client rather than Image.network.
          child: (photo != null && photo.isNotEmpty)
              ? KycImage(url: photo, errorWidget: _initialsText)
              : _initialsText,
        ),
        const SizedBox(height: 14),
        Text(
          profile.name,
          style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 2),
        Text(
          profile.mobile,
          style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.outline),
        ),
        const SizedBox(height: 12),
        StatusPill.kyc(profile.kycStatus, _kycLabel(s)),
        const SizedBox(height: 8),
        Text(
          s.f('memberSince', <Object>[Formatters.date(profile.createdAt)]),
          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
        ),
      ],
    );
  }
}

// ── Tiles ────────────────────────────────────────────────────────────────────

class _NomineeTile extends StatelessWidget {
  const _NomineeTile({required this.nominee, required this.onDelete});
  final Nominee nominee;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final List<String> meta = <String>[
      if (nominee.relation != null && nominee.relation!.isNotEmpty) nominee.relation!,
      if (nominee.mobile != null && nominee.mobile!.isNotEmpty) nominee.mobile!,
    ];
    return ListTile(
      leading: const CircleAvatar(
        backgroundColor: Color(0x1A4F46E5),
        child: Icon(Icons.person_rounded, color: PigmeeColors.indigo),
      ),
      title: Text(nominee.name, style: const TextStyle(fontWeight: FontWeight.w700)),
      subtitle: meta.isEmpty
          ? null
          : Text(meta.join(' · '), style: TextStyle(color: theme.colorScheme.outline)),
      trailing: IconButton(
        icon: const Icon(Icons.delete_outline_rounded, color: PigmeeColors.rose),
        onPressed: onDelete,
      ),
    );
  }
}

class _DocumentTile extends StatelessWidget {
  const _DocumentTile({required this.document});
  final CustomerDocument document;

  @override
  Widget build(BuildContext context) {
    final AppStrings s = AppStrings.of(context);
    final String statusLabel = switch (document.verifiedStatus) {
      'verified' => s.t('kycVerified'),
      'rejected' => s.t('kycRejected'),
      _ => s.t('kycPending'),
    };
    final bool isPdf = document.fileUrl.toLowerCase().endsWith('.pdf');
    return ListTile(
      leading: CircleAvatar(
        backgroundColor: const Color(0x1A4F46E5),
        child: Icon(
          isPdf ? Icons.picture_as_pdf_rounded : Icons.description_rounded,
          color: PigmeeColors.indigo,
        ),
      ),
      title: Text(_prettyType(document.docType), style: const TextStyle(fontWeight: FontWeight.w700)),
      subtitle: Text(
        Formatters.date(document.uploadedAt),
        style: TextStyle(color: Theme.of(context).colorScheme.outline),
      ),
      trailing: StatusPill.kyc(document.verifiedStatus, statusLabel),
      onTap: () => showDialog<void>(
        context: context,
        builder: (_) => _DocumentViewer(document: document, isPdf: isPdf),
      ),
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
}

/// Shows an uploaded KYC document back to the customer: images inline (pinch to
/// zoom), PDFs via save-and-share, since the app has no embedded PDF renderer.
class _DocumentViewer extends ConsumerStatefulWidget {
  const _DocumentViewer({required this.document, required this.isPdf});
  final CustomerDocument document;
  final bool isPdf;

  @override
  ConsumerState<_DocumentViewer> createState() => _DocumentViewerState();
}

class _DocumentViewerState extends ConsumerState<_DocumentViewer> {
  bool _busy = false;

  Future<void> _saveAndShare() async {
    final AppStrings s = AppStrings.of(context);
    setState(() => _busy = true);
    try {
      final List<int> bytes =
          await ref.read(meRepositoryProvider).fileBytes(widget.document.fileUrl);
      final String path = await savePdfToDevice(
        'pigmee_${widget.document.docType}.pdf',
        bytes,
      );
      await shareLocalFile(path, subject: _DocumentTile._prettyType(widget.document.docType));
    } on ApiException catch (e) {
      if (mounted) _snack(e.message);
    } catch (_) {
      if (mounted) _snack(s.t('somethingWrong'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _snack(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final AppStrings s = AppStrings.of(context);
    return AlertDialog(
      title: Text(_DocumentTile._prettyType(widget.document.docType)),
      contentPadding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      content: SizedBox(
        width: 320,
        child: widget.isPdf
            ? Column(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  const Icon(Icons.picture_as_pdf_rounded, size: 56, color: PigmeeColors.indigo),
                  const SizedBox(height: 12),
                  Text(s.t('pdfViewHint'), textAlign: TextAlign.center),
                ],
              )
            : ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 380),
                child: InteractiveViewer(
                  child: KycImage(url: widget.document.fileUrl, fit: BoxFit.contain),
                ),
              ),
      ),
      actions: <Widget>[
        TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(s.t('close'))),
        if (widget.isPdf && !kIsWeb)
          FilledButton.icon(
            onPressed: _busy ? null : _saveAndShare,
            icon: const Icon(Icons.ios_share_rounded, size: 18),
            label: Text(s.t('share')),
          ),
      ],
    );
  }
}

class _EmptyLine extends StatelessWidget {
  const _EmptyLine({required this.message, required this.icon});
  final String message;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Row(
      children: <Widget>[
        Icon(icon, size: 20, color: theme.colorScheme.outline),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            message,
            style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.outline),
          ),
        ),
      ],
    );
  }
}

// ── Add-nominee bottom sheet ───────────────────────────────────────────────────

class _AddNomineeSheet extends ConsumerStatefulWidget {
  const _AddNomineeSheet();

  @override
  ConsumerState<_AddNomineeSheet> createState() => _AddNomineeSheetState();
}

class _AddNomineeSheetState extends ConsumerState<_AddNomineeSheet> {
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final TextEditingController _name = TextEditingController();
  final TextEditingController _relation = TextEditingController();
  final TextEditingController _mobile = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _name.dispose();
    _relation.dispose();
    _mobile.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final AppStrings s = AppStrings.of(context);
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    setState(() => _saving = true);
    try {
      await ref.read(meRepositoryProvider).addNominee(
            name: _name.text.trim(),
            relation: _relation.text.trim(),
            mobile: _mobile.text.trim(),
          );
      if (!mounted) return;
      Navigator.of(context).pop(true);
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
    return _SheetScaffold(
      title: s.t('addNominee'),
      formKey: _formKey,
      saving: _saving,
      onSubmit: _submit,
      children: <Widget>[
        TextFormField(
          controller: _name,
          textCapitalization: TextCapitalization.words,
          decoration: InputDecoration(
            labelText: s.t('name'),
            prefixIcon: const Icon(Icons.person_rounded),
          ),
          validator: (String? v) =>
              (v == null || v.trim().length < 2) ? s.t('nameRequired') : null,
        ),
        const SizedBox(height: 14),
        TextFormField(
          controller: _relation,
          textCapitalization: TextCapitalization.words,
          decoration: InputDecoration(
            labelText: '${s.t('relation')} (${s.t('optional')})',
            prefixIcon: const Icon(Icons.diversity_1_rounded),
          ),
        ),
        const SizedBox(height: 14),
        TextFormField(
          controller: _mobile,
          keyboardType: TextInputType.phone,
          decoration: InputDecoration(
            labelText: '${s.t('mobile')} (${s.t('optional')})',
            prefixIcon: const Icon(Icons.phone_rounded),
          ),
        ),
      ],
    );
  }
}

// ── Add-document bottom sheet ──────────────────────────────────────────────────

class _AddDocumentSheet extends ConsumerStatefulWidget {
  const _AddDocumentSheet();

  @override
  ConsumerState<_AddDocumentSheet> createState() => _AddDocumentSheetState();
}

class _AddDocumentSheetState extends ConsumerState<_AddDocumentSheet> {
  static const List<({String value, String label})> _types = <({String value, String label})>[
    (value: 'aadhaar', label: 'Aadhaar Card'),
    (value: 'pan', label: 'PAN Card'),
    (value: 'voter_id', label: 'Voter ID'),
    (value: 'driving_license', label: 'Driving License'),
    (value: 'passport', label: 'Passport'),
    (value: 'other', label: 'Other'),
  ];

  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  String _docType = _types.first.value;

  /// The file the customer picked, once it has been uploaded and the server has
  /// given us a reference to store on the document record.
  UploadedFile? _uploaded;
  Uint8List? _preview;

  bool _uploading = false;
  bool _saving = false;

  Future<void> _pickFile() async {
    final AppStrings s = AppStrings.of(context);
    final MediaSource? source = await showMediaSourceSheet(context);
    if (source == null || !mounted) return;

    setState(() => _uploading = true);
    try {
      final PickedMedia? picked = await const MediaPicker().pick(source);
      if (picked == null) return; // dismissed the picker
      final UploadedFile uploaded = await ref.read(meRepositoryProvider).uploadFile(
            bytes: picked.bytes,
            fileName: picked.fileName,
            mimeType: picked.mimeType,
          );
      if (!mounted) return;
      setState(() {
        _uploaded = uploaded;
        // Only images get a thumbnail; a PDF shows its name and size instead.
        _preview = uploaded.isPdf ? null : Uint8List.fromList(picked.bytes);
      });
    } on ApiException catch (e) {
      _snack(e.message);
    } catch (_) {
      _snack(s.t('uploadFailed'));
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _submit() async {
    final AppStrings s = AppStrings.of(context);
    final UploadedFile? file = _uploaded;
    if (file == null) {
      _snack(s.t('pickFileFirst'));
      return;
    }
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    setState(() => _saving = true);
    try {
      await ref.read(meRepositoryProvider).addDocument(
            docType: _docType,
            fileUrl: file.url,
          );
      if (!mounted) return;
      Navigator.of(context).pop(true);
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
    return _SheetScaffold(
      title: s.t('addDocument'),
      formKey: _formKey,
      saving: _saving,
      onSubmit: _submit,
      children: <Widget>[
        Align(
          alignment: Alignment.centerLeft,
          child: Text(
            s.t('docType'),
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Theme.of(context).colorScheme.outline,
                  fontWeight: FontWeight.w600,
                ),
          ),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: <Widget>[
            for (final ({String value, String label}) t in _types)
              ChoiceChip(
                label: Text(t.label),
                selected: _docType == t.value,
                onSelected: (_) => setState(() => _docType = t.value),
              ),
          ],
        ),
        const SizedBox(height: 18),
        _FilePickerTile(
          uploaded: _uploaded,
          preview: _preview,
          uploading: _uploading,
          onPick: _uploading ? null : _pickFile,
        ),
      ],
    );
  }
}

/// Dashed drop-target-style tile: prompts for a file, then shows what was
/// uploaded (thumbnail for an image, name + size for a PDF).
class _FilePickerTile extends StatelessWidget {
  const _FilePickerTile({
    required this.uploaded,
    required this.preview,
    required this.uploading,
    required this.onPick,
  });

  final UploadedFile? uploaded;
  final Uint8List? preview;
  final bool uploading;
  final VoidCallback? onPick;

  @override
  Widget build(BuildContext context) {
    final AppStrings s = AppStrings.of(context);
    final ThemeData theme = Theme.of(context);
    final UploadedFile? file = uploaded;

    return InkWell(
      onTap: onPick,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: file == null ? theme.colorScheme.outlineVariant : PigmeeColors.emerald,
          ),
          color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.35),
        ),
        child: Row(
          children: <Widget>[
            SizedBox(
              height: 46,
              width: 46,
              child: _thumbnail(context, file),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(
                    file == null ? s.t('attachFile') : file.fileName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    file == null ? s.t('attachFileHint') : '${file.prettySize} · ${s.t('uploaded')}',
                    style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                  ),
                ],
              ),
            ),
            Icon(
              file == null ? Icons.add_rounded : Icons.swap_horiz_rounded,
              color: theme.colorScheme.outline,
            ),
          ],
        ),
      ),
    );
  }

  Widget _thumbnail(BuildContext context, UploadedFile? file) {
    if (uploading) {
      return const Center(
        child: SizedBox(
          height: 20,
          width: 20,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      );
    }
    if (preview != null) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(10),
        child: Image.memory(preview!, fit: BoxFit.cover),
      );
    }
    return Container(
      decoration: BoxDecoration(
        color: const Color(0x1A4F46E5),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Icon(
        file == null
            ? Icons.upload_file_rounded
            : (file.isPdf ? Icons.picture_as_pdf_rounded : Icons.image_rounded),
        color: PigmeeColors.indigo,
      ),
    );
  }
}

/// Shared layout for the add-* bottom sheets: a drag handle, title, form fields,
/// and a submit button, lifted above the keyboard.
class _SheetScaffold extends StatelessWidget {
  const _SheetScaffold({
    required this.title,
    required this.formKey,
    required this.saving,
    required this.onSubmit,
    required this.children,
  });

  final String title;
  final GlobalKey<FormState> formKey;
  final bool saving;
  final Future<void> Function() onSubmit;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final AppStrings s = AppStrings.of(context);
    final ThemeData theme = Theme.of(context);
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
          child: Form(
            key: formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Center(
                  child: Container(
                    height: 4,
                    width: 44,
                    decoration: BoxDecoration(
                      color: theme.colorScheme.outlineVariant,
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                ),
                const SizedBox(height: 18),
                Text(
                  title,
                  style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 18),
                ...children,
                const SizedBox(height: 24),
                PrimaryButton(
                  label: s.t('save'),
                  icon: Icons.check_rounded,
                  loading: saving,
                  onPressed: onSubmit,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
