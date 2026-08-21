import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/api_exception.dart';
import '../l10n/strings.dart';
import '../state/paged_notifier.dart';
import 'state_views.dart';

/// A pull-to-refresh + infinite-scroll list driven by a [PagedState].
///
/// Handles the four states (loading / error / empty / data), appends a footer
/// spinner while the next page loads, and calls [onLoadMore] as the user nears
/// the bottom. Used by the transaction history and the account passbook.
class PagedListView<T> extends StatelessWidget {
  const PagedListView({
    super.key,
    required this.state,
    required this.onRefresh,
    required this.onLoadMore,
    required this.itemBuilder,
    required this.emptyMessage,
    this.emptyIcon = Icons.inbox_rounded,
    this.onRetry,
    this.header,
    this.padding = const EdgeInsets.all(16),
    this.separated = true,
  });

  final AsyncValue<PagedState<T>> state;
  final Future<void> Function() onRefresh;
  final VoidCallback onLoadMore;
  final Widget Function(BuildContext context, T item) itemBuilder;
  final String emptyMessage;
  final IconData emptyIcon;
  final VoidCallback? onRetry;

  /// Optional non-scrolling header rendered above the list (still scrolls with
  /// the content). Always shown, even when the list itself is empty.
  final Widget? header;
  final EdgeInsets padding;
  final bool separated;

  bool _onScroll(ScrollNotification n, PagedState<T> data) {
    if (n.metrics.pixels >= n.metrics.maxScrollExtent - 320 &&
        data.hasMore &&
        !data.isLoadingMore) {
      onLoadMore();
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: state.when(
        skipLoadingOnRefresh: false,
        loading: () => ListView(
          children: <Widget>[
            ?header,
            const SizedBox(height: 120),
            const LoadingView(),
          ],
        ),
        error: (Object e, _) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: <Widget>[
            ?header,
            const SizedBox(height: 80),
            ErrorView(message: _msg(context, e), onRetry: onRetry),
          ],
        ),
        data: (PagedState<T> data) {
          if (data.isEmpty) {
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: <Widget>[
                ?header,
                const SizedBox(height: 80),
                EmptyView(message: emptyMessage, icon: emptyIcon),
              ],
            );
          }
          final int headerCount = header != null ? 1 : 0;
          final int footerCount = data.isLoadingMore ? 1 : 0;
          return NotificationListener<ScrollNotification>(
            onNotification: (ScrollNotification n) => _onScroll(n, data),
            child: ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: padding,
              itemCount: data.items.length + headerCount + footerCount,
              separatorBuilder: (BuildContext _, int i) {
                if (!separated) return const SizedBox.shrink();
                if (header != null && i == 0) return const SizedBox(height: 8);
                return const Divider(height: 1);
              },
              itemBuilder: (BuildContext context, int index) {
                if (header != null && index == 0) return header!;
                final int itemIndex = index - headerCount;
                if (itemIndex >= data.items.length) {
                  return const Padding(
                    padding: EdgeInsets.all(20),
                    child: Center(
                      child: SizedBox(
                        height: 22,
                        width: 22,
                        child: CircularProgressIndicator(strokeWidth: 2.4),
                      ),
                    ),
                  );
                }
                return itemBuilder(context, data.items[itemIndex]);
              },
            ),
          );
        },
      ),
    );
  }

  String _msg(BuildContext context, Object e) {
    final AppStrings s = AppStrings.of(context);
    return e is ApiException ? e.message : s.t('somethingWrong');
  }
}
