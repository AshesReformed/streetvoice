import { createAdminClient } from '@/lib/supabase/admin';
import { publicBaseUrl, sendSms } from '@/lib/sms/notify';
import { sms } from '@/lib/sms/messages';
import { alertNumbers } from '@/lib/ops/alerts';

// ===========================================================================
// Nothing waits forever. Run from the 5-minute cron:
//
//   reminder    sent to the department, still 'open' (no "OK" reply) after
//               ESCALATE_REMIND_HOURS (24 h; 4 h when urgent) → one
//               reminder SMS to the department
//   escalation  still open or in progress ESCALATE_OVERDUE_DAYS (7) after
//               it was filed → SMS to the department's supervisor number
//               (or ALERT_SMS_NUMBERS), and it shows as Overdue
//
// Each happens once per complaint (reminded_at / escalated_at). Linked
// duplicates are skipped: the first complaint stands for them.
// ===========================================================================

const HOUR = 3600_000;

function envNum(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const ESCALATION = {
  remindHours: () => envNum('ESCALATE_REMIND_HOURS', 24),
  remindHoursUrgent: () => envNum('ESCALATE_REMIND_HOURS_URGENT', 4),
  overdueDays: () => envNum('ESCALATE_OVERDUE_DAYS', 7),
};

interface Row {
  id: string;
  tracking_id: string;
  status: string;
  priority: string;
  created_at: string;
  dispatched_at: string | null;
  public_token: string;
  department: { name: string; sms_number: string | null; supervisor_sms_number: string | null } | null;
}

const SELECT =
  'id, tracking_id, status, priority, created_at, dispatched_at, public_token, department:departments(name, sms_number, supervisor_sms_number)';

export async function sendReminders(limit = 20): Promise<string[]> {
  const supabase = createAdminClient();
  // Oldest cutoff is the urgent one; the normal cutoff is checked per row
  const { data } = await supabase
    .from('complaints')
    .select(SELECT)
    .eq('status', 'open')
    .is('reminded_at', null)
    .is('duplicate_of', null)
    .lt('dispatched_at', new Date(Date.now() - ESCALATION.remindHoursUrgent() * HOUR).toISOString())
    .order('dispatched_at', { ascending: true })
    .limit(200);

  const reminded: string[] = [];
  for (const c of (data ?? []) as unknown as Row[]) {
    if (reminded.length >= limit) break;
    const hours = c.priority === 'high' ? ESCALATION.remindHoursUrgent() : ESCALATION.remindHours();
    if (!c.dispatched_at || Date.now() - Date.parse(c.dispatched_at) < hours * HOUR) continue;
    const to = c.department?.sms_number;
    if (!to) continue;
    await sendSms({
      to,
      body: sms.departmentReminder(c.tracking_id, `${publicBaseUrl()}/c/${c.public_token}`),
      purpose: 'department_reminder',
      complaintId: c.id,
    });
    await supabase.from('complaints').update({ reminded_at: new Date().toISOString() }).eq('id', c.id);
    reminded.push(c.tracking_id);
  }
  return reminded;
}

export async function escalateOverdue(limit = 20): Promise<string[]> {
  const supabase = createAdminClient();
  const days = ESCALATION.overdueDays();
  const { data } = await supabase
    .from('complaints')
    .select(SELECT)
    .in('status', ['open', 'in_progress'])
    .is('escalated_at', null)
    .is('duplicate_of', null)
    .lt('created_at', new Date(Date.now() - days * 24 * HOUR).toISOString())
    .order('created_at', { ascending: true })
    .limit(limit);

  const escalated: string[] = [];
  for (const c of (data ?? []) as unknown as Row[]) {
    const recipients = c.department?.supervisor_sms_number
      ? [c.department.supervisor_sms_number]
      : alertNumbers();
    const age = Math.floor((Date.now() - Date.parse(c.created_at)) / (24 * HOUR));
    for (const to of recipients) {
      await sendSms({
        to,
        body: sms.supervisorEscalation(
          c.tracking_id,
          c.department?.name ?? '',
          age,
          `${publicBaseUrl()}/c/${c.public_token}`
        ),
        purpose: 'supervisor_escalation',
        complaintId: c.id,
      });
    }
    // Marked even without a number to text: it still shows as Overdue
    await supabase.from('complaints').update({ escalated_at: new Date().toISOString() }).eq('id', c.id);
    escalated.push(c.tracking_id);
  }
  return escalated;
}
