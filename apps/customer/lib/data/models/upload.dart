/// A file stored by `POST /api/uploads` — the reference the profile or document
/// record keeps, plus enough metadata to show the customer what was uploaded.
class UploadedFile {
  const UploadedFile({
    required this.url,
    required this.fileName,
    required this.mimeType,
    required this.sizeBytes,
  });

  factory UploadedFile.fromJson(Map<String, dynamic> json) => UploadedFile(
        url: json['url'] as String,
        fileName: (json['fileName'] as String?) ?? '',
        mimeType: (json['mimeType'] as String?) ?? '',
        sizeBytes: (json['sizeBytes'] as num?)?.toInt() ?? 0,
      );

  final String url;
  final String fileName;
  final String mimeType;
  final int sizeBytes;

  bool get isPdf => mimeType == 'application/pdf';

  /// Human-readable size, e.g. "412 KB".
  String get prettySize {
    if (sizeBytes < 1024) return '$sizeBytes B';
    if (sizeBytes < 1024 * 1024) return '${(sizeBytes / 1024).round()} KB';
    return '${(sizeBytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
}
