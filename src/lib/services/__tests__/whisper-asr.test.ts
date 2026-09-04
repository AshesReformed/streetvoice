import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Keep tests offline and fast: the real @xenova/transformers module downloads
// and executes ONNX models, so stub it before the service ever loads it.
vi.mock('@xenova/transformers', () => ({
  pipeline: vi.fn(),
}));

import { pipeline } from '@xenova/transformers';
import * as wavefileModule from 'wavefile';
import { getASRService } from '@/lib/services';
import { MockASRService } from '@/lib/services/mock-asr';
import { WhisperASRService } from '@/lib/services/whisper-asr';

const mockPipeline = vi.mocked(pipeline);

// Stand-in for the real Whisper pipeline. Returns timestamps covering 4s of
// audio by default (see the confidence assertions below).
const fakeTranscriber = vi.fn();

function makeWavBytes(sampleCount: number, sampleRate = 16000): Uint8Array {
  // Real WAV fixture built with the same wavefile library the service uses,
  // exercising the actual decode + resample path.
  const wavefile = wavefileModule as unknown as {
    WaveFile?: new () => WaveFileFixture;
    default?: { WaveFile?: new () => WaveFileFixture };
  };
  const WaveFile = wavefile.WaveFile ?? wavefile.default?.WaveFile;
  if (!WaveFile) throw new Error('wavefile module did not load');

  const wav = new WaveFile();
  const samples = Array.from({ length: sampleCount }, (_, i) =>
    Math.round(1000 * Math.sin(i / 10))
  );
  wav.fromScratch(1, sampleRate, '16', samples);
  return wav.toBuffer();
}

interface WaveFileFixture {
  fromScratch(numChannels: number, sampleRate: number, bitDepth: string, samples: number[]): void;
  toBuffer(): Uint8Array;
}

// MP3 files start with an "ID3" tag or the 0xFFFB frame sync — either way,
// not the RIFF/WAVE magic the WAV decoder expects.
const MP3_BYTES = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0, 0, 0, 0]);

describe('getASRService factory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to the mock provider', () => {
    expect(getASRService()).toBeInstanceOf(MockASRService);
  });

  it('returns WhisperASRService when ASR_PROVIDER=whisper', () => {
    vi.stubEnv('ASR_PROVIDER', 'whisper');
    expect(getASRService()).toBeInstanceOf(WhisperASRService);
  });

  it('falls back to mock for unknown providers', () => {
    vi.stubEnv('ASR_PROVIDER', 'bogus');
    expect(getASRService()).toBeInstanceOf(MockASRService);
  });
});

describe('WhisperASRService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPipeline.mockResolvedValue(fakeTranscriber as never);
    // 5s of audio (16000 * 5 samples) with speech timestamped across 4s
    // → expected confidence 0.8.
    fakeTranscriber.mockResolvedValue({
      text: ' The streetlight is broken. ',
      chunks: [
        { timestamp: [0, 2], text: 'The streetlight' },
        { timestamp: [2, 4], text: 'is broken.' },
      ],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function stubFetchWith(bytes: Uint8Array, ok = true, status = 200) {
    // slice() guarantees a standalone ArrayBuffer, which Response accepts.
    const body = bytes.slice().buffer as ArrayBuffer;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { status: ok ? 200 : status }))
    );
  }

  it('fetches the audio, runs Whisper, and maps the result to ASROutput', async () => {
    // 8kHz source audio proves the 16kHz resampling path works too.
    stubFetchWith(makeWavBytes(40000, 8000));

    const service = new WhisperASRService();
    const result = await service.transcribe({
      audio_url: 'https://telephony.example.com/calls/123.wav',
      language_hint: 'en',
    });

    // The pipeline is created lazily, once, with the default model
    expect(mockPipeline).toHaveBeenCalledWith(
      'automatic-speech-recognition',
      'Xenova/whisper-small',
      expect.objectContaining({ quantized: true })
    );
    expect(mockPipeline).toHaveBeenCalledTimes(1);

    // Whisper receives decoded mono Float32Array samples + sane options
    expect(fakeTranscriber).toHaveBeenCalledTimes(1);
    const [audioArg, options] = fakeTranscriber.mock.calls[0];
    expect(audioArg).toBeInstanceOf(Float32Array);
    // 40000 samples @ 8kHz → 5s → 80000 samples @ 16kHz
    expect(audioArg.length).toBe(80000);
    expect(options).toMatchObject({
      task: 'transcribe',
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: true,
      language: 'en',
    });

    expect(result).toEqual({
      transcript: 'The streetlight is broken.',
      language_detected: 'en',
      confidence: 0.8,
    });
  });

  it('does not force a language for unsupported hints (Whisper auto-detects)', async () => {
    stubFetchWith(makeWavBytes(16000));

    const service = new WhisperASRService();
    await service.transcribe({
      audio_url: 'https://telephony.example.com/calls/124.wav',
      language_hint: 'xx',
    });

    const [, options] = fakeTranscriber.mock.calls[0];
    expect(options).not.toHaveProperty('language');
  });

  it('guesses the language from the transcript script when no hint is given', async () => {
    stubFetchWith(makeWavBytes(16000));
    fakeTranscriber.mockResolvedValue({ text: 'گلی کی بتی خراب ہے', chunks: [] });

    const service = new WhisperASRService();
    const result = await service.transcribe({
      audio_url: 'https://telephony.example.com/calls/125.wav',
    });

    expect(result.language_detected).toBe('ur');
  });

  it('returns confidence 0 for an empty transcript', async () => {
    stubFetchWith(makeWavBytes(16000));
    fakeTranscriber.mockResolvedValue({ text: '', chunks: [] });

    const service = new WhisperASRService();
    const result = await service.transcribe({
      audio_url: 'https://telephony.example.com/calls/126.wav',
      language_hint: 'ur',
    });

    expect(result.transcript).toBe('');
    expect(result.confidence).toBe(0);
  });

  it('rejects non-WAV audio with a clear error', async () => {
    stubFetchWith(MP3_BYTES);

    const service = new WhisperASRService();
    await expect(
      service.transcribe({ audio_url: 'https://telephony.example.com/calls/127.mp3' })
    ).rejects.toThrow(/Unsupported audio format.*WAV/);
  });

  it('rejects when the audio URL returns an HTTP error', async () => {
    stubFetchWith(new Uint8Array(0), false, 404);

    const service = new WhisperASRService();
    await expect(
      service.transcribe({ audio_url: 'https://telephony.example.com/calls/missing.wav' })
    ).rejects.toThrow('HTTP 404');
  });
});
