import { createAdminClient } from '@/lib/supabase/admin';

// ===========================================================================
// Live numbers for the control room's System health panel: how many calls
// are coming in, how many wait for the AI and for how long, what failed,
// and how much of the free storage is used.
// ===========================================================================

const MINUTE = 60_000;
const since = (ms: number) => new Date(Date.now() - ms).toISOString();

/** Free-tier limits the panel compares against */
export const FREE_TIER = {
  databaseBytes: 500 * 1024 * 1024,
  storageBytes: 1024 * 1024 * 1024,
};

export interface SystemHealth {
  calls_last_hour: number;
  refused_last_hour: number;
  waiting_for_ai: number;
  oldest_waiting_minutes: number | null;
  ai_failures_24h: number;
  sms_sent_24h: number;
  sms_failed_24h: number;
  sms_stuck: number;
  last_sms_sent_at: string | null;
  overdue: number;
  duplicates_merged_24h: number;
  database_bytes: number | null;
  recording_files: number | null;
  recording_bytes: number | null;
  limits: typeof FREE_TIER;
  checked_at: string;
}

async function count(query: PromiseLike<{ count: number | null }>): Promise<number> {
  return (await query).count ?? 0;
}

export async function systemHealth(): Promise<SystemHealth> {
  const supabase = createAdminClient();
  const head = { count: 'exact' as const, head: true };

  const [
    callsLastHour,
    refusedLastHour,
    waitingForAi,
    oldest,
    aiFailures,
    smsSent,
    smsFailed,
    smsStuck,
    lastSms,
    overdue,
    duplicates,
    usage,
  ] = await Promise.all([
    count(supabase.from('call_attempts').select('id', head).eq('outcome', 'accepted').gte('created_at', since(60 * MINUTE))),
    count(supabase.from('call_attempts').select('id', head).neq('outcome', 'accepted').gte('created_at', since(60 * MINUTE))),
    count(supabase.from('complaints').select('id', head).eq('status', 'processing')),
    supabase
      .from('complaints')
      .select('created_at')
      .eq('status', 'processing')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    count(
      supabase
        .from('complaints')
        .select('id', head)
        .not('processing_error', 'is', null)
        .gte('created_at', since(24 * 60 * MINUTE))
    ),
    count(
      supabase
        .from('sms_messages')
        .select('id', head)
        .eq('direction', 'out')
        .in('status', ['sent', 'delivered'])
        .gte('created_at', since(24 * 60 * MINUTE))
    ),
    count(
      supabase
        .from('sms_messages')
        .select('id', head)
        .eq('direction', 'out')
        .eq('status', 'failed')
        .gte('created_at', since(24 * 60 * MINUTE))
    ),
    // Queued for over 5 minutes: the phone isn't picking messages up
    count(
      supabase
        .from('sms_messages')
        .select('id', head)
        .eq('direction', 'out')
        .eq('status', 'queued')
        .lt('created_at', since(5 * MINUTE))
        .gte('created_at', since(24 * 60 * MINUTE))
    ),
    supabase
      .from('sms_messages')
      .select('created_at')
      .eq('direction', 'out')
      .in('status', ['sent', 'delivered'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    count(
      supabase
        .from('complaints')
        .select('id', head)
        .in('status', ['open', 'in_progress'])
        .not('escalated_at', 'is', null)
    ),
    count(
      supabase
        .from('complaints')
        .select('id', head)
        .not('duplicate_of', 'is', null)
        .gte('created_at', since(24 * 60 * MINUTE))
    ),
    supabase.rpc('system_usage').maybeSingle(),
  ]);

  const sizes = (usage.data ?? null) as {
    database_bytes: number;
    recording_files: number;
    recording_bytes: number;
  } | null;

  return {
    calls_last_hour: callsLastHour,
    refused_last_hour: refusedLastHour,
    waiting_for_ai: waitingForAi,
    oldest_waiting_minutes: oldest.data
      ? Math.floor((Date.now() - Date.parse(oldest.data.created_at)) / MINUTE)
      : null,
    ai_failures_24h: aiFailures,
    sms_sent_24h: smsSent,
    sms_failed_24h: smsFailed,
    sms_stuck: smsStuck,
    last_sms_sent_at: lastSms.data?.created_at ?? null,
    overdue,
    duplicates_merged_24h: duplicates,
    database_bytes: sizes ? Number(sizes.database_bytes) : null,
    recording_files: sizes ? Number(sizes.recording_files) : null,
    recording_bytes: sizes ? Number(sizes.recording_bytes) : null,
    limits: FREE_TIER,
    checked_at: new Date().toISOString(),
  };
}
