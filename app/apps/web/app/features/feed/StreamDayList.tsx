// 时间线的流式列表：服务端给第一页，读到接近底部时自动读下一页，一直读到接口的尽头。
// 不再有页码：页脚只有一行安静的状态字（正在加载 / 加载失败点此重试 / 已经到底了）。
// 从条目返回来时，已读出的页与滚动位置按 history entry 恢复——否则无限滚动会把读者丢回顶部。
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigation } from "react-router";
import type { FeedItemSummary, PoolResponse } from "@aihot/contracts/site";
import { RingMark } from "@aihot/site/brand/Logo.tsx";
import { DayList } from "./DayList";
import { isHydrated } from "../../lib/hydration";
import { isReload, readSnapshot, restoreAnchor, saveSnapshot, useSaveOnLeave } from "../../lib/restore";
import { listPath } from "../../lib/seo";

/** 接口每页 40 条、最多 50 页；翻到 pageCount 就是这条时间线的尽头。 */
const MAX_PAGE = 50;

interface StreamState {
  version: 1;
  /** The list these pages belong to: a change of filters starts a new stream. */
  filterKey: string;
  items: FeedItemSummary[];
  page: number;
}

/** 同一份筛选的第 N 页；第 1 页就是服务端已给的首屏。 */
function poolPath(filters: PoolResponse["filters"], page: number) {
  return listPath("/api/site/pool", {
    channel: filters.channel === "all" ? null : filters.channel,
    category: filters.category,
    tag: filters.tag,
    kind: filters.changeKind,
    uncat: filters.uncategorized ? "1" : null,
    q: filters.q,
    tab: filters.q && filters.tab === "relevance" ? "relevance" : null,
    page: page > 1 ? page : null,
  });
}

export function StreamDayList({ initial }: { initial: PoolResponse }) {
  const location = useLocation();
  const navigation = useNavigation();
  const historyKey = location.key;
  const filterKey = poolPath(initial.filters, 1);
  const pageCount = Math.max(1, Math.min(initial.pageCount, MAX_PAGE));
  const firstPage = Math.max(1, Math.min(initial.page, pageCount));

  // 客户端返回（history 里已有这份列表）：首帧就是恢复后的列表，服务端渲染的首屏与它无关。
  const [state, setState] = useState<StreamState>(() => {
    if (isHydrated()) {
      const snap = readSnapshot<StreamState>(historyKey);
      if (snap?.data.version === 1 && snap.data.filterKey === filterKey) return snap.data;
    }
    return { version: 1, filterKey, items: initial.items, page: firstPage };
  });
  const stateRef = useRef(state);
  stateRef.current = state;
  const filterKeyRef = useRef(filterKey);
  const request = useRef<AbortController | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => () => request.current?.abort(), []);

  // 筛选变了：取消还在路上的下一页，换到新的一份流。回到看过的筛选（前进/后退）时恢复那一份。
  useLayoutEffect(() => {
    if (filterKeyRef.current === filterKey) return;
    filterKeyRef.current = filterKey;
    request.current?.abort();
    request.current = null;
    setLoading(false);
    setError(false);
    const snap = readSnapshot<StreamState>(historyKey);
    if (snap?.data.version === 1 && snap.data.filterKey === filterKey) {
      setState(snap.data);
      restoreAnchor(snap.anchor, snap.scrollY);
      return;
    }
    setState({ version: 1, filterKey, items: initial.items, page: firstPage });
  }, [filterKey, initial, historyKey, firstPage]);

  // 同一份筛选重新拿到首屏（重试、同一入口再点一次）：从新的页头重来。
  const lastInitial = useRef({ initial, filterKey });
  useLayoutEffect(() => {
    const prev = lastInitial.current;
    lastInitial.current = { initial, filterKey };
    if (prev.initial === initial || prev.filterKey !== filterKey) return;
    request.current?.abort();
    request.current = null;
    setLoading(false);
    setError(false);
    setState({ version: 1, filterKey, items: initial.items, page: firstPage });
  }, [initial, filterKey, firstPage]);

  // 整页加载（含后退到本条目后整页重载）：hydration 后恢复已读出的页和位置；读者刷新则看最新的页头。
  const restored = useRef(false);
  useLayoutEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const snap = readSnapshot<StreamState>(historyKey);
    if (snap?.data.version !== 1 || snap.data.filterKey !== filterKey) return;
    if (!isHydrated()) {
      if (isReload()) return;
      setState(snap.data);
      requestAnimationFrame(() => restoreAnchor(snap.anchor, snap.scrollY));
      return;
    }
    restoreAnchor(snap.anchor, snap.scrollY);
  }, [historyKey, filterKey]);

  // 离开这个 history entry 时把已读出的页和位置存下来。
  useEffect(() => {
    if (navigation.state === "loading" && navigation.location && navigation.location.key !== historyKey) {
      saveSnapshot(historyKey, stateRef.current);
    }
  }, [navigation.state, navigation.location, historyKey]);
  useSaveOnLeave(historyKey, () => stateRef.current);

  const hasMore = state.page < pageCount;
  const loadMore = useCallback(async () => {
    const current = stateRef.current;
    if (request.current || current.page >= pageCount) return;
    const next = current.page + 1;
    const key = filterKeyRef.current;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(false);
    const mine = () => filterKeyRef.current === key && !controller.signal.aborted;
    try {
      const res = await fetch(poolPath(initial.filters, next), { signal: controller.signal, headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(String(res.status));
      const page = (await res.json()) as PoolResponse;
      if (!mine()) return;
      setState((prev) => {
        if (prev.filterKey !== key) return prev;
        // 新条目可能在翻页时插到页头，让旧条目滑到下一页：按 id 去重，不重复画。
        const seen = new Set(prev.items.map((item) => item.id));
        const added = page.items.filter((item) => !seen.has(item.id));
        return { ...prev, items: added.length ? [...prev.items, ...added] : prev.items, page: Math.min(page.page, pageCount) };
      });
    } catch {
      if (mine()) setError(true);
    } finally {
      if (request.current === controller) {
        request.current = null;
        setLoading(false);
      }
    }
  }, [initial.filters, pageCount]);

  // 哨兵进到视口下方 800px 内就自动读下一页；失败后停下，把继续的动作交给重试文字。
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || loading || error) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore();
    }, { rootMargin: "800px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, error, loadMore, state.page]);

  return (
    <div>
      <DayList items={state.items} collapsible />
      <div ref={sentinel} aria-hidden="true" />
      {(loading || error || !hasMore) && state.items.length > 0 && (
        <div className="fx-stream-end" role="status">
          {loading ? (
            <>
              <RingMark className="fx-stream-mark" spinning /> 正在加载
            </>
          ) : error ? (
            <button type="button" onClick={() => void loadMore()} className="fx-stream-retry">
              加载失败，点此重试
            </button>
          ) : (
            "已经到底了"
          )}
        </div>
      )}
    </div>
  );
}
