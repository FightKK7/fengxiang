// The 出刊台: a draft never changes what readers see; publishing keeps the replaced content as a
// revision, rolls it forward and can roll it back; the issue's window shows what it cost (bills apart
// from estimates from unit prices). The admin routes keep the session and CSRF guards.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import Fastify from "fastify";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { Conflict } from "@aihot/backend/audit";
import { passwordLogin, SESSION_COOKIE } from "@aihot/backend/admin/auth";
import { estimateCost, paidRequest, usageTokens } from "@aihot/backend/providers/receipts";
import { discardReportDraft, listReports, publishReportDraft, regenerateReport, reportEditor, rollbackReport, saveReportDraft } from "@aihot/backend/admin/reports";
import { publishArticle } from "@aihot/backend/publication/publish";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { registerAdminAuth } from "../apps/api/src/routes/admin-auth.ts";
import { registerAdmin } from "../apps/api/src/routes/admin.ts";

const T = tag();
const SOURCE = `test-reports-${T}`;
after(async () => { await stopBoss(); await closeDb(); });

let n = 0;
/** A judged, selected, published report; each call returns another one. */
async function article(category = "commercial") {
  n += 1;
  if (n === 1) {
    await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at)
      VALUES (${SOURCE}, 'Reports', 'rss', 'T1', 'editorial', '2100-01-01')`;
  }
  const { articleId } = await upsertMaterial({
    sourceId: SOURCE, url: `https://example.com/reports-${T}-${n}`, title: `出刊台测试 ${n} ${T}`,
    bodyText: "正文", bodyHtml: "<p>正文</p>", bodyStatus: "ok", via: "fetch", publishedAt: new Date(),
  });
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, score, selected)
    VALUES (${articleId}, 1, 'rule', 'pass', ${category}, ${`标题${n}-${T}`}, ${`摘要${n}-${T}`}, 90, true)`;
  await sql`UPDATE articles SET grouping_status = 'complete', grouped_at = now() WHERE id = ${articleId}`;
  await publishArticle(articleId);
  return articleId;
}

function citation(id: string, title: string) {
  return {
    itemId: id, title, summary: `${title} 摘要`, sourceName: "Reports", sourceUrl: `https://example.com/${id}`,
    sourceId: SOURCE, firstParty: true, publishedAt: new Date().toISOString(), sources: 1,
  };
}

/** A daily with two printed entries; the window holds the publications and their paid calls. */
async function daily(key: string) {
  const first = await article();
  const second = await article("product");
  const start = new Date(Date.now() - 3600_000);
  const end = new Date(Date.now() + 3600_000);
  const content = {
    date: key,
    lead: { title: citation(first, "第一条").title, leadParagraph: "第一段" },
    leadItemId: first,
    verdict: { title: "旧的判断", body: "旧的导语" },
    highlights: [second],
    sections: [
      { label: "商业化与定价", items: [citation(first, "第一条")] },
      { label: "产品变化", items: [citation(second, "第二条")] },
    ],
    flashes: [],
    metrics: { totalEvents: 2, sourcesCount: 1, firstPartyEvents: 2 },
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    generator: { version: "test" },
  };
  await sql`INSERT INTO reports (kind, key, window_start, window_end, content, generated_at, origin)
    VALUES ('daily', ${key}, ${start}, ${end}, ${sql.json(content as never)}, now(), 'manual')`;
  return { first, second, start, end };
}

async function contentOf(key: string) {
  const [row] = await sql<{ content: Record<string, any>; revision: number; origin: string }[]>`
    SELECT content, revision, origin FROM reports WHERE kind = 'daily' AND key = ${key}`;
  return row!;
}

test("a draft leaves the public issue alone; publishing keeps the old version and rollback restores it", async () => {
  const key = `reports-draft-${T}`;
  const { first, second } = await daily(key);
  const before = await contentOf(key);
  const editor = await reportEditor("daily", key);
  assert.ok(editor);
  assert.equal(editor.revision, 1);
  assert.equal(editor.hasDraft, false);
  assert.deepEqual(editor.order, [first, second]);
  assert.equal(editor.entries.find((entry) => entry.itemId === first)!.reason, null);
  const candidates = editor.candidates.map((candidate) => candidate.itemId);
  assert.ok(candidates.includes(first));

  // 选稿与排序: the second leads, a written 所以呢 and a new 今日判断; the issue is still unpublished.
  const saved = await saveReportDraft("daily", key, {
    version: 1,
    verdict: { title: "新的今日判断", body: "写影响结构" },
    leadItemId: second,
    order: [second, first],
    reasons: [{ itemId: first, reason: "第一条的所以呢" }],
    rankingBasis: "影响面从大到小",
    add: [],
  }, "admin:test");
  assert.ok(saved);
  assert.equal(saved.hasDraft, true);
  assert.deepEqual(saved.order, [second, first]);
  assert.deepEqual(saved.entries.map((entry) => entry.itemId), [second, first], "the saved print order survives the reload");
  assert.equal(saved.verdict?.title, "新的今日判断");
  assert.equal((await contentOf(key)).revision, 1, "a draft does not publish");
  assert.equal((await contentOf(key)).content.leadItemId, first, "the old lead is still public");
  const [draftRow] = await sql<{ base_revision: number }[]>`SELECT base_revision FROM report_drafts WHERE kind = 'daily' AND key = ${key}`;
  assert.equal(draftRow!.base_revision, 1);

  const published = await publishReportDraft("daily", key, { version: 1, reason: "本期发刊" }, "admin:test");
  assert.ok(published);
  assert.equal(published.revision, 2);
  assert.equal(published.hasDraft, false);
  const after = await contentOf(key);
  assert.equal(after.revision, 2);
  assert.equal(after.origin, "manual");
  assert.equal(after.content.leadItemId, second);
  assert.deepEqual(after.content.highlights, [first]);
  assert.equal(after.content.lead.title, "第二条");
  const printed = after.content.sections.flatMap((section: any) => section.items);
  assert.deepEqual(printed.map((item: any) => item.itemId), [first, second], "sections follow their categories");
  assert.equal(printed.find((item: any) => item.itemId === first).reason, "第一条的所以呢");
  assert.equal(after.content.verdict.title, "新的今日判断");
  assert.equal(after.content.rankingBasis, "影响面从大到小");
  const [revision] = await sql<{ content: Record<string, any>; reason: string | null }[]>`
    SELECT rr.content, rr.reason FROM report_revisions rr JOIN reports r ON r.id = rr.report_id
    WHERE r.kind = 'daily' AND r.key = ${key} AND rr.revision = 1`;
  assert.equal(revision!.content.leadItemId, first, "the replaced version keeps its own content");
  assert.equal(revision!.reason, "本期发刊");
  assert.equal((await sql`SELECT 1 FROM audit_log WHERE subject = ${`report:daily:${key}`} AND action = 'report.publish'`).length, 1);

  // 回滚: the published edit becomes a kept revision and the issue reads as it did before it.
  const rolled = await rollbackReport("daily", key, { revision: 1, reason: "判断写错" }, "admin:test");
  assert.ok(rolled);
  assert.equal(rolled.revision, 3);
  const restored = await contentOf(key);
  assert.equal(restored.content.leadItemId, first);
  assert.equal(restored.content.verdict.title, "旧的判断");
  const kept = await sql<{ revision: number }[]>`SELECT rr.revision FROM report_revisions rr JOIN reports r ON r.id = rr.report_id
    WHERE r.kind = 'daily' AND r.key = ${key} ORDER BY rr.revision`;
  assert.deepEqual(kept.map((row) => row.revision), [1, 2], "the edited version is kept before the rollback");
  assert.equal((await sql`SELECT 1 FROM audit_log WHERE subject = ${`report:daily:${key}`} AND action = 'report.rollback'`).length, 1);
});

test("edits are refused against a moved-on issue, and a discarded draft never publishes", async () => {
  const key = `reports-conflict-${T}`;
  const { first } = await daily(key);
  await saveReportDraft("daily", key, {
    version: 1, verdict: null, leadItemId: first, order: [first], reasons: [], rankingBasis: null, add: [],
  }, "admin:test");
  await assert.rejects(
    () => saveReportDraft("daily", key, { version: 2, verdict: null, leadItemId: first, order: [first], reasons: [], rankingBasis: null, add: [] }, "admin:test"),
    (error: unknown) => error instanceof Conflict,
  );
  const discarded = await discardReportDraft("daily", key, { version: 1, reason: "排版不对" }, "admin:test");
  assert.ok(discarded);
  assert.equal(discarded.hasDraft, false);
  assert.equal((await sql`SELECT 1 FROM report_drafts WHERE kind = 'daily' AND key = ${key}`).length, 0);
  await assert.rejects(
    () => publishReportDraft("daily", key, { version: 1 }, "admin:test"),
    (error: unknown) => error instanceof Conflict && /草稿/.test(error.message),
  );
  assert.equal((await contentOf(key)).revision, 1);
});

test("an issue's cost prices its window from service_prices, and the site's own bills stay bills", async () => {
  const key = `reports-cost-${T}`;
  const { start } = await daily(key);
  await sql`INSERT INTO service_prices (service, model, currency, input_per_mtok, cached_per_mtok, output_per_mtok)
    VALUES ('llm', 'deepseek-flash', 'USD', 0.28, 0.028, 0.42) ON CONFLICT (service, model) DO NOTHING`;
  const [receipt] = await sql<{ id: number }[]>`
    INSERT INTO receipts (logical_key, service, model, purpose, subject, status)
    VALUES (${`reports-cost-${T}`}, 'llm', 'deepseek-flash', 'score_article', ${`article:${T}`}, 'completed') RETURNING id`;
  await sql`INSERT INTO receipt_attempts (receipt_id, attempt, service, model, origin, status, usage, started_at, finished_at)
    VALUES (${receipt!.id}, 1, 'llm', 'deepseek-flash', 'live', 'received',
            ${sql.json({ prompt_tokens: 1_000_000, completion_tokens: 100_000 } as never)}, ${new Date(start.getTime() + 1000)}, now())`;
  const editor = await reportEditor("daily", key);
  assert.ok(editor);
  assert.equal(editor.cost.calls, 1);
  assert.equal(editor.cost.priced, true);
  assert.equal(editor.cost.actual, 0);
  // 0.28 for the fresh input million plus 0.042 for 100k output.
  assert.equal(editor.cost.total, 0.322);
  assert.equal(editor.cost.currency, "USD");

  // A provider-reported amount is a bill: it is not re-estimated when the price row changes.
  const [billed] = await sql<{ id: number }[]>`
    INSERT INTO receipts (logical_key, service, model, purpose, subject, status)
    VALUES (${`reports-billed-${T}`}, 'llm', 'deepseek-flash', 'score_article', ${`article:${T}:billed`}, 'completed') RETURNING id`;
  await sql`INSERT INTO receipt_attempts (receipt_id, attempt, service, model, origin, status, usage, cost, currency, cost_basis, started_at, finished_at)
    VALUES (${billed!.id}, 1, 'llm', 'deepseek-flash', 'live', 'received',
            ${sql.json({ prompt_tokens: 10, completion_tokens: 10 } as never)}, 1.5, 'USD', 'actual', ${new Date(start.getTime() + 2000)}, now())`;
  const again = await reportEditor("daily", key);
  assert.ok(again);
  assert.equal(again.cost.calls, 2);
  assert.equal(again.cost.actual, 1.5);
  assert.equal(again.cost.total, 1.822);

  // The list names the last week's cost for the desk itself.
  const listed = await listReports();
  assert.ok(listed.recent.calls >= 2);
});

test("a completed paid request stores the estimated money from usage and unit prices", async () => {
  await sql`INSERT INTO service_prices (service, model, currency, input_per_mtok, cached_per_mtok, output_per_mtok)
    VALUES ('llm', 'estimate-model', 'USD', 1, 0.1, 2) ON CONFLICT (service, model) DO NOTHING`;
  const usage = { prompt_tokens: 1_000_000, completion_tokens: 500_000, prompt_tokens_details: { cached_tokens: 200_000 } };
  const result = await paidRequest(
    { service: "llm", model: "estimate-model", purpose: "test_estimate", identity: { test: T } },
    async () => ({ response: { ok: true }, usage }),
  );
  const [row] = await sql<{ cost: string | null; currency: string | null; cost_basis: string | null }[]>`
    SELECT cost, currency, cost_basis FROM receipts WHERE id = ${result.receiptId}`;
  // 800k fresh input at $1/M + 200k cached at $0.1/M + 500k output at $2/M.
  assert.equal(Number(row!.cost), 1.82);
  assert.equal(row!.currency, "USD");
  assert.equal(row!.cost_basis, "estimated");

  assert.deepEqual(usageTokens(usage), { input: 1_000_000, cached: 200_000, output: 500_000 });
  assert.equal(estimateCost({ currency: "USD", input: 1, cached: 0.1, output: 2 }, usage)?.amount, 1.82);
  assert.equal(estimateCost({ currency: "USD", input: null, cached: null, output: null }, usage), null);
});

test("a stale regeneration request is not repeated, and a missing issue is not a failure", async () => {
  assert.equal(await regenerateReport("daily", `missing-${T}`, { reason: "重跑" }, "admin:test"), null);
  const key = "2019-12-31";
  await daily(key);
  // Compose cannot find judged entries for this synthetic date; it is a Conflict with an actionable
  // Chinese message (not a 500) and no command is recorded, so a retry with the same id may try again.
  await assert.rejects(() => regenerateReport("daily", key, { reason: "重跑" }, "admin:test"), /还没有已判断的条目/);
  assert.equal((await contentOf(key)).revision, 1);
});

test("a weekly's printed order is its ranking: the themes follow the editors' order", async () => {
  const key = `reports-weekly-${T}`;
  const first = await article("commercial");
  const second = await article("product");
  const start = new Date(Date.now() - 3600_000);
  const end = new Date(Date.now() + 3600_000);
  const content = {
    kind: "weekly", title: `周报 ${key}`, headline: "旧头条", leadItemId: first, highlights: [], overview: "旧导读",
    themes: [
      { heading: "商业化与定价", summary: "旧分节导读", storyRefs: [citation(first, "第一条")] },
      { heading: "产品变化", summary: null, storyRefs: [citation(second, "第二条")] },
    ],
    metrics: { totalStories: 2 },
    windowStart: start.toISOString(), windowEnd: end.toISOString(),
  };
  await sql`INSERT INTO reports (kind, key, window_start, window_end, content, generated_at, origin)
    VALUES ('weekly', ${key}, ${start}, ${end}, ${sql.json(content as never)}, now(), 'manual')`;
  const saved = await saveReportDraft("weekly", key, {
    version: 1, verdict: null, leadItemId: second, order: [second, first], reasons: [], rankingBasis: "影响面优先", add: [],
  }, "admin:test");
  assert.ok(saved);
  assert.deepEqual(saved.order, [second, first]);
  await publishReportDraft("weekly", key, { version: 1 }, "admin:test");
  const [row] = await sql<{ content: Record<string, any> }[]>`SELECT content FROM reports WHERE kind = 'weekly' AND key = ${key}`;
  const printed = row!.content;
  assert.deepEqual(printed.storyOrder, [second, first]);
  assert.equal(printed.leadItemId, second);
  assert.equal(printed.headline, "第二条");
  assert.deepEqual(printed.themes.map((theme: any) => theme.heading), ["产品变化", "商业化与定价"], "the ranking order is the theme order");
  assert.equal(printed.themes[0].storyRefs[0].itemId, second);
  assert.equal(printed.themes[0].summary, null, "the old introduction does not describe the reordered theme");
  assert.equal(printed.themes[1].summary, "旧分节导读", "an unchanged theme keeps its introduction");
  assert.equal(printed.rankingBasis, "影响面优先");
});

test("admin report routes keep the session and CSRF guards", async () => {
  const app = Fastify({ logger: false });
  registerAdminAuth(app);
  registerAdmin(app);
  const base = await app.listen({ host: "127.0.0.1", port: 0 });
  const previous = config.adminPassword;
  const password = `reports-admin-${T}`;
  config.adminPassword = password;
  try {
    const request = (path: string, init: RequestInit = {}) => fetch(`${base}${path}`, { redirect: "manual", ...init });
    assert.equal((await request("/api/admin/reports")).status, 401);
    const listed = await request("/api/admin/reports", { headers: { cookie: "bad=1" } });
    assert.equal(listed.status, 401);
    const { token } = await passwordLogin(password, "/admin", "synthetic-agent");
    const me = await request("/api/admin/me", { headers: { cookie: `${SESSION_COOKIE}=${token}` } });
    assert.equal(me.status, 200);
    const { csrf } = (await me.json()) as { csrf: string };
    assert.equal((await request("/api/admin/reports", { headers: { cookie: `${SESSION_COOKIE}=${token}` } })).status, 200);
    const noCsrf = await request("/api/admin/reports/daily/x/publish", {
      method: "POST", headers: { cookie: `${SESSION_COOKIE}=${token}`, "content-type": "application/json" }, body: JSON.stringify({ version: 1 }),
    });
    assert.equal(noCsrf.status, 403);
    const wrongCsrf = await request("/api/admin/reports/daily/x/publish", {
      method: "POST", headers: { cookie: `${SESSION_COOKIE}=${token}`, "content-type": "application/json", "x-csrf-token": "wrong" }, body: JSON.stringify({ version: 1 }),
    });
    assert.equal(wrongCsrf.status, 403);
    // With the session and CSRF the command reaches the module: no such issue is a 404, not a guard failure.
    const missing = await request("/api/admin/reports/daily/none/publish", {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE}=${token}`, "content-type": "application/json", "x-csrf-token": csrf, "idempotency-key": `reports-guard-${T}` },
      body: JSON.stringify({ version: 1 }),
    });
    assert.equal(missing.status, 404);
  } finally {
    config.adminPassword = previous;
    await app.close();
  }
});
