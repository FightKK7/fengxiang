-- The collection run that first stored the material (source:run); one run's items can be shown as one group.
CREATE INDEX CONCURRENTLY IF NOT EXISTS articles_batch_idx
  ON articles (batch_id)
  WHERE batch_id IS NOT NULL;
