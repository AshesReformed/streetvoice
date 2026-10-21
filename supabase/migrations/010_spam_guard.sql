-- 010_spam_guard.sql
-- Spam and flood protection, in three layers:
-- 1. Limits per caller: every call attempt is logged in call_attempts (by a
--    keyed hash of the phone number or, for the browser simulator, the IP),
--    so the server can count recent calls. Counting in the database works on
--    serverless hosting, where in-memory counters don't.
-- 2. A blocklist: blocked numbers are refused before anything is stored or
--    sent to the AI.
-- 3. An AI spam label: prank, abusive, silent or test calls get the new
--    'spam' status, are never sent to a department, and show in the
--    control room's Flagged tab.

ALTER TABLE complaints DROP CONSTRAINT complaints_status_check;
ALTER TABLE complaints ADD CONSTRAINT complaints_status_check
  CHECK (status IN ('processing','needs_review','open','in_progress','resolved','spam'));

-- Why the AI (or an admin) marked a complaint as spam
ALTER TABLE complaints ADD COLUMN spam_reason text;
CREATE INDEX idx_complaints_citizen ON complaints(citizen_id, created_at DESC);

-- Every call attempt, accepted or refused. caller_key is a keyed hash
-- (never the raw number or IP).
CREATE TABLE call_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_key text NOT NULL,
  key_kind text NOT NULL CHECK (key_kind IN ('phone','ip')),
  outcome text NOT NULL CHECK (outcome IN ('accepted','rate_limited','blocked')),
  channel text,                         -- simulator, twilio, webhook
  complaint_id uuid REFERENCES complaints(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_call_attempts_key ON call_attempts(caller_key, created_at DESC);
CREATE INDEX idx_call_attempts_created ON call_attempts(created_at DESC);

-- Blocked callers. blocked_until NULL = blocked until someone unblocks.
CREATE TABLE blocked_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_hash text NOT NULL UNIQUE,
  phone_masked text,                    -- "+92 300 ••• 4567", for the control room
  reason text,
  blocked_until timestamptz,
  blocked_by uuid REFERENCES officers(id) ON DELETE SET NULL,  -- NULL = automatic
  created_at timestamptz DEFAULT now()
);

-- Server-only writes; admins can read
ALTER TABLE call_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_numbers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "call_attempts_select_admin" ON call_attempts FOR SELECT TO authenticated
  USING (get_officer_role() = 'admin');
CREATE POLICY "blocked_numbers_select_admin" ON blocked_numbers FOR SELECT TO authenticated
  USING (get_officer_role() = 'admin');
REVOKE INSERT, UPDATE, DELETE ON call_attempts, blocked_numbers FROM authenticated, anon;
