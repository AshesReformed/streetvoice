import { ClassificationService, ClassificationInput, ClassificationOutput } from './types';

export interface Department {
  id: string;
  name: string;
  keywords: string[];
}

export class MockClassificationService implements ClassificationService {
  private departments: Department[];

  constructor(departments: Department[]) {
    this.departments = departments;
  }

  async classify(input: ClassificationInput): Promise<ClassificationOutput> {
    const text = input.text.toLowerCase();

    let bestMatch: { department: Department; score: number; matchedKeywords: string[] } | null =
      null;

    for (const dept of this.departments) {
      if (dept.keywords.length === 0) continue; // Skip fallback department

      const matchedKeywords = dept.keywords.filter((keyword) =>
        text.includes(keyword.toLowerCase())
      );

      // Score against at most two of the department's keywords: short
      // complaints ("no water for two days") rarely echo a whole keyword
      // list, so one strong on-topic keyword reaches the 0.5 classification
      // threshold and two or more matches are conclusive.
      const score = Math.min(1, matchedKeywords.length / Math.min(dept.keywords.length, 2));

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { department: dept, score, matchedKeywords };
      }
    }

    // If no match or confidence below threshold (0.5), return null department
    if (!bestMatch || bestMatch.score < 0.5) {
      return {
        department_id: null,
        category: 'unclassified',
        confidence: bestMatch?.score || 0,
      };
    }

    return {
      department_id: bestMatch.department.id,
      category: bestMatch.department.name,
      confidence: bestMatch.score,
    };
  }
}
