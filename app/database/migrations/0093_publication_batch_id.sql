-- The folded collection batch this report belongs to (set only when the run's items are folded into one group).
ALTER TABLE publications ADD COLUMN IF NOT EXISTS batch_id text;
