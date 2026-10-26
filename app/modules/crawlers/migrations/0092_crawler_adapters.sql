-- 抓取器模块的抓取器定义（modules/crawlers）：模板决定用哪种抓法，实例带名称、目标信源、页面地址、
-- 模板参数与启停；后台「抓取器」页的增删改查都读写这张表，定时任务也只跑这里启用的行。
-- 删除是软删除（deleted_at）：后台列表不再显示，历史运行记录仍能对上；默认两条由代码首次启动时补齐。
CREATE TABLE IF NOT EXISTS crawler_adapters (
  id text PRIMARY KEY,
  name text NOT NULL,
  template text NOT NULL,
  source_id text NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  url text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
