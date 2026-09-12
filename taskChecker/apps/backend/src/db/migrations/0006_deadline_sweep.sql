-- 0006_deadline_sweep.sql — automatic deadline enforcement.
--
-- Tasks with a deadline (due_at) that are still open (not done/backlog) when
-- the deadline passes are moved back to `backlog` by the worker sweep.
-- The sweep runs cross-tenant with no request context, so the move itself is
-- a locked-down SECURITY DEFINER function (same shape as the lookup escape
-- hatches in 0001): fixed UPDATE, capped batch, SKIP LOCKED for multi-replica
-- workers, every row carrying tenant_id so the worker still writes
-- activity/audit inside the tenant via withTenant. The overdue predicate is
-- re-checked in the outer UPDATE so a concurrent PATCH (complete/delete)
-- between snapshot and write can never be clobbered.

CREATE OR REPLACE FUNCTION sweep_overdue_tasks(p_limit integer)
RETURNS TABLE (tenant_id uuid, id uuid, project_id uuid, old_status task_status, title text)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  WITH overdue AS (
    SELECT o.tenant_id, o.id, o.project_id, o.status AS old_status, o.title
    FROM tasks o
    WHERE o.deleted_at IS NULL
      AND o.due_at IS NOT NULL
      AND o.due_at < now()
      AND o.status NOT IN ('done', 'backlog')
    ORDER BY o.due_at ASC
    LIMIT GREATEST(sweep_overdue_tasks.p_limit, 1)
    FOR UPDATE OF o SKIP LOCKED
  )
  UPDATE tasks t SET status = 'backlog', updated_at = now()
  FROM overdue o
  WHERE t.tenant_id = o.tenant_id
    AND t.id = o.id
    AND t.deleted_at IS NULL
    AND t.due_at IS NOT NULL
    AND t.due_at < now()
    AND t.status NOT IN ('done', 'backlog')
  RETURNING t.tenant_id, t.id, t.project_id, o.old_status, t.title
$$;

REVOKE ALL ON FUNCTION sweep_overdue_tasks(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sweep_overdue_tasks(integer) TO teamflow;
