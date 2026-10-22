import { createAdminClient } from '@/lib/supabase/admin';
import { hashPhone } from '@/lib/sms/phone';
import { checkFlood } from '@/lib/ops/alerts';

// ===========================================================================
// Spam and flood guard, checked before a call is filed:
//
//   blocked number            → refused, nothing stored, no AI call
//   too many calls per number → refused, told their latest tracking number
//   too many calls per IP     → refused (browser simulator only)
//
// Counts come from the call_attempts table, so they hold across serverless
// instances. Limits can be tuned with env vars (see LIMITS). Every logged
// attempt also runs the flood check (lib/ops/alerts.ts).
// ===========================================================================

const HOUR_MS = 60 * 60 * 1000;

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export const LIMITS = {
  /** Complaints one number may file per hour */
  perNumberHour: () => envInt('SPAM_MAX_CALLS_PER_HOUR', 4),
  /** Complaints one number may file per day */
  perNumberDay: () => envInt('SPAM_MAX_CALLS_PER_DAY', 15),
  /** Simulator calls one IP may make per 10 minutes (high: a venue's Wi-Fi is one IP) */
  perIp10Min: () => envInt('SPAM_MAX_CALLS_PER_IP', 20),
  /** Spam-labelled calls in 7 days that block a number automatically */
  autoBlockAfterSpam: () => envInt('SPAM_AUTO_BLOCK_AFTER', 2),
  /** How long an automatic block lasts */
  autoBlockHours: () => envInt('SPAM_AUTO_BLOCK_HOURS', 24),
};

export type Channel = 'simulator' | 'twilio' | 'webhook';

export type GuardVerdict =
  | { allowed: true }
  | {
      allowed: false;
      reason: 'blocked' | 'rate_limited';
      /** Bilingual text for the caller (spoken on a phone line, shown in the simulator) */
      message: { ur: string; en: string };
      /** The caller's most recent complaint, when they hit a limit */
      latest_tracking_id?: string;
    };

/** Keyed hash of an IP, so call_attempts never holds raw IPs. */
export function ipKey(ip: string): string {
  return hashPhone(`ip:${ip}`);
}

/** "+923001234567" → "+92 300 ••• 4567" */
export function maskPhone(e164: string | null | undefined): string | null {
  if (!e164) return null;
  const m = e164.match(/^\+92(\d{3})\d+(\d{4})$/);
  if (m) return `+92 ${m[1]} ••• ${m[2]}`;
  return e164.length > 6 ? `${e164.slice(0, 4)} ••• ${e164.slice(-4)}` : '•••';
}

/** The active block on a number hash, if any. */
export async function activeBlock(phoneHash: string) {
  const { data } = await createAdminClient()
    .from('blocked_numbers')
    .select('id, reason, blocked_until, phone_masked, created_at')
    .eq('phone_hash', phoneHash)
    .maybeSingle();
  if (!data) return null;
  if (data.blocked_until && Date.parse(data.blocked_until) <= Date.now()) return null;
  return data;
}

async function acceptedSince(callerKey: string, sinceMs: number, cap: number): Promise<number> {
  const { data } = await createAdminClient()
    .from('call_attempts')
    .select('id')
    .eq('caller_key', callerKey)
    .eq('outcome', 'accepted')
    .gte('created_at', new Date(Date.now() - sinceMs).toISOString())
    .limit(cap);
  return data?.length ?? 0;
}

async function latestTrackingId(phoneHash: string): Promise<string | undefined> {
  const supabase = createAdminClient();
  const { data: citizen } = await supabase
    .from('citizens')
    .select('id')
    .eq('phone_hash', phoneHash)
    .maybeSingle();
  if (!citizen) return undefined;
  const { data: latest } = await supabase
    .from('complaints')
    .select('tracking_id')
    .eq('citizen_id', citizen.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return latest?.tracking_id ?? undefined;
}

export async function recordAttempt(
  callerKey: string,
  keyKind: 'phone' | 'ip',
  outcome: 'accepted' | 'rate_limited' | 'blocked',
  channel: Channel,
  complaintId?: string
) {
  await createAdminClient().from('call_attempts').insert({
    caller_key: callerKey,
    key_kind: keyKind,
    outcome,
    channel,
    ...(complaintId ? { complaint_id: complaintId } : {}),
  });
  // An alarm must never stop a call from being filed
  await checkFlood().catch((err) => console.error('Flood check failed:', err));
}

const BLOCKED_MESSAGE = {
  ur: 'معذرت، اس نمبر سے شکایات عارضی طور پر بند ہیں۔',
  en: 'Sorry, complaints from this number are temporarily blocked.',
};

function limitMessage(trackingId?: string) {
  return trackingId
    ? {
        ur: `آپ پہلے ہی کئی شکایات درج کر چکے ہیں۔ آپ کی آخری شکایت کا نمبر ${trackingId} ہے۔ براہ کرم بعد میں کال کریں۔`,
        en: `You have already made several complaints. Your latest complaint number is ${trackingId}. Please call again later.`,
      }
    : {
        ur: 'بہت زیادہ کالیں۔ براہ کرم کچھ دیر بعد کال کریں۔',
        en: 'Too many calls. Please wait a while and call again.',
      };
}

/**
 * Decide whether a call may be filed. Refusals are logged in call_attempts
 * (so a flood shows up even when nothing is filed); accepted calls are
 * logged by the caller with `recordAttempt(…, 'accepted', …)` once filed.
 */
export async function checkCaller({
  phone,
  ip,
  channel,
}: {
  phone?: string | null;
  ip?: string | null;
  channel: Channel;
}): Promise<GuardVerdict> {
  if (phone) {
    const key = hashPhone(phone);
    if (await activeBlock(key)) {
      await recordAttempt(key, 'phone', 'blocked', channel);
      return { allowed: false, reason: 'blocked', message: BLOCKED_MESSAGE };
    }
    const hourCap = LIMITS.perNumberHour();
    const dayCap = LIMITS.perNumberDay();
    if (
      (await acceptedSince(key, HOUR_MS, hourCap)) >= hourCap ||
      (await acceptedSince(key, 24 * HOUR_MS, dayCap)) >= dayCap
    ) {
      await recordAttempt(key, 'phone', 'rate_limited', channel);
      const latest = await latestTrackingId(key);
      return {
        allowed: false,
        reason: 'rate_limited',
        message: limitMessage(latest),
        ...(latest ? { latest_tracking_id: latest } : {}),
      };
    }
  }

  if (ip) {
    const key = ipKey(ip);
    const cap = LIMITS.perIp10Min();
    if ((await acceptedSince(key, 10 * 60 * 1000, cap)) >= cap) {
      await recordAttempt(key, 'ip', 'rate_limited', channel);
      return { allowed: false, reason: 'rate_limited', message: limitMessage() };
    }
  }

  return { allowed: true };
}

/** Log an accepted call against every key it was checked with. */
export async function recordAccepted(
  { phone, ip, channel }: { phone?: string | null; ip?: string | null; channel: Channel },
  complaintId: string
) {
  if (phone) await recordAttempt(hashPhone(phone), 'phone', 'accepted', channel, complaintId);
  if (ip) await recordAttempt(ipKey(ip), 'ip', 'accepted', channel, complaintId);
}

/** Block a number. hours = null blocks until someone unblocks it. */
export async function blockNumber({
  phone,
  phoneHash,
  reason,
  hours,
  blockedBy,
}: {
  phone?: string | null;
  phoneHash: string;
  reason: string;
  hours: number | null;
  blockedBy: string | null;
}) {
  const supabase = createAdminClient();
  const row = {
    phone_masked: maskPhone(phone),
    reason,
    blocked_until: hours ? new Date(Date.now() + hours * HOUR_MS).toISOString() : null,
    blocked_by: blockedBy,
  };
  const { data: existing } = await supabase
    .from('blocked_numbers')
    .select('id')
    .eq('phone_hash', phoneHash)
    .maybeSingle();
  if (existing) {
    await supabase.from('blocked_numbers').update(row).eq('id', existing.id);
    return existing.id as string;
  }
  const { data } = await supabase
    .from('blocked_numbers')
    .insert({ phone_hash: phoneHash, ...row })
    .select('id')
    .single();
  return (data?.id as string | undefined) ?? null;
}

/**
 * After the AI labels a call as spam: block the caller automatically once
 * they reach LIMITS.autoBlockAfterSpam spam calls in 7 days. Never
 * shortens or replaces a block an admin made.
 */
export async function autoBlockIfRepeatSpammer(citizenId: string | null): Promise<boolean> {
  if (!citizenId) return false;
  const supabase = createAdminClient();
  const { data: citizen } = await supabase
    .from('citizens')
    .select('phone_hash, phone')
    .eq('id', citizenId)
    .maybeSingle();
  if (!citizen?.phone_hash) return false;

  const threshold = LIMITS.autoBlockAfterSpam();
  const { data: spam } = await supabase
    .from('complaints')
    .select('id')
    .eq('citizen_id', citizenId)
    .eq('status', 'spam')
    .gte('created_at', new Date(Date.now() - 7 * 24 * HOUR_MS).toISOString())
    .limit(threshold);
  if ((spam?.length ?? 0) < threshold) return false;
  if (await activeBlock(citizen.phone_hash)) return false;

  await blockNumber({
    phone: citizen.phone,
    phoneHash: citizen.phone_hash,
    reason: `Automatic: ${threshold} spam calls in 7 days`,
    hours: LIMITS.autoBlockHours(),
    blockedBy: null,
  });
  return true;
}
