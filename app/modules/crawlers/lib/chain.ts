// 降级链：一个适配器按顺序跑若干级，任一级成功即停止；每一级的结果（成功/失败/跳过/耗时/错误）
// 都带回去落库，后台才能显示「这次是靠 Tier 0 拿到的」还是「降级到 Tier 1 了」。
//
// 结构参考 feedgrab 的 Open API → Playwright → 内部导出 API → Jina 分层，但不抄它的代码。

/** 一级：名字 + 实际抓取函数。没有实现的层级 available=false，链会跳过并记录为 skipped。 */
export interface Tier<T> {
  name: string;
  /** false 的层级不执行（占位），后台标「降级未启用」。 */
  available: boolean;
  /** 这一级靠什么拿数据，后台悬停显示。 */
  note?: string;
  run: () => Promise<T>;
}

/** 推进 ingest 的一条（只列 ingest 认的字段；适配器可以带更多字段）。 */
export interface CrawlItem {
  title: string;
  url: string;
  publishedAt?: string;
  author?: string;
  raw?: Record<string, unknown>;
}

/**
 * 一次抓取的成功结果：要推进 ingest 的条目 + 这次实际观测到的数量。
 * 「观测到」和「推送」分开：定价 diff 首次只存快照不推，观测到 5 个套餐、推送 0 条，仍是成功。
 */
export interface CrawlResult {
  items: CrawlItem[];
  observed: number;
  /** 观测单位，后台「条数」列显示：「条」「套餐」。 */
  unit: string;
}

/** 一个适配器 = 一个源 + 一条按顺序尝试的降级链。 */
export interface Adapter<T> {
  id: string;
  name: string;
  description: string;
  /** 推进 ingest 时用的 sourceId / sourceName。 */
  sourceId: string;
  sourceName: string;
  /** 观测单位，后台「条数」列显示：「条」「套餐」。 */
  unit: string;
  tiers: Array<Tier<T>>;
  /** 把命中那一级的结果转成 ingest 条目 + 观测数量。 */
  toCrawlResult: (value: T) => CrawlResult;
}

/** 某一级的执行结果。value 只在成功的那一级带着数据，供 runner 推送。 */
export interface TierResult<T> {
  tier: Tier<T>;
  ok: boolean;
  skipped: boolean;
  durationMs: number;
  value: T | null;
  error: string | null;
}

export interface ChainResult<T> {
  ok: boolean;
  /** 成功那一级返回的数据；全部失败为 null。 */
  value: T | null;
  /** 命中的层级；全部失败为 null。 */
  hit: Tier<T> | null;
  /** 整条链的耗时。 */
  durationMs: number;
  tiers: Array<TierResult<T>>;
}

const ms = (started: number) => Math.max(0, Math.round(performance.now() - started));

/** 按顺序执行；成功即停，后续层级不执行（记录为 skipped）。任何异常都只影响当前层，继续降级。 */
export async function runChain<T>(adapter: Adapter<T>): Promise<ChainResult<T>> {
  const started = performance.now();
  const tiers: Array<TierResult<T>> = [];
  for (const tier of adapter.tiers) {
    if (!tier.available) {
      tiers.push({ tier, ok: false, skipped: true, durationMs: 0, value: null, error: null });
      continue;
    }
    const at = performance.now();
    try {
      const value = await tier.run();
      tiers.push({ tier, ok: true, skipped: false, durationMs: ms(at), value, error: null });
      return { ok: true, value, hit: tier, durationMs: ms(started), tiers };
    } catch (error) {
      tiers.push({ tier, ok: false, skipped: false, durationMs: ms(at), value: null, error: errorMessage(error) });
    }
  }
  return { ok: false, value: null, hit: null, durationMs: ms(started), tiers };
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").trim().slice(0, 500) || "unknown error";
}
