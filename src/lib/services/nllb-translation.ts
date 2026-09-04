import type { TranslationPipeline } from '@xenova/transformers';
import { TranslationService, TranslationInput, TranslationOutput } from './types';

// ===========================================================================
// NLLB Translation — real multilingual machine translation, fully self-hosted.
//
// Runs Meta's NLLB-200 locally through @xenova/transformers (ONNX Runtime,
// WASM backend): no external API calls, no per-use cost.
//
// - Model weights are downloaded on first use (~2.4 GB for the distilled
//   600M variant, int8-quantized) and cached on disk under
//   node_modules/@xenova/transformers/.cache — only the first call is slow.
// - NLLB uses FLORES-200 language codes (e.g. "urd_Arab", "eng_Latn"), NOT
//   the simple ISO 639-1 codes Whisper returns ("ur", "en"). A mapping
//   function converts between the two.
// - The interface always returns both Urdu and English text. When the source
//   language is neither Urdu nor English, two translation passes are run.
// - @xenova/transformers is imported dynamically so that the default (mock)
//   provider never loads the ONNX runtime.
// ===========================================================================

/** Smallest distilled NLLB variant — best CPU accuracy/speed trade-off. */
const DEFAULT_MODEL = 'Xenova/nllb-200-distilled-600M';

/**
 * FLORES-200 codes for the languages the interface must output.
 */
const FLORES_URDU = 'urd_Arab';
const FLORES_ENGLISH = 'eng_Latn';

/**
 * Mapping from Whisper's ISO 639-1 language codes to NLLB's FLORES-200 codes.
 * Covers the major languages of Pakistan plus English.
 */
const WHISPER_TO_FLORES: Record<string, string> = {
  ur: 'urd_Arab', // Urdu
  en: 'eng_Latn', // English
  pa: 'pan_Guru', // Punjabi (Shahmukhi/Gurmukhi)
  ps: 'pus_Arab', // Pashto
  sd: 'snd_Arab', // Sindhi
};

/**
 * Convert a Whisper language code to a FLORES-200 code.
 * Falls back to Urdu ("urd_Arab") for unrecognized codes — the most common
 * source language in this system — and logs a warning rather than throwing,
 * so the pipeline degrades gracefully.
 */
export function toFloresCode(whisperCode: string): string {
  const code = whisperCode.toLowerCase();
  const mapped = WHISPER_TO_FLORES[code];
  if (mapped) return mapped;

  console.warn(
    `[nllb-translation] Unrecognized language code "${whisperCode}" — ` +
      `defaulting to Urdu (${FLORES_URDU}). Add a mapping in WHISPER_TO_FLORES ` +
      'if this language should be supported explicitly.'
  );
  return FLORES_URDU;
}

// The transformers.js translation pipeline resolves to a callable that
// returns an array of { translation_text: string }.
type TranslationPipelineFn = (
  text: string,
  options: { src_lang: string; tgt_lang: string }
) => Promise<Array<{ translation_text: string }>>;

let pipelinePromise: Promise<TranslationPipelineFn> | null = null;

/**
 * Dispose the cached ONNX pipeline and clear the singleton reference so the
 * model's memory can be reclaimed before the next heavy model is loaded.
 * Render's free tier caps at 512 MB — holding Whisper (~400 MB) and NLLB
 * (~600 MB) simultaneously causes OOM kills, so process-call.ts loads them
 * one at a time and releases each after use.
 */
async function releasePipeline(): Promise<void> {
  const cached = pipelinePromise;
  pipelinePromise = null;
  if (cached) {
    try {
      const pipeline = await cached;
      const disposable = pipeline as unknown as { dispose?: () => Promise<void> | void };
      if (typeof disposable.dispose === 'function') {
        await disposable.dispose();
      }
    } catch {
      // Already failed to load — nothing to dispose.
    }
  }
}

/**
 * Reset the cached pipeline singleton. Exported for tests only — allows
 * each test to verify first-use behaviour (download logging, env-var reading,
 * error recovery) in isolation.
 * @internal
 */
export function _resetPipeline(): void {
  pipelinePromise = null;
}

function getModelName(): string {
  return process.env.NLLB_MODEL || DEFAULT_MODEL;
}

async function getTranslator(): Promise<TranslationPipelineFn> {
  if (!pipelinePromise) {
    const model = getModelName();
    console.log(
      `[nllb-translation] First use: downloading "${model}" (~2.4 GB quantized). ` +
        'This will take a while — the weights are cached on disk, so later calls are fast.'
    );
    pipelinePromise = import('@xenova/transformers')
      .then(({ pipeline }) =>
        pipeline('translation', model, {
          quantized: true,
          progress_callback: (data: { status?: string; file?: string }) => {
            if (data.file && (data.status === 'download' || data.status === 'done')) {
              console.log(
                `[nllb-translation] ${data.status === 'download' ? 'Downloading' : 'Finished'} ${data.file}`
              );
            }
          },
        }) as Promise<unknown>
      )
      .then((p) => p as TranslationPipelineFn)
      .catch((err) => {
        // Don't cache a failed load — let the next call retry.
        pipelinePromise = null;
        throw err;
      });
  }
  return pipelinePromise;
}

/**
 * Run a single translation pass through the NLLB pipeline.
 */
async function translatePass(
  translator: TranslationPipelineFn,
  text: string,
  srcLang: string,
  tgtLang: string
): Promise<string> {
  if (!text) return '';
  const result = await translator(text, { src_lang: srcLang, tgt_lang: tgtLang });
  return result[0]?.translation_text?.trim() ?? '';
}

export class NllbTranslationService implements TranslationService {
  async translate(input: TranslationInput): Promise<TranslationOutput> {
    const translator = await getTranslator();
    const srcFlores = toFloresCode(input.source_lang);

    // Determine which outputs are needed and whether the source already
    // matches one of them — no need to translate a language into itself.
    const needUrdu = srcFlores !== FLORES_URDU;
    const needEnglish = srcFlores !== FLORES_ENGLISH;

    let urdu: string;
    let english: string;

    if (!needUrdu && !needEnglish) {
      // Source is both Urdu and English simultaneously — impossible, but
      // defensively treat it as Urdu and translate to English.
      urdu = input.text;
      english = await translatePass(translator, input.text, FLORES_URDU, FLORES_ENGLISH);
    } else if (!needUrdu) {
      // Source is Urdu — copy it directly, translate to English only.
      urdu = input.text;
      english = await translatePass(translator, input.text, FLORES_URDU, FLORES_ENGLISH);
    } else if (!needEnglish) {
      // Source is English — copy it directly, translate to Urdu only.
      english = input.text;
      urdu = await translatePass(translator, input.text, FLORES_ENGLISH, FLORES_URDU);
    } else {
      // Source is a third language — two passes needed.
      const [urduResult, englishResult] = await Promise.all([
        translatePass(translator, input.text, srcFlores, FLORES_URDU),
        translatePass(translator, input.text, srcFlores, FLORES_ENGLISH),
      ]);
      urdu = urduResult;
      english = englishResult;
    }

    return { urdu, english };
  }

  // Dispose the NLLB ONNX session so its memory is freed after translation
  // completes — critical for 512 MB deployments that can't hold both models.
  async release(): Promise<void> {
    await releasePipeline();
  }
}
