import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/media_picker.dart';
import '../core/theme.dart';
import '../data/api_exception.dart';
import '../data/models/kyc_models.dart';
import '../data/models/upload.dart';
import '../l10n/strings.dart';
import '../state/kyc_providers.dart';
import '../state/providers.dart';
import '../widgets/media_source_sheet.dart';
import '../widgets/primary_button.dart';
import '../widgets/section_card.dart';

/// The KYC submission itself, in three steps: photo, Aadhaar card, nominee.
///
/// The Aadhaar number is typed once and posted once — never written to disk on
/// the device, and the server persists only the last four digits plus a salted
/// hash, so the app only ever sees the masked form afterwards. It is still
/// required: those last four are what the reviewer checks against the card
/// image, and the hash is what stops one Aadhaar opening two accounts.
/// Pops `true` once the packet is accepted.
class KycSubmitScreen extends ConsumerStatefulWidget {
  const KycSubmitScreen({super.key});

  @override
  ConsumerState<KycSubmitScreen> createState() => _KycSubmitScreenState();
}

class _KycSubmitScreenState extends ConsumerState<KycSubmitScreen> {
  static const int _steps = 3;

  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final TextEditingController _address = TextEditingController();
  final List<_NomineeDraft> _nominees = <_NomineeDraft>[_NomineeDraft()];

  int _step = 0;

  UploadedFile? _photo;
  Uint8List? _photoPreview;

  /// True only when the photo came straight off the camera — the server records
  /// it, and a reviewer may reject a gallery picture.
  bool _photoIsLive = false;
  bool _uploadingPhoto = false;

  UploadedFile? _aadhaar;
  Uint8List? _aadhaarPreview;
  bool _uploadingAadhaar = false;

  /// Held only until [_submit] posts it. Never persisted, never logged.
  final TextEditingController _aadhaarNumber = TextEditingController();

  bool _saving = false;

  @override
  void dispose() {
    _address.dispose();
    _aadhaarNumber.dispose();
    for (final _NomineeDraft n in _nominees) {
      n.dispose();
    }
    super.dispose();
  }

  // ── Uploads ──────────────────────────────────────────────────────────────

  Future<void> _pickPhoto() async {
    final AppStrings s = AppStrings.of(context);
    // A PDF is not a portrait, so files are off for this one.
    final MediaSource? source = await showMediaSourceSheet(context, allowFiles: false);
    if (source == null || !mounted) return;

    setState(() => _uploadingPhoto = true);
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
        _photo = uploaded;
        _photoPreview = Uint8List.fromList(picked.bytes);
        _photoIsLive = source == MediaSource.camera;
      });
    } on ApiException catch (e) {
      _snack(e.message);
    } catch (_) {
      _snack(s.t('uploadFailed'));
    } finally {
      if (mounted) setState(() => _uploadingPhoto = false);
    }
  }

  Future<void> _pickAadhaar() async {
    final AppStrings s = AppStrings.of(context);
    final MediaSource? source = await showMediaSourceSheet(context);
    if (source == null || !mounted) return;

    setState(() => _uploadingAadhaar = true);
    try {
      final PickedMedia? picked = await const MediaPicker().pick(source);
      if (picked == null) return;
      final UploadedFile uploaded = await ref.read(meRepositoryProvider).uploadFile(
            bytes: picked.bytes,
            fileName: picked.fileName,
            mimeType: picked.mimeType,
          );
      if (!mounted) return;
      setState(() {
        _aadhaar = uploaded;
        // A scanned card is often a PDF, which has no thumbnail.
        _aadhaarPreview = uploaded.isPdf ? null : Uint8List.fromList(picked.bytes);
      });
    } on ApiException catch (e) {
      _snack(e.message);
    } catch (_) {
      _snack(s.t('uploadFailed'));
    } finally {
      if (mounted) setState(() => _uploadingAadhaar = false);
    }
  }

  // ── Steps ────────────────────────────────────────────────────────────────

  /// Twelve digits is all we check here. The server owns the Verhoeff checksum
  /// and the one-Aadhaar-one-customer clash, and returns both as readable text.
  bool get _aadhaarNumberLooksValid =>
      RegExp(r'^\d{12}$').hasMatch(_aadhaarNumber.text.trim());

  void _next() {
    final AppStrings s = AppStrings.of(context);
    if (_step == 0 && _photo == null) {
      _snack(s.t('kycPhotoRequired'));
      return;
    }
    if (_step == 1 && _aadhaar == null) {
      _snack(s.t('kycAadhaarRequired'));
      return;
    }
    if (_step == 1 && !_aadhaarNumberLooksValid) {
      _snack(s.t('kycAadhaarNumberRequired'));
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() => _step++);
  }

  void _back() {
    FocusScope.of(context).unfocus();
    setState(() => _step--);
  }

  void _addNominee() => setState(() => _nominees.add(_NomineeDraft()));

  void _removeNominee(int index) {
    setState(() => _nominees.removeAt(index).dispose());
  }

  Future<void> _submit() async {
    final AppStrings s = AppStrings.of(context);
    final UploadedFile? photo = _photo;
    final UploadedFile? aadhaar = _aadhaar;
    if (photo == null) {
      _snack(s.t('kycPhotoRequired'));
      setState(() => _step = 0);
      return;
    }
    if (aadhaar == null) {
      _snack(s.t('kycAadhaarRequired'));
      setState(() => _step = 1);
      return;
    }
    if (!_aadhaarNumberLooksValid) {
      _snack(s.t('kycAadhaarNumberRequired'));
      setState(() => _step = 1);
      return;
    }
    if (_nominees.isEmpty) {
      _snack(s.t('kycNomineeAtLeastOne'));
      return;
    }
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    setState(() => _saving = true);
    try {
      await ref.read(kycRepositoryProvider).submit(
            photoUrl: photo.url,
            photoIsLive: _photoIsLive,
            aadhaarFileUrl: aadhaar.url,
            aadhaarNumber: _aadhaarNumber.text,
            nominees: <NomineeInput>[
              for (final _NomineeDraft n in _nominees) n.toInput(),
            ],
            address: _address.text,
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

  // ── Build ────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final AppStrings s = AppStrings.of(context);
    // Already cached by the status screen; the hints are the reviewer's own
    // wording, so an empty one simply shows nothing rather than blocking.
    final KycRequirements? needs = ref.watch(kycStatusProvider).valueOrNull?.requirements;
    final bool last = _step == _steps - 1;

    return Scaffold(
      appBar: AppBar(title: Text(s.t('kycSubmitTitle'))),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
            children: <Widget>[
              _StepHeader(step: _step, steps: _steps, title: _title(s)),
              const SizedBox(height: 20),
              switch (_step) {
                0 => _photoStep(s, needs?.photo ?? ''),
                1 => _aadhaarStep(s, needs?.aadhaar ?? ''),
                _ => _nomineeStep(s, needs?.nominee ?? ''),
              },
              const SizedBox(height: 28),
              PrimaryButton(
                label: last ? s.t('kycSubmitCta') : s.t('next'),
                icon: last ? Icons.check_rounded : Icons.arrow_forward_rounded,
                loading: _saving,
                onPressed: () => last ? _submit() : _next(),
              ),
              if (_step > 0) ...<Widget>[
                const SizedBox(height: 12),
                SecondaryButton(
                  label: s.t('back'),
                  icon: Icons.arrow_back_rounded,
                  onPressed: _saving ? null : _back,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  String _title(AppStrings s) => switch (_step) {
        0 => s.t('kycStepPhoto'),
        1 => s.t('kycStepAadhaar'),
        _ => s.t('kycStepNominee'),
      };

  Widget _photoStep(AppStrings s, String hint) {
    final ThemeData theme = Theme.of(context);
    return SectionCard(
      title: s.t('kycPhotoLabel'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Center(
            child: Container(
              height: 132,
              width: 132,
              clipBehavior: Clip.antiAlias,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
                border: Border.all(
                  color: _photo == null ? theme.colorScheme.outlineVariant : PigmeeColors.emerald,
                  width: 2,
                ),
              ),
              alignment: Alignment.center,
              child: _uploadingPhoto
                  ? const SizedBox(
                      height: 24,
                      width: 24,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : (_photoPreview != null
                      ? Image.memory(_photoPreview!, fit: BoxFit.cover, height: 132, width: 132)
                      : Icon(Icons.add_a_photo_rounded, size: 34, color: theme.colorScheme.outline)),
            ),
          ),
          const SizedBox(height: 16),
          SecondaryButton(
            label: _photo == null ? s.t('kycTakeLivePhoto') : s.t('kycRetakePhoto'),
            icon: Icons.photo_camera_rounded,
            onPressed: _uploadingPhoto ? null : _pickPhoto,
          ),
          if (_photo != null) ...<Widget>[
            const SizedBox(height: 12),
            Center(
              child: Text(
                _photoIsLive ? s.t('kycPhotoLive') : s.t('kycPhotoGallery'),
                style: TextStyle(
                  color: _photoIsLive ? PigmeeColors.emerald : PigmeeColors.amber,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
          const SizedBox(height: 14),
          _Hint(text: s.t('kycPhotoLiveNote')),
          if (hint.isNotEmpty) ...<Widget>[
            const SizedBox(height: 8),
            _Hint(text: hint),
          ],
        ],
      ),
    );
  }

  Widget _aadhaarStep(AppStrings s, String hint) {
    return SectionCard(
      title: s.t('kycAadhaarUpload'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          _UploadTile(
            uploaded: _aadhaar,
            preview: _aadhaarPreview,
            uploading: _uploadingAadhaar,
            onPick: _uploadingAadhaar ? null : _pickAadhaar,
          ),
          const SizedBox(height: 18),
          TextFormField(
            controller: _aadhaarNumber,
            keyboardType: TextInputType.number,
            inputFormatters: <TextInputFormatter>[FilteringTextInputFormatter.digitsOnly],
            maxLength: 12,
            decoration: InputDecoration(
              labelText: s.t('kycAadhaarNumber'),
              hintText: '1234 5678 9012',
              prefixIcon: const Icon(Icons.badge_outlined),
              // The 0/12 counter reads as a form error to a first-time saver.
              counterText: '',
            ),
          ),
          const SizedBox(height: 8),
          _Hint(text: s.t('kycAadhaarNumberPrivacy')),
          const SizedBox(height: 14),
          _Hint(text: s.t('kycAadhaarNote')),
          if (hint.isNotEmpty) ...<Widget>[
            const SizedBox(height: 8),
            _Hint(text: hint),
          ],
        ],
      ),
    );
  }

  Widget _nomineeStep(AppStrings s, String hint) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        SectionCard(
          title: s.t('nominees'),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              for (int i = 0; i < _nominees.length; i++) ...<Widget>[
                if (i > 0) const Divider(height: 32),
                _NomineeForm(
                  key: ObjectKey(_nominees[i]),
                  draft: _nominees[i],
                  index: i,
                  onRemove: _nominees.length > 1 ? () => _removeNominee(i) : null,
                ),
              ],
              const SizedBox(height: 16),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: _addNominee,
                  icon: const Icon(Icons.add_rounded, size: 18),
                  label: Text(s.t('kycAddAnotherNominee')),
                ),
              ),
              if (hint.isNotEmpty) _Hint(text: hint),
            ],
          ),
        ),
        const SizedBox(height: 20),
        SectionCard(
          title: '${s.t('address')} (${s.t('optional')})',
          child: TextFormField(
            controller: _address,
            textCapitalization: TextCapitalization.sentences,
            maxLines: 3,
            minLines: 2,
            decoration: InputDecoration(hintText: s.t('address')),
          ),
        ),
      ],
    );
  }
}

// ── Nominee draft ────────────────────────────────────────────────────────────

/// One nominee being typed. Controllers live outside the widget tree so a step
/// change (or adding a row) never loses what was entered.
class _NomineeDraft {
  final TextEditingController name = TextEditingController();
  final TextEditingController relation = TextEditingController();
  final TextEditingController mobile = TextEditingController();
  final TextEditingController address = TextEditingController();

  NomineeInput toInput() => NomineeInput(
        name: name.text,
        relation: relation.text,
        mobile: mobile.text,
        address: address.text,
      );

  void dispose() {
    name.dispose();
    relation.dispose();
    mobile.dispose();
    address.dispose();
  }
}

class _NomineeForm extends StatelessWidget {
  const _NomineeForm({
    super.key,
    required this.draft,
    required this.index,
    required this.onRemove,
  });

  final _NomineeDraft draft;
  final int index;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    final AppStrings s = AppStrings.of(context);
    final ThemeData theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Row(
          children: <Widget>[
            Expanded(
              child: Text(
                s.f('kycNomineeIndex', <Object>[index + 1]),
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.outline,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            if (onRemove != null)
              TextButton.icon(
                onPressed: onRemove,
                icon: const Icon(Icons.delete_outline_rounded, size: 18, color: PigmeeColors.rose),
                label: Text(
                  s.t('remove'),
                  style: const TextStyle(color: PigmeeColors.rose),
                ),
              ),
          ],
        ),
        const SizedBox(height: 10),
        TextFormField(
          controller: draft.name,
          textCapitalization: TextCapitalization.words,
          decoration: InputDecoration(
            labelText: s.t('name'),
            prefixIcon: const Icon(Icons.person_rounded),
          ),
          validator: (String? v) => (v == null || v.trim().length < 2) ? s.t('nameRequired') : null,
        ),
        const SizedBox(height: 14),
        TextFormField(
          controller: draft.relation,
          textCapitalization: TextCapitalization.words,
          decoration: InputDecoration(
            labelText: s.t('relation'),
            prefixIcon: const Icon(Icons.diversity_1_rounded),
          ),
          validator: (String? v) =>
              (v == null || v.trim().length < 2) ? s.t('kycRelationRequired') : null,
        ),
        const SizedBox(height: 14),
        TextFormField(
          controller: draft.mobile,
          keyboardType: TextInputType.phone,
          decoration: InputDecoration(
            labelText: '${s.t('mobile')} (${s.t('optional')})',
            prefixIcon: const Icon(Icons.phone_rounded),
          ),
          validator: (String? v) {
            final String value = (v ?? '').trim();
            if (value.isEmpty) return null;
            return RegExp(r'^[6-9]\d{9}$').hasMatch(value) ? null : s.t('enterValidMobile');
          },
        ),
        const SizedBox(height: 14),
        TextFormField(
          controller: draft.address,
          textCapitalization: TextCapitalization.sentences,
          decoration: InputDecoration(
            labelText: '${s.t('address')} (${s.t('optional')})',
            prefixIcon: const Icon(Icons.home_outlined),
          ),
        ),
      ],
    );
  }
}

// ── Pieces ───────────────────────────────────────────────────────────────────

/// Progress across the three steps: filled bars behind, the current one tinted.
class _StepHeader extends StatelessWidget {
  const _StepHeader({required this.step, required this.steps, required this.title});

  final int step;
  final int steps;
  final String title;

  @override
  Widget build(BuildContext context) {
    final AppStrings s = AppStrings.of(context);
    final ThemeData theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Row(
          children: <Widget>[
            for (int i = 0; i < steps; i++) ...<Widget>[
              if (i > 0) const SizedBox(width: 6),
              Expanded(
                child: Container(
                  height: 5,
                  decoration: BoxDecoration(
                    color: i <= step ? PigmeeColors.indigo : theme.colorScheme.outlineVariant,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
            ],
          ],
        ),
        const SizedBox(height: 12),
        Text(
          s.f('kycStepOf', <Object>[step + 1, steps]),
          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
        ),
        const SizedBox(height: 2),
        Text(
          title,
          style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
        ),
      ],
    );
  }
}

/// Pick-a-file tile: prompts, then shows what was uploaded (thumbnail for an
/// image, name and size for a PDF).
class _UploadTile extends StatelessWidget {
  const _UploadTile({
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
            SizedBox(height: 46, width: 46, child: _thumbnail(theme, file)),
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

  Widget _thumbnail(ThemeData theme, UploadedFile? file) {
    if (uploading) {
      return const Center(
        child: SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2)),
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

class _Hint extends StatelessWidget {
  const _Hint({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Icon(Icons.info_outline_rounded, size: 16, color: theme.colorScheme.outline),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
          ),
        ),
      ],
    );
  }
}
