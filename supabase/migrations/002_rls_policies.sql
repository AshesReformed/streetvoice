-- 002_rls_policies.sql
-- Row-Level Security policies for StreetVoice

-- Enable RLS on all tables
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE officers ENABLE ROW LEVEL SECURITY;
ALTER TABLE citizens ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;

-- Helper: get current officer's role
CREATE OR REPLACE FUNCTION get_officer_role()
RETURNS text AS $$
  SELECT role FROM officers WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: get current officer's department_id
CREATE OR REPLACE FUNCTION get_officer_department_id()
RETURNS uuid AS $$
  SELECT department_id FROM officers WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- departments: SELECT for all authenticated, INSERT/UPDATE for admin only
-- ============================================================
CREATE POLICY "departments_select_all_authenticated"
  ON departments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "departments_insert_admin"
  ON departments FOR INSERT
  TO authenticated
  WITH CHECK (get_officer_role() = 'admin');

CREATE POLICY "departments_update_admin"
  ON departments FOR UPDATE
  TO authenticated
  USING (get_officer_role() = 'admin')
  WITH CHECK (get_officer_role() = 'admin');

-- ============================================================
-- officers: SELECT — admins see all, officers see own row
-- INSERT/UPDATE — admin only
-- ============================================================
CREATE POLICY "officers_select"
  ON officers FOR SELECT
  TO authenticated
  USING (
    get_officer_role() = 'admin' OR id = auth.uid()
  );

CREATE POLICY "officers_insert_admin"
  ON officers FOR INSERT
  TO authenticated
  WITH CHECK (get_officer_role() = 'admin');

CREATE POLICY "officers_update_admin"
  ON officers FOR UPDATE
  TO authenticated
  USING (get_officer_role() = 'admin')
  WITH CHECK (get_officer_role() = 'admin');

-- ============================================================
-- complaints:
--   SELECT: officers see own department, admins see all
--   UPDATE: officers on own department only, admins on all
--   INSERT: via service role only (bypasses RLS)
-- ============================================================
CREATE POLICY "complaints_select"
  ON complaints FOR SELECT
  TO authenticated
  USING (
    get_officer_role() = 'admin'
    OR department_id = get_officer_department_id()
  );

CREATE POLICY "complaints_update"
  ON complaints FOR UPDATE
  TO authenticated
  USING (
    get_officer_role() = 'admin'
    OR department_id = get_officer_department_id()
  )
  WITH CHECK (
    get_officer_role() = 'admin'
    OR department_id = get_officer_department_id()
  );

-- ============================================================
-- status_history:
--   SELECT: join through complaint_id to check department_id, or admin
--   INSERT: authenticated officers/admins can insert
-- ============================================================
CREATE POLICY "status_history_select"
  ON status_history FOR SELECT
  TO authenticated
  USING (
    get_officer_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM complaints c
      WHERE c.id = status_history.complaint_id
        AND c.department_id = get_officer_department_id()
    )
  );

CREATE POLICY "status_history_insert"
  ON status_history FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================
-- citizens: RLS enabled, no policies for regular users
-- Managed via service role only
-- ============================================================
-- (no policies — service role bypasses RLS)

-- ============================================================
-- call_logs: SELECT for admin only, INSERT via service role only
-- ============================================================
CREATE POLICY "call_logs_select_admin"
  ON call_logs FOR SELECT
  TO authenticated
  USING (get_officer_role() = 'admin');
