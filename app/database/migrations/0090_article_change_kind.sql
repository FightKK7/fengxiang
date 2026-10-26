-- What kind of change the material reports (announcement / roadmap / diff / ga / hiring / tender),
-- declared by the source's config and read from the material layer; null when the source doesn't say.
ALTER TABLE articles ADD COLUMN IF NOT EXISTS change_kind text;
