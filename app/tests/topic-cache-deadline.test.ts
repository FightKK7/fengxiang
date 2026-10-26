// Topic counts may lag for a minute, but the first later read must wait for current counts.
// A failed refresh must fail rather than serving the old directory for another ten minutes.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { loadTopicPage, topicPageCounts } from "@aihot/backend/publication/topics";

after(closeDb);

test("topic directory and pool counts stop reusing a withdrawn entry after one minute", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
  const id = `topic-cache-${tag()}`;
  await sql`INSERT INTO sources(id,name,kind,tier,participation_mode) VALUES(${id},'Topic cache','rss','T1','editorial')`;
  // 时间取一分钟前：Date 被 mock 成固定时刻，库里 now() 会晚几毫秒，不能用 now() 当「已过去」。
  await sql`INSERT INTO articles(id,source_id,identity_key,url,title,timeline_at,discovered_at)
    VALUES(${id},${id},${id},${`https://example.org/${id}`},'飞书',now()-interval '1 minute',now()-interval '1 minute')`;
  await sql`INSERT INTO publications(article_id,source_id,title,summary,url,timeline_at,discovered_at,sort_at,selected,eligible,visible_after,tags,channel,category)
    VALUES(${id},${id},'飞书 更新','摘要',${`https://example.org/${id}`},now()-interval '1 minute',now()-interval '1 minute',now()-interval '1 minute',true,true,now()-interval '1 minute',ARRAY['entity:feishu'],'news','product')`;
  assert.equal((await loadTopicPage("feishu", 1))!.topic.total, 1);
  await sql`UPDATE publications SET visibility='withdrawn' WHERE article_id=${id}`;
  t.mock.timers.tick(61_000);
  const page = (await loadTopicPage("feishu", 1))!;
  assert.deepEqual(page.items, []);
  assert.equal(page.topic.total, 0, "an expired count cannot be returned during its background refresh");
  t.mock.timers.tick(61_000);
  await sql`ALTER TABLE publications RENAME TO unavailable_publications`;
  try {
    await assert.rejects(topicPageCounts(), /publications/, "an unavailable refresh cannot resurrect an expired directory");
  } finally {
    await sql`ALTER TABLE unavailable_publications RENAME TO publications`;
  }
});
