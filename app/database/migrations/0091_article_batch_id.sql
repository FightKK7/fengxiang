-- The collection run that first stored the material (source:run); one run's items can be shown as one group.
ALTER TABLE articles ADD COLUMN IF NOT EXISTS batch_id text;
