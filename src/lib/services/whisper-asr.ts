import type { AutomaticSpeechRecognitionPipeline } from '@xenova/transformers';
import { ASRService, ASRInput, ASROutput } from './types';

// ===========================================================================
// Whisper ASR — real speech-to-text, fully self-hosted.
//
// Runs OpenAI Whisper locally through @xenova/transformers (ONNX Runtime,
// WASM backend): no external API calls, no per-use cost.
//
// - Model weights are downloaded on first use (a few hundred MB for
//   whisper-small, int8-quantized) and cached on disk under
//   node_modules/@xenova/transformers/.cache — only the first call is slow.
// - The model is configurable via WHISPER_MODEL (tiny/base/small/medium).
// - Only WAV audio can be decoded natively in Node (via wavefile). Recordings
//   in other formats (e.g. MP3 from a telephony provider) must be converted
//   first, e.g. `ffmpeg -i call.mp3 call.wav`.
// - @xenova/transformers is imported dynamically so that the default (mock)
//   provider never loads the ONNX runtime.
// ===========================================================================

/** Default model: good accuracy/speed balance on a laptop CPU (no GPU). */
const DEFAULT_MODEL = 'Xenova/whisper-small';

/** Whisper expects 16 kHz mono audio. */
const TARGET_SAMPLE_RATE = 16000;

// Language codes the phone system (DTMF) offers. Other hints are ignored so
// Whisper falls back to its own language auto-detection instead of throwing.
const SUPPORTED_LANGUAGE_HINTS = new Set(['ur', 'en']);

// What the transformers.js ASR pipeline resolves to for a single audio input.
interface WhisperResult {
  text: string;
  chunks?: { timestamp: [number, number | null]; text: string }[];
}

let pipelinePromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

function getModelName(): string {
  // Easy to swap for tiny/base/medium from .env without code changes.
  return process.env.WHISPER_MODEL || DEFAULT_MODEL;
}

async function getPipeline(): Promise<AutomaticSpeechRecognitionPipeline> {
  if (!pipelinePromise) {
    const model = getModelName();
    console.log(
      `[whisper-asr] First use: downloading "${model}" (a few hundred MB). ` +
        'This will take a while — the weights are cached on disk, so later calls are fast.'
    );
    pipelinePromise = import('@xenova/transformers')
      .then(({ pipeline }) =>
        pipeline('automatic-speech-recognition', model, {
          // int8-quantized weights: best speed/accuracy trade-off on CPU.
          quantized: true,
          progress_callback: (data: { status?: string; file?: string }) => {
            // Log file-level download lifecycle only — the 'progress' events
            // fire per chunk and would spam the server log.
            if (data.file && (data.status === 'download' || data.status === 'done')) {
              console.log(
                `[whisper-asr] ${data.status === 'download' ? 'Downloading' : 'Finished'} ${data.file}`
              );
            }
          },
        })
      )
      .catch((err) => {
        // Don't cache a failed load — let the next call retry.
        pipelinePromise = null;
        throw err;
      });
  }
  return pipelinePromise;
}

// wavefile's bundled .d.ts doesn't expose the WaveFile class (its `export =`
// points at a namespace with no exported members), so type just the surface
// we use and resolve the constructor defensively across module interops.
interface DecodedWav {
  toBitDepth(depth: string): void;
  toSampleRate(rate: number): void;
  getSamples(
    interleaved?: boolean,
    container?: new (length: number) => Float32Array
  ): Float32Array | Float32Array[];
}
type WaveFileConstructor = new (bytes?: Uint8Array) => DecodedWav;

async function loadWaveFile(): Promise<WaveFileConstructor> {
  const mod = (await import('wavefile')) as unknown as {
    WaveFile?: WaveFileConstructor;
    default?: { WaveFile?: WaveFileConstructor };
  };
  const WaveFile = mod.WaveFile ?? mod.default?.WaveFile;
  if (!WaveFile) {
    throw new Error('Failed to load the wavefile module');
  }
  return WaveFile;
}

/**
 * Fetch the audio at `audioUrl` and decode it to 16 kHz mono PCM samples.
 * Only WAV is supported (see the file header for why).
 */
async function fetchWavSamples(audioUrl: string): Promise<Float32Array> {
  let response: Response;
  try {
    response = await fetch(audioUrl);
  } catch (err) {
    throw new Error(
      `Failed to fetch audio at ${audioUrl}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch audio at ${audioUrl}: HTTP ${response.status}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!isWav(bytes)) {
    throw new Error(
      `Unsupported audio format at ${audioUrl}: only WAV can be decoded in Node. ` +
        'Convert the recording first, e.g. `ffmpeg -i call.mp3 call.wav`.'
    );
  }
  return decodeWavToMono(bytes);
}

function isWav(bytes: Uint8Array): boolean {
  // "RIFF" <size> "WAVE" magic at fixed offsets.
  return (
    bytes.length > 44 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // "RIFF"
    bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45 // "WAVE"
  );
}

async function decodeWavToMono(bytes: Uint8Array): Promise<Float32Array> {
  const WaveFile = await loadWaveFile();
  const wav = new WaveFile(bytes);
  wav.toBitDepth('32f');
  wav.toSampleRate(TARGET_SAMPLE_RATE);

  // getSamples() returns a single Float32Array for mono audio, or one
  // Float32Array per channel for multi-channel audio — average those down.
  const samples = wav.getSamples(false, Float32Array) as unknown as
    | Float32Array
    | Float32Array[];
  if (!Array.isArray(samples)) return samples;

  const mono = new Float32Array(samples[0].length);
  for (let i = 0; i < mono.length; i++) {
    let sum = 0;
    for (const channel of samples) {
      sum += channel[i];
    }
    mono[i] = sum / samples.length;
  }
  return mono;
}

/**
 * The pipeline API does not surface Whisper's language auto-detection result,
 * so prefer the DTMF language hint; without one, guess from the script of the
 * transcript (Urdu is written in the Arabic script).
 */
function detectLanguage(hint: string | undefined, transcript: string): string {
  if (hint) return hint;
  return /[\u0600-\u06FF]/.test(transcript) ? 'ur' : 'en';
}

// Only forward hints Whisper understands — an unknown code would make the
// pipeline throw, so those are dropped and Whisper auto-detects instead.
function toWhisperLanguage(hint: string | undefined): string | undefined {
  if (!hint) return undefined;
  const code = hint.toLowerCase();
  return SUPPORTED_LANGUAGE_HINTS.has(code) ? code : undefined;
}

/**
 * Confidence derivation
 * ---------------------
 * @xenova/transformers v2 does not expose token-level probabilities for
 * Whisper (its `output_scores` option is unimplemented), so confidence is
 * estimated from the segment timestamps Whisper emits when called with
 * `return_timestamps: true`:
 *
 *   confidence = seconds of audio Whisper marked as speech / audio length
 *
 * Intelligible speech gets timestamped across nearly the whole clip
 * (≈ 0.7–1.0), while silence, noise, or an unintelligible call produces few
 * or short segments (→ 0). The call pipeline's low-confidence gate (< 0.6)
 * then routes shaky transcriptions to `needs_review`. An empty transcript
 * always scores 0.
 */
function estimateConfidence(
  result: WhisperResult,
  transcript: string,
  audioSamples: number
): number {
  if (!transcript || audioSamples <= 0) return 0;

  let speechSeconds = 0;
  for (const chunk of result.chunks ?? []) {
    const [start, end] = chunk.timestamp;
    if (typeof start === 'number' && typeof end === 'number' && end > start) {
      speechSeconds += end - start;
    }
  }
  const audioSeconds = audioSamples / TARGET_SAMPLE_RATE;
  return Math.round(Math.min(speechSeconds / audioSeconds, 1) * 100) / 100;
}

export class WhisperASRService implements ASRService {
  async transcribe(input: ASRInput): Promise<ASROutput> {
    const transcriber = await getPipeline();
    const audio = await fetchWavSamples(input.audio_url);

    // Whisper errors on zero-length input — report it as an empty transcript
    // and let the low-confidence gate route it to manual review.
    if (audio.length === 0) {
      return {
        transcript: '',
        language_detected: detectLanguage(input.language_hint, ''),
        confidence: 0,
      };
    }

    const language = toWhisperLanguage(input.language_hint);
    const result = (await transcriber(audio, {
      task: 'transcribe',
      // Whisper processes 30 s windows; longer calls are split with overlap.
      chunk_length_s: 30,
      stride_length_s: 5,
      // Segment timestamps feed the confidence estimate.
      return_timestamps: true,
      ...(language && { language }),
    })) as WhisperResult;

    const transcript = (result.text ?? '').trim();
    return {
      transcript,
      language_detected: detectLanguage(input.language_hint, transcript),
      confidence: estimateConfidence(result, transcript, audio.length),
    };
  }
}
