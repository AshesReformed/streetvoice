import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Keep tests offline and fast: the real @xenova/transformers module downloads
// and executes ONNX models, so stub it before the service ever loads it.
vi.mock('@xenova/transformers', () => ({
  pipeline: vi.fn(),
}));

import { pipeline } from '@xenova/transformers';
import { getTranslationService } from '@/lib/services';
import { MockTranslationService } from '@/lib/services/mock-translation';
import { NllbTranslationService, toFloresCode, _resetPipeline } from '@/lib/services/nllb-translation';

const mockPipeline = vi.mocked(pipeline);

// Stand-in for the real NLLB translation pipeline. Routes src_lang → tgt_lang
// through a deterministic stub that prefixes the output so tests can verify
// which direction was used.
const fakeTranslator = vi.fn();

describe('getTranslationService factory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to the mock provider', () => {
    expect(getTranslationService()).toBeInstanceOf(MockTranslationService);
  });

  it('returns NllbTranslationService when TRANSLATION_PROVIDER=nllb', () => {
    vi.stubEnv('TRANSLATION_PROVIDER', 'nllb');
    expect(getTranslationService()).toBeInstanceOf(NllbTranslationService);
  });

  it('falls back to mock for unknown providers', () => {
    vi.stubEnv('TRANSLATION_PROVIDER', 'bogus');
    expect(getTranslationService()).toBeInstanceOf(MockTranslationService);
  });
});

describe('toFloresCode language mapping', () => {
  it('maps Urdu (ur) to urd_Arab', () => {
    expect(toFloresCode('ur')).toBe('urd_Arab');
  });

  it('maps English (en) to eng_Latn', () => {
    expect(toFloresCode('en')).toBe('eng_Latn');
  });

  it('maps Punjabi (pa) to pan_Guru', () => {
    expect(toFloresCode('pa')).toBe('pan_Guru');
  });

  it('maps Pashto (ps) to pus_Arab', () => {
    expect(toFloresCode('ps')).toBe('pus_Arab');
  });

  it('maps Sindhi (sd) to snd_Arab', () => {
    expect(toFloresCode('sd')).toBe('snd_Arab');
  });

  it('is case-insensitive', () => {
    expect(toFloresCode('UR')).toBe('urd_Arab');
    expect(toFloresCode('En')).toBe('eng_Latn');
  });

  it('defaults to urd_Arab for unrecognized codes and warns', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(toFloresCode('xx')).toBe('urd_Arab');
    expect(toFloresCode('zh')).toBe('urd_Arab');

    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy.mock.calls[0][0]).toContain('"xx"');
    expect(warnSpy.mock.calls[1][0]).toContain('"zh"');

    warnSpy.mockRestore();
  });
});

describe('NllbTranslationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the module-level pipeline cache so each test exercises first-use
    // behaviour (download logging, env-var reading, error recovery).
    _resetPipeline();
    mockPipeline.mockResolvedValue(fakeTranslator as never);

    // Default: echo back the input with a directional marker so tests can
    // assert exactly which (src_lang, tgt_lang) pair was requested.
    fakeTranslator.mockImplementation(
      async (text: string, opts: { src_lang: string; tgt_lang: string }) => {
        return [{ translation_text: `[${opts.src_lang}>${opts.tgt_lang}] ${text}` }];
      }
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('creates the pipeline lazily with the default model', async () => {
    const service = new NllbTranslationService();
    await service.translate({ text: 'hello', source_lang: 'en' });

    expect(mockPipeline).toHaveBeenCalledWith(
      'translation',
      'Xenova/nllb-200-distilled-600M',
      expect.objectContaining({ quantized: true })
    );
    expect(mockPipeline).toHaveBeenCalledTimes(1);
  });

  it('translates Urdu → Urdu (passthrough) + English (one pass)', async () => {
    const service = new NllbTranslationService();
    const result = await service.translate({
      text: 'گلی کی بتی خراب ہے',
      source_lang: 'ur',
    });

    // Urdu is copied verbatim — no pipeline call for it.
    expect(result.urdu).toBe('گلی کی بتی خراب ہے');
    // English comes from a single pipeline call.
    expect(result.english).toBe('[urd_Arab>eng_Latn] گلی کی بتی خراب ہے');
    expect(fakeTranslator).toHaveBeenCalledTimes(1);
  });

  it('translates English → English (passthrough) + Urdu (one pass)', async () => {
    const service = new NllbTranslationService();
    const result = await service.translate({
      text: 'The streetlight is broken.',
      source_lang: 'en',
    });

    expect(result.english).toBe('The streetlight is broken.');
    expect(result.urdu).toBe('[eng_Latn>urd_Arab] The streetlight is broken.');
    expect(fakeTranslator).toHaveBeenCalledTimes(1);
  });

  it('runs two passes for a third language (Punjabi → Urdu + English)', async () => {
    const service = new NllbTranslationService();
    const result = await service.translate({
      text: 'ਸੜਕ ਟੁੱਟੀ ਹੋਈ ਹੈ',
      source_lang: 'pa',
    });

    expect(result.urdu).toBe('[pan_Guru>urd_Arab] ਸੜਕ ਟੁੱਟੀ ਹੋਈ ਹੈ');
    expect(result.english).toBe('[pan_Guru>eng_Latn] ਸੜਕ ਟੁੱਟੀ ਹੋਈ ਹੈ');
    expect(fakeTranslator).toHaveBeenCalledTimes(2);
  });

  it('returns empty strings when input text is empty', async () => {
    const service = new NllbTranslationService();
    const result = await service.translate({ text: '', source_lang: 'ur' });

    expect(result.urdu).toBe('');
    expect(result.english).toBe('');
    // translatePass short-circuits on empty text — no pipeline call.
    expect(fakeTranslator).not.toHaveBeenCalled();
  });

  it('defaults to Urdu for an unrecognized source language and logs a warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const service = new NllbTranslationService();
    const result = await service.translate({
      text: 'some unknown-language text',
      source_lang: 'zz',
    });

    // Unrecognized → treated as Urdu → Urdu is passthrough, English is one pass.
    expect(result.urdu).toBe('some unknown-language text');
    expect(result.english).toBe('[urd_Arab>eng_Latn] some unknown-language text');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('"zz"');

    warnSpy.mockRestore();
  });

  it('passes NLLB_MODEL env var through to the pipeline', async () => {
    vi.stubEnv('NLLB_MODEL', 'Xenova/nllb-200-1.3B');

    const service = new NllbTranslationService();
    await service.translate({ text: 'test', source_lang: 'en' });

    expect(mockPipeline).toHaveBeenCalledWith(
      'translation',
      'Xenova/nllb-200-1.3B',
      expect.anything()
    );
  });

  it('clears the cached pipeline if loading fails, so the next call retries', async () => {
    mockPipeline.mockRejectedValueOnce(new Error('download failed'));

    const service = new NllbTranslationService();
    await expect(
      service.translate({ text: 'hello', source_lang: 'en' })
    ).rejects.toThrow('download failed');

    // Second call should retry the pipeline creation.
    mockPipeline.mockResolvedValue(fakeTranslator as never);
    const result = await service.translate({ text: 'hello', source_lang: 'en' });

    expect(result.english).toBe('hello'); // passthrough for English
    expect(mockPipeline).toHaveBeenCalledTimes(2);
  });
});
