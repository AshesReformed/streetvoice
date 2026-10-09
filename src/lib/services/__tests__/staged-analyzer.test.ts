import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StagedComplaintAnalyzer } from '@/lib/services/staged-analyzer';

const transcribeSpy = vi.fn();
const translateSpy = vi.fn();
const classifySpy = vi.fn();
const asrReleaseSpy = vi.fn();
const translationReleaseSpy = vi.fn();

function createAnalyzer() {
  return new StagedComplaintAnalyzer(
    () => ({ transcribe: transcribeSpy, release: asrReleaseSpy }),
    () => ({ translate: translateSpy, release: translationReleaseSpy }),
    () => ({ classify: classifySpy })
  );
}

const input = (language_hint?: string) => ({
  audio_url: 'https://telephony.example.com/calls/call-1.wav',
  language_hint,
  departments: [],
});

describe('StagedComplaintAnalyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      department_id: 'dept-water',
      category: 'Water & Sanitation',
      confidence: 1,
    });
  });

  it('forwards the DTMF language selection to the ASR service as a hint', async () => {
    await createAnalyzer().analyze(input('ur'));

    // Without this pass-through, Whisper is forced into the wrong language
    // for real recordings (e.g. Urdu audio decoded as English).
    expect(transcribeSpy).toHaveBeenCalledWith({
      audio_url: 'https://telephony.example.com/calls/call-1.wav',
      language_hint: 'ur',
    });
  });

  it('releases each model after use so only one is in memory at a time', async () => {
    await createAnalyzer().analyze(input());

    expect(asrReleaseSpy).toHaveBeenCalledTimes(1);
    expect(translationReleaseSpy).toHaveBeenCalledTimes(1);

    // ASR release must happen before translation starts.
    const asrReleaseOrder = asrReleaseSpy.mock.invocationCallOrder[0];
    const translateOrder = translateSpy.mock.invocationCallOrder[0];
    const translationReleaseOrder = translationReleaseSpy.mock.invocationCallOrder[0];
    expect(asrReleaseOrder).toBeLessThan(translateOrder);
    expect(translateOrder).toBeLessThan(translationReleaseOrder);
  });

  it('classifies the English translation and routes confident results', async () => {
    const result = await createAnalyzer().analyze(input());

    expect(classifySpy).toHaveBeenCalledWith({ text: 'There is no water in the street.' });
    expect(result).toMatchObject({
      language: 'ur',
      department_id: 'dept-water',
      needs_review: false,
      review_reason: null,
    });
  });

  it('flags unclear speech for review', async () => {
    transcribeSpy.mockResolvedValue({ transcript: 'hello', language_detected: 'en', confidence: 0.4 });

    const result = await createAnalyzer().analyze(input());

    expect(result.needs_review).toBe(true);
    expect(result.review_reason).toBe('Speech was unclear');
  });

  it('flags unmatched complaints for review', async () => {
    classifySpy.mockResolvedValue({ department_id: null, category: 'unclassified', confidence: 0 });

    const result = await createAnalyzer().analyze(input());

    expect(result.needs_review).toBe(true);
    expect(result.review_reason).toBe('No department matched');
  });
});
