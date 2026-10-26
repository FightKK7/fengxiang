// 飞书定价页抓取模板：静态 HTML 里没有套餐价格（前端渲染），Tier 1 用 Playwright 打开页面，
// 按套餐卡片抽「版本名 + 价格 + 计价单位 + 关键权益」，把整页套餐存成快照，和上次快照 diff：
//   - 首次运行：只存快照，不推（避免把现价当变化）
//   - 无变化：不推（重复运行 created 0）
//   - 有变化：推一条 ingest item，标题如「飞书商业标准版定价从 ¥50 人/月 改为 ¥60 人/月」
//
// DOM 选择器来自 2026-10 实际页面（price-plan-pc__*），不是猜的；页面改版后先在浏览器里核对。
// 页面地址与快照 key 都跟着抓取器实例走（快照 key = 抓取器 id），所以同一模板可以有多个实例。
import type { Locator } from "playwright";
import type { AdapterTemplate } from "../templates.ts";
import { hasBrowser, withPage } from "../lib/browser.ts";
import { loadSnapshot, saveSnapshot } from "../store.ts";
import type { Adapter, CrawlItem } from "../lib/chain.ts";

const DEFAULT_URL = "https://www.feishu.cn/pricing";

export interface PricingPlan {
  /** 版本名：免费版 / 商业标准版 / 商业专业版 / 商业旗舰版 / 企业旗舰版。 */
  name: string;
  /** 价格原文（只保留币种+数字）：「¥0」「¥50」「定制」。 */
  price: string;
  /** 计价单位：「人/月」；企业版为空。 */
  unit: string;
  /** 套餐权益原文，按页面顺序。 */
  features: string[];
  /** 页面上的用户规模说明（「支持 500 用户」「无规模上限」）。 */
  support: string | null;
}

interface Snapshot {
  plans: PricingPlan[];
  capturedAt: string;
}

interface PlanChange {
  kind: "price" | "added" | "removed" | "features";
  plan: string;
  before: string;
  after: string;
}

/** 一次 Tier 1 的结果：套餐快照 + 与上次的差异 + 最终要推的条目（首次/无变化为 null）。 */
export interface PricingTierResult {
  plans: PricingPlan[];
  changes: PlanChange[];
  firstRun: boolean;
  item: CrawlItem | null;
}

const trim = (value: string) => value.replace(/\s+/g, " ").trim();
const priceLabel = (plan: PricingPlan) => (plan.unit ? `${plan.price} ${plan.unit}` : plan.price);

function parsePrice(text: string): { price: string; unit: string } {
  const flat = trim(text);
  const currency = /([¥$€])/.exec(flat)?.[1] ?? "";
  const number = /(\d[\d,.]*)/.exec(flat.replace(/[¥$€]/g, ""))?.[1] ?? "";
  const unit = /(人\/月|人\/年|人\/天|席\/月|席\/年)/.exec(flat)?.[1] ?? "";
  if (flat.includes("定制")) return { price: "定制", unit: "" };
  if (!currency && !number) return { price: "定制", unit: "" };
  return { price: `${currency}${number}`, unit };
}

/** 从一张套餐卡片上抽结构；页面卡片的高度/顺序会变，所以只在卡片内部按类名找。 */
async function readCard(card: Locator): Promise<PricingPlan | null> {
  const name = trim(
    await card
      .locator(".price-plan-pc__plan-free-name, .price-plan-pc__plan-biz-name, .price-plan-pc__plan-enterprise-title")
      .first()
      .innerText()
      .catch(() => ""),
  );
  if (!name) return null;
  const priceWrapper = card.locator("[class*='price-wrapper']").first();
  const priceText = (await priceWrapper.count()) > 0 ? await priceWrapper.innerText().catch(() => "") : "";
  const { price, unit } = parsePrice(priceText);
  const features = (await card.locator(".price-plan-pc__plan-feature-item").allInnerTexts()).map(trim).filter(Boolean);
  const supportText = await card
    .locator(".price-plan-pc__plan-user-support")
    .first()
    .innerText()
    .catch(() => "");
  return { name, price, unit, features, support: trim(supportText) || null };
}

/** 页面上五张套餐卡：免费版在左，商业三档在中间，企业旗舰版在右。 */
async function extractPlans(page: import("playwright").Page): Promise<PricingPlan[]> {
  await page.waitForSelector(".price-plan-pc__plans-wrapper", { timeout: 20_000 });
  const cards: Locator[] = [
    page.locator(".price-plan-pc__plan-free-wrapper"),
    ...(await page.locator(".price-plan-pc__plan-biz-inner-wrapper").all()),
    page.locator(".price-plan-pc__plan-enterprise-wrapper"),
  ].filter((card) => card !== null) as Locator[];
  const plans: PricingPlan[] = [];
  for (const card of cards) {
    if ((await card.count()) === 0) continue;
    const plan = await readCard(card.first());
    if (plan && !plans.some((existing) => existing.name === plan.name)) plans.push(plan);
  }
  return plans;
}

function previousPlans(data: unknown): PricingPlan[] | null {
  if (!data || typeof data !== "object") return null;
  const plans = (data as { plans?: unknown }).plans;
  if (!Array.isArray(plans)) return null;
  const clean = plans.flatMap((plan): PricingPlan[] => {
    if (!plan || typeof plan !== "object") return [];
    const row = plan as unknown as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!name) return [];
    return [{
      name,
      price: typeof row.price === "string" ? row.price : "",
      unit: typeof row.unit === "string" ? row.unit : "",
      features: Array.isArray(row.features) ? row.features.filter((f): f is string => typeof f === "string") : [],
      support: typeof row.support === "string" ? row.support : null,
    }];
  });
  return clean.length ? clean : null;
}

function diffPlans(before: PricingPlan[], after: PricingPlan[]): PlanChange[] {
  const beforeByName = new Map(before.map((plan) => [plan.name, plan]));
  const afterByName = new Map(after.map((plan) => [plan.name, plan]));
  const changes: PlanChange[] = [];
  for (const [name, plan] of afterByName) {
    const old = beforeByName.get(name);
    if (!old) {
      changes.push({ kind: "added", plan: name, before: "", after: priceLabel(plan) });
      continue;
    }
    if (priceLabel(old) !== priceLabel(plan)) {
      changes.push({ kind: "price", plan: name, before: priceLabel(old), after: priceLabel(plan) });
    } else if (JSON.stringify(old.features) !== JSON.stringify(plan.features)) {
      changes.push({ kind: "features", plan: name, before: old.features.join("、"), after: plan.features.join("、") });
    }
  }
  for (const [name, plan] of beforeByName) {
    if (!afterByName.has(name)) changes.push({ kind: "removed", plan: name, before: priceLabel(plan), after: "" });
  }
  return changes;
}

/** 标题优先用 brief 的「飞书<版本>定价从 X 改为 Y」；多档同时变化时给一条汇总。 */
function titleFor(changes: PlanChange[]): string {
  if (changes.length === 1) {
    const change = changes[0]!;
    if (change.kind === "price") return `飞书${change.plan}定价从 ${change.before} 改为 ${change.after}`;
    if (change.kind === "added") return `飞书新增${change.plan}：${change.after}`;
    if (change.kind === "removed") return `飞书下线${change.plan}（原 ${change.before}）`;
    return `飞书${change.plan}权益调整`;
  }
  return `飞书定价调整：${changes[0]!.plan} 等 ${changes.length} 项`;
}

function summaryFor(changes: PlanChange[]): string {
  return changes
    .map((change) => {
      if (change.kind === "added") return `${change.plan}：新增 ${change.after}`;
      if (change.kind === "removed") return `${change.plan}：下线（原 ${change.before}）`;
      if (change.kind === "features") return `${change.plan}：权益调整`;
      return `${change.plan}：${change.before} → ${change.after}`;
    })
    .join("；");
}

function toItem(changes: PlanChange[], pageUrl: string): CrawlItem {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return {
    title: titleFor(changes),
    // 定价页本身不会因为 ?update=… 变化；带上本次运行的时间戳，ingest 才不会把下一次变化按 URL 去重掉。
    url: `${pageUrl}?update=${stamp}`,
    publishedAt: now.toISOString(),
    author: "飞书",
    raw: { _aihot: {}, pricing: { changes } },
  };
}

/** Tier 1：浏览器渲染 → 抽取 → 和上次快照 diff →（非试抓时）存快照 → 返回要不要推。 */
async function browserTier(pageUrl: string, adapterId: string, preview: boolean): Promise<PricingTierResult> {
  const rendered = await withPage(pageUrl, extractPlans, { waitMs: 4500, timeoutMs: 45_000 });
  if (!rendered.ok) {
    throw new Error(rendered.reason === "unavailable" ? `Tier 1 不可用：${rendered.message}` : rendered.message);
  }
  const plans = rendered.value;
  if (plans.length === 0) throw new Error("Tier 1 打开定价页成功，但没有抽到任何套餐（页面可能改版）");

  const previous = await loadSnapshot(adapterId);
  const before = previous ? previousPlans(previous.data) : null;
  const firstRun = !before;
  const changes = before ? diffPlans(before, plans) : [];
  // 试抓不写快照：否则一次「预览」会被当成一次真的运行，下次正式跑就测不出变化。
  if (!preview) await saveSnapshot(adapterId, { plans, capturedAt: new Date().toISOString() } satisfies Snapshot);
  return { plans, changes, firstRun, item: firstRun || changes.length === 0 ? null : toItem(changes, pageUrl) };
}

const ABOUT = "飞书定价页：价格由前端渲染，静态 HTML 拿不到；用浏览器抽套餐，和上次快照比，只推变化。";

export const feishuPricing: AdapterTemplate = {
  id: "feishu-pricing",
  name: "飞书定价",
  about: ABOUT,
  url: DEFAULT_URL,
  sourceId: "feishu-pricing",
  unit: "套餐",
  tiers: [
    { name: "Tier 0 · 静态 HTML", available: false, note: "定价页是前端渲染，静态 HTML 里没有套餐价格" },
    { name: "Tier 1 · 浏览器渲染", available: hasBrowser(), note: "Playwright 打开定价页，按套餐卡片抽价格/单位/权益，和上次快照 diff" },
  ],
  fields: [],
  config(input) {
    const raw = (input ?? {}) as Record<string, unknown>;
    // 目前没有模板参数；保留空对象，和「模板可配」的约定一致。
    return Object.fromEntries(Object.entries(raw).filter(([, value]) => ["string", "number"].includes(typeof value))) as Record<string, string | number>;
  },
  build(row, options) {
    const adapterId = row.id;
    const preview = options?.preview === true;
    const adapter: Adapter<PricingTierResult> = {
      id: row.id,
      name: row.name,
      description: ABOUT,
      sourceId: row.source_id,
      sourceName: row.source_name ?? row.name,
      unit: "套餐",
      tiers: [
        {
          name: "Tier 0 · 静态 HTML",
          available: false,
          note: "定价页是前端渲染，静态 HTML 里没有套餐价格；留给以后的服务端渲染/预渲染方案",
          run: async () => {
            throw new Error("Tier 0 未实现：定价页由前端渲染，静态 HTML 没有价格");
          },
        },
        {
          name: "Tier 1 · 浏览器渲染",
          available: hasBrowser(),
          note: "Playwright 打开定价页，等前端渲染后按 price-plan-pc 套餐卡片抽价格/单位/权益，和上次快照 diff",
          run: () => browserTier(row.url, adapterId, preview),
        },
      ],
      toCrawlResult: (result) => ({ items: result.item ? [result.item] : [], observed: result.plans.length, unit: "套餐" }),
    };
    return adapter as Adapter<unknown>;
  },
};
