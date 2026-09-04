-- 001_initial_schema.sql
-- StreetVoice core data model

-- Tracking ID sequence
CREATE SEQUENCE complaint_tracking_seq START 1;

-- departments
CREATE TABLE departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  keywords text[] NOT NULL DEFAULT '{}',
  contact_info text,
  created_at timestamptz DEFAULT now()
);

-- officers (id = auth.users.id)
CREATE TABLE officers (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  department_id uuid REFERENCES departments(id),
  role text NOT NULL CHECK (role IN ('officer','admin')),
  full_name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- citizens
CREATE TABLE citizens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_hash text,
  preferred_language text,
  area_guess text,
  created_at timestamptz DEFAULT now()
);

-- complaints
CREATE TABLE complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_id text UNIQUE NOT NULL DEFAULT ('SV-' || lpad(nextval('complaint_tracking_seq')::text, 6, '0')),
  citizen_id uuid REFERENCES citizens(id),
  department_id uuid REFERENCES departments(id),
  category text,
  audio_url text,
  transcript_regional text,
  transcript_urdu text,
  transcript_english text,
  confidence_score numeric,
  status text NOT NULL CHECK (status IN ('needs_review','open','in_progress','resolved')) DEFAULT 'needs_review',
  priority text NOT NULL CHECK (priority IN ('low','medium','high')) DEFAULT 'medium',
  area text,
  assigned_officer_id uuid REFERENCES officers(id),
  created_at timestamptz DEFAULT now()
);

-- status_history
CREATE TABLE status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  status text NOT NULL,
  remark text,
  updated_by uuid REFERENCES officers(id),
  created_at timestamptz DEFAULT now()
);

-- call_logs
CREATE TABLE call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_ref text,
  duration_sec int,
  language_selected text,
  outcome text,
  complaint_id uuid REFERENCES complaints(id),
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_complaints_tracking_id ON complaints(tracking_id);
CREATE INDEX idx_complaints_department_status ON complaints(department_id, status);
CREATE INDEX idx_complaints_status ON complaints(status);
CREATE INDEX idx_complaints_assigned_officer ON complaints(assigned_officer_id);
CREATE INDEX idx_status_history_complaint ON status_history(complaint_id, created_at DESC);
CREATE INDEX idx_call_logs_complaint ON call_logs(complaint_id);

-- Auto-insert into status_history on complaint status change
CREATE OR REPLACE FUNCTION fn_complaints_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO status_history (complaint_id, status, remark, updated_by)
    VALUES (NEW.id, NEW.status, NULL, auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_complaints_status_change
  AFTER UPDATE ON complaints
  FOR EACH ROW
  EXECUTE FUNCTION fn_complaints_status_change();

-- ============================================================
-- GRANTS: Allow Supabase roles to access tables and sequences
-- ============================================================

-- service_role: full access (used by webhook pipeline and admin operations)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- authenticated: read/write access (filtered by RLS policies)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- anon: no direct table access (public endpoints use service_role internally)
-- No grants needed for anon role

-- Ensure future tables also get proper grants
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
