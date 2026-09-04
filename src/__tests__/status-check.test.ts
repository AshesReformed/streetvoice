import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the Supabase admin client before importing the route handler
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

// Dynamic import after mock setup
import { GET } from '@/app/api/complaints/status/[trackingId]/route';
import { createAdminClient } from '@/lib/supabase/admin';

const mockCreateAdminClient = vi.mocked(createAdminClient);

function makeRequest(url = 'http://localhost:3000/api/complaints/status/TRK-001') {
  return new NextRequest(new URL(url));
}

function makeParams(trackingId: string) {
  return { params: Promise.resolve({ trackingId }) };
}

describe('Status Check Endpoint Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const allowedFields = ['status', 'department_name'];
  const sensitiveFields = [
    'transcript_regional',
    'transcript_urdu',
    'transcript_english',
    'audio_url',
    'citizen_id',
    'phone_hash',
  ];

  it('only returns status and department_name fields in a successful response', async () => {
    mockCreateAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                status: 'under_review',
                departments: { name: 'Water & Sanitation' },
              },
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await GET(makeRequest(), makeParams('TRK-001'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toBeDefined();

    // Verify only allowed fields are present
    const returnedKeys = Object.keys(body.data);
    for (const field of allowedFields) {
      expect(returnedKeys).toContain(field);
    }
    for (const field of sensitiveFields) {
      expect(returnedKeys).not.toContain(field);
    }

    // Verify correct values
    expect(body.data.status).toBe('under_review');
    expect(body.data.department_name).toBe('Water & Sanitation');
  });

  it('returns 404 for invalid tracking_id', async () => {
    mockCreateAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'not found' },
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await GET(makeRequest(), makeParams('INVALID-ID'));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBeDefined();

    // Ensure no sensitive data leaks even in error responses
    const bodyKeys = Object.keys(body);
    for (const field of sensitiveFields) {
      expect(bodyKeys).not.toContain(field);
    }
  });

  it('returns 404 when complaint is null (no error but no data)', async () => {
    mockCreateAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await GET(makeRequest(), makeParams('TRK-MISSING'));
    expect(res.status).toBe(404);
  });

  it('returns 500 on unexpected database error', async () => {
    mockCreateAdminClient.mockImplementation(() => {
      throw new Error('Database connection failed');
    });

    const res = await GET(makeRequest(), makeParams('TRK-001'));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe('Internal server error');

    // Ensure no internal details leak
    expect(JSON.stringify(body)).not.toContain('Database connection failed');
  });

  it('handles null department gracefully', async () => {
    mockCreateAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                status: 'received',
                departments: null,
              },
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await GET(makeRequest(), makeParams('TRK-002'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('received');
    expect(body.data.department_name).toBeNull();
  });

  it('response shape contract: no extra fields beyond the documented schema', async () => {
    // This test documents the exact API contract for consumers
    mockCreateAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                status: 'resolved',
                departments: { name: 'Roads & Infrastructure' },
              },
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await GET(makeRequest(), makeParams('TRK-003'));
    const body = await res.json();

    // The top-level response should only contain "data"
    expect(Object.keys(body)).toEqual(['data']);

    // The data object should only contain status and department_name
    expect(Object.keys(body.data).sort()).toEqual(
      ['department_name', 'status'].sort()
    );
  });
});
