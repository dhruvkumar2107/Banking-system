/// Web / unsupported-platform fallback for [savePdfToDevice].
///
/// dart:io is unavailable on the web, so file saving is not supported there.
/// Callers catch the thrown error and surface a friendly message.
Future<String> savePdfToDevice(String fileName, List<int> bytes) async {
  throw UnsupportedError('Saving files is not supported on this platform.');
}

/// Web / unsupported-platform fallback for [shareLocalFile]. The share sheet is
/// a native affordance; on web the browser's own download handles this instead.
Future<void> shareLocalFile(String path, {String? subject, String? text}) async {
  throw UnsupportedError('Sharing files is not supported on this platform.');
}
