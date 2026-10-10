import { NextRequest, NextResponse } from 'next/server';
import { verifySmsWebhookSignature } from '@/lib/sms/signature';
import { handleIncomingSms } from '@/lib/sms/commands';
import { createAdminClient } from '@/lib/supabase/admin';

// ===========================================================================
// Webhook for "SMS Gateway for Android": incoming SMS (sms:received) and
// delivery reports for SMS we sent (sms:sent / sms:delivered / sms:failed).
// Register it once with the gateway:
//
//   curl -X POST -u USER:PASS -H "Content-Type: application/json" \
//     -d '{"url":"https://<your-app>/api/sms/incoming","event":"sms:received"}' \
//     https://api.sms-gate.app/3rdparty/v1/webhooks
//
// Requests are signed: X-Signature = hex HMAC-SHA256(raw body + X-Timestamp)
// keyed with the app's signing key (Settings → Webhooks), set here as
// SMS_WEBHOOK_SIGNING_KEY. Without a key the endpoint only works in dev.
// ===========================================================================

interface SmsGatewayEvent {
  event?: string;
  payload?: {
    message?: string;
    sender?: string;
    phoneNumber?: string;
    messageId?: string;
    id?: string;
    reason?: string;
  };
}

// Delivery reports (also registered as webhooks) → sms_messages.status
const DELIVERY_STATUS: Record<string, 'sent' | 'delivered' | 'failed'> = {
  'sms:sent': 'sent',
  'sms:delivered': 'delivered',
  'sms:failed': 'failed',
};

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const key = process.env.SMS_WEBHOOK_SIGNING_KEY;
  if (key) {
    const ok = verifySmsWebhookSignature(
      rawBody,
      request.headers.get('x-timestamp'),
      request.headers.get('x-signature'),
      key
    );
    if (!ok) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  } else if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'SMS webhook signing key not configured' }, { status: 500 });
  }

  let event: SmsGatewayEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // What happened to an SMS we sent: update its row by the gateway's id
  const delivery = event.event ? DELIVERY_STATUS[event.event] : undefined;
  if (delivery) {
    const ref = event.payload?.messageId ?? event.payload?.id;
    if (ref) {
      await createAdminClient()
        .from('sms_messages')
        .update({
          status: delivery,
          ...(delivery === 'failed' ? { error: event.payload?.reason ?? 'Phone could not send the SMS' } : {}),
        })
        .eq('provider_ref', ref);
    }
    return NextResponse.json({ data: { status: delivery } });
  }

  // Acknowledge other event types so the gateway doesn't retry them
  if (event.event !== 'sms:received') {
    return NextResponse.json({ data: { ignored: event.event ?? null } });
  }

  const from = event.payload?.sender ?? event.payload?.phoneNumber;
  const text = event.payload?.message;
  if (!from || typeof text !== 'string') {
    return NextResponse.json({ error: 'Missing sender or message' }, { status: 400 });
  }

  try {
    const result = await handleIncomingSms(from, text);
    return NextResponse.json({ data: { action: result.action } });
  } catch (err) {
    console.error('Incoming SMS error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
