import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ComplaintAnalysis } from '@/lib/services/types';

// The pipeline tests only care about how the analyzer is invoked and what
// gets stored — stub the analyzer factory and Supabase so no real provider
// or database is touched.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock('@/lib/services', () => ({
  getComplaintAnalyzer: vi.fn(),
}));

import { processIncomingCall } from '@/lib/pipeline/process-call';
import { createAdminClient } from '@/lib/supabase/admin';
import { getComplaintAnalyzer } from '@/lib/services';

const mockCreateAdminClient = vi.mocked(createAdminClient);
const mockGetComplaintAnalyzer = vi.mocked(getComplaintAnalyzer);

const analyzeSpy = vi.fn();
const complaintInsertSpy = vi.fn();

const DEPARTMENTS = [
  { id: 'dept-electricity', name: 'Electricity', keywords: ['power'], description: 'Outages' },
];

function analysis(overrides: Partial<ComplaintAnalysis> = {}): ComplaintAnalysis {
  return {
    language: 'pa',
    transcript_original: 'ساڈے محلے وچ ٹرانسفارمر سڑ گیا اے',
    transcript_urdu: 'ہمارے محلے میں ٹرانسفارمر جل گیا ہے',
    transcript_english: 'The transformer in our neighbourhood has burnt out.',
    summary: 'Transformer burnt out in Model Town.',
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

function stubPipelineDependencies(result: ComplaintAnalysis) {
  analyzeSpy.mockResolvedValue(result);
  mockGetComplaintAnalyzer.mockReturnValue({ analyze: analyzeSpy });

  // Minimal Supabase stand-in: departments read, complaint insert chain, and
  // the fire-and-forget call_logs / status_history inserts. No caller_id is
  // supplied, so the citizen upsert path is never reached.
  complaintInsertSpy.mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: { id: 'complaint-1', tracking_id: 'SV-000001' },
        error: null,
      }),
    }),
  });
  mockCreateAdminClient.mockReturnValue({
    from: vi.fn((table: string) => {
      if (table === 'departments') {
        return { select: vi.fn().mockResolvedValue({ data: DEPARTMENTS, error: null }) };
      }
      if (table === 'complaints') {
        return { insert: complaintInsertSpy };
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    }),
  } as unknown as ReturnType<typeof createAdminClient>);
}

describe('processIncomingCall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubPipelineDependencies(analysis());
  });

  it('passes the recording, DTMF language and departments to the analyzer', async () => {
    await processIncomingCall({
      call_ref: 'call-1',
      audio_url: 'https://telephony.example.com/calls/call-1.wav',
      dtmf_language: 'pa',
    });

    expect(analyzeSpy).toHaveBeenCalledWith({
      audio_url: 'https://telephony.example.com/calls/call-1.wav',
      language_hint: 'pa',
      departments: DEPARTMENTS,
    });
  });

  it('omits the language hint when the caller made no DTMF selection', async () => {
    await processIncomingCall({
      call_ref: 'call-2',
      audio_url: 'https://telephony.example.com/calls/call-2.wav',
    });

    expect(analyzeSpy.mock.calls[0][0].language_hint).toBeUndefined();
  });

  it('stores the analysis and routes a confident complaint as open', async () => {
    await processIncomingCall({
      call_ref: 'call-3',
      audio_url: 'https://telephony.example.com/calls/call-3.wav',
    });

    expect(complaintInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'open',
        department_id: 'dept-electricity',
        category: 'Electricity',
        transcript_regional: 'ساڈے محلے وچ ٹرانسفارمر سڑ گیا اے',
        transcript_english: 'The transformer in our neighbourhood has burnt out.',
        summary: 'Transformer burnt out in Model Town.',
        language: 'pa',
        area: 'Model Town',
        priority: 'high',
        confidence_score: 0.92,
        review_reason: null,
      })
    );
  });

  it('holds a complaint for review without a department when the analyzer is unsure', async () => {
    stubPipelineDependencies(
      analysis({ needs_review: true, confidence: 0.3, review_reason: 'Speech was unclear' })
    );

    await processIncomingCall({
      call_ref: 'call-4',
      audio_url: 'https://telephony.example.com/calls/call-4.wav',
    });

    expect(complaintInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'needs_review',
        department_id: null,
        review_reason: 'Speech was unclear',
      })
    );
  });

  it('returns the stored tracking id with the spoken confirmation', async () => {
    const result = await processIncomingCall({
      call_ref: 'call-5',
      audio_url: 'https://telephony.example.com/calls/call-5.wav',
      dtmf_language: 'en',
    });

    expect(result.tracking_id).toBe('SV-000001');
    expect(result.spoken_confirmation_text).toContain('SV-000001');
  });
});
