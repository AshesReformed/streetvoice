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

// Complaint analyzer: one recording in, everything the pipeline stores out.
// Implementations either call a multimodal model once (Gemini) or chain the
// ASR → translation → classification services above (staged).
export interface AnalyzerDepartment {
  id: string;
  name: string;
  keywords: string[];
  description?: string | null;
}

export interface ComplaintAnalysisInput {
  audio_url: string;
  language_hint?: string;
  departments: AnalyzerDepartment[];
}

export type Urgency = 'low' | 'medium' | 'high';

export interface ComplaintAnalysis {
  language: string; // ISO 639 code of what the caller actually spoke
  transcript_original: string;
  transcript_urdu: string;
  transcript_english: string;
  summary: string; // one line, English
  summary_urdu: string; // the same line in Urdu, for the department SMS
  department_id: string | null;
  category: string; // department name, or 'unclassified'
  area: string | null; // locality / landmark mentioned by the caller
  urgency: Urgency;
  confidence: number; // 0..1, how sure the analyzer is of the routing
  needs_review: boolean;
  review_reason: string | null;
  // Prank, abuse, silence, test call...: never sent to a department.
  // Optional: analyzers that can't judge it (staged, mock) leave it out.
  is_spam?: boolean;
  spam_reason?: string | null;
}

export interface ComplaintAnalyzer {
  analyze(input: ComplaintAnalysisInput): Promise<ComplaintAnalysis>;
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
