// ASR Service
export interface ASRInput {
  audio_url: string;
  language_hint?: string;
}

export interface ASROutput {
  transcript: string;
  language_detected: string;
  confidence: number;
}

export interface ASRService {
  transcribe(input: ASRInput): Promise<ASROutput>;
  // Dispose the underlying model and free memory. Optional so that lightweight
  // or mock implementations that hold no heavy resources can omit it.
  release?(): Promise<void>;
}

// Translation Service
export interface TranslationInput {
  text: string;
  source_lang: string;
}

export interface TranslationOutput {
  urdu: string;
  english: string;
}

export interface TranslationService {
  translate(input: TranslationInput): Promise<TranslationOutput>;
  // Dispose the underlying model and free memory. Optional so that lightweight
  // or mock implementations that hold no heavy resources can omit it.
  release?(): Promise<void>;
}

// Classification Service
export interface ClassificationInput {
  text: string;
}

export interface ClassificationOutput {
  department_id: string | null;
  category: string;
  confidence: number;
}

export interface ClassificationService {
  classify(input: ClassificationInput): Promise<ClassificationOutput>;
}

// Telephony webhook input/output
export interface TelephonyWebhookInput {
  call_ref: string;
  audio_url: string;
  // Language the caller picked via DTMF ('ur' | 'en'). Absent when the
  // caller made no selection — the ASR provider then auto-detects.
  dtmf_language?: string;
  caller_id?: string;
}

export interface TelephonyWebhookOutput {
  tracking_id: string;
  spoken_confirmation_text: string;
}
