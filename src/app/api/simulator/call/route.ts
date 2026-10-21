import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { processIncomingCall } from '@/lib/pipeline/process-call';
import { checkCaller, recordAccepted } from '@/lib/abuse/guard';
import { audioFormat } from '@/lib/audio/format';
import { uploadRecording } from '@/lib/recordings';
import { normalizePhone } from '@/lib/sms/phone';
import { LANGUAGE_MENU } from '@/lib/twilio';

// ===========================================================================
// Web phone simulator (/call): the browser records the caller, compresses it
// to MP3 (older pages send WAV) and posts it here as multipart form data:
//
//   audio     MP3 or WAV file (required)
//   language  phone-menu code the caller pressed (optional)
//   phone     the caller's number for SMS updates (optional)
//
// The recording goes into private storage and then through exactly the
// same pipeline as a real phone call. Public, so the spam guard limits it
// per IP and per number (counted in the database, see lib/abuse/guard.ts),
// and it can be switched off with SIMULATOR_ENABLED=false.
// ===========================================================================

export const maxDuration = 300;

const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // ~2.5 min of WAV, ~20 min of MP3

function clientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function POST(request: NextRequest) {
  try {
    if (process.env.SIMULATOR_ENABLED === 'false') {
      return NextResponse.json({ error: 'The call simulator is turned off' }, { status: 404 });
    }
    const form = await request.formData().catch(() => null);
    const audio = form?.get('audio');
    if (!(audio instanceof Blob)) {
      return NextResponse.json({ error: 'Missing audio' }, { status: 400 });
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: 'Recording is too long' }, { status: 413 });
    }
    const bytes = new Uint8Array(await audio.arrayBuffer());
    const format = audioFormat(bytes);
    if (!format) {
      return NextResponse.json({ error: 'Audio must be MP3 or WAV' }, { status: 400 });
    }

    const language = String(form?.get('language') ?? '');
    const menuLanguage = LANGUAGE_MENU.some((l) => l.code === language) ? language : undefined;

    const rawPhone = String(form?.get('phone') ?? '').trim();
    const phone = rawPhone ? normalizePhone(rawPhone) : null;
    if (rawPhone && !phone) {
      return NextResponse.json({ error: 'Enter a valid phone number, e.g. 03001234567' }, { status: 400 });
    }

    // Spam guard: blocklist, then limits per number and per IP
    const caller = { phone, ip: clientIp(request), channel: 'simulator' as const };
    const verdict = await checkCaller(caller);
    if (!verdict.allowed) {
      return NextResponse.json(
        {
          error: verdict.message.en,
          error_ur: verdict.message.ur,
          reason: verdict.reason,
          ...(verdict.latest_tracking_id ? { latest_tracking_id: verdict.latest_tracking_id } : {}),
        },
        { status: verdict.reason === 'blocked' ? 403 : 429 }
      );
    }

    const callRef = `web-${randomUUID()}`;
    const audioUrl = await uploadRecording(`${callRef}.${format.ext}`, bytes, format.contentType);

    // Same pipeline as a phone call: filed now, analyzed after the response
    const filed = await processIncomingCall({
      call_ref: callRef,
      audio_url: audioUrl,
      ...(menuLanguage ? { dtmf_language: menuLanguage } : {}),
      ...(phone ? { caller_id: phone } : {}),
    });

    if (filed.created) await recordAccepted(caller, filed.complaint_id);

    return NextResponse.json({ data: { tracking_id: filed.tracking_id } });
  } catch (err) {
    console.error('Simulator call error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
