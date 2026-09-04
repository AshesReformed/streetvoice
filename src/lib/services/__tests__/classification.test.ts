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

describe('MockClassificationService', () => {
  it('routes "water pipeline broken on main road" to Water & Sanitation', async () => {
    const svc = createService();
    const result = await svc.classify({ text: 'water pipeline broken on main road' });

    // matches: water, pipeline → 2/2 = 1.0
    expect(result.department_id).toBe('dept-water');
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    expect(result.category).toBe('Water & Sanitation');
  });

  it('routes "power outage from electricity transformer" to Electricity', async () => {
    const svc = createService();
    // Using text with enough keyword density for a decisive score
    // matches: electricity, power, outage, transformer → 4/2, capped at 1.0
    const result = await svc.classify({ text: 'power outage from electricity transformer' });

    expect(result.department_id).toBe('dept-electricity');
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    expect(result.category).toBe('Electricity');
  });

  it('routes "there is a pothole on the road near bridge" to Roads & Infrastructure', async () => {
    const svc = createService();
    const result = await svc.classify({ text: 'there is a pothole on the road near bridge' });

    // matches: pothole, road, bridge → 3/2, capped at 1.0
    expect(result.department_id).toBe('dept-roads');
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    expect(result.category).toBe('Roads & Infrastructure');
  });

  it('routes "garbage not collected, trash everywhere" to Sanitation & Waste', async () => {
    const svc = createService();
    const result = await svc.classify({ text: 'garbage not collected, trash everywhere' });

    // matches: garbage, trash → 2/2 = 1.0
    expect(result.department_id).toBe('dept-waste');
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    expect(result.category).toBe('Sanitation & Waste');
  });

  it('classifies a short, realistic one-keyword complaint', async () => {
    const svc = createService();
    // "water" is the only keyword present → 1/2 = 0.5 — one strong,
    // on-topic keyword is enough to classify a short complaint
    const result = await svc.classify({ text: 'There has been no water for two days' });

    expect(result.department_id).toBe('dept-water');
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    expect(result.category).toBe('Water & Sanitation');
  });

  it('returns null department for ambiguous input with low confidence', async () => {
    const svc = createService();
    const result = await svc.classify({ text: 'something is wrong in my area' });

    expect(result.department_id).toBeNull();
    expect(result.confidence).toBeLessThan(0.5);
    expect(result.category).toBe('unclassified');
  });

  it('returns null department and zero confidence for empty input', async () => {
    const svc = createService();
    const result = await svc.classify({ text: '' });

    expect(result.department_id).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.category).toBe('unclassified');
  });

  it('never selects General/Unclassified department (empty keywords)', async () => {
    const svc = createService();

    // Try a variety of inputs — none should return dept-general
    const inputs = [
      'water pipeline broken',
      'something is wrong',
      'garbage trash waste',
      'road pothole bridge',
      'random unrelated complaint',
      '',
    ];

    for (const text of inputs) {
      const result = await svc.classify({ text });
      expect(result.department_id).not.toBe('dept-general');
    }
  });

  it('is case-insensitive when matching keywords', async () => {
    const svc = createService();
    const result = await svc.classify({ text: 'WATER PIPELINE broken on Main ROAD' });

    expect(result.department_id).toBe('dept-water');
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('picks the department with the highest score when multiple match', async () => {
    const svc = createService();
    // water: water + pipeline → 2/2 = 1.0; roads: road → 1/2 = 0.5
    const result = await svc.classify({ text: 'water pipeline flooding the road' });

    expect(result.department_id).toBe('dept-water');
    expect(result.confidence).toBe(1);
    expect(result.category).toBe('Water & Sanitation');
  });
});
