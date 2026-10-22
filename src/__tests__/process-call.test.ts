import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ComplaintAnalysis } from '@/lib/services/types';
import { FakeDb } from './helpers/fake-supabase';

// The pipeline runs against an in-memory database; the AI analyzer, the
// recording store and Next.js after() are stubbed.
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/services', () => ({ getComplaintAnalyzer: vi.fn() }));
vi.mock('@/lib/sms/notify', () => ({
  notifyCitizen: vi.fn(async () => true),
  announceRouted: vi.fn(async () => undefined),
  sendSms: vi.fn(async () => true),
}));
vi.mock('@/lib/recordings', () => ({
  storeRecording: vi.fn(async (id: string) => `storage://recordings/${id}.wav`),
  recordingUrl: vi.fn(async (url: string) => `https://signed.example.com/${url.split('/').pop()}`),
}));

import { after } from 'next/server';
import {
  analyzeComplaint,
  fileComplaint,
  MAX_ANALYSIS_ATTEMPTS,
  processIncomingCall,
  processPendingComplaints,
  spokenDigits,
} from '@/lib/pipeline/process-call';
import { createAdminClient } from '@/lib/supabase/admin';
import { getComplaintAnalyzer } from '@/lib/services';
import { announceRouted, notifyCitizen, sendSms } from '@/lib/sms/notify';
import { hashPhone } from '@/lib/sms/phone';

const analyzeSpy = vi.fn();
let db: FakeDb;

const DEPARTMENT = { id: 'dept-electricity', name: 'Electricity', keywords: ['power'], description: 'Outages' };

function analysis(overrides: Partial<ComplaintAnalysis> = {}): ComplaintAnalysis {
  return {
    language: 'pa',
    transcript_original: 'ساڈے محلے وچ ٹرانسفارمر سڑ گیا اے',
    transcript_urdu: 'ہمارے محلے میں ٹرانسفارمر جل گیا ہے',
    transcript_english: 'The transformer in our neighbourhood has burnt out.',
    summary: 'Transformer burnt out in Model Town.',
    summary_urdu: 'ماڈل ٹاؤن میں ٹرانسفارمر جل گیا۔',
    department_id: 'dept-electricity',
    category: 'Electricity',
    area: 'Model Town',
    urgency: 'high',
    confidence: 0.92,
    needs_review: false,
    review_reason: null,
    ...overrides,
  };
}

const call = (n: number, extra: Record<string, string> = {}) => ({
  call_ref: `call-${n}`,
  audio_url: `https://telephony.example.com/calls/call-${n}.wav`,
  ...extra,
});

function complaintRow(id: string) {
  return db.tables.complaints.find((c) => c.id === id)!;
}

beforeEach(() => {
  vi.clearAllMocks();
  db = new FakeDb();
  db.tables.departments.push(DEPARTMENT);
  vi.mocked(createAdminClient).mockReturnValue(db as unknown as ReturnType<typeof createAdminClient>);
  analyzeSpy.mockResolvedValue(analysis());
  vi.mocked(getComplaintAnalyzer).mockReturnValue({ analyze: analyzeSpy });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('fileComplaint', () => {
  it('saves the call as processing and returns its tracking number at once', async () => {
    const filed = await fileComplaint(call(1, { dtmf_language: 'pa', caller_id: '+923001112233' }));

    const row = complaintRow(filed.complaint_id);
    expect(row).toMatchObject({ status: 'processing', call_ref: 'call-1' });
    expect(row.department_id).toBeUndefined();
    expect(filed.created).toBe(true);
    expect(filed.tracking_id).toBe(row.tracking_id);
    expect(db.tables.call_logs[0]).toMatchObject({ language_selected: 'pa', complaint_id: row.id });
    expect(db.tables.status_history[0]).toMatchObject({ status: 'processing' });
    expect(db.tables.citizens).toHaveLength(1);
    expect(db.tables.citizens[0]).toMatchObject({
      phone: '+923001112233',
      phone_hash: hashPhone('+923001112233'),
    });
    expect(analyzeSpy).not.toHaveBeenCalled();
  });

  it('reads the tracking number out digit by digit', async () => {
    const filed = await fileComplaint(call(2));

    expect(filed.spoken_confirmation_text).toContain(spokenDigits(filed.tracking_id));
    expect(spokenDigits('482913')).toBe('4 8 2 9 1 3');
  });

  it('returns the existing complaint when the same call is filed twice', async () => {
    const first = await fileComplaint(call(3));
    const retry = await fileComplaint(call(3));

    expect(retry).toMatchObject({ complaint_id: first.complaint_id, created: false });
    expect(db.tables.complaints).toHaveLength(1);
  });
});

describe('analyzeComplaint', () => {
  it('stores the recording, analyzes it and routes a confident complaint as open', async () => {
    const { complaint_id } = await fileComplaint(call(4, { dtmf_language: 'pa' }));

    const outcome = await analyzeComplaint(complaint_id);

    expect(outcome).toEqual({ result: 'routed', department: 'Electricity' });
    expect(analyzeSpy).toHaveBeenCalledWith({
      audio_url: `https://signed.example.com/${complaint_id}.wav`,
      language_hint: 'pa',
      departments: [DEPARTMENT],
    });
    expect(complaintRow(complaint_id)).toMatchObject({
      status: 'open',
      audio_url: `storage://recordings/${complaint_id}.wav`,
      department_id: 'dept-electricity',
      category: 'Electricity',
      transcript_english: 'The transformer in our neighbourhood has burnt out.',
      summary: 'Transformer burnt out in Model Town.',
      language: 'pa',
      area: 'Model Town',
      priority: 'high',
      confidence_score: 0.92,
      processing_attempts: 1,
    });
    expect(db.tables.status_history.at(-1)).toMatchObject({
      status: 'open',
      remark: 'Routed automatically to Electricity',
    });
    // The department and the citizen are told by SMS
    expect(announceRouted).toHaveBeenCalledWith(complaint_id);
  });

  it('holds an unclear complaint for review without a department', async () => {
    analyzeSpy.mockResolvedValue(
      analysis({ needs_review: true, confidence: 0.3, review_reason: 'Speech was unclear' })
    );
    const { complaint_id } = await fileComplaint(call(5));

    expect(await analyzeComplaint(complaint_id)).toEqual({ result: 'needs_review', department: null });
    expect(complaintRow(complaint_id)).toMatchObject({
      status: 'needs_review',
      department_id: null,
      review_reason: 'Speech was unclear',
    });
    // Nothing goes to a department until an admin routes it
    expect(announceRouted).not.toHaveBeenCalled();
  });

  it('leaves a failed complaint processing for a retry, then gives up to manual review', async () => {
    analyzeSpy.mockRejectedValue(new Error('Gemini request failed: HTTP 503'));
    const { complaint_id } = await fileComplaint(call(6));

    for (let i = 1; i < MAX_ANALYSIS_ATTEMPTS; i++) {
      expect(await analyzeComplaint(complaint_id)).toMatchObject({ result: 'retry' });
      expect(complaintRow(complaint_id)).toMatchObject({
        status: 'processing',
        processing_error: 'Gemini request failed: HTTP 503',
      });
    }

    expect(await analyzeComplaint(complaint_id)).toMatchObject({ result: 'gave_up' });
    expect(complaintRow(complaint_id)).toMatchObject({
      status: 'needs_review',
      processing_attempts: MAX_ANALYSIS_ATTEMPTS,
    });
  });

  it('links a second report of the same issue instead of texting the department again', async () => {
    // Within the 48-hour window of the fake database's timestamps
    vi.useFakeTimers({ toFake: ['Date'], now: Date.parse('2026-10-01T01:00:00Z') });
    const first = await fileComplaint(call(8));
    await analyzeComplaint(first.complaint_id);
    vi.mocked(announceRouted).mockClear();
    const second = await fileComplaint(call(9, { caller_id: '+923001112233' }));

    expect(await analyzeComplaint(second.complaint_id)).toEqual({
      result: 'duplicate',
      department: 'Electricity',
      duplicate_of: first.tracking_id,
      reports: 2,
    });
    expect(complaintRow(second.complaint_id)).toMatchObject({
      status: 'open',
      duplicate_of: first.complaint_id,
    });
    expect(complaintRow(first.complaint_id).report_count).toBe(2);
    expect(announceRouted).not.toHaveBeenCalled();
    // Below the first milestone the department isn't texted about it
    expect(vi.mocked(sendSms).mock.calls.map((c) => c[0].purpose)).not.toContain('department_more_reports');
  });

  it('skips complaints that are no longer processing', async () => {
    const { complaint_id } = await fileComplaint(call(7));
    await analyzeComplaint(complaint_id);

    expect(await analyzeComplaint(complaint_id)).toEqual({ result: 'skipped' });
    expect(analyzeSpy).toHaveBeenCalledTimes(1);
  });
});

describe('processIncomingCall', () => {
  it('schedules analysis after the response by default', async () => {
    const filed = await processIncomingCall(call(8));

    expect(complaintRow(filed.complaint_id).status).toBe('processing');
    expect(analyzeSpy).not.toHaveBeenCalled();
    expect(after).toHaveBeenCalledTimes(1);

    await (vi.mocked(after).mock.calls[0][0] as () => Promise<unknown>)();
    expect(complaintRow(filed.complaint_id).status).toBe('open');
  });

  it('analyzes inline when asked to wait', async () => {
    const filed = await processIncomingCall(call(9), { wait: true });

    expect(complaintRow(filed.complaint_id).status).toBe('open');
    expect(after).not.toHaveBeenCalled();
  });

  it('texts the caller their tracking number before analyzing', async () => {
    const filed = await processIncomingCall(call(13), { wait: true });

    expect(notifyCitizen).toHaveBeenCalledWith(filed.complaint_id, 'filed');
    expect(vi.mocked(notifyCitizen).mock.invocationCallOrder[0]).toBeLessThan(
      analyzeSpy.mock.invocationCallOrder[0]
    );
  });

  it('does not analyze a retried call twice', async () => {
    await processIncomingCall(call(10));
    await processIncomingCall(call(10));

    expect(after).toHaveBeenCalledTimes(1);
  });
});

describe('processPendingComplaints', () => {
  it('analyzes complaints left in processing, oldest first', async () => {
    const a = await fileComplaint(call(11));
    const b = await fileComplaint(call(12));

    const results = await processPendingComplaints({ minAgeSeconds: -60 });

    expect(results.map((r) => r.complaint_id)).toEqual([a.complaint_id, b.complaint_id]);
    expect(results.every((r) => r.result === 'routed')).toBe(true);
  });
});
