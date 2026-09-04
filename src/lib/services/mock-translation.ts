import { TranslationService, TranslationInput, TranslationOutput } from './types';

export class MockTranslationService implements TranslationService {
  async translate(input: TranslationInput): Promise<TranslationOutput> {
    return {
      urdu: `[mock] ${input.text}`,
      english: `[mock] ${input.text}`,
    };
  }
}
