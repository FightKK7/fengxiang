// 抓取器模块自己的数据：抓取器定义（crawler_adapters）、运行记录（crawler_runs）、抓取快照
// （crawler_snapshots）、目标信源与失败计数。只动模块自己的表，不碰框架的 articles / publications。
import { randomBytes } from "node:crypto";
import { sql } from "@aihot/backend/db";
import type { CrawlerRunView, CrawlerSourceView, CrawlerTierRun } from "./types.ts";

/** 一条抓取器定义（crawler_adapters 一行 + 目标信源的当前状态）。 */
export interface AdapterRow {
  id: string;
  name: string;
  template: string;
  source_id: string;
  url: string;
  config: Record<string, string | number>;
  enabled: boolean;
  source_name: string | null;
  source_enabled: boolean | null;
  created_at: Date;
  updated_at: Date;
}

/** 新建抓取器时要写进去的字段；id 由 store 生成。 */
export interface AdapterInput {
  name: string;
  template: string;
  sourceId: string;
  url: string;
  config: Record<string, string | number>;
  enabled: boolean;
}

interface AdapterDbRow {
  id: string;
  name: string;
  template: string;
  source_id: string;
  url: string;
  config: unknown;
  enabled: boolean;
  source_name: string | null;
  source_enabled: boolean | null;
  created_at: Date;
  updated_at: Date;
}

function toAdapter(row: AdapterDbRow): AdapterRow {
  const config = row.config && typeof row.config === "object" && !Array.isArray(row.config) ? (row.config as Record<string, string | number>) : {};
  return { ...row, config };
}

/** 列定义；查询处各自拼 WHERE deleted_at IS NULL（片段里不能再带 WHERE）。 */
const SELECT_ADAPTER = sql`
  SELECT a.id, a.name, a.template, a.source_id, a.url, a.config, a.enabled, a.created_at, a.updated_at,
         s.name AS source_name, s.enabled AS source_enabled
  FROM crawler_adapters a LEFT JOIN sources s ON s.id = a.source_id`;

/** 原来写死在代码里的两个抓取器：首次启动时补进表；软删除过的不再复活（ON CONFLICT 不动已有行）。 */
let seeded = false;
async function ensureDefaults(): Promise<void> {
  if (seeded) return;
  const existing = await sql<{ id: string }[]>`SELECT id FROM crawler_adapters LIMIT 1`;
  if (existing.length === 0) {
    const defaults = [
      { id: "feishu-changelog", name: "飞书功能变化", source: "feishu-changelog", url: "https://www.feishu.cn/hc/zh-CN/articles/360043073734", config: { months: 3 } },
      { id: "feishu-pricing", name: "飞书定价", source: "feishu-pricing", url: "https://www.feishu.cn/pricing", config: {} },
    ];
    for (const item of defaults) {
      // 目标信源还没建（全新环境）就先不补：外键要求源存在，后台「信源」页建好后重启/刷新会补上。
      await sql`
        INSERT INTO crawler_adapters (id, name, template, source_id, url, config, enabled)
        SELECT ${item.id}, ${item.name}, ${item.id}, ${item.source}, ${item.url}, ${sql.json(item.config as never)}, true
        WHERE EXISTS (SELECT 1 FROM sources WHERE id = ${item.source})
        ON CONFLICT (id) DO NOTHING`;
    }
  }
  seeded = true;
}

export async function listAdapters(): Promise<AdapterRow[]> {
  await ensureDefaults();
  const rows = await sql<AdapterDbRow[]>`${SELECT_ADAPTER} WHERE a.deleted_at IS NULL ORDER BY a.name, a.id`;
  return rows.map(toAdapter);
}

export async function getAdapter(id: string): Promise<AdapterRow | null> {
  const [row] = await sql<AdapterDbRow[]>`${SELECT_ADAPTER} WHERE a.id = ${id} AND a.deleted_at IS NULL`;
  return row ? toAdapter(row) : null;
}

/** 新建：id 用「模板-随机串」，人一眼能看出用的哪种抓法；冲突时重试一次。 */
export async function createAdapter(input: AdapterInput): Promise<AdapterRow> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const id = `${input.template}-${randomBytes(3).toString("hex")}`;
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO crawler_adapters (id, name, template, source_id, url, config, enabled)
      VALUES (${id}, ${input.name}, ${input.template}, ${input.sourceId}, ${input.url}, ${sql.json(input.config as never)}, ${input.enabled})
      ON CONFLICT (id) DO NOTHING RETURNING id`;
    if (row) return (await getAdapter(row.id))!;
  }
  throw Object.assign(new Error("生成抓取器编号失败，请重试。"), { statusCode: 500 });
}

/** 修改：name / 目标信源 / 页面地址 / 模板参数 / 启停；模板本身不可改（换抓法要新建一条）。 */
export async function updateAdapter(id: string, input: Omit<AdapterInput, "template">): Promise<AdapterRow | null> {
  const rows = await sql<{ id: string }[]>`
    UPDATE crawler_adapters
    SET name = ${input.name}, source_id = ${input.sourceId}, url = ${input.url},
        config = ${sql.json(input.config as never)}, enabled = ${input.enabled}, updated_at = now()
    WHERE id = ${id} RETURNING id`;
  return rows.length ? getAdapter(id) : null;
}

/** 删除：软删除（列表不再显示、不再运行）；快照保留，重新建同 id 不存在，历史运行记录仍可追溯。 */
export async function deleteAdapter(id: string): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    UPDATE crawler_adapters SET deleted_at = now(), enabled = false, updated_at = now()
    WHERE id = ${id} AND deleted_at IS NULL RETURNING id`;
  return rows.length > 0;
}

/** 目标信源下拉项（已登记的信源，含停用；停用的也能绑定，只是运行会被拒）。 */
export async function allSources(): Promise<CrawlerSourceView[]> {
  const rows = await sql<{ id: string; name: string; enabled: boolean }[]>`
    SELECT id, name, enabled FROM sources ORDER BY enabled DESC, name`;
  return rows.map((row) => ({ id: row.id, name: row.name, enabled: row.enabled }));
}

export interface CrawlerRunRecord {
  adapter: string;
  startedAt: Date;
  finishedAt: Date;
  ok: boolean;
  tier: string | null;
  items: number;
  created: number;
  durationMs: number;
  triggerKind: "manual" | "schedule";
  error: string | null;
  tiers: CrawlerTierRun[];
}

interface RunRow {
  adapter: string;
  started_at: Date;
  finished_at: Date;
  ok: boolean;
  tier: string | null;
  items: number;
  created: number;
  duration_ms: number;
  trigger_kind: string;
  error: string | null;
  tiers: unknown;
}

export async function saveRun(run: CrawlerRunRecord): Promise<void> {
  await sql`
    INSERT INTO crawler_runs (adapter, started_at, finished_at, ok, tier, items, created, duration_ms, trigger_kind, error, tiers)
    VALUES (${run.adapter}, ${run.startedAt}, ${run.finishedAt}, ${run.ok}, ${run.tier}, ${run.items}, ${run.created},
            ${run.durationMs}, ${run.triggerKind}, ${run.error}, ${sql.json(run.tiers as never)})`;
}

function tiersOf(raw: unknown): CrawlerTierRun[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value): CrawlerTierRun[] => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    return [{
      name: typeof row.name === "string" ? row.name : "",
      ok: row.ok === true,
      skipped: row.skipped === true,
      durationMs: Number(row.durationMs) || 0,
      items: Number(row.items) || 0,
      error: typeof row.error === "string" ? row.error : null,
    }];
  });
}

function toView(row: RunRow): CrawlerRunView {
  return {
    adapter: row.adapter,
    startedAt: row.started_at.toISOString(),
    finishedAt: row.finished_at.toISOString(),
    ok: row.ok,
    tier: row.tier,
    items: Number(row.items) || 0,
    created: Number(row.created) || 0,
    durationMs: Number(row.duration_ms) || 0,
    triggerKind: row.trigger_kind === "schedule" ? "schedule" : "manual",
    error: row.error,
    tiers: tiersOf(row.tiers),
  };
}

/** 每个抓取器最近一次运行。 */
export async function latestRuns(): Promise<Map<string, CrawlerRunView>> {
  const rows = await sql<RunRow[]>`
    SELECT DISTINCT ON (adapter) adapter, started_at, finished_at, ok, tier, items, created, duration_ms, trigger_kind, error, tiers
    FROM crawler_runs ORDER BY adapter, started_at DESC`;
  return new Map(rows.map((row) => [row.adapter, toView(row)]));
}

/** 每个抓取器最近一次失败的错误（不一定来自最近一次运行）。 */
export async function latestErrors(): Promise<Map<string, string>> {
  const rows = await sql<{ adapter: string; error: string }[]>`
    SELECT DISTINCT ON (adapter) adapter, error
    FROM crawler_runs WHERE NOT ok AND error IS NOT NULL
    ORDER BY adapter, started_at DESC`;
  return new Map(rows.map((row) => [row.adapter, row.error]));
}

/** 某个抓取器最近的运行记录（编辑对话框里看历史）。 */
export async function recentRuns(adapter: string, limit = 5): Promise<CrawlerRunView[]> {
  const rows = await sql<RunRow[]>`
    SELECT adapter, started_at, finished_at, ok, tier, items, created, duration_ms, trigger_kind, error, tiers
    FROM crawler_runs WHERE adapter = ${adapter} ORDER BY started_at DESC LIMIT ${limit}`;
  return rows.map(toView);
}

/** 最近一次运行失败的抓取器数（后台导航红点）：只算仍存在的抓取器。 */
export async function failingAdapters(): Promise<number> {
  const [row] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM (
      SELECT DISTINCT ON (r.adapter) r.ok FROM crawler_runs r
      JOIN crawler_adapters a ON a.id = r.adapter AND a.deleted_at IS NULL
      ORDER BY r.adapter, r.started_at DESC
    ) latest WHERE NOT ok`;
  return row?.n ?? 0;
}

export interface CrawlerSnapshot {
  data: unknown;
  capturedAt: Date;
}

/** 抓取器上次保存的快照（定价 diff 用）。没有就是第一次运行。 */
export async function loadSnapshot(adapter: string): Promise<CrawlerSnapshot | null> {
  const [row] = await sql<{ data: unknown; captured_at: Date }[]>`
    SELECT data, captured_at FROM crawler_snapshots WHERE adapter = ${adapter}`;
  return row ? { data: row.data, capturedAt: row.captured_at } : null;
}

/** 保存本次快照；首次只存不推，有变化推完后再存新快照。 */
export async function saveSnapshot(adapter: string, data: unknown): Promise<void> {
  await sql`
    INSERT INTO crawler_snapshots (adapter, data, captured_at, updated_at)
    VALUES (${adapter}, ${sql.json(data as never)}, now(), now())
    ON CONFLICT (adapter) DO UPDATE SET data = EXCLUDED.data, captured_at = EXCLUDED.captured_at, updated_at = now()`;
}

/** 源是否启用；null = 库里没有这个源。手动运行前要问这一句，停用的源不再允许 force 采集。 */
export async function sourceEnabled(sourceId: string): Promise<boolean | null> {
  const [row] = await sql<{ enabled: boolean }[]>`SELECT enabled FROM sources WHERE id = ${sourceId}`;
  return row ? row.enabled : null;
}
