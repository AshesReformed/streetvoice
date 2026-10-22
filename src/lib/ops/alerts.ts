import { createHash } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendSms } from '@/lib/sms/notify';
import { sms } from '@/lib/sms/messages';
import { normalizePhone } from '@/lib/sms/phone';
import { normalizeArea } from '@/lib/pipeline/duplicates';

// ===========================================================================
// Alarms for the control room. Each check looks at the last few minutes:
//
//   flood          too many calls overall (an attack, or a city-wide outage)
//   repeat_caller  one number or IP refused again and again
//   area_spike     many complaints about one department in one area: a real
//                  outage, worth a look before the department is swamped
//   ai_backlog     complaints waiting for the AI too long
//   sms_failing    the SMS phone isn't sending
//
// A new alert shows as a red banner on every control-room page and is
// texted to ALERT_SMS_NUMBERS (comma-separated). While an alert of the same
// kind and key is open (2 hours), it isn't raised again.
//
// Many calls can raise the same alert in the same instant (a flood is many
// calls), so a check-then-insert alone would let all of them through. Each
// alert gets an id made from its kind, key, 2-hour window and how many of
// its kind were dismissed in that window: callers racing to raise the same
// alert compute the same id, and the database keeps only the first.
// ===========================================================================

const MINUTE = 60_000;
const DEDUPE_MS = 2 * 60 * MINUTE;

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export const THRESHOLDS = {
  floodCallsPer10Min: () => envInt('ALERT_FLOOD_CALLS_PER_10MIN', 30),
  repeatRefusalsPer10Min: () => envInt('ALERT_REPEAT_REFUSALS_PER_10MIN', 5),
  areaComplaintsPerHour: () => envInt('ALERT_AREA_COMPLAINTS_PER_HOUR', 5),
  aiBacklogCount: () => envInt('ALERT_AI_BACKLOG', 20),
  aiBacklogMinutes: () => envInt('ALERT_AI_BACKLOG_MINUTES', 15),
  smsFailuresPer30Min: () => envInt('ALERT_SMS_FAILURES', 3),
};

export type AlertKind = 'flood' | 'repeat_caller' | 'area_spike' | 'ai_backlog' | 'sms_failing';

export function alertNumbers(): string[] {
  return (process.env.ALERT_SMS_NUMBERS ?? '')
    .split(',')
    .map((n) => normalizePhone(n))
    .filter((n): n is string => Boolean(n));
}

const since = (ms: number) => new Date(Date.now() - ms).toISOString();

/** A uuid-shaped id that is the same for everyone raising this alert now */
export function alertId(kind: string, dedupeKey: string, dismissed: number, now = Date.now()): string {
  const h = createHash('sha256')
    .update(`${kind}:${dedupeKey}:${Math.floor(now / DEDUPE_MS)}:${dismissed}`)
    .digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Insert the alert unless the same one is open. Returns true if this call added it. */
async function insertOnce(
  kind: AlertKind,
  dedupeKey: string,
  message: string,
  details: Record<string, unknown>
): Promise<boolean> {
  const supabase = createAdminClient();
  const { data: recent } = await supabase
    .from('system_alerts')
    .select('id, resolved_at')
    .eq('kind', kind)
    .eq('dedupe_key', dedupeKey)
    .gte('created_at', since(DEDUPE_MS))
    .limit(50);
  if ((recent ?? []).some((a) => !a.resolved_at)) return false;

  const id = alertId(kind, dedupeKey, (recent ?? []).length);
  const { data: inserted } = await supabase
    .from('system_alerts')
    .upsert({ id, kind, dedupe_key: dedupeKey, message, details }, { onConflict: 'id', ignoreDuplicates: true })
    .select('id');
  return (inserted ?? []).length > 0;
}

/** Raise an alert unless the same one is already open. Returns true if new. */
export async function raiseAlert(
  kind: AlertKind,
  dedupeKey: string,
  message: string,
  details: Record<string, unknown> = {}
): Promise<boolean> {
  if (!(await insertOnce(kind, dedupeKey, message, details))) return false;
  for (const to of alertNumbers()) {
    await sendSms({ to, body: sms.adminAlert(message), purpose: 'admin_alert' });
  }
  return true;
}

/** Cheap enough to run after every call: one count query. */
export async function checkFlood(): Promise<boolean> {
  const cap = THRESHOLDS.floodCallsPer10Min();
  const { data } = await createAdminClient()
    .from('call_attempts')
    .select('id')
    .gte('created_at', since(10 * MINUTE))
    .limit(cap);
  const calls = data?.length ?? 0;
  if (calls < cap) return false;
  return raiseAlert(
    'flood',
    'calls',
    `${calls}+ calls in the last 10 minutes. Check Flagged for spam, or for a city-wide outage.`,
    { calls }
  );
}

async function checkRepeatCallers(): Promise<number> {
  const cap = THRESHOLDS.repeatRefusalsPer10Min();
  const { data } = await createAdminClient()
    .from('call_attempts')
    .select('caller_key, key_kind, outcome')
    .gte('created_at', since(10 * MINUTE))
    .limit(2000);
  const refused = new Map<string, { kind: string; count: number }>();
  for (const a of data ?? []) {
    if (a.outcome === 'accepted') continue;
    const entry = refused.get(a.caller_key) ?? { kind: a.key_kind, count: 0 };
    entry.count++;
    refused.set(a.caller_key, entry);
  }
  let raised = 0;
  for (const [key, { kind, count }] of refused) {
    if (count < cap) continue;
    const who = kind === 'ip' ? 'One device' : 'One phone number';
    const ok = await raiseAlert(
      'repeat_caller',
      key,
      `${who} was refused ${count} times in 10 minutes (blocked or over the limit).`,
      { refusals: count, key_kind: kind }
    );
    if (ok) raised++;
  }
  return raised;
}

async function checkAreaSpikes(): Promise<number> {
  const cap = THRESHOLDS.areaComplaintsPerHour();
  const { data } = await createAdminClient()
    .from('complaints')
    .select('area, department_id, status, department:departments(name)')
    .gte('created_at', since(60 * MINUTE))
    .limit(2000);
  const groups = new Map<string, { area: string; department: string; count: number }>();
  for (const c of data ?? []) {
    const area = normalizeArea(c.area);
    if (!area || !c.department_id || c.status === 'spam') continue;
    const key = `${c.department_id}:${area}`;
    const department = (c.department as unknown as { name: string } | null)?.name ?? 'a department';
    const g = groups.get(key) ?? { area: c.area as string, department, count: 0 };
    g.count++;
    groups.set(key, g);
  }
  let raised = 0;
  for (const [key, g] of groups) {
    if (g.count < cap) continue;
    const ok = await raiseAlert(
      'area_spike',
      key,
      `${g.count} ${g.department} complaints from ${g.area} in the last hour. Possible outage.`,
      { ...g }
    );
    if (ok) raised++;
  }
  return raised;
}

async function checkAiBacklog(): Promise<boolean> {
  const { data } = await createAdminClient()
    .from('complaints')
    .select('created_at')
    .eq('status', 'processing')
    .order('created_at', { ascending: true })
    .limit(1000);
  const waiting = data?.length ?? 0;
  if (!waiting) return false;
  const oldestMin = Math.floor((Date.now() - Date.parse(data![0].created_at)) / MINUTE);
  if (waiting < THRESHOLDS.aiBacklogCount() && oldestMin < THRESHOLDS.aiBacklogMinutes()) return false;
  return raiseAlert(
    'ai_backlog',
    'processing',
    `${waiting} complaints waiting for the AI; the oldest for ${oldestMin} min. They are safe and will be analyzed as capacity frees up.`,
    { waiting, oldest_minutes: oldestMin }
  );
}

async function checkSms(): Promise<boolean> {
  const { data: failed } = await createAdminClient()
    .from('sms_messages')
    .select('id')
    .eq('direction', 'out')
    .eq('status', 'failed')
    .gte('created_at', since(30 * MINUTE))
    .limit(100);
  const failures = failed?.length ?? 0;
  if (failures < THRESHOLDS.smsFailuresPer30Min()) return false;
  // Not texted: SMS is what's broken. The banner still shows.
  return insertOnce(
    'sms_failing',
    'sms',
    `${failures} SMS failed in the last 30 minutes. Check the SMS phone is on, online and has balance.`,
    { failures }
  );
}

/** Every check; run from the 5-minute cron. Returns how many alerts were raised. */
export async function checkForAlerts(): Promise<number> {
  const results = await Promise.all([
    checkFlood().then(Number),
    checkRepeatCallers(),
    checkAreaSpikes(),
    checkAiBacklog().then(Number),
    checkSms().then(Number),
  ]);
  return results.reduce((a, b) => a + b, 0);
}
