import 'dart:io';

import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

/// Writes [bytes] to a file named [fileName] in the app's documents directory
/// and returns the absolute path. Used to persist downloaded receipt PDFs on
/// native (Android / iOS / desktop) platforms.
Future<String> savePdfToDevice(String fileName, List<int> bytes) async {
  final Directory dir = await getApplicationDocumentsDirectory();
  final File file = File('${dir.path}/$fileName');
  await file.writeAsBytes(bytes, flush: true);
  return file.path;
}

/// Hands a file that is already on disk to the platform share sheet, so the
/// customer can send a receipt on to WhatsApp, mail, Drive, or a printer without
/// the app needing an integration with any of them.
Future<void> shareLocalFile(String path, {String? subject, String? text}) async {
  // share_plus 13 replaced the `Share.shareXFiles(...)` statics with a single
  // parameter object on the instance.
  await SharePlus.instance.share(
    ShareParams(files: <XFile>[XFile(path)], subject: subject, text: text),
  );
}
