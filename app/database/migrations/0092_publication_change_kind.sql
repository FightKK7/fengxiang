-- The material's change kind, projected to the public read layer.
ALTER TABLE publications ADD COLUMN IF NOT EXISTS change_kind text;
