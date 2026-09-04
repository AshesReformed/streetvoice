import { describe, it, expect, vi, beforeEach } from 'vitest';

// The pipeline tests only care about how services are invoked — stub the
// service factory and Supabase so no real provider or database is touched.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock('@/lib/services', () => ({
  getASRService: vi.fn(),
  getTranslationService: vi.fn(),
  getClassificationService: vi.fn(),
}));

import { processIncomingCall } from '@/lib/pipeline/process-call';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getASRService,
  getTranslationService,
  getClassificationService,
} from '@/lib/services';

const mockCreateAdminClient = vi.mocked(createAdminClient);
const mockGetASRService = vi.mocked(getASRService);
const mockGetTranslationService = vi.mocked(getTranslationService);
const mockGetClassificationService = vi.mocked(getClassificationService);

const transcribeSpy = vi.fn();
const translateSpy = vi.fn();
const classifySpy = vi.fn();

function stubPipelineDependencies() {
  transcribeSpy.mockResolvedValue({
    transcript: 'گلی میں پانی نہیں ہے',
    language_detected: 'ur',
    confidence: 0.9,
  });
  translateSpy.mockResolvedValue({
    urdu: 'گلی میں پانی نہیں ہے',
    english: 'There is no water in the street.',
  });
  classifySpy.mockResolvedValue({
    department_id: null,
    category: 'unclassified',
    confidence: 0,
  });

  mockGetASRService.mockReturnValue({ transcribe: transcribeSpy });
  mockGetTranslationService.mockReturnValue({ translate: translateSpy });
  mockGetClassificationService.mockReturnValue({ classify: classifySpy });

  // Minimal Supabase stand-in: departments read, complaint insert chain, and
  // the fire-and-forget call_logs / status_history inserts. No caller_id is
  // supplied, so the citizen upsert path is never reached.
  const complaintInsert = {
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: { id: 'complaint-1', tracking_id: 'SV-000001' },
        error: null,
      }),
    }),
  };
  mockCreateAdminClient.mockReturnValue({
    from: vi.fn((table: string) => {
      if (table === 'departments') {
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      }
      if (table === 'complaints') {
        return { insert: vi.fn().mockReturnValue(complaintInsert) };
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    }),
  } as unknown as ReturnType<typeof createAdminClient>);
}

describe('processIncomingCall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubPipelineDependencies();
  });

  it('forwards the DTMF language selection to the ASR service as a hint', async () => {
    await processIncomingCall({
      call_ref: 'call-1',
      audio_url: 'https://telephony.example.com/calls/call-1.wav',
      dtmf_language: 'ur',
    });

    // Without this pass-through, Whisper is forced into the wrong language
    // for real recordings (e.g. Urdu audio decoded as English).
    expect(transcribeSpy).toHaveBeenCalledWith({
      audio_url: 'https://telephony.example.com/calls/call-1.wav',
      language_hint: 'ur',
    });
  });

  it('omits the language hint when the caller made no DTMF selection', async () => {
    await processIncomingCall({
      call_ref: 'call-2',
      audio_url: 'https://telephony.example.com/calls/call-2.wav',
    });

    expect(transcribeSpy).toHaveBeenCalledWith({
      audio_url: 'https://telephony.example.com/calls/call-2.wav',
      language_hint: undefined,
    });
  });

  it('returns the stored tracking id with the spoken confirmation', async () => {
    const result = await processIncomingCall({
      call_ref: 'call-3',
      audio_url: 'https://telephony.example.com/calls/call-3.wav',
      dtmf_language: 'en',
    });

    expect(result.tracking_id).toBe('SV-000001');
    expect(result.spoken_confirmation_text).toContain('SV-000001');
  });
});
