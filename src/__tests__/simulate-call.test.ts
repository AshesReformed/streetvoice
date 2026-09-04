import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Mock external dependencies before importing the route handler
vi.mock('@/lib/middleware/auth', () => ({
  requireAuth: vi.fn(),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock('@/lib/pipeline/process-call', () => ({
  processIncomingCall: vi.fn(),
}));

import { POST } from '@/app/api/dev/simulate-call/route';
import { requireAuth } from '@/lib/middleware/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { processIncomingCall } from '@/lib/pipeline/process-call';

const mockRequireAuth = vi.mocked(requireAuth);
const mockCreateAdminClient = vi.mocked(createAdminClient);
const mockProcessIncomingCall = vi.mocked(processIncomingCall);

function makeRequest(body?: unknown) {
  return new NextRequest(
    new URL('http://localhost:3000/api/dev/simulate-call'),
    body === undefined
      ? { method: 'POST' }
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
  );
}

// Stands in for the post-pipeline complaint lookup (tracking id -> complaint).
function stubComplaintLookup() {
  mockCreateAdminClient.mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'complaint-1',
              tracking_id: 'SV-000042',
              status: 'open',
              category: 'Roads & Infrastructure',
              department: { name: 'Roads & Infrastructure' },
            },
            error: null,
          }),
        }),
      }),
    }),
  } as unknown as ReturnType<typeof createAdminClient>);
}

function adminUser() {
  return {
    id: 'user-1',
    email: 'admin@test.pk',
    officer: {
      id: 'user-1',
      department_id: null,
      role: 'admin' as const,
      full_name: 'Test Admin',
    },
  };
}

describe('Simulate Call Endpoint (admin-only)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('works in production when the user is an admin', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mockRequireAuth.mockResolvedValue(adminUser());
    mockProcessIncomingCall.mockResolvedValue({
      tracking_id: 'SV-000042',
      spoken_confirmation_text: 'Your complaint has been registered.',
    });
    stubComplaintLookup();

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(mockProcessIncomingCall).toHaveBeenCalledTimes(1);
  });

  it('still blocks non-admin users in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mockRequireAuth.mockResolvedValue({
      id: 'user-2',
      email: 'officer@test.pk',
      officer: {
        id: 'user-2',
        department_id: null,
        role: 'officer',
        full_name: 'Test Officer',
      },
    });

    const res = await POST(makeRequest());

    expect(res.status).toBe(403);
    expect(mockProcessIncomingCall).not.toHaveBeenCalled();
  });

  it('passes through auth failures from requireAuth', async () => {
    const unauthorized = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    mockRequireAuth.mockResolvedValue(unauthorized);

    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    expect(mockProcessIncomingCall).not.toHaveBeenCalled();
  });

  it('returns 403 for non-admin officers', async () => {
    mockRequireAuth.mockResolvedValue({
      id: 'user-2',
      email: 'officer@test.pk',
      officer: {
        id: 'user-2',
        department_id: null,
        role: 'officer',
        full_name: 'Test Officer',
      },
    });

    const res = await POST(makeRequest());

    expect(res.status).toBe(403);
    expect(mockProcessIncomingCall).not.toHaveBeenCalled();
  });

  it('runs the pipeline and returns the created complaint', async () => {
    mockRequireAuth.mockResolvedValue(adminUser());
    mockProcessIncomingCall.mockResolvedValue({
      tracking_id: 'SV-000042',
      spoken_confirmation_text: 'Your complaint has been registered.',
    });
    mockCreateAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'complaint-1',
                tracking_id: 'SV-000042',
                status: 'open',
                category: 'Roads & Infrastructure',
                department: { name: 'Roads & Infrastructure' },
              },
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockProcessIncomingCall).toHaveBeenCalledTimes(1);

    // The generated payload must satisfy the webhook contract
    const payload = mockProcessIncomingCall.mock.calls[0][0];
    expect(payload.call_ref).toMatch(/^sim-/);
    expect(payload.audio_url).toMatch(/^https:\/\/.+\/samples\/[a-z]+\.mp3$/);
    expect(typeof payload.dtmf_language).toBe('string');
    expect(payload.caller_id).toMatch(/^\+92/);

    expect(body.data).toEqual({
      tracking_id: 'SV-000042',
      status: 'open',
      category: 'Roads & Infrastructure',
      department_name: 'Roads & Infrastructure',
      complaint_id: 'complaint-1',
    });
  });

  it('uses a supplied audioUrl instead of a random scenario', async () => {
    mockRequireAuth.mockResolvedValue(adminUser());
    mockProcessIncomingCall.mockResolvedValue({
      tracking_id: 'SV-000043',
      spoken_confirmation_text: 'Your complaint has been registered.',
    });
    stubComplaintLookup();

    const customUrl = 'https://storage.example.com/calls/real-recording.wav';
    const res = await POST(makeRequest({ audioUrl: customUrl }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockProcessIncomingCall).toHaveBeenCalledTimes(1);

    const payload = mockProcessIncomingCall.mock.calls[0][0];
    expect(payload.audio_url).toBe(customUrl);
    // Not one of the canned sample URLs
    expect(payload.audio_url).not.toMatch(/\/samples\//);
    expect(body.data.tracking_id).toBe('SV-000043');
  });

  it('ignores a blank audioUrl and falls back to a random scenario', async () => {
    mockRequireAuth.mockResolvedValue(adminUser());
    mockProcessIncomingCall.mockResolvedValue({
      tracking_id: 'SV-000044',
      spoken_confirmation_text: 'Your complaint has been registered.',
    });
    stubComplaintLookup();

    const res = await POST(makeRequest({ audioUrl: '   ' }));

    expect(res.status).toBe(200);
    const payload = mockProcessIncomingCall.mock.calls[0][0];
    expect(payload.audio_url).toMatch(
      /^https:\/\/cdn\.streetvoice\.dev\/samples\/[a-z]+\.mp3$/
    );
  });

  it('forwards a supplied language hint to the pipeline', async () => {
    mockRequireAuth.mockResolvedValue(adminUser());
    mockProcessIncomingCall.mockResolvedValue({
      tracking_id: 'SV-000045',
      spoken_confirmation_text: 'Your complaint has been registered.',
    });
    stubComplaintLookup();

    const customUrl = 'https://storage.example.com/calls/urdu-recording.wav';
    const res = await POST(makeRequest({ audioUrl: customUrl, language: 'ur' }));

    expect(res.status).toBe(200);
    expect(mockProcessIncomingCall).toHaveBeenCalledTimes(1);

    const payload = mockProcessIncomingCall.mock.calls[0][0];
    expect(payload.audio_url).toBe(customUrl);
    // The explicit choice mirrors what a DTMF-selecting caller provides
    expect(payload.dtmf_language).toBe('ur');
  });

  it('sends no language hint for a custom recording left unspecified', async () => {
    mockRequireAuth.mockResolvedValue(adminUser());
    mockProcessIncomingCall.mockResolvedValue({
      tracking_id: 'SV-000046',
      spoken_confirmation_text: 'Your complaint has been registered.',
    });
    stubComplaintLookup();

    const customUrl = 'https://storage.example.com/calls/recording.wav';
    const res = await POST(makeRequest({ audioUrl: customUrl, language: 'unspecified' }));

    expect(res.status).toBe(200);
    const payload = mockProcessIncomingCall.mock.calls[0][0];
    // No hint — the ASR auto-detects instead of being forced into a language
    expect(payload.dtmf_language).toBeUndefined();
  });

  it('sends no language hint for a custom recording without a language field', async () => {
    mockRequireAuth.mockResolvedValue(adminUser());
    mockProcessIncomingCall.mockResolvedValue({
      tracking_id: 'SV-000047',
      spoken_confirmation_text: 'Your complaint has been registered.',
    });
    stubComplaintLookup();

    const customUrl = 'https://storage.example.com/calls/recording.wav';
    const res = await POST(makeRequest({ audioUrl: customUrl }));

    expect(res.status).toBe(200);
    const payload = mockProcessIncomingCall.mock.calls[0][0];
    expect(payload.dtmf_language).toBeUndefined();
  });

  it('uses the explicit language even without a custom audio URL', async () => {
    mockRequireAuth.mockResolvedValue(adminUser());
    mockProcessIncomingCall.mockResolvedValue({
      tracking_id: 'SV-000048',
      spoken_confirmation_text: 'Your complaint has been registered.',
    });
    stubComplaintLookup();

    const res = await POST(makeRequest({ language: 'en' }));

    expect(res.status).toBe(200);
    const payload = mockProcessIncomingCall.mock.calls[0][0];
    expect(payload.dtmf_language).toBe('en');
    expect(payload.audio_url).toMatch(/\/samples\//);
  });

  it('returns 400 for an unsupported language value', async () => {
    mockRequireAuth.mockResolvedValue(adminUser());

    const res = await POST(
      makeRequest({ audioUrl: 'https://storage.example.com/calls/a.wav', language: 'fr' })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/Invalid language/);
    expect(mockProcessIncomingCall).not.toHaveBeenCalled();
  });

  it('returns 400 when the supplied audioUrl is not a valid URL', async () => {
    mockRequireAuth.mockResolvedValue(adminUser());

    const res = await POST(makeRequest({ audioUrl: 'not a valid url' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/Invalid audioUrl/);
    expect(mockProcessIncomingCall).not.toHaveBeenCalled();
  });
});
