// Conditional export: the web build gets the stub (no dart:io), while native
// builds get the real implementation backed by path_provider + dart:io.
export 'file_saver_stub.dart' if (dart.library.io) 'file_saver_io.dart';
