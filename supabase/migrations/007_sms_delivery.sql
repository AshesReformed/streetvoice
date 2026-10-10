-- 007_sms_delivery.sql
-- Complaints reach departments and citizens by SMS, in Urdu, with no login:
-- the department's phone gets each new complaint and replies "482913 OK" /
-- "482913 DONE"; the citizen gets an SMS at every step.

-- Where each department receives complaints, and its name in Urdu for SMS
ALTER TABLE departments ADD COLUMN sms_number text;   -- E.164, e.g. +923001234567
ALTER TABLE departments ADD COLUMN name_ur text;

UPDATE departments SET name_ur = 'واٹر اینڈ سینی ٹیشن' WHERE name = 'Water & Sanitation';
UPDATE departments SET name_ur = 'بجلی' WHERE name = 'Electricity';
UPDATE departments SET name_ur = 'سڑکیں اور انفراسٹرکچر' WHERE name = 'Roads & Infrastructure';
UPDATE departments SET name_ur = 'صفائی اور کچرا' WHERE name = 'Sanitation & Waste';
UPDATE departments SET name_ur = 'جنرل' WHERE name = 'General/Unclassified';

-- The caller's number, needed to text them back. citizens has RLS with no
-- policies, so only the server (service role) can read it.
ALTER TABLE citizens ADD COLUMN phone text;

-- Urdu summary for the department SMS; when the department was notified;
-- an unguessable token for the no-login complaint page (/c/<token>)
ALTER TABLE complaints ADD COLUMN summary_urdu text;
ALTER TABLE complaints ADD COLUMN dispatched_at timestamptz;
ALTER TABLE complaints ADD COLUMN public_token text UNIQUE
  DEFAULT replace(gen_random_uuid()::text, '-', '');
UPDATE complaints SET public_token = replace(gen_random_uuid()::text, '-', '') WHERE public_token IS NULL;
ALTER TABLE complaints ALTER COLUMN public_token SET NOT NULL;

-- Every SMS in and out, for the control room and for debugging
CREATE TABLE sms_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction text NOT NULL CHECK (direction IN ('out','in')),
  phone text NOT NULL,                  -- recipient (out) or sender (in)
  body text NOT NULL,
  purpose text,                         -- citizen_filed, department_dispatch, command_reply, ...
  complaint_id uuid REFERENCES complaints(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','received')),
  provider_ref text,
  error text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_sms_messages_complaint ON sms_messages(complaint_id, created_at);
CREATE INDEX idx_sms_messages_created ON sms_messages(created_at DESC);

ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sms_messages_select_admin" ON sms_messages FOR SELECT TO authenticated
  USING (get_officer_role() = 'admin');
