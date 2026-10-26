// An item whose original carries no reliable date keeps its public page, and no exit presents when it was
// collected as when it was published. Failure cases: the Markdown export labels the collection time
// "发布时间"; RSS gives the collection time as pubDate; a dated item loses its publication time.
// 2026-10-22: the detail page also has to know the precision and trust of the source time — a source that
// only prints a date must not reach readers as an exact instant, and a bulk page date is not an event time.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { beijingStamp } from "@aihot/contracts/time";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { buildApp } from "../apps/api/src/app.ts";

const T = tag();
const SOURCE = `pubtime-${T}`;
const UNTRUSTED = `pubtime-bulk-${T}`;
const discovered = new Date(Date.now() - 3600_000);
const published = new Date(Date.now() - 5 * 3600_000);
// 只标日期的源：publication_time 是 YYYY-MM-DD，published_at 只是这一天的锚点。
const dayOnly = new Date("2026-10-19T00:00:00.000Z");
const ids = { dated: `${T}-dated`, undated: `${T}-undated`, dayOnly: `${T}-day-only`, untrusted: `${T}-untrusted` };
const app = await buildApp();

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier) VALUES (${SOURCE}, 'Publication time fixture', 'rss', 'T1')`;
  await sql`INSERT INTO sources (id, name, kind, tier, config) VALUES
    (${UNTRUSTED}, 'Bulk page date fixture', 'json_list', 'T1', ${sql.json({ publishedAtAuthoritative: false })});`;
  for (const [kind, id] of Object.entries(ids)) {
    const at = kind === "dated" ? published : kind === "dayOnly" ? dayOnly : kind === "untrusted" ? published : null;
    // An untrusted source's live items order by discovery, not by the page's bulk date.
    const timeline = kind === "untrusted" ? discovered : kind === "undated" ? discovered : at!;
    const publicationTime = kind === "dayOnly" ? "2026-10-19" : at ? at.toISOString() : null;
    await sql`INSERT INTO articles (id, source_id, identity_key, url, title, discovered_at, timeline_at, published_at, published_at_claim, publication_time)
      VALUES (${id}, ${kind === "untrusted" ? UNTRUSTED : SOURCE}, ${id}, ${`https://example.org/${id}`}, ${`${T} ${kind}`},
        ${discovered}, ${timeline}, ${at}, ${at}, ${publicationTime})`;
    await sql`INSERT INTO publications (article_id, title, source_id, channel, url, discovered_at, timeline_at, published_at, sort_at,
        eligible, selected, visible_after, visibility, tags, summary)
      VALUES (${id}, ${`${T} ${kind}`}, ${kind === "untrusted" ? UNTRUSTED : SOURCE}, 'news', ${`https://example.org/${id}`},
        ${discovered}, ${timeline}, ${at}, ${discovered}, true, false, ${discovered}, 'public', ${[T]}, 'fixture summary')`;
  }
});
after(async () => {
  await app.close();
  await stopBoss();
  await closeDb();
});

const get = async (url: string) => {
  const res = await app.inject({ method: "GET", url });
  assert.equal(res.statusCode, 200, url);
  return res.body;
};
const detail = async (id: string) => JSON.parse(await get(`/api/site/items/${id}`));

test("the Markdown export names the collection time as such when the publication time is unknown", async () => {
  const undated = await get(`/items/${ids.undated}/markdown`);
  assert.ok(undated.includes(`- 收录时间：${beijingStamp(discovered)}（北京时间）`));
  assert.ok(!undated.includes("发布时间"));
  assert.ok((await get(`/items/${ids.dated}/markdown`)).includes(`- 发布时间：${beijingStamp(published)}（北京时间）`));
});

test("RSS gives no pubDate for an item without a known publication time", async () => {
  const feed = await get("/feed/all.xml");
  const entry = (id: string) => feed.split("<item>").find((block) => block.includes(`>${id}</guid>`));
  assert.ok(entry(ids.undated) && !entry(ids.undated)!.includes("<pubDate>"));
  assert.ok(entry(ids.dated)!.includes(`<pubDate>${published.toUTCString()}</pubDate>`));
});

test("a date-only source stays a date on the item page, not a midnight instant", async () => {
  const item = await detail(ids.dayOnly);
  assert.equal(item.publishedAtPrecision, "date", "the source states only a day");
  assert.equal(item.timelineAtPrecision, "date", "the event time is that day, not an exact hour");
  assert.equal(item.publishedAtTrusted, true);
  assert.equal(item.publishedAt, dayOnly.toISOString());
});

test("a source whose page date is not an event time reaches readers marked as such", async () => {
  const item = await detail(ids.untrusted);
  assert.equal(item.publishedAtTrusted, false);
  assert.equal(item.publishedAtPrecision, "exact", "the source's own page date is still exact as a claim");
  assert.equal(item.timelineAtPrecision, "exact", "the event time comes from discovery");
  assert.equal(item.timelineAt, discovered.toISOString());
  assert.equal(item.publishedAt, published.toISOString());
});
