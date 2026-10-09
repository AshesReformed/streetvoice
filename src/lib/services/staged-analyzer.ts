import { config } from '@/lib/config';
import {
  ASRService,
  ClassificationService,
  ComplaintAnalysis,
  ComplaintAnalysisInput,
  ComplaintAnalyzer,
  TranslationService,
} from './types';

// ===========================================================================
// Staged analyzer — the original pipeline: ASR, then translation, then
// keyword classification, each as its own service (mock or self-hosted
// Whisper / NLLB). Used when AI_PROVIDER is not 'gemini', and by tests.
//
// Whisper and NLLB are each several hundred MB in memory, so each model is
// loaded on demand, used, then explicitly disposed (via release()) before
// the next one is loaded — only one model is ever resident at a time.
// ===========================================================================

export class StagedComplaintAnalyzer implements ComplaintAnalyzer {
  constructor(
    private readonly asr: () => ASRService,
    private readonly translation: () => TranslationService,
    private readonly classification: (input: ComplaintAnalysisInput) => ClassificationService
  ) {}

  async analyze(input: ComplaintAnalysisInput): Promise<ComplaintAnalysis> {
    // 1. ASR: load Whisper, transcribe audio, then release the model.
    const asrService = this.asr();
    const asrResult = await asrService.transcribe({
      audio_url: input.audio_url,
      language_hint: input.language_hint,
    });
    await asrService.release?.();

    // 2. Translation: load NLLB, translate to Urdu + English, then release.
    const translationService = this.translation();
    const translationResult = await translationService.translate({
      text: asrResult.transcript,
      source_lang: asrResult.language_detected,
    });
    await translationService.release?.();

    // 3. Keyword classification on the English text.
    const classificationResult = await this.classification(input).classify({
      text: translationResult.english,
    });

    // 4. Low-confidence gate
    const lowAsr = asrResult.confidence < config.classification.asrConfidenceThreshold;
    const lowRouting =
      classificationResult.confidence < config.classification.confidenceThreshold;
    const needsReview = lowAsr || lowRouting;

    return {
      language: asrResult.language_detected,
      transcript_original: asrResult.transcript,
      transcript_urdu: translationResult.urdu,
      transcript_english: translationResult.english,
      summary: translationResult.english,
      department_id: classificationResult.department_id,
      category: classificationResult.category,
      area: null,
      urgency: 'medium',
      confidence: classificationResult.confidence,
      needs_review: needsReview,
      review_reason: lowAsr
        ? 'Speech was unclear'
        : lowRouting
          ? 'No department matched'
          : null,
    };
  }
}
