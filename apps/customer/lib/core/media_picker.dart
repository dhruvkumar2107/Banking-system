import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';

/// A file the customer chose, already loaded into memory. Kept small on purpose:
/// KYC uploads are capped server-side at 5MB.
class PickedMedia {
  const PickedMedia({required this.bytes, required this.fileName, required this.mimeType});

  final List<int> bytes;
  final String fileName;
  final String mimeType;

  int get sizeBytes => bytes.length;
}

/// Where a KYC file can come from.
enum MediaSource { camera, gallery, files }

/// Thin wrapper over `image_picker` / `file_picker` so screens never import the
/// plugins directly — that keeps the picking rules (allowed types, downscaling,
/// mime detection) in one place, and makes the call sites testable.
class MediaPicker {
  const MediaPicker();

  /// The types the API accepts. Kept in sync with `uploads.service.ts`.
  static const List<String> allowedExtensions = <String>['jpg', 'jpeg', 'png', 'webp', 'pdf'];

  /// Pick one file. Returns `null` if the customer backed out of the picker.
  Future<PickedMedia?> pick(MediaSource source) async {
    switch (source) {
      case MediaSource.camera:
      case MediaSource.gallery:
        return _pickImage(source == MediaSource.camera ? ImageSource.camera : ImageSource.gallery);
      case MediaSource.files:
        return _pickFile();
    }
  }

  Future<PickedMedia?> _pickImage(ImageSource source) async {
    // Downscale on the device: a 12MP phone photo is ~5MB and would be rejected,
    // and a KYC scan is perfectly legible at 1600px.
    final XFile? shot = await ImagePicker().pickImage(
      source: source,
      maxWidth: 1600,
      maxHeight: 1600,
      imageQuality: 85,
    );
    if (shot == null) return null;
    final List<int> bytes = await shot.readAsBytes();
    return PickedMedia(
      bytes: bytes,
      fileName: _safeName(shot.name, fallbackExt: 'jpg'),
      mimeType: _mimeFor(shot.name, declared: shot.mimeType) ?? 'image/jpeg',
    );
  }

  Future<PickedMedia?> _pickFile() async {
    // file_picker 12 exposes statics rather than a `FilePicker.platform` instance,
    // and `pickFile` (singular) replaces filtering a result list down to one.
    final PlatformFile? file = await FilePicker.pickFile(
      type: FileType.custom,
      allowedExtensions: allowedExtensions,
    );
    if (file == null) return null;
    // Read on demand: the old `withData: true` flag is deprecated, and holding the
    // bytes only here keeps a cancelled pick from allocating anything.
    final List<int> bytes = await file.readAsBytes();
    return PickedMedia(
      bytes: bytes,
      // file_picker 12's PlatformFile no longer exposes `extension`; it only ever
      // derived it from `name`, which `_safeName` already handles.
      fileName: _safeName(file.name, fallbackExt: 'jpg'),
      mimeType: _mimeFor(file.name) ?? 'application/octet-stream',
    );
  }

  /// Strip any directory parts a picker may hand back, and guarantee a suffix.
  static String _safeName(String raw, {required String fallbackExt}) {
    final String base = raw.split(RegExp(r'[/\\]')).last.trim();
    if (base.isEmpty) return 'upload.$fallbackExt';
    return base.contains('.') ? base : '$base.$fallbackExt';
  }

  /// Content type from the extension. The server re-checks the magic bytes, so
  /// this only has to be right often enough to be useful — never trusted.
  static String? _mimeFor(String name, {String? declared}) {
    if (declared != null && declared.isNotEmpty) return declared;
    final String ext = name.contains('.') ? name.split('.').last.toLowerCase() : '';
    return switch (ext) {
      'jpg' || 'jpeg' => 'image/jpeg',
      'png' => 'image/png',
      'webp' => 'image/webp',
      'pdf' => 'application/pdf',
      _ => null,
    };
  }
}
