import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiComplaintAnalyzer, audioMimeType } from '@/lib/services/gemini-analyzer';

const DEPARTMENTS = [
  { id: 'dept-water', name: 'Water & Sanitation', keywords: ['water'], description: 'No water, leaks' },
  { id: 'dept-electricity', name: 'Electricity', keywords: ['power'], description: null },
];

const AUDIO_URL = 'https://cdn.example.com/calls/call-1.wav';

function geminiReply(result: Record<string, unknown>) {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

function modelResult(overrides: Record<string, unknown> = {}) {
  return {
    language: 'ps',
    transcript_original: 'زموږ په کلي کې اوبه نشته',
    transcript_urdu: 'ہمارے گاؤں میں پانی نہیں ہے',
    transcript_english: 'There is no water in our village.',
    summary: 'No water supply in the village near Charsadda.',
    summary_urdu: 'چارسدہ کے قریب گاؤں میں پانی نہیں۔',
    department: 'Water & Sanitation',
    area: 'Charsadda',
    urgency: 'high',
    confidence: 0.9,
    needs_review: false,
    review_reason: null,
    is_spam: false,
    spam_reason: null,
    ...overrides,
  };
}

const fetchMock = vi.fn();

describe('GeminiComplaintAnalyzer', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function stubAudioThen(reply: Response) {
    fetchMock
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3, 4]), { headers: { 'Content-Type': 'audio/wav' } })
      )
      .mockResolvedValueOnce(reply);
  }

  it('sends the audio, department list and language hint, and maps the department', async () => {
    stubAudioThen(geminiReply(modelResult()));

    const result = await new GeminiComplaintAnalyzer().analyze({
      audio_url: AUDIO_URL,
      language_hint: 'ps',
      departments: DEPARTMENTS,
    });

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toContain(':generateContent');
    expect(init.headers['x-goog-api-key']).toBe('test-key');
    const body = JSON.parse(init.body);
    const parts = body.contents[0].parts;
    expect(parts[0].inlineData).toEqual({ mimeType: 'audio/wav', data: 'AQIDBA==' });
    expect(parts[1].text).toContain('- Water & Sanitation: No water, leaks');
    expect(parts[1].text).toContain('- Electricity: power');
    expect(parts[1].text).toContain('the caller chose Pashto');
    expect(body.generationConfig.responseSchema.properties.department.enum).toEqual([
      'Water & Sanitation',
      'Electricity',
      'unclassified',
    ]);

    expect(result).toEqual({
      language: 'ps',
      transcript_original: 'زموږ په کلي کې اوبه نشته',
      transcript_urdu: 'ہمارے گاؤں میں پانی نہیں ہے',
      transcript_english: 'There is no water in our village.',
      summary: 'No water supply in the village near Charsadda.',
      summary_urdu: 'چارسدہ کے قریب گاؤں میں پانی نہیں۔',
      department_id: 'dept-water',
      category: 'Water & Sanitation',
      area: 'Charsadda',
      urgency: 'high',
      confidence: 0.9,
      needs_review: false,
      review_reason: null,
      is_spam: false,
      spam_reason: null,
    });
  });

  it('passes on the spam label with a reason', async () => {
    stubAudioThen(
      geminiReply(modelResult({ is_spam: true, spam_reason: 'Prank call', needs_review: true, review_reason: 'Prank' }))
    );
    const result = await new GeminiComplaintAnalyzer().analyze({ audio_url: AUDIO_URL, departments: DEPARTMENTS });
    expect(result).toMatchObject({ is_spam: true, spam_reason: 'Prank call', needs_review: true });

    stubAudioThen(geminiReply(modelResult({ is_spam: true, spam_reason: null })));
    const unexplained = await new GeminiComplaintAnalyzer().analyze({ audio_url: AUDIO_URL, departments: DEPARTMENTS });
    expect(unexplained.spam_reason).toBe('Not a genuine complaint');
  });

  it('sends unclassified complaints to review', async () => {
    stubAudioThen(geminiReply(modelResult({ department: 'unclassified', confidence: 0.8 })));

    const result = await new GeminiComplaintAnalyzer().analyze({
      audio_url: AUDIO_URL,
      departments: DEPARTMENTS,
    });

    expect(result.department_id).toBeNull();
    expect(result.category).toBe('unclassified');
    expect(result.needs_review).toBe(true);
    expect(result.review_reason).toBe('No department matched');
  });

  it('sends low-confidence complaints to review even if the model did not', async () => {
    stubAudioThen(geminiReply(modelResult({ confidence: 0.4 })));

    const result = await new GeminiComplaintAnalyzer().analyze({
      audio_url: AUDIO_URL,
      departments: DEPARTMENTS,
    });

    expect(result.needs_review).toBe(true);
    expect(result.review_reason).toBe('Low confidence');
  });

  it('retries once when rate-limited', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(new Response(new Uint8Array([1]), { headers: { 'Content-Type': 'audio/wav' } }))
      .mockResolvedValueOnce(new Response('quota', { status: 429 }))
      .mockResolvedValueOnce(geminiReply(modelResult()));

    const pending = new GeminiComplaintAnalyzer().analyze({ audio_url: AUDIO_URL, departments: DEPARTMENTS });
    await vi.runAllTimersAsync();
    const result = await pending;
    vi.useRealTimers();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.department_id).toBe('dept-water');
  });

  it('switches to the fallback model when the main one is overloaded', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(new Uint8Array([1]), { headers: { 'Content-Type': 'audio/wav' } }))
      .mockResolvedValueOnce(new Response('high demand', { status: 503 }))
      .mockResolvedValueOnce(geminiReply(modelResult()));

    vi.useFakeTimers();
    const pending = new GeminiComplaintAnalyzer().analyze({ audio_url: AUDIO_URL, departments: DEPARTMENTS });
    await vi.runAllTimersAsync();
    const result = await pending;
    vi.useRealTimers();

    expect(fetchMock.mock.calls[1][0]).toContain('/gemini-3.8-flash:generateContent');
    expect(fetchMock.mock.calls[2][0]).toContain('/gemini-3.5-flash:generateContent');
    expect(result.department_id).toBe('dept-water');
  });

  it('retries once when the request times out', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(new Uint8Array([1]), { headers: { 'Content-Type': 'audio/wav' } }))
      .mockRejectedValueOnce(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))
      .mockResolvedValueOnce(geminiReply(modelResult()));

    const result = await new GeminiComplaintAnalyzer().analyze({
      audio_url: AUDIO_URL,
      departments: DEPARTMENTS,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.department_id).toBe('dept-water');
  });

  it('fails clearly when the API key is missing', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array([1]), { headers: { 'Content-Type': 'audio/wav' } }));

    await expect(
      new GeminiComplaintAnalyzer().analyze({ audio_url: AUDIO_URL, departments: DEPARTMENTS })
    ).rejects.toThrow('GEMINI_API_KEY');
  });

  it('fails clearly when the audio cannot be fetched', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 404 }));

    await expect(
      new GeminiComplaintAnalyzer().analyze({ audio_url: AUDIO_URL, departments: DEPARTMENTS })
    ).rejects.toThrow('HTTP 404');
  });
});

describe('audioMimeType', () => {
  it('prefers an audio content-type header', () => {
    expect(audioMimeType('audio/mpeg; charset=binary', 'https://x.test/a.wav')).toBe('audio/mp3');
    expect(audioMimeType('audio/ogg', 'https://x.test/a.wav')).toBe('audio/ogg');
  });

  it('falls back to the file extension', () => {
    expect(audioMimeType('application/octet-stream', 'https://x.test/a.mp3')).toBe('audio/mp3');
    expect(audioMimeType(null, 'https://x.test/a.ogg?sig=1')).toBe('audio/ogg');
  });

  it('defaults to WAV', () => {
    expect(audioMimeType(null, 'https://api.twilio.com/Recordings/RE123')).toBe('audio/wav');
  });
});
