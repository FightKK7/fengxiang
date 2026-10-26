-- The folded collection batch this report belongs to (set only when the run's items are folded into one group).
CREATE INDEX CONCURRENTLY IF NOT EXISTS publications_batch_idx
  ON publications (batch_id)
  WHERE batch_id IS NOT NULL;
