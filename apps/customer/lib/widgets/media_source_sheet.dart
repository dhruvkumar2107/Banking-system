import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';

import '../core/media_picker.dart';
import '../core/theme.dart';
import '../l10n/strings.dart';

/// Asks where a KYC file should come from. Returns `null` if dismissed.
///
/// [allowFiles] is off for the profile photo (a PDF is not a portrait) and on
/// for KYC documents, where a scanned PDF is the common case.
Future<MediaSource?> showMediaSourceSheet(
  BuildContext context, {
  bool allowFiles = true,
}) {
  final AppStrings s = AppStrings.of(context);
  return showModalBottomSheet<MediaSource>(
    context: context,
    builder: (BuildContext ctx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          const SizedBox(height: 12),
          Container(
            height: 4,
            width: 44,
            decoration: BoxDecoration(
              color: Theme.of(ctx).colorScheme.outlineVariant,
              borderRadius: BorderRadius.circular(999),
            ),
          ),
          const SizedBox(height: 18),
          // The camera is unavailable on the web build; hide rather than fail.
          if (!kIsWeb)
            _Option(
              icon: Icons.photo_camera_rounded,
              label: s.t('takePhoto'),
              onTap: () => Navigator.of(ctx).pop(MediaSource.camera),
            ),
          _Option(
            icon: Icons.photo_library_rounded,
            label: s.t('chooseFromGallery'),
            onTap: () => Navigator.of(ctx).pop(MediaSource.gallery),
          ),
          if (allowFiles)
            _Option(
              icon: Icons.folder_open_rounded,
              label: s.t('chooseFile'),
              subtitle: s.t('chooseFileHint'),
              onTap: () => Navigator.of(ctx).pop(MediaSource.files),
            ),
          const SizedBox(height: 8),
        ],
      ),
    ),
  );
}

class _Option extends StatelessWidget {
  const _Option({required this.icon, required this.label, required this.onTap, this.subtitle});

  final IconData icon;
  final String label;
  final String? subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => ListTile(
        leading: CircleAvatar(
          backgroundColor: const Color(0x1A4F46E5),
          child: Icon(icon, color: PigmeeColors.indigo),
        ),
        title: Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: subtitle == null ? null : Text(subtitle!),
        onTap: onTap,
      );
}
