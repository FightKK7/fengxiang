-- Number of reports in the folded batch the head stands for.
ALTER TABLE publications ADD COLUMN IF NOT EXISTS batch_size integer;
