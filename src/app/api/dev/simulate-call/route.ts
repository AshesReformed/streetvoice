import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { processIncomingCall } from '@/lib/pipeline/process-call';
import { webhookPayloadSchema } from '@/lib/validation/schemas';
import { SAMPLE_SCENARIOS } from '@/lib/services/mock-asr';

// Admin-only endpoint that simulates an incoming phone call by pushing a fake
// payload through the real call pipeline (ASR -> translation ->
// classification -> complaint). Lets the dashboard fill up with realistic
// test data without any telephony provider. Accepts an optional
// { audioUrl } body to send a real recording through the pipeline instead of
// a canned sample, and an optional { language: 'ur' | 'en' } to force the
// DTMF language hint — a recording without one is auto-detected by the ASR
// instead of being forced into a random language. Gated by admin auth only.

const FAKE_CALLERS = [
  '+923001234567',
  '+923217654321',
  '+923451234987',
  '+923331122334',
  '+923129876543',
];

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export async function POST(request: NextRequest) {
  // Never available in production builds
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;

    if (auth.officer.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Optional custom audio URL (e.g. a real recording) to push through the
    // pipeline; without one a random canned scenario is simulated.
    let body: { audioUrl?: unknown; language?: unknown } = {};
    try {
      const parsedBody: unknown = await request.json();
      if (parsedBody && typeof parsedBody === 'object') {
        body = parsedBody as { audioUrl?: unknown; language?: unknown };
      }
    } catch {
      // No body (or invalid JSON) — keep the random-scenario behavior
    }
    const customAudioUrl =
      typeof body.audioUrl === 'string' && body.audioUrl.trim() !== ''
        ? body.audioUrl.trim()
        : undefined;

    // Optional language mirroring the DTMF selection a real caller would
    // have made. 'unspecified' (or omitting the field) sends no hint so the
    // ASR auto-detects from the audio itself.
    const rawLanguage =
      typeof body.language === 'string' && body.language.trim() !== ''
        ? body.language.trim().toLowerCase()
        : undefined;
    const language = rawLanguage === 'unspecified' ? undefined : rawLanguage;
    if (language !== undefined && language !== 'ur' && language !== 'en') {
      return NextResponse.json(
        { error: "Invalid language: must be 'ur', 'en', or 'unspecified'" },
        { status: 400 }
      );
    }

    const scenario = pick(Object.keys(SAMPLE_SCENARIOS));
    const payload = {
      call_ref: `sim-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      audio_url: customAudioUrl ?? `https://cdn.streetvoice.dev/samples/${scenario}.mp3`,
      // An explicit choice is what a real DTMF-selecting caller provides.
      // A custom recording without one gets no hint (ASR auto-detects)
      // rather than a random language; canned scenarios keep simulating a
      // random selection, like every real caller who reached the pipeline.
      dtmf_language: language ?? (customAudioUrl ? undefined : pick(['ur', 'en'])),
      caller_id: pick(FAKE_CALLERS),
    };

    // Same payload contract as the real webhook
    const parsed = webhookPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      // The custom URL is the only user-provided field, so call out problems
      // with it explicitly rather than a generic validation error.
      const audioIssue = parsed.error.flatten().fieldErrors.audio_url;
      return NextResponse.json(
        {
          error:
            customAudioUrl && audioIssue
              ? `Invalid audioUrl: ${audioIssue.join(', ')}`
              : 'Validation failed',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const result = await processIncomingCall(parsed.data);

    // Load the stored complaint so the UI can show how it was classified
    const supabase = createAdminClient();
    const { data: complaint } = await supabase
      .from('complaints')
      .select('id, tracking_id, status, category, department:departments(name)')
      .eq('tracking_id', result.tracking_id)
      .single();
    const departmentName =
      (complaint?.department as unknown as { name: string } | null | undefined)?.name ?? null;

    return NextResponse.json({
      data: {
        tracking_id: result.tracking_id,
        status: complaint?.status ?? null,
        category: complaint?.category ?? null,
        department_name: departmentName,
        complaint_id: complaint?.id ?? null,
      },
    });
  } catch (err) {
    console.error('Simulate call error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
