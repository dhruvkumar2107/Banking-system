import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/media_picker.dart';
import '../core/theme.dart';
import '../data/api_exception.dart';
import '../data/models/upload.dart';
import '../l10n/strings.dart';
import '../state/data_providers.dart';
import '../state/providers.dart';
import '../widgets/kyc_image.dart';
import '../widgets/media_source_sheet.dart';
import '../widgets/primary_button.dart';

/// Navigation arguments for [EditProfileScreen] — the current profile values to
/// prefill the form.
class EditProfileArgs {
  const EditProfileArgs({required this.name, this.address, this.photoUrl});
  final String name;
  final String? address;
  final String? photoUrl;
}

class EditProfileScreen extends ConsumerStatefulWidget {
  const EditProfileScreen({super.key, required this.args});
  final EditProfileArgs args;

  @override
  ConsumerState<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends ConsumerState<EditProfileScreen> {
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _address;

  /// The stored reference for the photo — either what the profile already had or
  /// the url returned by a fresh upload.
  String? _photoUrl;

  /// Bytes of a just-picked photo, shown immediately so the customer sees the
  /// result without waiting for a round trip back through the API.
  Uint8List? _pickedPreview;

  bool _uploading = false;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: widget.args.name);
    _address = TextEditingController(text: widget.args.address ?? '');
    _photoUrl = widget.args.photoUrl;
  }

  @override
  void dispose() {
    _name.dispose();
    _address.dispose();
    super.dispose();
  }

  Future<void> _changePhoto() async {
    final AppStrings s = AppStrings.of(context);
    // A portrait, so no PDF option here.
    final MediaSource? source = await showMediaSourceSheet(context, allowFiles: false);
    if (source == null || !mounted) return;

    setState(() => _uploading = true);
    try {
      final PickedMedia? picked = await const MediaPicker().pick(source);
      if (picked == null) return; // customer backed out of the picker
      final UploadedFile uploaded = await ref.read(meRepositoryProvider).uploadFile(
            bytes: picked.bytes,
            fileName: picked.fileName,
            mimeType: picked.mimeType,
          );
      if (!mounted) return;
      setState(() {
        _photoUrl = uploaded.url;
        _pickedPreview = Uint8List.fromList(picked.bytes);
      });
      _snack(s.t('photoUploaded'));
    } on ApiException catch (e) {
      _snack(e.message);
    } catch (_) {
      _snack(s.t('photoFailed'));
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  void _removePhoto() {
    setState(() {
      // An empty string clears the stored reference server-side; null would be
      // dropped from the PATCH body and leave the old photo in place.
      _photoUrl = '';
      _pickedPreview = null;
    });
  }

  Future<void> _save() async {
    final AppStrings s = AppStrings.of(context);
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    setState(() => _saving = true);
    try {
      await ref.read(meRepositoryProvider).updateProfile(
            name: _name.text.trim(),
            address: _address.text.trim(),
            photoUrl: _photoUrl,
          );
      if (!mounted) return;
      ref.invalidate(profileProvider);
      ref.invalidate(dashboardProvider);
      _snack(s.t('profileSaved'));
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
    final bool hasPhoto = _pickedPreview != null || (_photoUrl?.isNotEmpty ?? false);

    return Scaffold(
      appBar: AppBar(title: Text(s.t('editProfile'))),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Center(
                  child: _PhotoPicker(
                    initials: _initials,
                    preview: _pickedPreview,
                    photoUrl: _photoUrl,
                    busy: _uploading,
                    onTap: _uploading ? null : _changePhoto,
                  ),
                ),
                const SizedBox(height: 12),
                Center(
                  child: TextButton.icon(
                    onPressed: _uploading ? null : _changePhoto,
                    icon: const Icon(Icons.photo_camera_rounded, size: 18),
                    label: Text(hasPhoto ? s.t('changePhoto') : s.t('addPhoto')),
                  ),
                ),
                if (hasPhoto)
                  Center(
                    child: TextButton(
                      onPressed: _uploading ? null : _removePhoto,
                      child: Text(
                        s.t('removePhoto'),
                        style: const TextStyle(color: PigmeeColors.rose),
                      ),
                    ),
                  ),
                const SizedBox(height: 20),
                TextFormField(
                  controller: _name,
                  textCapitalization: TextCapitalization.words,
                  decoration: InputDecoration(
                    labelText: s.t('fullName'),
                    prefixIcon: const Icon(Icons.person_rounded),
                  ),
                  validator: (String? v) =>
                      (v == null || v.trim().length < 2) ? s.t('nameRequired') : null,
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _address,
                  textCapitalization: TextCapitalization.sentences,
                  maxLines: 2,
                  decoration: InputDecoration(
                    labelText: '${s.t('address')} (${s.t('optional')})',
                    prefixIcon: const Icon(Icons.home_rounded),
                  ),
                ),
                const SizedBox(height: 32),
                PrimaryButton(
                  label: s.t('save'),
                  icon: Icons.check_rounded,
                  loading: _saving,
                  onPressed: _uploading ? null : _save,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String get _initials {
    final List<String> parts = _name.text
        .trim()
        .split(RegExp(r'\s+'))
        .where((String p) => p.isNotEmpty)
        .toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.characters.first.toUpperCase();
    return (parts.first.characters.first + parts.last.characters.first).toUpperCase();
  }
}

/// A tappable avatar: the picked photo, the stored photo, or the initials —
/// with a camera badge so it reads as an action rather than decoration.
class _PhotoPicker extends StatelessWidget {
  const _PhotoPicker({
    required this.initials,
    required this.preview,
    required this.photoUrl,
    required this.busy,
    required this.onTap,
  });

  final String initials;
  final Uint8List? preview;
  final String? photoUrl;
  final bool busy;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: AppStrings.of(context).t('changePhoto'),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Stack(
          children: <Widget>[
            Container(
              height: 104,
              width: 104,
              clipBehavior: Clip.antiAlias,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(colors: PigmeeColors.heroGradient),
              ),
              alignment: Alignment.center,
              child: _inner(context),
            ),
            Positioned(
              right: 0,
              bottom: 0,
              child: Container(
                height: 34,
                width: 34,
                decoration: BoxDecoration(
                  color: PigmeeColors.indigo,
                  shape: BoxShape.circle,
                  border: Border.all(color: Theme.of(context).scaffoldBackgroundColor, width: 3),
                ),
                child: const Icon(Icons.photo_camera_rounded, size: 15, color: Colors.white),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _inner(BuildContext context) {
    if (busy) {
      return const SizedBox(
        height: 24,
        width: 24,
        child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
      );
    }
    if (preview != null) {
      return Image.memory(preview!, height: 104, width: 104, fit: BoxFit.cover);
    }
    final String? url = photoUrl;
    if (url != null && url.isNotEmpty) {
      return SizedBox(
        height: 104,
        width: 104,
        child: KycImage(url: url, errorWidget: _initialsText),
      );
    }
    return _initialsText;
  }

  Widget get _initialsText => Center(
        child: Text(
          initials,
          style: const TextStyle(color: Colors.white, fontSize: 34, fontWeight: FontWeight.w800),
        ),
      );
}
