import { describe, it, expect } from 'vitest';
import { MockClassificationService, Department } from '@/lib/services/mock-classification';

const departments: Department[] = [
  { id: 'dept-water', name: 'Water & Sanitation', keywords: ['water', 'sewage', 'drainage', 'pipeline'] },
  { id: 'dept-electricity', name: 'Electricity', keywords: ['electricity', 'power', 'outage', 'transformer', 'wire'] },
  { id: 'dept-roads', name: 'Roads & Infrastructure', keywords: ['road', 'pothole', 'bridge', 'streetlight'] },
  { id: 'dept-waste', name: 'Sanitation & Waste', keywords: ['garbage', 'trash', 'waste', 'cleaning'] },
  { id: 'dept-general', name: 'General/Unclassified', keywords: [] },
];

function createService() {
  return new MockClassificationService(departments);
}

describe('Low-confidence handling', () => {
  it('routes a single strong keyword at exactly the 0.5 boundary', async () => {
    const svc = createService();
    // "electricity" alone → 1/2 = 0.5 → meets the threshold, so a short
    // one-keyword complaint classifies instead of being flagged for review
    const result = await svc.classify({ text: 'electricity' });

    expect(result.department_id).toBe('dept-electricity');
    expect(result.confidence).toBe(0.5);
  });

  it('returns confidence = 0 when zero keywords match', async () => {
    const svc = createService();
    const result = await svc.classify({ text: 'completely unrelated nonsense xyz' });

    expect(result.confidence).toBe(0);
    expect(result.department_id).toBeNull();
    expect(result.category).toBe('unclassified');
  });

  it('gives full confidence when two keywords match', async () => {
    const svc = createService();
    // Water dept: "water" + "pipeline" → 2/2 = 1.0
    const result = await svc.classify({ text: 'water pipeline issue' });

    expect(result.confidence).toBe(1);
    expect(result.department_id).toBe('dept-water');
  });

  it('routes two matching keywords with full confidence', async () => {
    const svc = createService();
    // Electricity dept: "power" + "outage" → 2/2 = 1.0
    const result = await svc.classify({ text: 'power outage nearby' });

    expect(result.confidence).toBe(1);
    expect(result.department_id).toBe('dept-electricity');
  });

  it('returns unclassified category for all below-threshold results', async () => {
    const svc = createService();
    const inputs = [
      'something vague',
      'my area has problems',
      'fix the thing',
      'help needed',
    ];

    for (const text of inputs) {
      const result = await svc.classify({ text });
      expect(result.category).toBe('unclassified');
      expect(result.department_id).toBeNull();
    }
  });

  it('higher keyword density yields higher confidence', async () => {
    const svc = createService();

    // 1 keyword match: road → 1/2 = 0.5
    const low = await svc.classify({ text: 'road issue' });
    // 3 keyword matches: road, pothole, bridge → 3/2, capped at 1.0
    const high = await svc.classify({ text: 'pothole on road near bridge' });

    expect(high.confidence).toBeGreaterThan(low.confidence);
  });
});
