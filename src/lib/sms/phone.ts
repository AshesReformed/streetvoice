import { createHmac } from 'crypto';

/**
 * Normalize a Pakistani phone number to E.164 ("+923001234567").
 * Accepts "03001234567", "3001234567", "923001234567", "00923001234567",
 * "+92 300 1234567". Other international numbers starting with "+" are kept.
 * Returns null for anything that isn't a plausible phone number.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = toAsciiDigits(raw).trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  let e164: string;
  if (trimmed.startsWith('+')) e164 = `+${digits}`;
  else if (digits.startsWith('0092')) e164 = `+${digits.slice(2)}`;
  else if (digits.startsWith('92') && digits.length === 12) e164 = `+${digits}`;
  else if (digits.startsWith('03') && digits.length === 11) e164 = `+92${digits.slice(1)}`;
  else if (digits.startsWith('3') && digits.length === 10) e164 = `+92${digits}`;
  else e164 = `+${digits}`;

  return /^\+\d{8,15}$/.test(e164) ? e164 : null;
}

/** Urdu (۰-۹) and Arabic-Indic (٠-٩) digits → ASCII 0-9. */
export function toAsciiDigits(text: string): string {
  return text
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/**
 * Keyed hash of a normalized phone number, used to look up returning
 * callers. The secret is PHONE_HASH_SECRET (falls back to the service-role
 * key, which only the server holds).
 */
export function hashPhone(e164: string): string {
  const secret = process.env.PHONE_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createHmac('sha256', secret).update(e164).digest('hex');
}
