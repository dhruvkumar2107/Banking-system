import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/providers.dart';

/// Bytes of a stored KYC file, keyed by its `/api/uploads/...` url.
///
/// Cached per url for the life of the screen so scrolling a document list does
/// not re-download every thumbnail.
final kycFileProvider = FutureProvider.family<Uint8List, String>((ref, String url) async {
  final List<int> bytes = await ref.watch(meRepositoryProvider).fileBytes(url);
  return Uint8List.fromList(bytes);
});

/// Renders a stored KYC image.
///
/// `/api/uploads/...` is access-controlled rather than a static path, so a plain
/// `Image.network` gets a 403 — the bytes have to come through the authenticated
/// API client. Absolute `http(s)` urls (legacy records entered by hand before
/// upload existed) still go through `Image.network`.
class KycImage extends ConsumerWidget {
  const KycImage({
    super.key,
    required this.url,
    this.fit = BoxFit.cover,
    this.placeholder,
    this.errorWidget,
  });

  final String url;
  final BoxFit fit;
  final Widget? placeholder;
  final Widget? errorWidget;

  bool get _isRemote => url.startsWith('http://') || url.startsWith('https://');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (_isRemote) {
      return Image.network(
        url,
        fit: fit,
        errorBuilder: (_, _, _) => errorWidget ?? const _Broken(),
        loadingBuilder: (BuildContext c, Widget child, ImageChunkEvent? p) =>
            p == null ? child : (placeholder ?? const _Loading()),
      );
    }

    return ref.watch(kycFileProvider(url)).when(
          loading: () => placeholder ?? const _Loading(),
          error: (Object _, StackTrace _) => errorWidget ?? const _Broken(),
          data: (Uint8List bytes) => Image.memory(
            bytes,
            fit: fit,
            errorBuilder: (_, _, _) => errorWidget ?? const _Broken(),
          ),
        );
  }
}

class _Loading extends StatelessWidget {
  const _Loading();

  @override
  Widget build(BuildContext context) => Center(
        child: SizedBox(
          height: 20,
          width: 20,
          child: CircularProgressIndicator(
            strokeWidth: 2,
            color: Theme.of(context).colorScheme.outline,
          ),
        ),
      );
}

class _Broken extends StatelessWidget {
  const _Broken();

  @override
  Widget build(BuildContext context) => Center(
        child: Icon(
          Icons.broken_image_outlined,
          color: Theme.of(context).colorScheme.outline,
        ),
      );
}
