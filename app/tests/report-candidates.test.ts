import { editionAt, gate, tag } from "./setup.ts";
// A selected item released across the daily edition time must appear in the next issue exactly once.
// Each late release carries its own source, so the daily's per-source cap cannot decide this test.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { publishArticle, publishArticleTx } from "@aihot/backend/publication/publish";
import { composeDaily } from "@aihot/backend/reports/compose";
import { candidates } from "@aihot/backend/reports/edition";
import { REPORTS } from "@aihot/site";

const T = tag();
const SOURCE = `test-report-boundary-${T}`;
const LATE = [1, 2, 3].map((n) => `test-report-boundary-late${n}-${T}`);

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at)
            VALUES (${SOURCE}, 'Report boundary test', 'rss', 'T1', 'editorial', '2100-01-01'),
                   (${LATE[0]!}, 'Report boundary late 1', 'rss', 'T1', 'editorial', '2100-01-01'),
                   (${LATE[1]!}, 'Report boundary late 2', 'rss', 'T1', 'editorial', '2100-01-01'),
                   (${LATE[2]!}, 'Report boundary late 3', 'rss', 'T1', 'editorial', '2100-01-01')`;
});
after(async () => {
  await stopBoss();
  await closeDb();
});

async function analyzed(label: string, timelineAt: Date, sourceId = SOURCE, reason: string | null = `判断 ${label}`): Promise<string> {
  const { articleId, backfill } = await upsertMaterial({
    sourceId,
    url: `https://example.com/report-boundary-${T}-${label}`,
    title: `Report boundary ${label}`,
    bodyText: `Report boundary ${label} body`,
    bodyStatus: "ok",
    publishedAt: timelineAt,
    discoveredAt: timelineAt,
    via: "fetch",
  });
  assert.equal(backfill, false);
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, reason_zh, score, selected)
            VALUES (${articleId}, 1, 'rule', 'pass', 'product', ${`标题 ${label}`}, ${`摘要 ${label}`}, ${reason}, 90, true)`;
  return articleId;
}

async function selected(label: string, timelineAt: Date, releasedAt: Date, sourceId = SOURCE, reason: string | null = `判断 ${label}`): Promise<string> {
  const articleId = await analyzed(label, timelineAt, sourceId, reason);
  const published = await publishArticle(articleId, { now: releasedAt, releasedAt });
  assert.equal(published?.selected, true);
  return articleId;
}

test("reports assign delayed and boundary releases to the period readers first see them", async () => {
  const onTime = await selected("on-time", editionAt("daily", "2020-01-02", -120), editionAt("daily", "2020-01-02", -60));
  const delayed = await selected("delayed", editionAt("daily", "2020-01-02", -60), editionAt("daily", "2020-01-02", 120), LATE[0]!);
  const atBoundary = await selected("at-boundary", editionAt("daily", "2020-01-02", -60), editionAt("daily", "2020-01-02"), LATE[1]!);
  const groupedBefore = await analyzed("grouped-before", editionAt("daily", "2020-01-02", -120));
  await publishArticle(groupedBefore, { now: editionAt("daily", "2020-01-02", -120) });
  await sql`UPDATE articles SET grouping_status = 'complete', grouped_at = ${editionAt("daily", "2020-01-02", -60)} WHERE id = ${groupedBefore}`;
  await publishArticle(groupedBefore, { now: editionAt("daily", "2020-01-02", -50) });
  const groupedLate = await analyzed("grouped-late", editionAt("daily", "2020-01-02", -120), LATE[2]!);
  await publishArticle(groupedLate, { now: editionAt("daily", "2020-01-02", -120) }); // waits for identity confirmation
  await sql`UPDATE articles SET grouping_status = 'complete', grouped_at = ${editionAt("daily", "2020-01-02", -10)} WHERE id = ${groupedLate}`;
  const boundary = editionAt("daily", "2020-01-02");
  const previous = new Set((await candidates(editionAt("daily", "2020-01-01"), boundary)).map((c) => c.itemId));

  assert.equal(previous.has(onTime), true);
  assert.equal(previous.has(groupedBefore), true);
  for (const id of [delayed, atBoundary, groupedLate]) assert.equal(previous.has(id), false);

  await composeDaily("2020-01-02");
  await publishArticle(groupedLate, { now: editionAt("daily", "2020-01-02", 10) });
  const [release] = await sql<{ visible_after: Date }[]>`SELECT visible_after FROM publications WHERE article_id = ${groupedLate}`;
  assert.equal(release!.visible_after.toISOString(), editionAt("daily", "2020-01-02", 10).toISOString());
  const next = new Set((await candidates(boundary, editionAt("daily", "2020-01-03"))).map((c) => c.itemId));
  assert.equal(next.has(onTime), false);
  assert.equal(next.has(groupedBefore), false);
  for (const id of [delayed, atBoundary, groupedLate]) assert.equal(next.has(id), true);
  await composeDaily("2020-01-03");
  const reports = await sql<{ key: string; content: { sections: Array<{ items: Array<{ itemId: string }> }>; flashes: Array<{ itemId: string }> } }[]>`
    SELECT key, content FROM reports WHERE kind = 'daily' AND key IN ('2020-01-02', '2020-01-03')`;
  // An issue carries an item as an entry or as a flash (one source fills at most two entries).
  const items = (key: string) => {
    const content = reports.find((r) => r.key === key)!.content;
    return new Set([...content.sections.flatMap((s) => s.items), ...content.flashes].map((i) => i.itemId));
  };
  assert.equal(items("2020-01-02").has(onTime), true);
  assert.equal(items("2020-01-02").has(groupedBefore), true);
  assert.equal(items("2020-01-02").has(delayed), false);
  assert.equal(items("2020-01-02").has(atBoundary), false);
  assert.equal(items("2020-01-02").has(groupedLate), false);
  assert.equal(items("2020-01-03").has(onTime), false);
  assert.equal(items("2020-01-03").has(groupedBefore), false);
  assert.equal(items("2020-01-03").has(delayed), true);
  assert.equal(items("2020-01-03").has(atBoundary), true);
  assert.equal(items("2020-01-03").has(groupedLate), true);
});

/** One issue's stored content, as this file reads it. */
interface DayContent {
  lead: { title: string };
  sections: Array<{ items: Array<{ itemId: string; reason?: string }> }>;
  flashes: Array<{ itemId: string }>;
  generator: { droppedWithoutReason?: number };
}
const storedDay = async (key: string): Promise<DayContent> =>
  (await sql<{ content: DayContent }[]>`SELECT content FROM reports WHERE kind = 'daily' AND key = ${key}`)[0]!.content;

test("a daily carries selected reports with or without a judgement; a day of none still has its issue", async () => {
  const at = (date: string) => editionAt("daily", date, -12 * 3600);
  const released = (date: string) => editionAt("daily", date, -11 * 3600);
  const sourceFor = async (n: number) => {
    const id = `test-report-judgment-${n}-${T}`;
    await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at)
              VALUES (${id}, ${`Judgment ${n}`}, 'rss', 'T1', 'editorial', '2100-01-01') ON CONFLICT DO NOTHING`;
    return id;
  };

  // 2026-10-23 新定位：判断是可选增值，精选条目即使没写判断也进刊；版面用摘要。
  const judged: string[] = [];
  for (const n of [1, 2, 3]) judged.push(await selected(`judged-${n}`, at("2021-06-15"), released("2021-06-15"), await sourceFor(n)));
  const unjudged: string[] = [];
  for (const n of [4, 5]) {
    const id = await analyzed(`unjudged-${n}`, at("2021-06-15"), await sourceFor(n), null);
    await publishArticle(id, { now: released("2021-06-15"), releasedAt: released("2021-06-15") });
    unjudged.push(id);
  }

  assert.equal((await composeDaily("2021-06-15")).entries, 5, "selected entries carry with or without a judgement");
  const day = await storedDay("2021-06-15");
  const carried = [...day.sections.flatMap((s) => s.items), ...day.flashes].map((i) => i.itemId);
  assert.deepEqual(carried.sort(), [...judged, ...unjudged].sort(), "every selected report reaches the front page");
  const withReason = [...day.sections.flatMap((s) => s.items)].filter((i) => i.reason);
  assert.equal(withReason.length, 3, "entries that wrote a judgement keep it in the stored issue");
  assert.equal(day.generator.droppedWithoutReason, 0, "no selected entry is dropped for lacking a judgement");

  // A window with scored reports but no selected report still comes out, as a quiet day.
  for (const n of [6, 7]) {
    const id = await analyzed(`quiet-${n}`, at("2021-06-16"), await sourceFor(n), null);
    await sql`UPDATE analyses SET selected = false WHERE article_id = ${id}`;
    await publishArticle(id, { now: released("2021-06-16"), releasedAt: released("2021-06-16") });
  }
  assert.equal((await composeDaily("2021-06-16")).entries, 0);
  const quiet = await storedDay("2021-06-16");
  assert.equal(quiet.lead.title, REPORTS.quiet.title, "a judged window with no selection reads as a quiet day, not a failure");
  assert.deepEqual(quiet.sections, []);
  assert.equal(quiet.generator.droppedWithoutReason, 0);
});

/** Observe an actual PostgreSQL lock wait before advancing the clock or releasing the transaction. */
async function waitForBlocked(blocker: number, operation: Promise<unknown>) {
  const deadline = performance.now() + 5_000;
  while (!(await sql`SELECT 1 FROM pg_stat_activity WHERE ${blocker} = ANY(pg_blocking_pids(pid))`)[0]) {
    if (performance.now() >= deadline) assert.fail("operation did not wait for the held transaction");
    await Promise.race([operation.then(() => assert.fail("operation finished before the held transaction committed")), delay(10)]);
  }
}

for (const lock of ["article", "fact seat", "report snapshot"] as const) {
  test(`a release waiting for the ${lock} lock uses the time after the cutoff`, async (t) => {
    const id = await analyzed(`waiting-${lock}`, editionAt("daily", "2020-01-02", -120));
    await publishArticle(id, { now: editionAt("daily", "2020-01-02", -120) });
    await sql`UPDATE articles SET grouping_status = 'complete', grouped_at = ${editionAt("daily", "2020-01-02", -60)} WHERE id = ${id}`;
    const [fact] = lock === "fact seat" ? await sql<{ id: number }[]>`INSERT INTO facts (public_id, title) VALUES (${`report-seat-${T}`}, 'fact') RETURNING id` : [];
    if (fact) await sql`INSERT INTO fact_articles (fact_id, article_id, role) VALUES (${fact.id}, ${id}, 'report')`;
    const acquired = gate<number>();
    const release = gate();
    const holding = sql.begin(async (tx) => {
      if (lock === "article") await tx`SELECT 1 FROM articles WHERE id = ${id} FOR UPDATE`;
      else if (fact) await tx`SELECT pg_advisory_xact_lock(hashtext(${`seat:${fact.id}`}))`;
      else await tx`SELECT pg_advisory_xact_lock(hashtext('report_candidates'))`;
      const [row] = await tx<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      acquired.open(row!.pid);
      await release.promise;
    });
    let publication: Promise<unknown> | undefined;
    try {
      const pid = await Promise.race([acquired.promise, holding.then(() => assert.fail("lock holder exited before acquiring its lock"))]);
      t.mock.timers.enable({ apis: ["Date"], now: editionAt("daily", "2020-01-02", -1) });
      publication = publishArticle(id);
      await waitForBlocked(pid, publication);
      t.mock.timers.setTime(editionAt("daily", "2020-01-02", 10).getTime());
      release.open();
      await holding;
      await publication;

      const [published] = await sql<{ visible_after: Date; visible_at: Date }[]>`
        SELECT p.visible_after, l.visible_at FROM publications p JOIN selected_ledger l ON l.article_id = p.article_id
        WHERE p.article_id = ${id} ORDER BY l.seq DESC LIMIT 1`;
      assert.equal(published!.visible_after.toISOString(), editionAt("daily", "2020-01-02", 10).toISOString());
      assert.equal(published!.visible_at.toISOString(), published!.visible_after.toISOString());
      const boundary = editionAt("daily", "2020-01-02");
      assert.equal((await candidates(editionAt("daily", "2020-01-01"), boundary)).some((c) => c.itemId === id), false);
      assert.equal((await candidates(boundary, editionAt("daily", "2020-01-03"))).some((c) => c.itemId === id), true);
    } finally {
      release.open();
      await Promise.allSettled([holding, publication]);
    }
  });
}

test("daily composition waits for a pre-cutoff release to commit instead of losing it between issues", async (t) => {
  const id = await analyzed("commit-after-cutoff", editionAt("daily", "2020-01-04", -120));
  await publishArticle(id, { now: editionAt("daily", "2020-01-04", -120) });
  await sql`UPDATE articles SET grouping_status = 'complete', grouped_at = ${editionAt("daily", "2020-01-04", -60)} WHERE id = ${id}`;
  t.mock.timers.enable({ apis: ["Date"], now: editionAt("daily", "2020-01-04", -1) });
  const written = gate<number>();
  const commit = gate();
  const publication = sql.begin(async (tx) => {
    await publishArticleTx(tx, id);
    const [row] = await tx<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
    written.open(row!.pid);
    await commit.promise;
  });
  let report: ReturnType<typeof composeDaily> | undefined;
  try {
    const pid = await Promise.race([written.promise, publication.then(() => assert.fail("publication exited before the commit gate"))]);
    t.mock.timers.setTime(editionAt("daily", "2020-01-04", 10).getTime());
    report = composeDaily("2020-01-04");
    await waitForBlocked(pid, report);
    commit.open();
    await publication;
    await report;
    await assert.rejects(composeDaily("2020-01-05"), /nothing judged/);
    const reports = await sql<{ key: string; content: { sections: Array<{ items: Array<{ itemId: string }> }> } }[]>`
      SELECT key, content FROM reports WHERE kind = 'daily' AND key IN ('2020-01-04', '2020-01-05')`;
    const hasItem = (key: string) => reports.find((r) => r.key === key)!.content.sections.some((s) => s.items.some((item) => item.itemId === id));
    assert.equal(hasItem("2020-01-04"), true);
    assert.equal(reports.some((r) => r.key === "2020-01-05"), false);
    assert.equal((await candidates(editionAt("daily", "2020-01-04"), editionAt("daily", "2020-01-05"))).some((c) => c.itemId === id), false);
  } finally {
    commit.open();
    await Promise.allSettled([publication, report]);
  }
});
