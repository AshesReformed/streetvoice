import { ASRService, ASRInput, ASROutput } from './types';

// Sample transcripts used by the mock ASR. The scenario is derived from the
// audio file name in the URL (e.g. ".../samples/streetlight.mp3") so dev
// tooling can simulate different kinds of calls by pointing at a named
// sample. URLs without a recognized sample fall back to the water complaint,
// preserving the original mock behavior.
export const SAMPLE_SCENARIOS: Record<string, { transcript: string; confidence: number }> = {
  streetlight: {
    transcript:
      'The streetlight on our road has been broken for two weeks and the whole street is dark at night.',
    confidence: 0.91,
  },
  water: {
    transcript:
      'There is a water pipeline broken on main road near sector 5. Sewage is overflowing and causing problems for residents.',
    confidence: 0.92,
  },
  garbage: {
    transcript:
      'Garbage has not been collected from our street for many days and trash is piling up everywhere.',
    confidence: 0.88,
  },
  electricity: {
    transcript:
      'There is no electricity in our area since last night. The transformer near the market is sparking and power lines are down.',
    confidence: 0.9,
  },
  unclear: {
    transcript:
      'Hello... hello... I want to report something but the line is very bad, I cannot hear anything.',
    // Below the ASR confidence threshold so the complaint lands in needs_review
    confidence: 0.42,
  },
};

export class MockASRService implements ASRService {
  async transcribe(input: ASRInput): Promise<ASROutput> {
    const match = input.audio_url.match(/\/samples\/([a-z]+)\.mp3/);
    const sample = (match && SAMPLE_SCENARIOS[match[1]]) || SAMPLE_SCENARIOS.water;

    return {
      transcript: sample.transcript,
      language_detected: input.language_hint || 'ur',
      confidence: sample.confidence,
    };
  }
}
