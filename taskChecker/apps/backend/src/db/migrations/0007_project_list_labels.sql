-- 0007_project_list_labels.sql — per-project board list (status column) display names.
--
-- The four task_status values stay the source of truth for task placement;
-- this table stores an optional human label per (project, status) so a team
-- can rename e.g. "backlog" to "Summary". Absent rows fall back to the
-- built-in defaults ("Backlog", "To do", "In progress", "Done").

CREATE TABLE IF NOT EXISTS project_list_labels (
  tenant_id  uuid        NOT NULL,
  project_id uuid        NOT NULL,
  status     task_status NOT NULL,
  label      text        NOT NULL CHECK (char_length(label) BETWEEN 1 AND 50),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_list_labels_pkey PRIMARY KEY (tenant_id, project_id, status),
  CONSTRAINT project_list_labels_project_fk FOREIGN KEY (tenant_id, project_id)
    REFERENCES projects (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS project_list_labels_project_idx
  ON project_list_labels (tenant_id, project_id);

ALTER TABLE project_list_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_list_labels FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON project_list_labels;
CREATE POLICY tenant_isolation ON project_list_labels USING (
  tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
) WITH CHECK (
  tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
);
