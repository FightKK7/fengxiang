-- Position in the folded batch, 1 being the group head; null when the report is not part of a folded batch.
ALTER TABLE publications ADD COLUMN IF NOT EXISTS batch_pos integer;
