// 运行器：跑一条适配器的降级链 → 成功则把条目推进框架的 ingest → 结果写 crawler_runs。
// 不直接写 articles / publications：入库沿用 ingestItems（也就是 POST /api/ingest/items 的同一段代码），
// 定时任务在 worker 进程里跑，没有自己的 HTTP 地址，所以按函数复用而不是再发一次网络请求。
import { ingestItems } from "@aihot/backend/ingest/items";
import { runChain, type Adapter, type ChainResult, type CrawlItem } from "./lib/chain.ts";
import { saveRun } from "./store.ts";
import type { CrawlerPreviewResult, CrawlerRunView, CrawlerTierRun } from "./types.ts";

const running = new Set<string>();

const message = (error: unknown) => {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/\s+/g, " ").trim().slice(0, 500) || "unknown error";
};

function lastError<T>(result: ChainResult<T>): string {
  const failed = [...result.tiers].reverse().find((tier) => !tier.ok && !tier.skipped);
  return failed?.error ?? "所有抓取层级都失败了";
}

/** 每一级都落一条结果：执行过的带成功/失败与耗时；成功之后没轮到的，记 skipped（不是失败）。 */
function tierRuns<T>(adapter: Adapter<T>, chain: ChainResult<T>): CrawlerTierRun[] {
  const observedOf = (value: T | null) => {
    if (value === null) return 0;
    try {
      return adapter.toCrawlResult(value).observed;
    } catch {
      return 0;
    }
  };
  const ran = new Map(chain.tiers.map((tier) => [tier.tier, tier]));
  return adapter.tiers.map((tier) => {
    const result = ran.get(tier);
    if (!result) return { name: tier.name, ok: false, skipped: true, durationMs: 0, items: 0, error: null };
    return {
      name: tier.name,
      ok: result.ok,
      skipped: result.skipped,
      durationMs: result.durationMs,
      items: observedOf(result.value),
      error: result.error,
    };
  });
}

/**
 * 试抓：只跑降级链、拿结果给人看；不推进 ingest、不写快照、不写运行记录。
 * 后台新建/编辑时的「试抓一次」用这个；预览失败也要如实返回每一级的结果。
 */
export async function previewAdapter(adapter: Adapter<unknown>): Promise<CrawlerPreviewResult> {
  const startedMs = performance.now();
  let chain: ChainResult<unknown>;
  try {
    chain = await runChain(adapter);
  } catch (error) {
    return {
      ok: false, error: message(error), observed: 0, unit: adapter.unit, durationMs: Math.round(performance.now() - startedMs),
      items: [], tiers: adapter.tiers.map((tier) => ({ name: tier.name, ok: false, skipped: true, durationMs: 0, items: 0, error: null })),
    };
  }
  let ok = chain.ok;
  let error: string | null = ok ? null : lastError(chain);
  let payload: { items: CrawlItem[]; observed: number; unit: string } = { items: [], observed: 0, unit: adapter.unit };
  if (ok && chain.value !== null) {
    try {
      payload = adapter.toCrawlResult(chain.value);
    } catch (cause) {
      ok = false;
      error = message(cause);
    }
  }
  if (ok && payload.observed === 0) {
    ok = false;
    error = "抓取成功但没有解析出任何条目";
  }
  const durationMs = Math.max(0, Math.round(performance.now() - startedMs));
  return {
    ok,
    error,
    observed: payload.observed,
    unit: payload.unit || adapter.unit,
    durationMs,
    items: payload.items.slice(0, 5).map((item) => ({ title: item.title, url: item.url, publishedAt: item.publishedAt ?? null })),
    tiers: tierRuns(adapter, chain),
  };
}

/**
 * 跑一个适配器。同一个进程里同一个适配器不并发（后台连点两次只会跑一次）；
 * 跨进程（api 手动 + worker 定时）的事件由数据库记录各自保留，后台按时间看得到。
 */
export async function runAdapter<T>(adapter: Adapter<T>, triggerKind: "manual" | "schedule"): Promise<CrawlerRunView> {
  if (running.has(adapter.id)) throw Object.assign(new Error("这个适配器正在运行，请稍后再试。"), { statusCode: 409 });
  running.add(adapter.id);
  const startedAt = new Date();
  const startedMs = performance.now();
  try {
    const chain = await runChain(adapter);
    let ok = chain.ok;
    let error: string | null = ok ? null : lastError(chain);
    let payload: { items: CrawlItem[]; observed: number; unit: string } = { items: [], observed: 0, unit: "" };
    let created = 0;

    if (ok && chain.value !== null) {
      try {
        payload = adapter.toCrawlResult(chain.value);
      } catch (cause) {
        ok = false;
        error = message(cause);
      }
    }
    if (ok && payload.observed === 0) {
      ok = false;
      error = "抓取成功但没有解析出任何条目";
    }
    if (ok && payload.items.length > 0) {
      try {
        const result = await ingestItems({
          sourceId: adapter.sourceId,
          sourceName: adapter.sourceName,
          items: payload.items.map((item) => ({ title: item.title, url: item.url, publishedAt: item.publishedAt, author: item.author, raw: item.raw })),
        });
        created = result.created;
      } catch (cause) {
        ok = false;
        error = message(cause);
      }
    }

    const finishedAt = new Date();
    const durationMs = Math.max(0, Math.round(performance.now() - startedMs));
    const tiers = tierRuns(adapter, chain);
    const tier = chain.hit?.name ?? null;
    await saveRun({ adapter: adapter.id, startedAt, finishedAt, ok, tier, items: payload.observed, created, durationMs, triggerKind, error, tiers });
    return {
      adapter: adapter.id,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      ok,
      tier,
      items: payload.observed,
      created,
      durationMs,
      triggerKind,
      error,
      tiers,
    };
  } finally {
    running.delete(adapter.id);
  }
}
