-- The public list (全部动态, topics) is an acquisition timeline: ordered by when this site first
-- received the item, not by the source's event time. The existing pool index is keyed on
-- coalesce(published_at, discovered_at), which cannot serve a plain discovered_at DESC scan.
CREATE INDEX CONCURRENTLY IF NOT EXISTS publications_discovered_idx
  ON publications (discovered_at DESC, article_id DESC);
