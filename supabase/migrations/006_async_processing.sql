-- 006_async_processing.sql
-- Calls are filed instantly and analyzed afterwards, so a complaint can now be
-- 'processing' while the AI works. Also: short random tracking numbers that
-- are easy to hear and type, one complaint per call, and private storage for
-- recordings.

-- 'processing' = filed, AI analysis not finished yet
ALTER TABLE complaints DROP CONSTRAINT complaints_status_check;
ALTER TABLE complaints ADD CONSTRAINT complaints_status_check
  CHECK (status IN ('processing','needs_review','open','in_progress','resolved'));

-- One complaint per telephony call, so a retried webhook can't file twice
ALTER TABLE complaints ADD COLUMN call_ref text UNIQUE;

-- Background analysis bookkeeping
ALTER TABLE complaints ADD COLUMN processing_attempts int NOT NULL DEFAULT 0;
ALTER TABLE complaints ADD COLUMN processing_error text;
CREATE INDEX idx_complaints_processing ON complaints(created_at) WHERE status = 'processing';

-- Random 6-digit tracking numbers ("482913") instead of sequential
-- "SV-000123": easy to read out over the phone and type on a keypad, and
-- not guessable by counting.
CREATE OR REPLACE FUNCTION gen_tracking_id()
RETURNS text AS $$
DECLARE
  candidate text;
BEGIN
  LOOP
    candidate := (100000 + floor(random() * 900000))::int::text;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM complaints WHERE tracking_id = candidate);
  END LOOP;
  RETURN candidate;
END;
$$ LANGUAGE plpgsql VOLATILE SET search_path = public;

-- Complaints are only inserted by the server (service role)
REVOKE EXECUTE ON FUNCTION gen_tracking_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gen_tracking_id() TO service_role;
ALTER TABLE complaints ALTER COLUMN tracking_id SET DEFAULT gen_tracking_id();

-- Private bucket for call recordings; officers get short-lived signed links
INSERT INTO storage.buckets (id, name, public)
VALUES ('recordings', 'recordings', false)
ON CONFLICT (id) DO NOTHING;
