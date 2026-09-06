import { NextRequest, NextResponse } from 'next/server';
import { validateRequest } from 'twilio';

// ===========================================================================
// Twilio telephony helpers — shared by the /api/telephony/twilio/* routes.
//
// Twilio's call flow against these two endpoints:
//
//   1. Call arrives  → Twilio POSTs to /voice. We answer with TwiML:
//      a greeting, a <Gather> for DTMF language selection, and a fallback
//      <Record> for callers who press nothing.
//   2. Caller presses a digit → Twilio POSTs the digit to the <Gather>
//      action URL (the recording route, selection phase). We reply with a
//      <Record> whose action URL carries the chosen language as a query
//      parameter.
//   3. Recording finishes → Twilio POSTs the recording details to the
//      <Record> action URL (the recording route, completion phase). We map
//      the payload onto the existing processIncomingCall contract — the
//      same pipeline the /api/calls/webhook route already uses — and speak
//      the tracking ID back to the caller.
//
// Every request from Twilio is validated with the X-Twilio-Signature header
// (HMAC-SHA1 of the full URL + sorted POST parameters, keyed by the auth
// token) so these public endpoints only accept genuine Twilio traffic.
// ===========================================================================

/**
 * Language menu offered via DTMF in the voice route's <Gather>.
 * Codes are Whisper/ISO 639-1 style, matching what the pipeline's
 * dtmf_language field expects (see webhookPayloadSchema).
 */
export const LANGUAGE_MENU: ReadonlyArray<{
  digit: string;
  code: string;
  label: string;
}> = [
  { digit: '1', code: 'ur', label: 'Urdu' },
  { digit: '2', code: 'pa', label: 'Punjabi' },
  { digit: '3', code: 'ps', label: 'Pashto' },
  { digit: '4', code: 'sd', label: 'Sindhi' },
  { digit: '5', code: 'skr', label: 'Saraiki' },
];

/**
 * Map a DTMF digit to its language code, e.g. '2' → 'pa'.
 * Returns undefined for anything not on the menu (including the digits
 * Twilio sends as recording stop keys).
 */
export function digitToLanguage(digit: string | undefined | null): string | undefined {
  if (!digit) return undefined;
  return LANGUAGE_MENU.find((entry) => entry.digit === digit)?.code;
}

/**
 * True when `code` is one of the menu languages — used to sanity-check the
 * `lang` query parameter before it flows into the pipeline as
 * dtmf_language. The parameter itself is covered by the Twilio signature
 * (the signature is computed over the full URL including query string), so
 * this is defense in depth rather than the primary gate.
 */
export function isMenuLanguage(code: string | undefined | null): code is string {
  if (!code) return false;
  return LANGUAGE_MENU.some((entry) => entry.code === code);
}

/**
 * Twilio recordings are fetchable as WAV by appending ".wav" to the
 * RecordingUrl. Our Whisper ASR only decodes WAV (see whisper-asr.ts), so
 * every recording handed to the pipeline must go through this.
 */
export function toWavRecordingUrl(recordingUrl: string): string {
  return recordingUrl.endsWith('.wav') ? recordingUrl : `${recordingUrl}.wav`;
}

/**
 * Parse a Twilio webhook body (application/x-www-form-urlencoded) into a
 * flat string map — the shape validateRequest expects.
 */
export function parseFormParams(rawBody: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(rawBody)) {
    params[key] = value;
  }
  return params;
}

/**
 * Reconstruct the public URL Twilio signed. Behind Render's proxy the
 * request URL Next sees can differ from what Twilio actually called (http
 * vs https, internal host), so prefer the forwarded headers when present.
 * The query string is included — it is part of the signed payload.
 */
export function getTwilioRequestUrl(request: NextRequest): string {
  const url = new URL(request.url);
  const proto =
    request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ?? url.protocol.replace(':', '');
  const host =
    request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ??
    request.headers.get('host') ??
    url.host;
  return `${proto}://${host}${url.pathname}${url.search}`;
}

/**
 * Validate that a request genuinely comes from Twilio:
 * - X-Twilio-Signature must match HMAC-SHA1(auth token, URL + sorted params)
 * - when TWILIO_ACCOUNT_SID is configured, the payload's AccountSid must
 *   match it (guards against a leaked signature being replayed across
 *   accounts).
 *
 * Returns a NextResponse to send immediately on failure, or null when the
 * request is authentic. Mirrors the WEBHOOK_SECRET convention used by
 * /api/calls/webhook: without a configured token the endpoints are open in
 * development but refuse all traffic in production.
 */
export function validateTwilioWebhook(
  request: NextRequest,
  params: Record<string, string>
): NextResponse | null {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) {
    // TWILIO_AUTH_TOKEN not set — allow in dev mode
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Twilio auth token not configured' }, { status: 500 });
    }
    return null;
  }

  const signature = request.headers.get('x-twilio-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing Twilio signature' }, { status: 403 });
  }

  if (!validateRequest(token, signature, getTwilioRequestUrl(request), params)) {
    return NextResponse.json({ error: 'Invalid Twilio signature' }, { status: 403 });
  }

  const expectedSid = process.env.TWILIO_ACCOUNT_SID;
  if (expectedSid && params.AccountSid && params.AccountSid !== expectedSid) {
    return NextResponse.json({ error: 'Account SID mismatch' }, { status: 403 });
  }

  return null;
}

/** Wrap TwiML output in the content type Twilio expects. */
export function twimlResponse(twiml: string): NextResponse {
  return new NextResponse(twiml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
}
