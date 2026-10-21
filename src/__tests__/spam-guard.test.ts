import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ComplaintAnalysis } from '@/lib/services/types';
import { FakeDb } from './helpers/fake-supabase';

// The spam guard and the pipeline's spam handling, against the in-memory
// database. The fake database stamps rows from 2026-10-01T00:00Z, so the
// clock is set just after that for the "last hour" counts.
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/services', () => ({ getComplaintAnalyzer: vi.fn() }));
vi.mock('@/lib/sms/notify', () => ({
  notifyCitizen: vi.fn(async () => true),
  announceRouted: vi.fn(async () => undefined),
}));
vi.mock('@/lib/recordings', () => ({
  storeRecording: vi.fn(async (id: string) => `storage://recordings/${id}.mp3`),
  recordingUrl: vi.fn(async (url: string) => `https://signed.example.com/${url.split('/').pop()}`),
}));

import { checkCaller, recordAccepted, maskPhone, LIMITS, ipKey } from '@/lib/abuse/guard';
import { analyzeComplaint, fileComplaint } from '@/lib/pipeline/process-call';
import { createAdminClient } from '@/lib/supabase/admin';
import { getComplaintAnalyzer } from '@/lib/services';
import { announceRouted } from '@/lib/sms/notify';
import { hashPhone } from '@/lib/sms/phone';

const PHONE = '+923001234567';
let db: FakeDb;
const analyzeSpy = vi.fn();

function analysis(overrides: Partial<ComplaintAnalysis> = {}): ComplaintAnalysis {
  return {
    language: 'ur',
    transcript_original: 'ہیلو ٹیسٹنگ',
    transcript_urdu: 'ہیلو ٹیسٹنگ',
    transcript_english: 'Hello, testing, testing.',
    summary: 'Test call with no complaint.',
    summary_urdu: 'ٹیسٹ کال',
    department_id: null,
    category: 'unclassified',
    area: null,
    urgency: 'low',
    confidence: 0.2,
    needs_review: true,
    review_reason: 'Not a civic complaint',
    is_spam: true,
    spam_reason: 'Test call',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'], now: Date.parse('2026-10-01T00:10:00Z') });
  db = new FakeDb();
  db.tables.departments.push({ id: 'dept-1', name: 'Electricity', keywords: [], description: null });
  vi.mocked(createAdminClient).mockReturnValue(db as unknown as ReturnType<typeof createAdminClient>);
  vi.mocked(getComplaintAnalyzer).mockReturnValue({ analyze: analyzeSpy });
  analyzeSpy.mockResolvedValue(analysis());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('checkCaller', () => {
  it('lets a caller file up to the hourly limit, then refuses with their latest number', async () => {
    const caller = { phone: PHONE, channel: 'simulator' as const };
    let lastTracking = '';
    for (let i = 0; i < LIMITS.perNumberHour(); i++) {
      expect(await checkCaller(caller)).toEqual({ allowed: true });
      const filed = await fileComplaint({ call_ref: `c${i}`, audio_url: 'https://x.test/a.mp3', caller_id: PHONE });
      await recordAccepted(caller, filed.complaint_id);
      lastTracking = filed.tracking_id;
    }

    const verdict = await checkCaller(caller);
    expect(verdict).toMatchObject({ allowed: false, reason: 'rate_limited', latest_tracking_id: lastTracking });
    if (!verdict.allowed) expect(verdict.message.en).toContain(lastTracking);
    expect(db.tables.call_attempts.filter((a) => a.outcome === 'rate_limited')).toHaveLength(1);
    // Logged by hash, never the raw number
    expect(JSON.stringify(db.tables.call_attempts)).not.toContain(PHONE);
  });

  it('refuses a blocked number, and ignores a block that has expired', async () => {
    db.tables.blocked_numbers = [
      { id: 'b1', phone_hash: hashPhone(PHONE), blocked_until: null, reason: 'prank calls' },
    ];
    expect(await checkCaller({ phone: PHONE, channel: 'twilio' })).toMatchObject({
      allowed: false,
      reason: 'blocked',
    });
    expect(db.tables.call_attempts[0]).toMatchObject({ outcome: 'blocked', channel: 'twilio' });

    db.tables.blocked_numbers[0].blocked_until = '2026-09-30T00:00:00Z';
    expect(await checkCaller({ phone: PHONE, channel: 'twilio' })).toEqual({ allowed: true });
  });

  it('limits the simulator per IP even without a number', async () => {
    const ip = '203.0.113.9';
    db.tables.call_attempts = Array.from({ length: LIMITS.perIp10Min() }, (_, i) => ({
      id: `a${i}`,
      caller_key: ipKey(ip),
      key_kind: 'ip',
      outcome: 'accepted',
      created_at: '2026-10-01T00:05:00Z',
    }));
    expect(await checkCaller({ ip, channel: 'simulator' })).toMatchObject({ allowed: false, reason: 'rate_limited' });
    expect(await checkCaller({ ip: '198.51.100.1', channel: 'simulator' })).toEqual({ allowed: true });
  });
});

describe('maskPhone', () => {
  it('hides the middle of the number', () => {
    expect(maskPhone('+923001234567')).toBe('+92 300 ••• 4567');
    expect(maskPhone(null)).toBeNull();
  });
});

describe('spam in the pipeline', () => {
  it('flags spam, never sends it to a department, and blocks a repeat spammer', async () => {
    const first = await fileComplaint({ call_ref: 's1', audio_url: 'https://x.test/1.mp3', caller_id: PHONE });
    expect(await analyzeComplaint(first.complaint_id)).toEqual({
      result: 'spam',
      reason: 'Test call',
      caller_blocked: false,
    });
    const row = db.tables.complaints.find((c) => c.id === first.complaint_id)!;
    expect(row).toMatchObject({ status: 'spam', spam_reason: 'Test call', department_id: null });
    expect(announceRouted).not.toHaveBeenCalled();
    expect(db.tables.blocked_numbers ?? []).toHaveLength(0);

    const second = await fileComplaint({ call_ref: 's2', audio_url: 'https://x.test/2.mp3', caller_id: PHONE });
    expect(await analyzeComplaint(second.complaint_id)).toMatchObject({ result: 'spam', caller_blocked: true });
    expect(db.tables.blocked_numbers).toHaveLength(1);
    expect(db.tables.blocked_numbers[0]).toMatchObject({
      phone_hash: hashPhone(PHONE),
      phone_masked: '+92 300 ••• 4567',
      blocked_by: null,
    });
    expect(db.tables.blocked_numbers[0].blocked_until).toBe('2026-10-02T00:10:00.000Z');

    // The blocked caller is now refused
    expect(await checkCaller({ phone: PHONE, channel: 'twilio' })).toMatchObject({ reason: 'blocked' });
  });

  it('still routes a genuine complaint', async () => {
    analyzeSpy.mockResolvedValue(
      analysis({ is_spam: false, spam_reason: null, needs_review: false, department_id: 'dept-1', category: 'Electricity', confidence: 0.9 })
    );
    const filed = await fileComplaint({ call_ref: 'g1', audio_url: 'https://x.test/g.mp3', caller_id: PHONE });
    expect(await analyzeComplaint(filed.complaint_id)).toMatchObject({ result: 'routed' });
    expect(announceRouted).toHaveBeenCalledOnce();
  });
});
