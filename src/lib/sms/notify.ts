import { createAdminClient } from '@/lib/supabase/admin';
import { getSmsProvider } from './provider';
import { sms } from './messages';
import { propagateStatus } from '@/lib/pipeline/duplicates';

// ===========================================================================
// Who gets an SMS, and when:
//
//   filed        → citizen: "registered, number 482913"
//   routed       → department: the complaint in Urdu + a no-login link
//                  citizen:    "sent to the Electricity department"
//   in_progress  → citizen: "work has started"
//   resolved     → citizen: "resolved"
//   (linked duplicates follow the first complaint; see pipeline/duplicates)
//
// Every message is logged in sms_messages. Sending never throws: a failed
// SMS is logged and must not break the complaint flow.
// ===========================================================================

export async function sendSms(opts: {
  to: string;
  body: string;
  purpose: string;
  complaintId?: string | null;
}): Promise<boolean> {
  const supabase = createAdminClient();
  const provider = getSmsProvider();

  const { data: logged } = await supabase
    .from('sms_messages')
    .insert({
      direction: 'out',
      phone: opts.to,
      body: opts.body,
      purpose: opts.purpose,
      complaint_id: opts.complaintId ?? null,
      status: 'queued',
    })
    .select('id')
    .single();

  try {
    const { ref } = await provider.send(opts.to, opts.body);
    if (logged) {
      await supabase.from('sms_messages').update({ status: 'sent', provider_ref: ref }).eq('id', logged.id);
    }
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`SMS to ${opts.to} failed:`, message);
    if (logged) {
      await supabase.from('sms_messages').update({ status: 'failed', error: message }).eq('id', logged.id);
    }
    return false;
  }
}

/**
 * Public base URL for links in SMS (no trailing slash): PUBLIC_BASE_URL,
 * else the production domain Vercel provides, else localhost for dev.
 */
export function publicBaseUrl(): string {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return (
    process.env.PUBLIC_BASE_URL ||
    (vercel ? `https://${vercel}` : 'http://localhost:3000')
  ).replace(/\/$/, '');
}

interface ComplaintForSms {
  id: string;
  tracking_id: string;
  status: string;
  priority: string;
  area: string | null;
  summary: string | null;
  summary_urdu: string | null;
  public_token: string;
  citizen: { phone: string | null } | null;
  department: { name: string; name_ur: string | null; sms_number: string | null } | null;
}

async function loadComplaint(complaintId: string): Promise<ComplaintForSms | null> {
  const { data } = await createAdminClient()
    .from('complaints')
    .select(
      'id, tracking_id, status, priority, area, summary, summary_urdu, public_token, citizen:citizens(phone), department:departments(name, name_ur, sms_number)'
    )
    .eq('id', complaintId)
    .maybeSingle();
  return (data as unknown as ComplaintForSms) ?? null;
}

export type CitizenEvent = 'filed' | 'routed' | 'in_progress' | 'resolved';

/** Text the caller about their complaint. Skipped when we have no number. */
export async function notifyCitizen(complaintId: string, event: CitizenEvent): Promise<boolean> {
  const c = await loadComplaint(complaintId);
  const to = c?.citizen?.phone;
  if (!c || !to) return false;

  const department = c.department?.name_ur || c.department?.name || '';
  const body =
    event === 'filed'
      ? sms.citizenFiled(c.tracking_id)
      : event === 'routed'
        ? sms.citizenRouted(c.tracking_id, department)
        : event === 'in_progress'
          ? sms.citizenInProgress(c.tracking_id)
          : sms.citizenResolved(c.tracking_id);

  return sendSms({ to, body, purpose: `citizen_${event}`, complaintId });
}

/**
 * Send a routed complaint to its department's phone, in Urdu, with a link
 * to the no-login complaint page. Skipped (returns false) when the
 * department has no SMS number yet.
 */
export async function dispatchToDepartment(complaintId: string): Promise<boolean> {
  const c = await loadComplaint(complaintId);
  const to = c?.department?.sms_number;
  if (!c || !to) return false;

  const sent = await sendSms({
    to,
    body: sms.departmentDispatch({
      id: c.tracking_id,
      urgent: c.priority === 'high',
      area: c.area,
      summary: c.summary_urdu || c.summary || '',
      link: `${publicBaseUrl()}/c/${c.public_token}`,
    }),
    purpose: 'department_dispatch',
    complaintId,
  });
  if (sent) {
    await createAdminClient()
      .from('complaints')
      .update({ dispatched_at: new Date().toISOString() })
      .eq('id', complaintId);
  }
  return sent;
}

/** A complaint was routed to a department: tell the department and the citizen. */
export async function announceRouted(complaintId: string): Promise<void> {
  await dispatchToDepartment(complaintId);
  await notifyCitizen(complaintId, 'routed');
}

/**
 * Citizen SMS for a status change made in the control room or by SMS reply.
 * Complaints linked as the same issue follow along, and their callers are
 * told too.
 */
export async function announceStatus(complaintId: string, status: string): Promise<void> {
  if (status === 'in_progress' || status === 'resolved') {
    await notifyCitizen(complaintId, status);
    for (const childId of await propagateStatus(complaintId, status)) {
      await notifyCitizen(childId, status);
    }
  }
}
