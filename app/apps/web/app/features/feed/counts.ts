// 筛选 tab 的条数：同一个 pool 读数按一个 facet 各读一次，只取 total。首页和全部动态共用。
// 这是一个客户端安全的模块：reads 由调用方（loader）传进来，避免把 api.server 带进路由组件。
import { CATEGORY_KEYS } from "@aihot/contracts/taxonomy";
import { CHANGE_KINDS, type ChangeKind, type PoolResponse, type TimelineFilters } from "@aihot/contracts/site";
import { listPath } from "../../lib/seo";
import type { TabCountData, TabCounts } from "./feed-types";


/**
 * 分类 tab 的计数保留变更类型筛选（一道筛选只换一个 facet），变更类型计数保留分类/一手/未分类；
 * 未分类和分类放在一起数，tab 数字加起来正好是全部。读失败的那一项就不显示数字，不让整页失败。
 */
export async function readCounts(read: (path: string) => Promise<PoolResponse>, filters: TimelineFilters, changeKind: ChangeKind | null, uncategorized: boolean): Promise<TabCountData> {
  const base = { tag: filters.tag, q: null, tab: null, page: null, kind: changeKind, uncat: uncategorized ? "1" : null };
  const total = (params: Record<string, string | null>) => read(listPath("/api/site/pool", { ...base, ...params })).then((data) => data.total, () => null);
  const filtered = !!filters.category || filters.channel !== "all" || uncategorized;
  const [categories, uncategorizedCount, firstParty, all, kinds] = await Promise.all([
    Promise.all(CATEGORY_KEYS.map((key) => total({ category: key, channel: null, uncat: null }))),
    total({ category: null, channel: null, uncat: "1" }),
    total({ channel: "firstParty", category: null, uncat: null }),
    filtered ? total({ category: null, channel: null, uncat: null }) : Promise.resolve(null),
    Promise.all(CHANGE_KINDS.map((kind) => total({ kind, category: filters.category, channel: filters.channel, uncat: uncategorized ? "1" : null }))),
  ]);
  const categoryCounts: TabCounts = {};
  CATEGORY_KEYS.forEach((key, i) => {
    categoryCounts[key] = categories[i] ?? null;
  });
  categoryCounts.uncategorized = uncategorizedCount;
  categoryCounts.firstParty = firstParty;
  if (all !== null) categoryCounts.all = all;
  const kindCounts: TabCounts = {};
  CHANGE_KINDS.forEach((kind, i) => {
    kindCounts[kind] = kinds[i] ?? null;
  });
  return { categories: categoryCounts, kinds: kindCounts };
}
