// Source administration: list, detail, preview (fetch without storing), edit, create with
// duplicate checks, pause/resume and manual collection. Every change is audited.
import { z } from "zod";
import { SOURCE_DEFAULTS } from "@aihot/site";
import type { AdminSource, AdminSourceBatchResult, AdminSourceCreated, AdminSourceDetail, AdminSourceFetch, AdminSourcePreview, AdminSourceRow, AdminSources, BeforeJson } from "@aihot/contracts/admin";
import { REPLACEABLE_SOURCE_KINDS } from "@aihot/contracts/admin";
import { audit, auditHistory, Conflict } from "../audit.ts";
import { groupingReset } from "../content/provenance.ts";
import { sql, type Db } from "../db.ts";
import { enqueue, QUEUES } from "../jobs/queue.ts";
import { republishKey, requestRepublish } from "../jobs/publication.ts";
import { normalizeUrl } from "../lib/url.ts";
import { serverModules } from "../modules.ts";
import { fetchJsonList } from "../sources/json-list.ts";
import { fetchRss } from "../sources/rss.ts";
import { assertSupportedConfig, UnsupportedConfig } from "../sources/config-keys.ts";
import { collectSource, enrichDetails, listingEntries, storedDetails } from "../sources/collect.ts";
import { filterPublicationWindow } from "../sources/filters.ts";
import { FetchError, type Candidate, type SourceRow } from "../sources/types.ts";
import { fetchWebList } from "../sources/web-list.ts";
import { fetchXSearch } from "../sources/x.ts";
import { xHandle } from "../sources/account.ts";


/** Kinds no listing fetch can preview (their content arrives from the source itself). */
const PREVIEW_UNSUPPORTED_KINDS: Partial<Record<SourceRow["kind"], string>> = { external: "外部上报", mp_account: "公众号" };

export interface SourceListFilters {
  q?: string;
  kind?: string;
  health?: string;
  enabled?: "true" | "false";
  mode?: string;
  page?: number;
}

export async function listSources(f: SourceListFilters): Promise<BeforeJson<AdminSources>> {
  const page = Math.max(1, f.page ?? 1);
  const q = f.q?.trim() ? `%${f.q.trim()}%` : null;
  const [rows, [totals]] = await Promise.all([
    sql<BeforeJson<AdminSourceRow>[]>`
    SELECT s.id, s.name, s.kind, s.tier, s.participation_mode, s.enabled, s.health, s.fail_count, s.interval_minutes,
           s.last_ok_at, s.last_fetch_at, s.last_error, (s.tier = 'T1') AS first_party, s.next_fetch_at, s.updated_at,
           (SELECT count(*)::int FROM articles a WHERE a.source_id = s.id AND a.discovered_at > now() - interval '7 days') AS items_7d,
           (SELECT count(*)::int FROM publications p WHERE p.source_id = s.id AND p.selected AND p.discovered_at > now() - interval '30 days') AS selected_30d
    FROM (
      SELECT * FROM sources
      WHERE (${q}::text IS NULL OR name ILIKE ${q} OR id ILIKE ${q} OR config::text ILIKE ${q})
        AND (${f.kind ?? null}::text IS NULL OR kind = ${f.kind ?? null})
        AND (${f.health ?? null}::text IS NULL
          OR (${f.health ?? null} = 'paused' AND NOT enabled)
          OR (${f.health ?? null} <> 'paused' AND health = ${f.health ?? null}))
        AND (${f.mode ?? null}::text IS NULL OR participation_mode = ${f.mode ?? null})
        AND (${f.enabled ?? null}::text IS NULL OR enabled = (${f.enabled ?? null} = 'true'))
      ORDER BY enabled DESC, CASE health WHEN 'failing' THEN 0 WHEN 'degraded' THEN 1 ELSE 2 END, name, id
      LIMIT 100 OFFSET ${(page - 1) * 100}
    ) s
    ORDER BY s.enabled DESC, CASE s.health WHEN 'failing' THEN 0 WHEN 'degraded' THEN 1 ELSE 2 END, s.name, s.id`,
    sql<{ total: number; enabled: number; paused: number; failing: number; degraded: number }[]>`
    SELECT count(*)::int AS total, count(*) FILTER (WHERE enabled)::int AS enabled,
           count(*) FILTER (WHERE NOT enabled)::int AS paused,
           count(*) FILTER (WHERE health = 'failing')::int AS failing, count(*) FILTER (WHERE health = 'degraded')::int AS degraded
    FROM sources`,
  ]);
  return { page, rows, totals };
}

export async function sourceDetail(id: string): Promise<BeforeJson<AdminSourceDetail> | null> {
  const [source] = await sql<BeforeJson<AdminSource>[]>`SELECT *, (tier = 'T1') AS first_party FROM sources WHERE id = ${id}`;
  if (!source) return null;
  const [runs, items, [stats], history, [republish]] = await Promise.all([
    sql<BeforeJson<AdminSourceDetail["runs"][number]>[]>`SELECT id, started_at, finished_at, status, found_count, new_count, error, detail FROM fetch_runs WHERE source_id = ${id} ORDER BY started_at DESC LIMIT 30`,
    sql<BeforeJson<AdminSourceDetail["items"][number]>[]>`
    SELECT a.id, a.title, a.url, a.discovered_at, a.published_at, a.processing_state, p.selected, p.visibility, p.title AS title_zh
    FROM articles a LEFT JOIN publications p ON p.article_id = a.id WHERE a.source_id = ${id} ORDER BY a.discovered_at DESC LIMIT 30`,
    sql<AdminSourceDetail["stats"][]>`
    SELECT count(*)::int AS total, count(*) FILTER (WHERE a.discovered_at > now() - interval '7 days')::int AS last7d,
           (SELECT count(*)::int FROM publications p WHERE p.source_id = ${id} AND p.selected) AS selected
    FROM articles a WHERE a.source_id = ${id}`,
    auditHistory(`source:${id}`),
    sql<{ value: Record<string, unknown> }[]>`SELECT value FROM settings WHERE key = ${republishKey(id)}`,
  ]);
  return { source, runs, items, stats: stats!, history, republish: republish?.value ?? null };
}

/** Upstream failures read as "预览抓取失败：…" in the admin toast instead of a bare English error. */
function previewFetch<T>(run: () => Promise<T>): Promise<T> {
  return run().catch((error: unknown) => {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode) throw error; // 400 from assertSupportedConfig and friends already reads well
    throw Object.assign(new Error(`预览抓取失败：${(error as Error).message}`), { statusCode: 500 });
  });
}

/** A stored source fetched now without storing anything; null when there is no such source. */
export async function previewStoredSource(id: string): Promise<BeforeJson<AdminSourcePreview> | null> {
  const [source] = await sql<SourceRow[]>`SELECT * FROM sources WHERE id = ${id}`;
  return source ? previewSource(source) : null;
}

export async function previewSource(draft: Pick<SourceRow, "id" | "kind" | "config"> & Partial<SourceRow>): Promise<BeforeJson<AdminSourcePreview>> {
  const source = { name: draft.id, enabled: true, cursor: null, tier: "T2", participation_mode: "editorial", ...draft } as SourceRow;
  assertSupportedConfig(source.kind, source.config);
  const started = performance.now();
  let found;
  if (source.kind === "rss") found = (await previewFetch(() => fetchRss(source, { force: true }).then((r) => r.candidates)));
  else if (source.kind === "web_list") found = await previewFetch(() => fetchWebList(source));
  else if (source.kind === "json_list") found = await previewFetch(() => fetchJsonList(source));
  else if (source.kind === "x_search") found = await previewFetch(() => fetchXSearch(source).then((r) => r.candidates));
  else {
    // Not a server fault: these kinds cannot be fetched on demand at all, so say so and let the admin
    // page hide the button (a 500 here reads as "the backend is broken" for a normal click).
    const kind = PREVIEW_UNSUPPORTED_KINDS[source.kind] ?? source.kind;
    throw Object.assign(new Error(`${kind}类信源不支持预览抓取：这类内容由信源侧推送，无法主动抓取。`), { statusCode: 400 });
  }
  // The listing and its detail pages as collection reads them, within the fixed publication boundary;
  // the limits of a first import and of later runs depend on the source's runs and are not previewed.
  let candidates = await listingEntries(source, found);
  const known = await storedDetails(candidates.map((c) => c.identityKey!));
  const admits = (c: Candidate) => filterPublicationWindow([c], source.config.publishedAfter).length > 0;
  const reads = await enrichDetails(candidates, source, known, { budget: Number(source.config.detail?.maxFetches ?? 0), datedOut: {}, admits });
  // A page that fails keeps its listing data, as in collection; when none can be read, the rules are what fails.
  if (reads.failures.length && reads.failures.length === reads.attempts) {
    throw new FetchError(`原文页全部读取失败（${reads.failures.length} 页）：${reads.failures.map((f) => `${f.url}（${f.error}）`).join("；")}`);
  }
  candidates = candidates.filter(admits);
  return {
    ms: Math.round(performance.now() - started),
    count: candidates.length,
    items: candidates.slice(0, 20).map((c) => ({ title: c.title, url: c.url, publishedAt: c.publishedAt?.toISOString() ?? null, excerpt: (c.excerpt ?? c.bodyText ?? "").slice(0, 200) })),
  };
}

const EDITABLE = z
  .object({
    name: z.string().min(1).max(200),
    kind: z.enum(REPLACEABLE_SOURCE_KINDS),
    enabled: z.boolean(),
    interval_minutes: z.number().int().min(1).max(1440),
    tier: z.enum(["T1", "T1_5", "T2", "EXCLUDE_MP"]),
    participation_mode: z.enum(["editorial", "hot_signal", "isolated"]),
    signal_group_id: z.string().max(120).nullable(),
    first_party: z.boolean(),
    owner_entity_id: z.string().max(120).nullable(),
    site_fulltext: z.boolean(),
    syndicate_fulltext: z.boolean(),
    tags: z.array(z.string().max(60)).max(30),
    config: z.record(z.string(), z.unknown()),
  })
  .partial()
  .strict();

/** What the installed modules do for a source kind they collect themselves (their server.ts sourceKinds). */
const kindHooks = (kind: string) => serverModules().flatMap((m) => m.sourceKinds?.[kind] ?? []);

export async function updateSource(id: string, input: { patch: unknown; version: string; reason?: string }, actor: string) {
  const patch = EDITABLE.parse(input.patch);
  return sql.begin(async (tx) => {
    // Creation and address edits share the lock: checking then inserting must not race.
    if (patch.config) await tx`SELECT pg_advisory_xact_lock(hashtext('admin-source-identity'))`;
    const [before] = await tx`SELECT * FROM sources WHERE id = ${id} FOR UPDATE`;
    if (!before) return null;
    if (new Date(before.updated_at as Date).toISOString() !== input.version) throw new Conflict("信源已被其他操作修改，请刷新后再改");
    const kindChanged = patch.kind !== undefined && patch.kind !== before.kind;
    if (patch.kind !== undefined && !patch.config) throw new UnsupportedConfig("调整采集方式须同时提供完整采集配置");
    if (kindChanged) {
      if (!(REPLACEABLE_SOURCE_KINDS as readonly string[]).includes(String(before.kind))) throw new UnsupportedConfig("仅 RSS、网页列表和 JSON 列表之间可调整采集方式");
      assertReplacementConfig(patch.kind!, patch.config!);
      const boundary = (before.config as Record<string, unknown>).publishedAfter;
      if (boundary) {
        if (patch.config!.publishedAfter !== undefined && Date.parse(String(patch.config!.publishedAfter)) < Date.parse(String(boundary))) throw new UnsupportedConfig("调整采集方式不能扩大既有发布时间范围");
        patch.config!.publishedAfter ??= boundary;
      }
    }
    // Kept in the admin shape for existing clients, but no independent first-party setting remains.
    if (patch.tier !== undefined || patch.first_party !== undefined) patch.first_party = (patch.tier ?? before.tier) === "T1";
    if (patch.config) {
      const nextKind = patch.kind ?? before.kind as SourceRow["kind"];
      assertSupportedConfig(nextKind, patch.config);
      // A changed address must not be one another source already collects from. (Sources that share a
      // feed on purpose, with different filters, keep editing their other settings.)
      const moved = kindChanged || sourceIdentity(nextKind, patch.config) !== sourceIdentity(String(before.kind), before.config as Record<string, unknown>);
      const dup = moved ? await findDuplicateSource(nextKind, patch.config, id, tx) : null;
      if (dup) throw new Conflict(`与已有信源重复：${dup.name}（${dup.id}）`);
    }
    const keys = Object.keys(patch) as Array<keyof typeof patch>;
    if (!keys.length) return before;
    const values = Object.fromEntries(keys.map((k) => [k, k === "config" ? tx.json(patch.config as never) : patch[k]]));
    const cursor = before.cursor ? { ...before.cursor as Record<string, unknown> } : null;
    if (kindChanged && cursor) {
      delete cursor.rss;
      delete cursor.detailRules;
    }
    // A module that collects this kind hears of the resume first, in the same transaction, so the row
    // returned below has what it stamps.
    if (patch.enabled === true && !before.enabled) for (const h of kindHooks(String(before.kind))) await h.resumed?.(id, tx);
    const [after] = await tx`UPDATE sources SET ${tx(values as never, ...(keys as string[]))}, updated_at = now(),
      cursor = CASE WHEN ${kindChanged} THEN ${cursor ? tx.json(cursor as never) : null}::jsonb ELSE cursor END,
      health = CASE WHEN ${patch.enabled ?? null}::boolean IS FALSE THEN 'paused' WHEN ${kindChanged} AND enabled OR ${patch.enabled ?? null}::boolean IS TRUE AND health = 'paused' THEN 'unknown' ELSE health END,
      next_fetch_at = CASE WHEN ${patch.enabled ?? null}::boolean IS TRUE OR ${kindChanged} AND enabled THEN now() ELSE next_fetch_at END
      WHERE id = ${id} RETURNING *`;
    if (before.participation_mode !== "editorial" && patch.participation_mode === "editorial") {
      // A heat-only decision cannot admit the first editorial judgement to selection. Previously
      // judged revisions remain reusable; this mode edit still does not buy analysis for old material.
      await tx`UPDATE articles a SET ${groupingReset()}
        WHERE a.source_id = ${id} AND NOT EXISTS (
          SELECT 1 FROM analyses an WHERE an.article_id = a.id AND an.input_revision = a.revision AND an.relevance IS NOT NULL)`;
    }
    await audit(actor, "source.update", `source:${id}`, input.reason ?? null,
      { ...Object.fromEntries(keys.map((k) => [k, before[k]])), ...(kindChanged ? { cursor: before.cursor } : {}) },
      { ...patch, ...(kindChanged ? { cursor } : {}) }, { db: tx });
    // What public exits show for this source's articles is derived from these fields: re-derive them
    // all (in the worker) so a revoked licence or an isolated source stops on every exit.
    const publisherChanged = patch.config && ["publisherRole", "publisherUrlPrefixes", "publisherRequiresDiscovery"].some(k => JSON.stringify((before.config as Record<string, unknown>)[k]) !== JSON.stringify(patch.config![k]));
    if (publisherChanged || keys.some((k) => PUBLICATION_FIELDS.includes(k) && JSON.stringify(before[k]) !== JSON.stringify(patch[k]))) {
      await requestRepublish(tx, id, actor);
    }
    return after;
  });
}

/**
 * Bulk pause/resume/delete from the source list. Pause and resume reuse updateSource per source, so the
 * module hooks, health and next-fetch stamps stay identical to the single-row command. A delete is only
 * allowed for a source that never produced content (articles, discoveries, publications or signals);
 * anything else is reported as skipped instead of orphaning the public exits.
 */
export async function batchSources(input: unknown, actor: string): Promise<BeforeJson<AdminSourceBatchResult>> {
  const cmd = AdminSourceBatchSchema.parse(input);
  const targets = cmd.all
    ? await sql<BatchTarget[]>`SELECT id, name, enabled, updated_at FROM sources ORDER BY id`
    : await sql<BatchTarget[]>`SELECT id, name, enabled, updated_at FROM sources WHERE id = ANY(${cmd.ids ?? []}::text[]) ORDER BY id`;
  if (!targets.length) throw new Conflict(cmd.all ? "还没有信源" : "选中的信源不存在，可能刚被删除");
  const result: BeforeJson<AdminSourceBatchResult> = { action: cmd.action, changed: 0, skipped: [] };

  if (cmd.action === "delete") {
    for (const t of targets) {
      const [refs] = await sql<{ articles: number; discoveries: number; publications: number; signals: number; adapters: number }[]>`
        SELECT (SELECT count(*)::int FROM articles WHERE source_id = ${t.id}) AS articles,
               (SELECT count(*)::int FROM article_discoveries WHERE source_id = ${t.id}) AS discoveries,
               (SELECT count(*)::int FROM publications WHERE source_id = ${t.id}) AS publications,
               (SELECT count(*)::int FROM story_signals WHERE source_id = ${t.id}) AS signals,
               (SELECT count(*)::int FROM crawler_adapters WHERE source_id = ${t.id}) AS adapters`;
      if (refs!.articles + refs!.discoveries + refs!.publications + refs!.signals > 0) {
        result.skipped.push({ id: t.id, name: t.name, reason: "有历史内容，只能暂停" });
        continue;
      }
      if (refs!.adapters > 0) {
        result.skipped.push({ id: t.id, name: t.name, reason: "被专用抓取引用，先停用那个抓取" });
        continue;
      }
      try {
        await sql.begin(async (tx) => {
          await tx`DELETE FROM settings WHERE key = ${republishKey(t.id)}`;
          await tx`DELETE FROM sources WHERE id = ${t.id}`;
          await audit(actor, "source.delete", `source:${t.id}`, cmd.reason ?? null, { id: t.id, name: t.name }, null, { db: tx });
        });
        result.changed += 1;
      } catch {
        result.skipped.push({ id: t.id, name: t.name, reason: "删除失败，可能有其他引用" });
      }
    }
    return result;
  }

  const want = cmd.action === "resume";
  for (const t of targets) {
    if (t.enabled === want) continue;
    try {
      await updateSource(t.id, {
        patch: { enabled: want },
        version: new Date(t.updated_at).toISOString(),
        reason: cmd.reason ?? (want ? "批量恢复采集" : "批量暂停采集"),
      }, actor);
      result.changed += 1;
    } catch (error) {
      result.skipped.push({ id: t.id, name: t.name, reason: error instanceof Conflict ? "刚被其他操作修改" : "操作失败" });
    }
  }
  return result;
}

interface BatchTarget {
  id: string;
  name: string;
  enabled: boolean;
  updated_at: Date;
}

const AdminSourceBatchSchema = z.object({
  action: z.enum(["pause", "resume", "delete"]),
  ids: z.array(z.string().min(1).max(120)).max(1000).optional(),
  all: z.boolean().optional(),
  reason: z.string().max(500).optional(),
}).strict();

/** Source fields the public projection reads (publication/rules.ts and the v1 payload). */
const PUBLICATION_FIELDS: string[] = ["kind", "participation_mode", "site_fulltext", "syndicate_fulltext", "tier", "name", "first_party", "owner_entity_id"];

/** Replacing a working collector requires the fields its replacement needs to produce articles. */
function assertReplacementConfig(kind: string, config: Record<string, unknown>): void {
  const address = kind === "rss" ? config.feedUrl : config.url;
  try {
    const url = new URL(String(address ?? ""));
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error();
  } catch { throw new UnsupportedConfig("完整采集配置须包含有效的 HTTP(S) 地址"); }
  if (kind === "json_list" && (!Array.isArray(config.titlePaths) || !config.titlePaths.length || !config.titlePaths.every(p => typeof p === "string" && p.trim()) || !(config.urlTemplate || config.urlTemplateFallback))) throw new UnsupportedConfig("JSON 列表须提供标题路径和文章地址模板");
}

const CreateSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{2,79}$/, "ID 只能用小写字母、数字和连字符，3–80 位，且以字母或数字开头"),
    name: z.string().min(1, "名称不能为空").max(200, "名称最多 200 字"),
    kind: z.enum(["rss", "web_list", "json_list", "x_search", "mp_account", "external"]),
    config: z.record(z.string(), z.unknown()),
    tier: z.enum(["T1", "T1_5", "T2", "EXCLUDE_MP"]).default("T2"),
    participation_mode: z.enum(["editorial", "hot_signal", "isolated"]).default("editorial"),
    interval_minutes: z.number().int().min(1, "采集间隔至少 1 分钟").max(1440, "采集间隔最多 1440 分钟").default(30),
    first_party: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    site_fulltext: z.boolean().default(SOURCE_DEFAULTS.siteFulltext),
    syndicate_fulltext: z.boolean().default(false),
  })
  .strict();

/** The address a source collects from, used to find duplicates before creating one. */
export function sourceIdentity(kind: string, config: Record<string, unknown>): string | null {
  const raw = (config.feedUrl ?? config.url ?? config.listUrl ?? config.endpoint ?? null) as string | null;
  if (kind === "x_search") {
    const handle = xHandle(config);
    return handle ? `x:${handle.toLowerCase()}` : null;
  }
  // A WeChat account is one account whichever id names it.
  if (kind === "mp_account") {
    const id = String(config.ghid ?? config.wxid ?? "").trim().toLowerCase();
    return id ? `mp:${id}` : null;
  }
  if (!raw) return null;
  return normalizeUrl(String(raw).replace(/^https:\/\/r\.jina\.ai\//, "")) ?? String(raw);
}

export async function findDuplicateSource(kind: string, config: Record<string, unknown>, exceptId?: string, db: Db = sql) {
  const identity = sourceIdentity(kind, config);
  if (!identity) return null;
  const rows = await db<{ id: string; kind: string; config: Record<string, unknown>; name: string }[]>`SELECT id, kind, config, name FROM sources WHERE kind = ${kind}`;
  return rows.find((r) => r.id !== exceptId && sourceIdentity(r.kind, r.config) === identity) ?? null;
}

export async function createSource(input: unknown, actor: string): Promise<BeforeJson<AdminSourceCreated>> {
  const s = CreateSchema.parse(input);
  s.first_party = s.tier === "T1";
  assertSupportedConfig(s.kind, s.config);
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext('admin-source-identity'))`;
    const dup = await findDuplicateSource(s.kind, s.config, undefined, tx);
    if (dup) return { created: false as const, duplicate: dup };
    const [row] = await tx<BeforeJson<AdminSource>[]>`
    INSERT INTO sources (id, name, kind, config, tier, participation_mode, interval_minutes, first_party, tags, site_fulltext, syndicate_fulltext, next_fetch_at)
    VALUES (${s.id}, ${s.name}, ${s.kind}, ${tx.json(s.config as never)}, ${s.tier}, ${s.participation_mode}, ${s.interval_minutes}, ${s.first_party}, ${s.tags},
            ${s.site_fulltext}, ${s.syndicate_fulltext}, now())
    ON CONFLICT (id) DO NOTHING RETURNING *`;
    if (!row) throw new Conflict(`信源 ID ${s.id} 已存在`);
    await audit(actor, "source.create", `source:${s.id}`, null, null, s, { db: tx });
    return { created: true as const, source: row };
  });
}

export async function fetchNow(id: string, actor: string): Promise<AdminSourceFetch | null> {
  const [s] = await sql<{ id: string; kind: string; config: Record<string, unknown>; enabled: boolean }[]>`SELECT id, kind, config, enabled FROM sources WHERE id = ${id}`;
  if (!s) return null;
  // A paused source is not collected even when the button is pressed: "暂停" means no fetching until
  // it is resumed, so a manual run must not bypass the operator's decision.
  if (!s.enabled) throw new Conflict("信源已暂停：恢复后才能采集。");
  const own = kindHooks(s.kind).find((h) => h.fetchNow)?.fetchNow;
  if (own) {
    await audit(actor, "source.fetch", `source:${id}`, null, null, await own(s));
    return { jobId: null };
  }
  // 手动采集在总开关关闭时当场抓：这个开关关掉后 worker 不注册 sources.fetch 的消费者，
  // 只把任务入队等于放进一个没人取的队列（操作者会看到「已加入队列」却永远没有条目）。
  if (process.env.COLLECT_ENABLED !== "true") {
    const collected = await collectSource(id, { force: true });
    await audit(actor, "source.fetch", `source:${id}`, null, null, collected);
    return { jobId: null, collected };
  }
  const jobId =
    s.kind === "mp_account"
      ? await enqueue(QUEUES.mpCheck, { sourceId: id, reason: "manual" }, { singletonKey: `mp:${id}` })
      : await enqueue(QUEUES.fetchSource, { sourceId: id, force: true }, { singletonKey: `manual:${id}` });
  await audit(actor, "source.fetch", `source:${id}`, null, null, { jobId });
  return { jobId };
}
