// 把「源 → 主体」的归属补进采集池，并回填 publications.tags 的 entity:<id>。
// 首页厂商筛选（/?brand=）与主题页的实体口径都读这个标签；新条目由 publish.ts 自动写，历史条目靠这个脚本。
// 可重复执行：node --env-file=.env scripts/backfill-owner-entity-tags.ts
//
// 说明：这些源是采集池里的实例（后台可增删），不在 industry/sources.json 里；新增官方源时在后台把
// owner_entity_id 设好，标签会在下一次发布投射时自动带上，不需要改这里。
import { closeDb, sql } from "@aihot/backend/db";

/** 还没设归属的官方源：按源名精确匹配（后台改名后要跟着改，或直接在后台设 owner_entity_id）。 */
const OWNERS: Record<string, string> = {
  "Replit Blog": "replit",
  "Anthropic Engineering": "anthropic",
  "Cursor Blog": "cursor",
  "Writer Blog": "writer",
  "Vercel Blog": "vercel",
  "Google AI Blog（Gemini）": "google-ai",
  "Google DeepMind": "google-ai",
};

let owned = 0;
for (const [name, owner] of Object.entries(OWNERS)) {
  const rows = await sql<{ id: string }[]>`
    UPDATE sources SET owner_entity_id = ${owner}, updated_at = now()
    WHERE name = ${name} AND owner_entity_id IS DISTINCT FROM ${owner}
    RETURNING id`;
  if (rows.length) {
    owned += rows.length;
    console.log(`owner  ${name} → ${owner}`);
  }
}

// 归属标签是客观事实：只追加缺的那一个，不覆盖模型标签与人工编辑。
const filled = await sql<{ article_id: string }[]>`
  UPDATE publications p
  SET tags = array_append(p.tags, 'entity:' || s.owner_entity_id)
  FROM sources s
  WHERE p.source_id = s.id
    AND s.owner_entity_id IS NOT NULL
    AND NOT p.tags @> ARRAY['entity:' || s.owner_entity_id]
  RETURNING p.article_id`;

console.log(`sources: ${owned} updated; publications tags: ${filled.length} backfilled`);

const perOwner = await sql<{ owner: string; n: number }[]>`
  SELECT s.owner_entity_id AS owner, count(*)::int AS n
  FROM publications p JOIN sources s ON s.id = p.source_id
  WHERE p.visibility = 'public' AND p.eligible AND (p.batch_pos IS NULL OR p.batch_pos = 1)
    AND s.owner_entity_id IS NOT NULL
  GROUP BY 1 ORDER BY n DESC`;
console.log("listed per owner:", perOwner.map((r) => `${r.owner} ${r.n}`).join(" · "));
await closeDb();
