-- The editors' working copy of one issue (出刊台): edits are saved here first and never reach readers.
-- 发刊 writes the draft into reports, keeping the replaced content in report_revisions; a draft can be
-- revised or dropped without touching the published issue.
CREATE TABLE report_drafts (
  kind          text NOT NULL CHECK (kind IN ('daily', 'weekly', 'monthly')),
  key           text NOT NULL,
  content       jsonb NOT NULL,
  base_revision integer NOT NULL,
  updated_by    text NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, key)
);
