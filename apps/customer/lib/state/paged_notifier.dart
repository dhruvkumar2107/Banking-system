import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/models/paginated.dart';

typedef PageFetcher<T> = Future<Paginated<T>> Function(int page);

/// Immutable view of an infinitely-scrolling list: the items accumulated so
/// far, the last page loaded, and whether more can be fetched.
class PagedState<T> {
  const PagedState({
    this.items = const <Never>[],
    this.page = 0,
    this.pages = 1,
    this.total = 0,
    this.isLoadingMore = false,
  });

  final List<T> items;
  final int page;
  final int pages;
  final int total;
  final bool isLoadingMore;

  bool get hasMore => page < pages;
  bool get isEmpty => items.isEmpty;

  PagedState<T> copyWith({
    List<T>? items,
    int? page,
    int? pages,
    int? total,
    bool? isLoadingMore,
  }) =>
      PagedState<T>(
        items: items ?? this.items,
        page: page ?? this.page,
        pages: pages ?? this.pages,
        total: total ?? this.total,
        isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      );
}

/// A reusable controller for paginated endpoints: loads the first page on
/// creation, exposes [refresh] (pull-to-refresh) and [loadMore] (infinite
/// scroll). A failed `loadMore` keeps the existing items and just clears the
/// loading flag, so a transient error never wipes the list.
class PagedNotifier<T> extends StateNotifier<AsyncValue<PagedState<T>>> {
  PagedNotifier(this._fetch) : super(const AsyncValue<Never>.loading()) {
    refresh();
  }

  final PageFetcher<T> _fetch;

  Future<void> refresh() async {
    state = const AsyncValue<Never>.loading();
    try {
      final Paginated<T> p = await _fetch(1);
      state = AsyncValue<PagedState<T>>.data(
        PagedState<T>(items: p.data, page: p.page, pages: p.pages, total: p.total),
      );
    } catch (e, st) {
      state = AsyncValue<PagedState<T>>.error(e, st);
    }
  }

  Future<void> loadMore() async {
    final PagedState<T>? current = state.valueOrNull;
    if (current == null || !current.hasMore || current.isLoadingMore) return;
    state = AsyncValue<PagedState<T>>.data(current.copyWith(isLoadingMore: true));
    try {
      final Paginated<T> p = await _fetch(current.page + 1);
      state = AsyncValue<PagedState<T>>.data(
        current.copyWith(
          items: <T>[...current.items, ...p.data],
          page: p.page,
          pages: p.pages,
          total: p.total,
          isLoadingMore: false,
        ),
      );
    } catch (_) {
      state = AsyncValue<PagedState<T>>.data(current.copyWith(isLoadingMore: false));
    }
  }
}
