-- 011_alerts_duplicates_escalation.sql
-- Day-2 readiness: the control room sees trouble coming, the same problem
-- reported many times becomes one complaint, and nothing waits forever.
--
-- 1. Duplicates: a new complaint about the same department and area as an
--    open one (48 h) is linked to it (duplicate_of). The first complaint
--    counts the reports and its priority rises; the department gets one
--    SMS, not fifty. When it is resolved, every linked caller hears so.
-- 2. Escalation: no reply from the department → a reminder SMS
--    (reminded_at); still open after a week → the supervisor is told
--    (escalated_at).
-- 3. Alerts: floods of calls, repeat callers and sudden spikes in one area
--    raise an alert shown on every control-room page (and SMS'd to admins).
-- 4. system_usage(): database and recording storage size for the health
--    panel.

ALTER TABLE complaints ADD COLUMN duplicate_of uuid REFERENCES complaints(id) ON DELETE SET NULL;
ALTER TABLE complaints ADD COLUMN report_count int NOT NULL DEFAULT 1;
ALTER TABLE complaints ADD COLUMN reminded_at timestamptz;
ALTER TABLE complaints ADD COLUMN escalated_at timestamptz;
CREATE INDEX idx_complaints_duplicate_of ON complaints(duplicate_of) WHERE duplicate_of IS NOT NULL;
CREATE INDEX idx_complaints_dept_created ON complaints(department_id, created_at DESC);

-- Where overdue complaints are escalated (falls back to ALERT_SMS_NUMBERS)
ALTER TABLE departments ADD COLUMN supervisor_sms_number text;

CREATE TABLE system_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('flood','repeat_caller','area_spike','ai_backlog','sms_failing')),
  dedupe_key text NOT NULL,             -- one open alert per kind + key
  message text NOT NULL,
  details jsonb,
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES officers(id) ON DELETE SET NULL
);
CREATE INDEX idx_system_alerts_open ON system_alerts(created_at DESC) WHERE resolved_at IS NULL;

ALTER TABLE system_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "system_alerts_select_admin" ON system_alerts FOR SELECT TO authenticated
  USING (get_officer_role() = 'admin');
REVOKE INSERT, UPDATE, DELETE ON system_alerts FROM authenticated, anon;

-- Sizes for the health panel. Server only.
CREATE OR REPLACE FUNCTION system_usage()
RETURNS TABLE (database_bytes bigint, recording_files bigint, recording_bytes bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    pg_catalog.pg_database_size(pg_catalog.current_database()),
    (SELECT count(*) FROM storage.objects WHERE bucket_id = 'recordings'),
    (SELECT coalesce(sum((metadata->>'size')::bigint), 0) FROM storage.objects WHERE bucket_id = 'recordings');
$$;
REVOKE EXECUTE ON FUNCTION system_usage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION system_usage() TO service_role;
