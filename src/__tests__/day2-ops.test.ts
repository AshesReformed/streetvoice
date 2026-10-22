import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FakeDb } from './helpers/fake-supabase';

// Duplicate grouping, alarms and escalation, against the in-memory
// database. The fake database stamps rows from 2026-10-01T00:00Z.
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/sms/notify', () => ({
  sendSms: vi.fn(async () => true),
  publicBaseUrl: () => 'https://streetvoice.test',
}));

import { createAdminClient } from '@/lib/supabase/admin';
import { sendSms } from '@/lib/sms/notify';
import {
  findOpenDuplicate,
  linkDuplicate,
  normalizeArea,
  priorityFor,
  propagateStatus,
  sameArea,
} from '@/lib/pipeline/duplicates';
import { checkFlood, checkForAlerts, raiseAlert } from '@/lib/ops/alerts';
import { escalateOverdue, sendReminders } from '@/lib/ops/escalation';

const HOUR = 3600_000;
const START = Date.parse('2026-10-01T00:00:00Z');
let db: FakeDb;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'], now: START + 10 * 60_000 });
  db = new FakeDb();
  db.tables.system_alerts = [];
  db.tables.call_attempts = [];
  vi.mocked(createAdminClient).mockReturnValue(db as unknown as ReturnType<typeof createAdminClient>);
  process.env.ALERT_SMS_NUMBERS = '03001112222';
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.ALERT_SMS_NUMBERS;
});

function complaint(row: Record<string, unknown>) {
  return db.insertRows('complaints', [
    { status: 'open', priority: 'low', department_id: 'dept-1', area: 'Model Town', ...row },
  ])[0];
}

describe('area matching', () => {
  it('normalizes punctuation and case', () => {
    expect(normalizeArea('  Model Town, Lahore. ')).toBe('model town lahore');
  });
  it('matches the same place written differently', () => {
    expect(sameArea('Model Town', 'model town, Lahore')).toBe(true);
    expect(sameArea('Gulberg', 'Model Town')).toBe(false);
    expect(sameArea('G', 'G block')).toBe(false); // too short to trust
    expect(sameArea(null, 'Model Town')).toBe(false);
  });
  it('raises priority with the number of reports, never lowers it', () => {
    expect(priorityFor(2, 'low')).toBe('low');
    expect(priorityFor(3, 'low')).toBe('medium');
    expect(priorityFor(5, 'medium')).toBe('high');
    expect(priorityFor(3, 'high')).toBe('high');
  });
});

describe('duplicate grouping', () => {
  it('finds the oldest open complaint for the same department and area', async () => {
    const first = complaint({});
    complaint({ status: 'resolved' });
    complaint({ area: 'Gulberg' });
    const child = complaint({ status: 'processing', area: 'model town lahore' });
    const match = await findOpenDuplicate(child.id as string, 'dept-1', 'model town lahore');
    expect(match?.id).toBe(first.id);
  });

  it('ignores other departments and complaints older than 48 hours', async () => {
    complaint({ department_id: 'dept-2' });
    vi.setSystemTime(START + 49 * HOUR);
    const child = complaint({ status: 'processing' });
    expect(await findOpenDuplicate(child.id as string, 'dept-1', 'Model Town')).toBeNull();
  });

  it('links the report, counts it and texts the caller', async () => {
    const parent = complaint({ tracking_id: '100001' });
    const child = complaint({ tracking_id: '100002', status: 'processing' });
    const match = (await findOpenDuplicate(child.id as string, 'dept-1', 'Model Town'))!;
    const reports = await linkDuplicate(
      { id: child.id as string, tracking_id: '100002', citizenPhone: '+923001234567' },
      match,
      { sms_number: '+923009998888' }
    );
    expect(reports).toBe(2);
    const rows = db.tables.complaints;
    expect(rows.find((r) => r.id === parent.id)?.report_count).toBe(2);
    expect(rows.find((r) => r.id === child.id)).toMatchObject({ duplicate_of: parent.id, status: 'open' });
    // Caller told, department not texted again below the first milestone
    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendSms).mock.calls[0][0]).toMatchObject({ to: '+923001234567', purpose: 'citizen_linked' });
  });

  it('tells the department at the 3rd report and raises the priority', async () => {
    const parent = complaint({ report_count: 2 });
    const child = complaint({ status: 'processing' });
    const match = (await findOpenDuplicate(child.id as string, 'dept-1', 'Model Town'))!;
    await linkDuplicate({ id: child.id as string, tracking_id: 'x', citizenPhone: null }, match, {
      sms_number: '+923009998888',
    });
    expect(db.tables.complaints.find((r) => r.id === parent.id)).toMatchObject({
      report_count: 3,
      priority: 'medium',
    });
    expect(vi.mocked(sendSms).mock.calls.map((c) => c[0].purpose)).toEqual(['department_more_reports']);
  });

  it('moves linked complaints along with the first one', async () => {
    const parent = complaint({});
    const a = complaint({ duplicate_of: parent.id });
    const b = complaint({ duplicate_of: parent.id, status: 'resolved' });
    expect(await propagateStatus(parent.id as string, 'in_progress')).toEqual([a.id]);
    expect(db.tables.complaints.find((r) => r.id === a.id)?.status).toBe('in_progress');
    expect(db.tables.complaints.find((r) => r.id === b.id)?.status).toBe('resolved');
    expect(await propagateStatus(parent.id as string, 'open')).toEqual([]);
  });
});

describe('alarms', () => {
  it('raises a flood alert once and texts the alert numbers', async () => {
    for (let i = 0; i < 30; i++) {
      db.insertRows('call_attempts', [{ caller_key: `k${i}`, key_kind: 'phone', outcome: 'accepted' }]);
    }
    expect(await checkFlood()).toBe(true);
    expect(await checkFlood()).toBe(false); // already open
    expect(db.tables.system_alerts).toHaveLength(1);
    expect(db.tables.system_alerts[0]).toMatchObject({ kind: 'flood' });
    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendSms).mock.calls[0][0]).toMatchObject({ to: '+923001112222', purpose: 'admin_alert' });
  });

  it('stays quiet below the threshold', async () => {
    db.insertRows('call_attempts', [{ caller_key: 'k', key_kind: 'phone', outcome: 'accepted' }]);
    expect(await checkFlood()).toBe(false);
    expect(db.tables.system_alerts).toHaveLength(0);
  });

  it('raises again once the open alert is dismissed', async () => {
    expect(await raiseAlert('flood', 'calls', 'test')).toBe(true);
    db.tables.system_alerts[0].resolved_at = new Date().toISOString();
    expect(await raiseAlert('flood', 'calls', 'test')).toBe(true);
  });

  it('flags a repeat caller, an area spike and an SMS outage', async () => {
    for (let i = 0; i < 5; i++) {
      db.insertRows('call_attempts', [{ caller_key: 'spammer', key_kind: 'phone', outcome: 'rate_limited' }]);
      complaint({ department: { name: 'Electricity' } });
      db.insertRows('sms_messages', [{ direction: 'out', status: i < 3 ? 'failed' : 'sent' }]);
    }
    expect(await checkForAlerts()).toBe(3);
    const kinds = db.tables.system_alerts.map((a) => a.kind).sort();
    expect(kinds).toEqual(['area_spike', 'repeat_caller', 'sms_failing']);
    // The SMS outage isn't texted (SMS is what's broken)
    expect(sendSms).toHaveBeenCalledTimes(2);
  });

  it('flags complaints stuck waiting for the AI', async () => {
    complaint({ status: 'processing' });
    vi.setSystemTime(START + 20 * 60_000);
    expect(await checkForAlerts()).toBe(1);
    expect(db.tables.system_alerts[0].kind).toBe('ai_backlog');
  });
});

describe('escalation', () => {
  const department = { name: 'Electricity', sms_number: '+923009998888', supervisor_sms_number: null };

  it('reminds the department once after 24 hours without a reply', async () => {
    const c = complaint({ tracking_id: '100001', dispatched_at: new Date(START).toISOString(), department });
    vi.setSystemTime(START + 5 * HOUR);
    expect(await sendReminders()).toEqual([]); // not urgent: waits 24 h
    vi.setSystemTime(START + 25 * HOUR);
    expect(await sendReminders()).toEqual(['100001']);
    expect(await sendReminders()).toEqual([]);
    expect(db.tables.complaints.find((r) => r.id === c.id)?.reminded_at).toBeTruthy();
    expect(vi.mocked(sendSms).mock.calls[0][0]).toMatchObject({
      to: '+923009998888',
      purpose: 'department_reminder',
    });
  });

  it('reminds sooner for urgent complaints and skips linked duplicates', async () => {
    complaint({ tracking_id: 'urgent', priority: 'high', dispatched_at: new Date(START).toISOString(), department });
    complaint({ tracking_id: 'dup', priority: 'high', duplicate_of: 'x', dispatched_at: new Date(START).toISOString(), department });
    vi.setSystemTime(START + 5 * HOUR);
    expect(await sendReminders()).toEqual(['urgent']);
  });

  it('escalates after 7 days to the supervisor, or the alert numbers', async () => {
    complaint({ tracking_id: 'a', status: 'in_progress', department: { ...department, supervisor_sms_number: '+923004445555' } });
    complaint({ tracking_id: 'b', department });
    complaint({ tracking_id: 'c', status: 'resolved', department });
    vi.setSystemTime(START + 6 * 24 * HOUR);
    expect(await escalateOverdue()).toEqual([]);
    vi.setSystemTime(START + 8 * 24 * HOUR);
    expect(await escalateOverdue()).toEqual(['a', 'b']);
    expect(await escalateOverdue()).toEqual([]);
    expect(vi.mocked(sendSms).mock.calls.map((c) => c[0].to)).toEqual(['+923004445555', '+923001112222']);
  });
});
