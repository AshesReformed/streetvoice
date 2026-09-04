import { ASRService, TranslationService, ClassificationService } from './types';
import { MockASRService } from './mock-asr';
import { WhisperASRService } from './whisper-asr';
import { MockTranslationService } from './mock-translation';
import { NllbTranslationService } from './nllb-translation';
import { MockClassificationService, Department } from './mock-classification';

export function getASRService(): ASRService {
  const provider = process.env.ASR_PROVIDER || 'mock';
  switch (provider) {
    case 'whisper':
      // Real speech-to-text via @xenova/transformers (self-hosted Whisper).
      // The heavy library is only loaded lazily on first transcription.
      return new WhisperASRService();
    case 'mock':
    default:
      return new MockASRService();
  }
}

export function getTranslationService(): TranslationService {
  const provider = process.env.TRANSLATION_PROVIDER || 'mock';
  switch (provider) {
    case 'nllb':
      // Real multilingual translation via @xenova/transformers (self-hosted
      // NLLB-200). The heavy library is only loaded lazily on first call.
      return new NllbTranslationService();
    case 'mock':
    default:
      return new MockTranslationService();
  }
}

export function getClassificationService(departments: Department[]): ClassificationService {
  // Classification always uses keyword matching for MVP
  return new MockClassificationService(departments);
}

export type { ASRService, TranslationService, ClassificationService } from './types';
export type { Department } from './mock-classification';
