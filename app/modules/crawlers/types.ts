// 抓取器模块的共享类型：后端（server.ts / runner.ts / store.ts）与后台页（web/admin-crawlers.tsx）共用。
// 只放类型，不放运行时依赖：后台页可以 import type，不把后端代码带进浏览器。

/** 降级链里的一级，后台展示用。 */
export interface CrawlerTierView {
  name: string;
  /** false：这一级还是占位，没有实现，界面标「降级未启用」。 */
  available: boolean;
  /** 一两句话说明这一级靠什么，后台鼠标悬停可见。 */
  note?: string;
}

/** 一次运行里某一级的结果：成功/失败/跳过、耗时、错误、这一级返回的条数。 */
export interface CrawlerTierRun {
  name: string;
  ok: boolean;
  /** 前一级成功后不再执行，或这一级没有实现：记录为跳过，不算失败。 */
  skipped: boolean;
  durationMs: number;
  items: number;
  error: string | null;
}

/** 一次完整的抓取器运行记录（crawler_runs 一行）。 */
export interface CrawlerRunView {
  adapter: string;
  startedAt: string;
  finishedAt: string;
  /** 抓取 + 推送整条链路是否成功。 */
  ok: boolean;
  /** 命中的那一级；全部失败时为 null。 */
  tier: string | null;
  /** 解析出的条目数。 */
  items: number;
  /** ingest 新建的条目数；重复运行为 0。 */
  created: number;
  durationMs: number;
  /** "manual"（后台按钮）或 "schedule"（定时任务）。 */
  triggerKind: "manual" | "schedule";
  error: string | null;
  /** 每一级都记录，含未执行的占位级。 */
  tiers: CrawlerTierRun[];
}

/** 抓取模板的一个可配参数（新建/编辑表单按这个渲染，不写死在页面里）。 */
export interface CrawlerTemplateField {
  key: string;
  label: string;
  kind: "number" | "text";
  value: string;
  min?: number;
  max?: number;
  hint?: string;
}

/** 代码里注册的抓取模板：决定「用哪种抓法」，实例化成一条抓取器。 */
export interface CrawlerTemplateView {
  id: string;
  name: string;
  /** 一句话给新建对话框用：这个模板抓什么、靠什么抓。 */
  about: string;
  /** 默认页面地址。 */
  url: string;
  /** 默认目标信源。 */
  sourceId: string;
  /** 观测单位，后台「条数」列显示：「条」「套餐」。 */
  unit: string;
  /** 这个模板的降级链（后台展示用；available=false 标「降级未启用」）。 */
  tiers: CrawlerTierView[];
  /** 可配字段（JSON 化后存 config）。 */
  fields: CrawlerTemplateField[];
}

/** 目标信源下拉项。 */
export interface CrawlerSourceView {
  id: string;
  name: string;
  enabled: boolean;
}

/** 后台表格的一行：抓取器定义 + 最近一次运行 + 最近错误 + 最近几次运行。 */
export interface CrawlerAdapterView {
  id: string;
  name: string;
  /** 模板 id（创建后不可改）。 */
  template: string;
  templateName: string;
  sourceId: string;
  sourceName: string | null;
  url: string;
  config: Record<string, string | number>;
  /** 抓取器自己的启停；停用后定时任务和手动运行都跳过。 */
  enabled: boolean;
  /** 目标信源是否启用；null = 库里没有这个源。源停用时手动运行被拒绝。 */
  sourceEnabled: boolean | null;
  /** 观测单位，后台「条数」列显示：「条」「套餐」。 */
  unit: string;
  tiers: CrawlerTierView[];
  lastRun: CrawlerRunView | null;
  /** 最近一次失败的错误（不一定来自最近一次运行）。 */
  lastError: string | null;
  /** 最近 5 次运行，编辑时看历史用。 */
  recentRuns: CrawlerRunView[];
}

/** GET /api/admin/crawlers：后台「抓取器」页的数据。 */
export interface CrawlerOverview {
  adapters: CrawlerAdapterView[];
  templates: CrawlerTemplateView[];
  sources: CrawlerSourceView[];
  generatedAt: string;
}

/** POST/PATCH 创建或修改一条抓取器。 */
export interface CrawlerSaveInput {
  name: string;
  template: string;
  sourceId: string;
  url: string;
  config: Record<string, string | number>;
  enabled: boolean;
}

/** POST /api/admin/crawlers/:id/preview：试抓一次（不推送、不写快照、不写运行记录）。 */
export interface CrawlerPreviewResult {
  ok: boolean;
  error: string | null;
  /** 观测到的条数/套餐数。 */
  observed: number;
  unit: string;
  durationMs: number;
  /** 本次会推送的条目（只给前 5 条看形状）。 */
  items: Array<{ title: string; url: string; publishedAt: string | null }>;
  tiers: CrawlerTierRun[];
}

/** 一次「全部运行」里单个抓取器的结果。 */
export interface CrawlerRunAllItem {
  adapter: string;
  name: string;
  ok: boolean;
  /** 停用/源停用：跳过，不算失败。 */
  skipped: boolean;
  created: number;
  error: string | null;
}

/** POST /api/admin/crawlers/run-all：全部运行的结果。 */
export interface CrawlerRunAllView {
  results: CrawlerRunAllItem[];
  failed: number;
}
