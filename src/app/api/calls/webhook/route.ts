import { NextRequest, NextResponse } from 'next/server';
import { webhookPayloadSchema } from '@/lib/validation/schemas';
import { processIncomingCall } from '@/lib/pipeline/process-call';
import { config } from '@/lib/config';
import { checkCaller, recordAccepted } from '@/lib/abuse/guard';
import { normalizePhone } from '@/lib/sms/phone';

// Leaves time for the background AI analysis and its retries (after())
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    // Validate webhook secret
    try {
      const secret = config.webhookSecret();
      const headerSecret = request.headers.get('x-webhook-secret');
      if (headerSecret !== secret) {
        return NextResponse.json({ error: 'Invalid webhook secret' }, { status: 401 });
      }
    } catch {
      // WEBHOOK_SECRET not set — allow in dev mode
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
      }
    }

    // Parse and validate body
    const body = await request.json();
    const parsed = webhookPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Spam guard: blocked numbers and callers over the limit are refused
    const caller = { phone: normalizePhone(parsed.data.caller_id), channel: 'webhook' as const };
    const verdict = await checkCaller(caller);
    if (!verdict.allowed) {
      return NextResponse.json(
        { error: verdict.message.en, reason: verdict.reason, spoken_confirmation_text: verdict.message.en },
        { status: verdict.reason === 'blocked' ? 403 : 429 }
      );
    }

    const result = await processIncomingCall(parsed.data);
    if (result.created) await recordAccepted(caller, result.complaint_id);

    return NextResponse.json({
      data: {
        tracking_id: result.tracking_id,
        spoken_confirmation_text: result.spoken_confirmation_text,
      },
    });
  } catch (err) {
    console.error('Webhook processing error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
