-- 0003_remove_in_review.sql — drop the 'in_review' task status.
--
-- Product now uses backlog -> todo -> in_progress -> done.
-- Existing rows in 'in_review' are folded into 'in_progress' so no work
-- disappears from boards. Postgres has no DROP VALUE for enums, so the
-- type is rebuilt without the value. Safe to re-run: no-ops when the
-- value is already gone (e.g. fresh DBs where 0001 was edited).

-- 1. Fold existing rows into in_progress (no-op when none match).
UPDATE tasks SET status = 'in_progress' WHERE status::text = 'in_review';

-- 2. Rebuild the enum without 'in_review', only if it still exists.
-- NOTE: the column DEFAULT must be dropped first — it still references the
-- old enum type and otherwise fails the rewrite with 42804.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'task_status' AND e.enumlabel = 'in_review'
  ) THEN
    ALTER TABLE tasks ALTER COLUMN status DROP DEFAULT;
    ALTER TYPE task_status RENAME TO task_status_old;
    CREATE TYPE task_status AS ENUM ('backlog', 'todo', 'in_progress', 'done');
    ALTER TABLE tasks ALTER COLUMN status TYPE task_status USING status::text::task_status;
    ALTER TABLE tasks ALTER COLUMN status SET DEFAULT 'backlog'::task_status;
    DROP TYPE task_status_old;
  END IF;
END $$;
