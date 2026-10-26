// 上线前的数据清洗与治理检查（2026-10-23 定）。
//
// 口径：列表的时间是「本站收录时间」（详情页才是事件时间）。首次导入会回填历史（默认最多 30 条、
// 12 个月内），这些旧内容同样是"今天抓到的"；如果也进公开列表，今天的时间线就会塞满历史版本，
// 看起来是乱的。治理规则（publication/scope.ts 的 listedCondition）：回填历史里原文发布时间比
// 首次收录早 48 小时以上的条目只做存档——详情页可读，但不进时间线、搜索、RSS 与公开 API。
//
// 这个脚本是上线前的核对步骤：统计公开列表实际可见的条目、被规则挡在列表外的陈旧回填、
// 同一次抓取里并列的时间点；`--apply` 把这次核对写进审计记录（不改任何数据）。
//
//   node --env-file-if-exists=.env scripts/governance.ts          # 只读核对
//   node --env-file-if-exists=.env scripts/governance.ts --apply  # 核对 + 写审计记录
import { audit } from "@aihot/backend/audit";
import { closeDb, sql } from "@aihot/backend/db";
import { listedFeedCondition } from "@aihot/backend/publication/scope";

const apply = process.argv.includes("--apply");
const now = new Date();

interface Counts {
  listed: number;
  eligiblePublic: number;
  staleBackfill: number;
}

const [counts] = await sql<Counts[]>`
  SELECT
    (SELECT count(*)::int FROM publications p WHERE ${listedFeedCondition(now)}) AS "listed",
    (SELECT count(*)::int FROM publications p WHERE p.visibility = 'public' AND p.eligible) AS "eligiblePublic",
    (SELECT count(*)::int FROM publications p
      WHERE p.visibility = 'public' AND p.eligible AND p.backfill
        AND p.published_at IS NOT NULL AND p.discovered_at - p.published_at > interval '48 hours') AS "staleBackfill"`;

const batches = await sql<{ bucket: Date; n: number }[]>`
  SELECT date_trunc('second', p.discovered_at) AS bucket, count(*)::int AS n
  FROM publications p WHERE ${listedFeedCondition(now)}
  GROUP BY 1 HAVING count(*) > 1 ORDER BY n DESC LIMIT 5`;

const hidden = counts!.eligiblePublic - counts!.listed;
console.log("=== 上线前数据治理核对 ===");
console.log(`公开时间线实际可见：${counts!.listed} 条`);
console.log(`陈旧回填（只存档，不进列表）：${counts!.staleBackfill} 条`);
console.log(`其他暂不可见：${hidden - counts!.staleBackfill} 条（未发布、未来时间等）`);
console.log(`同一次抓取里并列的时间点：${batches.length} 组（最大 ${batches[0]?.n ?? 0} 条）`);
if (batches.length) {
  console.log("  这些条目按收录时间无法再分先后；列表在同一收录时间内按事件时间倒序，所以同一批里也是新→旧。");
}

const ok = hidden === counts!.staleBackfill;
console.log(ok
  ? "\n核对通过：陈旧回填没有进入公开列表，列表里只有真正的新闻。"
  : `\n注意：有 ${hidden - counts!.staleBackfill} 条公开但列表不可见的条目（未发布或时间在未来），请人工确认。`);

if (apply) {
  await audit("governance", "publication.check-backfill", null, "上线前数据治理核对",
    { listed: counts!.listed, eligiblePublic: counts!.eligiblePublic, staleBackfill: counts!.staleBackfill },
    { sameSecondBatches: batches.length, at: now.toISOString() });
  console.log("已写入审计记录。");
}

await closeDb();
