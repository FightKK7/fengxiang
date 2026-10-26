-- 抓取器模块自己的运行记录（modules/crawlers）：适配器、起止时间、命中层级、条数、错误与每一级的结果。
-- 只记抓取健康度，不碰框架的 articles / publications 表。
CREATE TABLE crawler_runs (
  id bigserial PRIMARY KEY,
  adapter text NOT NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  ok boolean NOT NULL,
  tier text,
  items integer NOT NULL DEFAULT 0,
  created integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL,
  trigger_kind text NOT NULL,
  error text,
  tiers jsonb NOT NULL DEFAULT '[]'
);
