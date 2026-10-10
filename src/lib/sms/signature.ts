import { createHmac, timingSafeEqual } from 'crypto';

const MAX_CLOCK_SKEW_SECONDS = 5 * 60;

/**
 * Verify an "SMS Gateway for Android" webhook: X-Signature is the hex
 * HMAC-SHA256 of the raw body followed by X-Timestamp (Unix seconds), keyed
 * with the app's signing key. Old timestamps are rejected to stop replays.
 */
export function verifySmsWebhookSignature(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
  key: string,
  now = Date.now()
): boolean {
  if (!timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > MAX_CLOCK_SKEW_SECONDS) return false;

  const expected = createHmac('sha256', key).update(rawBody + timestamp).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signature.toLowerCase(), 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
