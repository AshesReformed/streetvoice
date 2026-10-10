import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { processIncomingCall } from '@/lib/pipeline/process-call';
import { uploadRecording } from '@/lib/recordings';
import { normalizePhone } from '@/lib/sms/phone';
import { LANGUAGE_MENU } from '@/lib/twilio';

// ===========================================================================
// Web phone simulator (/call): the browser records the caller, converts it
// to WAV and posts it here as multipart form data:
//
//   audio     WAV file (required)
//   language  phone-menu code the caller pressed (optional)
//   phone     the caller's number for SMS updates (optional)
//
// The recording goes into private storage and then through exactly the
// same pipeline as a real phone call. Public, so it is rate-limited per IP
// and can be switched off with SIMULATOR_ENABLED=false.
// ===========================================================================

export const maxDuration = 120;

const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // ~2.5 min of 16 kHz mono WAV
const WINDOW_MS = 10 * 60 * 1000;
const MAX_CALLS_PER_WINDOW = 5;
const recentCalls = new Map<string, number[]>();

function clientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

/** Simple in-memory limit: enough to stop a stray script draining the AI quota. */
function rateLimited(ip: string, now = Date.now()): boolean {
  const calls = (recentCalls.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (calls.length >= MAX_CALLS_PER_WINDOW) {
    recentCalls.set(ip, calls);
    return true;
  }
  calls.push(now);
  recentCalls.set(ip, calls);
  return false;
}

function isWav(bytes: Uint8Array): boolean {
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  return bytes.length > 44 && tag(0) === 'RIFF' && tag(8) === 'WAVE';
}

export async function POST(request: NextRequest) {
  try {
    if (process.env.SIMULATOR_ENABLED === 'false') {
      return NextResponse.json({ error: 'The call simulator is turned off' }, { status: 404 });
    }
    if (rateLimited(clientIp(request))) {
      return NextResponse.json(
        { error: 'Too many calls from this device. Please wait a few minutes.' },
        { status: 429 }
      );
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
    if (!isWav(bytes)) {
      return NextResponse.json({ error: 'Audio must be WAV' }, { status: 400 });
    }

    const language = String(form?.get('language') ?? '');
    const menuLanguage = LANGUAGE_MENU.some((l) => l.code === language) ? language : undefined;

    const rawPhone = String(form?.get('phone') ?? '').trim();
    const phone = rawPhone ? normalizePhone(rawPhone) : null;
    if (rawPhone && !phone) {
      return NextResponse.json({ error: 'Enter a valid phone number, e.g. 03001234567' }, { status: 400 });
    }

    const callRef = `web-${randomUUID()}`;
    const audioUrl = await uploadRecording(`${callRef}.wav`, bytes, 'audio/wav');

    // Same pipeline as a phone call: filed now, analyzed after the response
    const filed = await processIncomingCall({
      call_ref: callRef,
      audio_url: audioUrl,
      ...(menuLanguage ? { dtmf_language: menuLanguage } : {}),
      ...(phone ? { caller_id: phone } : {}),
    });

    return NextResponse.json({ data: { tracking_id: filed.tracking_id } });
  } catch (err) {
    console.error('Simulator call error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
