-- 抓取器模块的抓取快照（modules/crawlers）：目前用于飞书定价页的「和上次比」diff。
-- 首次运行只存不推；之后只有快照变化才推 ingest。一个适配器一行，data 保存完整快照 JSON。
CREATE TABLE crawler_snapshots (
  adapter text PRIMARY KEY,
  data jsonb NOT NULL,
  captured_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
