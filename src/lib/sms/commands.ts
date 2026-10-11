import { createAdminClient } from '@/lib/supabase/admin';
import { sms, type ComplaintStatus } from './messages';
import { announceStatus, sendSms } from './notify';
import { normalizePhone, toAsciiDigits } from './phone';

// ===========================================================================
// Incoming SMS. Departments update complaints by replying to the SMS they
// got; citizens (or anyone) can text a tracking number to hear its status.
//
//   "482913 OK"    (also START, شروع, ٹھیک)       → in_progress
//   "482913 DONE"  (also FIXED, حل, مکمل, ختم)    → resolved
//   "482913"                                     → current status
//
// Only the department a complaint is routed to may change its status: the
// sender's number must match that department's sms_number.
// ===========================================================================

// Loop guards (see handleIncomingSms)
const ECHO_WINDOW_MS = 60 * 60 * 1000;
const REPLY_WINDOW_MS = 10 * 60 * 1000;
const MAX_REPLIES_PER_WINDOW = 5;

const START_WORDS =['ok', 'okay', 'start', 'started', 'شروع', 'ٹھیک', 'اوکے'];
const DONE_WORDS = ['done', 'fixed', 'resolved', 'complete', 'completed', 'حل', 'مکمل', 'ختم'];

export type ParsedCommand =
  | { kind: 'start' | 'done' | 'status'; trackingId: string }
  | { kind: 'unknown' };

export function parseCommand(text: string): ParsedCommand {
  const normalized = toAsciiDigits(text).trim().toLowerCase();
  const match = normalized.match(/(\d{6})/);
  if (!match) return { kind: 'unknown' };

  const trackingId = match[1];
  const rest = normalized.replace(match[1], ' ');
  const words = rest.split(/[\s,.;:!?،۔-]+/).filter(Boolean);

  if (words.some((w) => DONE_WORDS.includes(w))) return { kind: 'done', trackingId };
  if (words.some((w) => START_WORDS.includes(w))) return { kind: 'start', trackingId };
  if (words.length === 0) return { kind: 'status', trackingId };
  return { kind: 'unknown' };
}

export interface IncomingSmsResult {
  action: 'in_progress' | 'resolved' | 'status' | 'not_found' | 'forbidden' | 'help' | 'ignored';
  reply: string;
  complaintId?: string;
}

/** Handle one incoming SMS: log it, act on it, and reply to the sender. */
export async function handleIncomingSms(from: string, text: string): Promise<IncomingSmsResult> {
  const supabase = createAdminClient();
  const phone = normalizePhone(from);
  const sender = phone ?? from;

  // Loop guard 1: one of our own messages coming back (e.g. the gateway SIM
  // texting itself, or a phone that is both department and gateway). Our
  // texts contain tracking numbers and words like DONE, so answering them
  // would start an endless SMS ping-pong. Log and stop.
  const recentCutoff = new Date(Date.now() - ECHO_WINDOW_MS).toISOString();
  const { data: echo } = await supabase
    .from('sms_messages')
    .select('id')
    .eq('direction', 'out')
    .eq('body', text)
    .gte('created_at', recentCutoff)
    .limit(1)
    .maybeSingle();
  if (echo) {
    await supabase.from('sms_messages').insert({
      direction: 'in',
      phone: sender,
      body: text,
      purpose: 'echo_ignored',
      status: 'received',
    });
    return { action: 'ignored', reply: '' };
  }

  const command = parseCommand(text);

  const complaint =
    command.kind === 'unknown'
      ? null
      : (
          await supabase
            .from('complaints')
            .select('id, tracking_id, status, department:departments(sms_number)')
            .eq('tracking_id', command.trackingId)
            .maybeSingle()
        ).data;

  await supabase.from('sms_messages').insert({
    direction: 'in',
    phone: sender,
    body: text,
    purpose: `command_${command.kind}`,
    complaint_id: complaint?.id ?? null,
    status: 'received',
  });

  // Never answer company senders ("ZONG 5G", bundle notices): replies would
  // fail or waste SMS. Free text only gets the help text if it comes from a
  // department, so random messages to the gateway SIM go unanswered.
  if (!phone) return { action: 'ignored', reply: '' };
  if (command.kind === 'unknown') {
    const { data: department } = await supabase
      .from('departments')
      .select('id')
      .eq('sms_number', phone)
      .limit(1)
      .maybeSingle();
    if (!department) return { action: 'ignored', reply: '' };
  }

  // Loop guard 2: at most a few automatic replies per number in a short
  // window, whatever they are replying to.
  const { data: recentReplies } = await supabase
    .from('sms_messages')
    .select('id')
    .eq('direction', 'out')
    .eq('purpose', 'command_reply')
    .eq('phone', phone)
    .gte('created_at', new Date(Date.now() - REPLY_WINDOW_MS).toISOString());
  if ((recentReplies?.length ?? 0) >= MAX_REPLIES_PER_WINDOW) {
    return { action: 'ignored', reply: '' };
  }

  let result: IncomingSmsResult;
  if (command.kind === 'unknown') {
    result = { action: 'help', reply: sms.help() };
  } else if (!complaint) {
    result = { action: 'not_found', reply: sms.notFound(command.trackingId) };
  } else if (command.kind === 'status') {
    result = {
      action: 'status',
      reply: sms.status(complaint.tracking_id, complaint.status as ComplaintStatus),
      complaintId: complaint.id,
    };
  } else {
    const department = complaint.department as unknown as { sms_number: string | null } | null;
    const departmentNumber = normalizePhone(department?.sms_number);
    if (!departmentNumber || departmentNumber !== sender) {
      result = { action: 'forbidden', reply: sms.notYourDepartment(complaint.tracking_id), complaintId: complaint.id };
    } else {
      const status = command.kind === 'done' ? 'resolved' : 'in_progress';
      if (complaint.status !== status) {
        await supabase.from('complaints').update({ status }).eq('id', complaint.id);
        // The status trigger wrote a history row; say where the change came from
        const { data: latest } = await supabase
          .from('status_history')
          .select('id')
          .eq('complaint_id', complaint.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latest) {
          await supabase
            .from('status_history')
            .update({ remark: `Updated by department SMS: "${text.trim().slice(0, 100)}"` })
            .eq('id', latest.id);
        }
        await announceStatus(complaint.id, status);
      }
      result = {
        action: status,
        reply: status === 'resolved' ? sms.ackResolved(complaint.tracking_id) : sms.ackInProgress(complaint.tracking_id),
        complaintId: complaint.id,
      };
    }
  }

  await sendSms({ to: sender, body: result.reply, purpose: 'command_reply', complaintId: result.complaintId });
  return result;
}
