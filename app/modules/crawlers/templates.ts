// 抓取模板注册表：模板 = 「用哪种抓法」（内嵌 JSON / 浏览器渲染 + 快照 diff），代码里实现；
// 一条抓取器 = 模板 + 名称、目标信源、页面地址、模板参数、启停（存 crawler_adapters，可在后台增删改）。
// 加一种新抓法 = 在这个目录加模板文件 + 这里加一行；后台的新建对话框自动多一个选项。
import type { Adapter } from "./lib/chain.ts";
import type { AdapterRow } from "./store.ts";
import type { CrawlerTemplateView } from "./types.ts";
import { feishuChangelog } from "./adapters/feishu.ts";
import { feishuPricing } from "./adapters/feishu-pricing.ts";

export interface BuildOptions {
  /** 试抓：允许模板跳过写快照等副作用（预览不落库）。 */
  preview?: boolean;
}

export interface AdapterTemplate extends CrawlerTemplateView {
  /** 校验并收拢模板参数（表单传来的都是字符串，这里转成要存的形状）。 */
  config(input: unknown): Record<string, string | number>;
  /** 用一条抓取器定义造出可运行的适配器。 */
  build(row: AdapterRow, options?: BuildOptions): Adapter<unknown>;
}

export const TEMPLATES: AdapterTemplate[] = [feishuChangelog, feishuPricing];

export function templateOf(id: string): AdapterTemplate | null {
  return TEMPLATES.find((template) => template.id === id) ?? null;
}

/** 给后台新建/编辑对话框的模板清单（不含函数）。 */
export function templateViews(): CrawlerTemplateView[] {
  return TEMPLATES.map(({ id, name, about, url, sourceId, unit, tiers, fields }) => ({
    id, name, about, url, sourceId, unit, tiers: tiers.map((tier) => ({ ...tier })), fields: [...fields],
  }));
}


/** 把一条抓取器定义造出可运行的适配器（模板缺失时抛错，由调用方报清楚）。 */
export function buildAdapter(row: AdapterRow, options?: BuildOptions): Adapter<unknown> {
  const template = templateOf(row.template);
  if (!template) throw Object.assign(new Error(`抓取器 ${row.id} 的模板 ${row.template} 已不在代码里。`), { statusCode: 500 });
  return template.build(row, options);
}
