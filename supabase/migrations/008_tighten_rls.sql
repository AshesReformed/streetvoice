-- 008_tighten_rls.sql
-- Closes gaps found in review:
-- 1. Any signed-in officer could insert status_history rows for any
--    complaint. History is written by the status trigger (SECURITY DEFINER)
--    and the server (service role), so signed-in users need no INSERT.
-- 2. Officers could update every column of their department's complaints
--    (including department_id, moving them elsewhere). Signed-in users may
--    now only change status; routing and AI fields are server-side only.
-- 3. Admins could not delete departments (no DELETE policy, so the delete
--    silently matched nothing).

DROP POLICY IF EXISTS "status_history_insert" ON status_history;
REVOKE INSERT, UPDATE, DELETE ON status_history FROM authenticated;

REVOKE UPDATE ON complaints FROM authenticated;
GRANT UPDATE (status) ON complaints TO authenticated;
REVOKE INSERT, DELETE ON complaints FROM authenticated;

CREATE POLICY "departments_delete_admin" ON departments FOR DELETE TO authenticated
  USING (get_officer_role() = 'admin');

-- Server-only tables: no direct writes from signed-in users
REVOKE INSERT, UPDATE, DELETE ON citizens, call_logs, sms_messages FROM authenticated;
