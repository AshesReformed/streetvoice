-- 009_sms_delivery_status.sql
-- The gateway reports what happened to each SMS after accepting it
-- (sms:sent / sms:delivered / sms:failed webhooks). Track 'delivered' too,
-- and look messages up by the gateway's id.

ALTER TABLE sms_messages DROP CONSTRAINT sms_messages_status_check;
ALTER TABLE sms_messages ADD CONSTRAINT sms_messages_status_check
  CHECK (status IN ('queued','sent','delivered','failed','received'));

CREATE INDEX idx_sms_messages_provider_ref ON sms_messages(provider_ref) WHERE provider_ref IS NOT NULL;
