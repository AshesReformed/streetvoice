import { createHmac } from 'crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FakeDb } from '@/__tests__/helpers/fake-supabase';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/sms/notify', () => ({
  sendSms: vi.fn(async () => true),
  announceStatus: vi.fn(async () => undefined),
}));

import { createAdminClient } from '@/lib/supabase/admin';
import { announceStatus, sendSms } from '@/lib/sms/notify';
import { handleIncomingSms, parseCommand } from '@/lib/sms/commands';
import { normalizePhone, toAsciiDigits } from '@/lib/sms/phone';
import { verifySmsWebhookSignature } from '@/lib/sms/signature';
import { sms } from '@/lib/sms/messages';

describe('normalizePhone', () => {
  it.each([
    ['03001234567', '+923001234567'],
    ['0300-1234567', '+923001234567'],
    ['3001234567', '+923001234567'],
    ['923001234567', '+923001234567'],
    ['00923001234567', '+923001234567'],
    ['+92 300 1234567', '+923001234567'],
    ['۰۳۰۰۱۲۳۴۵۶۷', '+923001234567'],
    ['+447700900123', '+447700900123'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it('rejects things that are not phone numbers', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('hello')).toBeNull();
    expect(normalizePhone('12')).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });

  it('converts Urdu and Arabic-Indic digits', () => {
    expect(toAsciiDigits('۴۸۲۹۱۳ ٤٨٢')).toBe('482913 482');
  });
});

describe('parseCommand', () => {
  it.each([
    ['482913 OK', 'start'],
    ['482913 ok', 'start'],
    ['ok 482913', 'start'],
    ['482913 شروع', 'start'],
    ['482913 DONE', 'done'],
    ['482913 done, thanks ok', 'done'],
    ['۴۸۲۹۱۳ حل', 'done'],
    ['482913 مکمل', 'done'],
    ['482913', 'status'],
    [' 482913 ', 'status'],
  ])('"%s" → %s', (text, kind) => {
    expect(parseCommand(text)).toEqual({ kind, trackingId: '482913' });
  });

  it('does not understand free text', () => {
    expect(parseCommand('hello')).toEqual({ kind: 'unknown' });
    expect(parseCommand('482913 what is this')).toEqual({ kind: 'unknown' });
  });
});

describe('handleIncomingSms', () => {
  let db: FakeDb;
  const DEPT_PHONE = '+923211112222';

  beforeEach(() => {
    vi.clearAllMocks();
    db = new FakeDb();
    vi.mocked(createAdminClient).mockReturnValue(db as unknown as ReturnType<typeof createAdminClient>);
    // The fake ignores select() column lists, so the department join is
    // stored on the row the way Supabase would return it.
    db.tables.complaints.push({
      id: 'c1',
      tracking_id: '482913',
      status: 'open',
      department: { sms_number: DEPT_PHONE },
    });
    db.tables.departments.push({ id: 'd1', name: 'Electricity', sms_number: DEPT_PHONE });
  });

  it('lets the department start and finish work, and tells the citizen', async () => {
    const started = await handleIncomingSms('03211112222', '482913 OK');
    expect(started.action).toBe('in_progress');
    expect(db.tables.complaints[0].status).toBe('in_progress');
    expect(announceStatus).toHaveBeenLastCalledWith('c1', 'in_progress');

    const done = await handleIncomingSms('+923211112222', '482913 DONE');
    expect(done.action).toBe('resolved');
    expect(db.tables.complaints[0].status).toBe('resolved');
    expect(announceStatus).toHaveBeenLastCalledWith('c1', 'resolved');
    expect(db.tables.status_history.at(-1)).toMatchObject({
      status: 'resolved',
      remark: 'Updated by department SMS: "482913 DONE"',
    });

    // Every message in and every reply out is logged / sent
    expect(db.tables.sms_messages.filter((m) => m.direction === 'in')).toHaveLength(2);
    expect(sendSms).toHaveBeenLastCalledWith(
      expect.objectContaining({ to: DEPT_PHONE, body: sms.ackResolved('482913'), purpose: 'command_reply' })
    );
  });

  it('refuses status changes from any other number', async () => {
    const result = await handleIncomingSms('03009998888', '482913 DONE');

    expect(result.action).toBe('forbidden');
    expect(db.tables.complaints[0].status).toBe('open');
    expect(announceStatus).not.toHaveBeenCalled();
  });

  it('answers a status check from anyone', async () => {
    const result = await handleIncomingSms('03009998888', '482913');

    expect(result).toMatchObject({ action: 'status', reply: sms.status('482913', 'open') });
  });

  it('says when a tracking number does not exist', async () => {
    const result = await handleIncomingSms(DEPT_PHONE, '111111 DONE');

    expect(result).toMatchObject({ action: 'not_found', reply: sms.notFound('111111') });
  });

  it('ignores company senders and free text from unknown numbers', async () => {
    expect((await handleIncomingSms('ZONG 5G', 'Your SMS bundle is now active')).action).toBe('ignored');
    expect((await handleIncomingSms('03009998888', 'hello?')).action).toBe('ignored');
    expect(sendSms).not.toHaveBeenCalled();
    // Still logged for the control room
    expect(db.tables.sms_messages.filter((m) => m.direction === 'in')).toHaveLength(2);
  });

  it('explains the format to a department that sends free text', async () => {
    const result = await handleIncomingSms(DEPT_PHONE, 'hello?');

    expect(result).toMatchObject({ action: 'help', reply: sms.help() });
    expect(sendSms).toHaveBeenCalledWith(expect.objectContaining({ to: DEPT_PHONE, body: sms.help() }));
  });
});

describe('verifySmsWebhookSignature', () => {
  const key = 'signing-key';
  const body = '{"event":"sms:received"}';
  const now = 1_790_000_000_000;
  const ts = String(now / 1000);
  const sign = (b: string, t: string) => createHmac('sha256', key).update(b + t).digest('hex');

  it('accepts a correctly signed, fresh request', () => {
    expect(verifySmsWebhookSignature(body, ts, sign(body, ts), key, now)).toBe(true);
  });

  it('rejects a tampered body, a wrong key, a stale timestamp or missing headers', () => {
    expect(verifySmsWebhookSignature(body + ' ', ts, sign(body, ts), key, now)).toBe(false);
    expect(verifySmsWebhookSignature(body, ts, sign(body, ts), 'other-key', now)).toBe(false);
    const old = String(now / 1000 - 600);
    expect(verifySmsWebhookSignature(body, old, sign(body, old), key, now)).toBe(false);
    expect(verifySmsWebhookSignature(body, null, null, key, now)).toBe(false);
  });
});

describe('department SMS', () => {
  it('carries the number, urgency, area, summary, link and reply format', () => {
    const text = sms.departmentDispatch({
      id: '482913',
      urgent: true,
      area: 'Model Town, Lahore',
      summary: 'ٹرانسفارمر سے چنگاریاں',
      link: 'https://app.example.com/c/abc',
    });

    expect(text).toContain('482913 (فوری)');
    expect(text).toContain('Model Town, Lahore');
    expect(text).toContain('https://app.example.com/c/abc');
    expect(text).toContain('482913 OK');
    expect(text).toContain('482913 DONE');
  });
});
