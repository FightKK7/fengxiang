// 筛选计数的共享类型（非 server 模块）：页面组件与 loader 都用它，避免把 server 代码带进客户端包。
export type TabCounts = Record<string, number | null>;

/** 分类 tab（含未分类、一手）与变更类型 tab 的条数。 */
export interface TabCountData {
  categories: TabCounts;
  kinds: TabCounts;
}
