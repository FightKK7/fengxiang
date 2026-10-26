-- 同源批次折叠已删除（2026-10-23）：采集不再给条目打批次号；抓取来源仍由 article_discoveries / fetch_runs 记录。
ALTER TABLE articles DROP COLUMN IF EXISTS batch_id;
