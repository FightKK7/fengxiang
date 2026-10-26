// 抓取器模块的后端插口（site/modules/server.ts 安装）：
//   - 后台接口：抓取器的增删改查 + 试抓 + 立即运行 / 全部运行（见 docs/crawlers-module.md）
//   - 定时任务：每 6 小时跑一遍启用的抓取器（worker 的 cron 队列）
// 抓取器定义存模块自己的 crawler_adapters；只写模块自己的 crawler_runs / crawler_snapshots，
// 条目入库走框架的 ingestItems（POST /api/ingest/items 的同一实现）。
import type { FastifyReply, FastifyRequest } from "fastify";
import type { ServerModule } from "@aihot/backend/modules";
import { actorOf, sessionPrincipal, type AdminPrincipal } from "@aihot/backend/admin/auth";
import { audit } from "@aihot/backend/audit";
import { sql } from "@aihot/backend/db";
import type { Adapter } from "./lib/chain.ts";
import { previewAdapter, runAdapter } from "./runner.ts";
import { buildAdapter, templateOf, templateViews } from "./templates.ts";
import {
  allSources, createAdapter, deleteAdapter, failingAdapters, getAdapter, latestErrors, latestRuns,
  listAdapters, recentRuns, sourceEnabled, updateAdapter, type AdapterRow,
} from "./store.ts";
import type {
  CrawlerAdapterView, CrawlerOverview, CrawlerRunAllItem, CrawlerRunAllView, CrawlerSaveInput,
} from "./types.ts";

const errorMessage = (error: unknown) => {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/\s+/g, " ").trim().slice(0, 500) || "unknown error";
};

const bad = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });

/** 后台接口的会话与 CSRF 检查（与框架 /api/admin/* 的规则一致，模块路由自己带）。 */
async function allowAdmin(req: FastifyRequest, reply: FastifyReply): Promise<AdminPrincipal | null> {
  reply.header("Cache-Control", "no-store");
  const admin = await sessionPrincipal(req.headers.cookie);
  if (!admin) {
    reply.code(401).type("application/json").send({ detail: "请先登录后台。" });
    return null;
  }
  if (req.method !== "GET" && req.method !== "HEAD" && req.headers["x-csrf-token"] !== admin.csrf) {
    reply.code(403).type("application/json").send({ detail: "缺少或过期的 CSRF token。" });
    return null;
  }
  return admin;
}

const record = (req: FastifyRequest) => (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
const param = (req: FastifyRequest) => (req.params as { id?: string }).id ?? "";

function text(value: unknown, label: string, max = 200): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) throw bad(`请填写${label}。`);
  if (trimmed.length > max) throw bad(`${label}最多 ${max} 个字。`);
  return trimmed;
}

function pageUrl(value: unknown): string {
  const url = text(value, "页面地址", 500);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw bad("页面地址不是合法的链接（要带 http:// 或 https://）。");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw bad("页面地址只支持 http/https。");
  return url;
}

/** 保存时的公共校验：名称、模板、目标信源、地址、模板参数、启停。 */
async function saveInput(input: Record<string, unknown>, templateId: string): Promise<CrawlerSaveInput> {
  const template = templateOf(templateId);
  if (!template) throw bad("没有这个抓取模板。");
  const sources = await allSources();
  const sourceId = text(input.sourceId, "目标信源", 100);
  if (!sources.some((source) => source.id === sourceId)) throw bad("目标信源不存在；先到「信源」页新建。");
  return {
    name: text(input.name, "名称", 40),
    template: template.id,
    sourceId,
    url: pageUrl(input.url ?? template.url),
    config: template.config(input.config),
    enabled: input.enabled === undefined ? true : input.enabled === true,
  };
}

async function viewOf(row: AdapterRow, runs: Map<string, unknown>, errors: Map<string, string>): Promise<CrawlerAdapterView> {
  const template = templateOf(row.template);
  if (!template) throw bad(`抓取器 ${row.id} 的模板 ${row.template} 已不在代码里。`, 500);
  return {
    id: row.id,
    name: row.name,
    template: row.template,
    templateName: template.name,
    sourceId: row.source_id,
    sourceName: row.source_name,
    url: row.url,
    config: row.config,
    enabled: row.enabled,
    sourceEnabled: row.source_enabled,
    unit: template.unit,
    tiers: template.tiers,
    lastRun: (runs.get(row.id) as CrawlerAdapterView["lastRun"]) ?? null,
    lastError: errors.get(row.id) ?? null,
    recentRuns: await recentRuns(row.id, 5),
  };
}

async function overview(): Promise<CrawlerOverview> {
  const [rows, runs, errors, sources] = await Promise.all([listAdapters(), latestRuns(), latestErrors(), allSources()]);
  const adapters = await Promise.all(rows.map((row) => viewOf(row, runs as Map<string, unknown>, errors)));
  return { adapters, templates: templateViews(), sources, generatedAt: new Date().toISOString() };
}

/** 用一条抓取器定义造适配器；模板缺失说明代码回滚了，按 500 报清楚。 */
function adapterOf(row: AdapterRow, preview = false): Adapter<unknown> {
  if (!templateOf(row.template)) throw bad(`抓取器 ${row.id} 的模板 ${row.template} 已不在代码里。`, 500);
  return buildAdapter(row, { preview });
}

export const crawlersServer: ServerModule = {
  name: "crawlers",
  http(app) {
    app.get("/api/admin/crawlers", async (req, reply) => {
      if (!(await allowAdmin(req, reply))) return;
      return overview();
    });

    app.post("/api/admin/crawlers", async (req, reply) => {
      const admin = await allowAdmin(req, reply);
      if (!admin) return;
      try {
        const input = record(req);
        const template = text(input.template, "抓取模板", 100);
        if (!templateOf(template)) throw bad("没有这个抓取模板。");
        const save = await saveInput(input, template);
        const row = await createAdapter(save);
        await audit(actorOf(admin), "crawler.create", `crawler:${row.id}`, typeof input.reason === "string" ? input.reason : null, null, {
          name: save.name, template: save.template, source_id: save.sourceId, url: save.url, enabled: save.enabled, config: save.config,
        });
        return { ok: true, id: row.id };
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode ?? 500;
        req.log.error({ err: error }, "crawler create failed");
        return reply.code(status).type("application/json").send({ detail: errorMessage(error) });
      }
    });

    app.patch("/api/admin/crawlers/:id", async (req, reply) => {
      const admin = await allowAdmin(req, reply);
      if (!admin) return;
      const id = param(req);
      try {
        const before = await getAdapter(id);
        if (!before) return reply.code(404).type("application/json").send({ detail: "没有这个抓取器。" });
        const input = record(req);
        const save = await saveInput(input, before.template);
        const row = await updateAdapter(id, save);
        if (!row) return reply.code(404).type("application/json").send({ detail: "没有这个抓取器。" });
        await audit(actorOf(admin), "crawler.update", `crawler:${id}`, typeof input.reason === "string" ? input.reason : null, {
          name: before.name, source_id: before.source_id, url: before.url, enabled: before.enabled, config: before.config,
        }, { name: save.name, source_id: save.sourceId, url: save.url, enabled: save.enabled, config: save.config });
        return { ok: true, id };
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode ?? 500;
        req.log.error({ err: error }, "crawler update failed");
        return reply.code(status).type("application/json").send({ detail: errorMessage(error) });
      }
    });

    app.delete("/api/admin/crawlers/:id", async (req, reply) => {
      const admin = await allowAdmin(req, reply);
      if (!admin) return;
      const id = param(req);
      try {
        const input = record(req);
        const reason = text(input.reason, "删除原因", 300);
        const before = await getAdapter(id);
        if (!before) return reply.code(404).type("application/json").send({ detail: "没有这个抓取器。" });
        await deleteAdapter(id);
        await audit(actorOf(admin), "crawler.delete", `crawler:${id}`, reason, {
          name: before.name, template: before.template, source_id: before.source_id, url: before.url,
        }, null);
        return { ok: true };
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode ?? 500;
        req.log.error({ err: error }, "crawler delete failed");
        return reply.code(status).type("application/json").send({ detail: errorMessage(error) });
      }
    });

    // 未保存时的试抓：用表单里的模板/地址/参数当场跑一次，不落库（新建对话框用这个）。
    app.post("/api/admin/crawlers/preview", async (req, reply) => {
      if (!(await allowAdmin(req, reply))) return;
      try {
        const input = record(req);
        const templateId = text(input.template, "抓取模板", 100);
        const template = templateOf(templateId);
        if (!template) throw bad("没有这个抓取模板。");
        const row: AdapterRow = {
          id: "preview",
          name: typeof input.name === "string" && input.name.trim() ? input.name.trim().slice(0, 40) : template.name,
          template: templateId,
          source_id: typeof input.sourceId === "string" ? input.sourceId : template.sourceId,
          url: pageUrl(input.url ?? template.url),
          config: template.config(input.config),
          enabled: true,
          source_name: null,
          source_enabled: null,
          created_at: new Date(),
          updated_at: new Date(),
        };
        return await previewAdapter(adapterOf(row, true));
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode ?? 500;
        req.log.error({ err: error }, "crawler preview failed");
        return reply.code(status).type("application/json").send({ detail: errorMessage(error) });
      }
    });

    // 列表页的直接启停：只改 enabled，不要求重填其它字段；进审计，不写运行记录。
    app.patch("/api/admin/crawlers/:id/enabled", async (req, reply) => {
      const admin = await allowAdmin(req, reply);
      if (!admin) return;
      const id = param(req);
      try {
        const before = await getAdapter(id);
        if (!before) return reply.code(404).type("application/json").send({ detail: "没有这个抓取器。" });
        const input = record(req);
        if (typeof input.enabled !== "boolean") throw bad("enabled 必须是 true 或 false。");
        const [row] = await sql`
          UPDATE crawler_adapters SET enabled = ${input.enabled}, updated_at = now()
          WHERE id = ${id} AND deleted_at IS NULL RETURNING id`;
        if (!row) return reply.code(404).type("application/json").send({ detail: "没有这个抓取器。" });
        await audit(actorOf(admin), "crawler.toggle", `crawler:${id}`, null,
          { enabled: before.enabled }, { enabled: input.enabled });
        return { ok: true, enabled: input.enabled };
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode ?? 500;
        req.log.error({ err: error, adapter: id }, "crawler toggle failed");
        return reply.code(status).type("application/json").send({ detail: errorMessage(error) });
      }
    });

    app.post("/api/admin/crawlers/:id/preview", async (req, reply) => {
      if (!(await allowAdmin(req, reply))) return;
      const id = param(req);
      const row = await getAdapter(id);
      if (!row) return reply.code(404).type("application/json").send({ detail: "没有这个抓取器。" });
      try {
        return await previewAdapter(adapterOf(row, true));
      } catch (error) {
        req.log.error({ err: error, adapter: id }, "crawler preview failed");
        return reply.code(500).type("application/json").send({ detail: errorMessage(error) });
      }
    });

    app.post("/api/admin/crawlers/:id/run", async (req, reply) => {
      const admin = await allowAdmin(req, reply);
      if (!admin) return;
      const id = param(req);
      try {
        const row = await getAdapter(id);
        if (!row) return reply.code(404).type("application/json").send({ detail: "没有这个抓取器。" });
        if (!row.enabled) return reply.code(409).type("application/json").send({ detail: "这个抓取器已停用；先启用再运行。" });
        if ((await sourceEnabled(row.source_id)) === false) {
          return reply.code(409).type("application/json").send({ detail: "目标信源已停用；先到「信源」页启用，再运行。" });
        }
        const run = await runAdapter(adapterOf(row), "manual");
        // 手动运行是人工操作，和其他后台写操作一样要留痕（定时任务不写）。
        await audit(actorOf(admin), "crawler.run", `crawler:${id}`, null, null, {
          ok: run.ok, items: run.items, created: run.created, tier: run.tier, error: run.error,
        });
        return { ok: true, run };
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode ?? 500;
        req.log.error({ err: error, adapter: id }, "crawler run failed");
        return reply.code(status).type("application/json").send({ detail: errorMessage(error) });
      }
    });

    app.post("/api/admin/crawlers/run-all", async (req, reply) => {
      const admin = await allowAdmin(req, reply);
      if (!admin) return;
      const results: CrawlerRunAllItem[] = [];
      for (const row of await listAdapters()) {
        const skipped = !row.enabled || row.source_enabled === false;
        if (skipped) {
          results.push({ adapter: row.id, name: row.name, ok: true, skipped: true, created: 0, error: null });
          continue;
        }
        try {
          const run = await runAdapter(adapterOf(row), "manual");
          results.push({ adapter: run.adapter, name: row.name, ok: run.ok, skipped: false, created: run.created, error: run.error });
        } catch (error) {
          results.push({ adapter: row.id, name: row.name, ok: false, skipped: false, created: 0, error: errorMessage(error) });
        }
      }
      const view: CrawlerRunAllView = { results, failed: results.filter((row) => !row.ok).length };
      await audit(actorOf(admin), "crawler.run-all", "crawler:all", null, null, {
        failed: view.failed,
        ran: results.filter((row) => !row.skipped).length,
        skipped: results.filter((row) => row.skipped).length,
      });
      return view;
    });
  },
  admin: {
    // 导航红点：最近一次运行失败的抓取器数（后台「抓取器」入口）。
    counts: { crawlers: failingAdapters },
  },
  schedules: [
    {
      name: "crawlers.run",
      // 每 6 小时：00:07、06:07、12:07、18:07（Asia/Shanghai，见框架 schedules）。
      cron: "7 */6 * * *",
      missed: "once",
      run: async () => {
        const results: Array<{ adapter: string; ok: boolean; skipped: boolean; tier: string | null; items: number; error?: string }> = [];
        for (const row of await listAdapters()) {
          if (!row.enabled || row.source_enabled === false) {
            results.push({ adapter: row.id, ok: true, skipped: true, tier: null, items: 0 });
            continue;
          }
          try {
            const run = await runAdapter(adapterOf(row), "schedule");
            results.push({ adapter: run.adapter, ok: run.ok, skipped: false, tier: run.tier, items: run.items });
          } catch (error) {
            results.push({ adapter: row.id, ok: false, skipped: false, tier: null, items: 0, error: errorMessage(error) });
          }
        }
        return {
          adapters: results.length,
          failed: results.filter((row) => !row.ok).length,
          skipped: results.filter((row) => row.skipped).length,
        };
      },
    },
  ],
};
