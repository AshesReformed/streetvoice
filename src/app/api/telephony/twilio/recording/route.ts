import { NextRequest, NextResponse } from 'next/server';
import { twiml } from 'twilio';
import { processIncomingCall } from '@/lib/pipeline/process-call';
import { webhookPayloadSchema } from '@/lib/validation/schemas';
import {
  digitToLanguage,
  isMenuLanguage,
  parseFormParams,
  toWavRecordingUrl,
  twimlResponse,
  validateTwilioWebhook,
} from '@/lib/twilio';

// ===========================================================================
// Twilio recording webhook — receives two kinds of requests:
//
// 1. Language selection (the <Gather> action from the voice route):
//    Twilio POSTs the pressed digit (Digits) before any recording exists.
//    We reply with a <Record> whose action URL carries the selected
//    language as a ?lang= query parameter — Twilio does not forward the
//    gathered digit to the later recording callback, so the selection has
//    to travel through the URL. The query string is part of the signed
//    URL, so it cannot be tampered with between the two requests.
//
// 2. Recording completed (the <Record> action): Twilio POSTs the recording
//    details. We translate the payload onto the exact contract the
//    /api/calls/webhook route already feeds to processIncomingCall:
//
//      CallSid       → call_ref
//      RecordingUrl  → audio_url (".wav" appended — Whisper only decodes WAV)
//      ?lang=        → dtmf_language
//      From          → caller_id
//
// The resulting tracking ID is spoken back to the caller as TwiML.
//
// Note on Digits in phase 2: the <Record> action callback's Digits field
// holds the key that STOPPED the recording (e.g. '#'), not the language
// selection — that is why the language travels via ?lang= instead.
// ===========================================================================

const RECORDING_ACTION_URL = '/api/telephony/twilio/recording';

export async function POST(request: NextRequest) {
  try {
    const params = parseFormParams(await request.text());
    const rejection = validateTwilioWebhook(request, params);
    if (rejection) return rejection;

    // ── Phase 1: language selection (digit pressed, no recording yet) ──
    if (!params.RecordingUrl) {
      if (!params.Digits) {
        // Neither a recording nor a digit (e.g. the caller hung up before
        // recording) — nothing to file, close the call politely.
        const hangup = new twiml.VoiceResponse();
        hangup.say('We did not receive your complaint. Please call again.');
        return twimlResponse(hangup.toString());
      }

      const language = digitToLanguage(params.Digits);
      const selection = new twiml.VoiceResponse();
      if (language) {
        selection.say('Please record your complaint after the beep.');
        selection.record({
          action: `${RECORDING_ACTION_URL}?lang=${language}`,
          method: 'POST',
          maxLength: 120,
          playBeep: true,
        });
      } else {
        // Digit not on the menu — record anyway; the ASR auto-detects.
        selection.say('We did not recognize your selection.');
        selection.record({
          action: RECORDING_ACTION_URL,
          method: 'POST',
          maxLength: 120,
          playBeep: true,
        });
      }
      return twimlResponse(selection.toString());
    }

    // ── Phase 2: recording finished — map Twilio's payload onto the
    // existing webhook contract and run the standard complaint pipeline. ──
    const langParam = request.nextUrl.searchParams.get('lang');
    const dtmfLanguage = isMenuLanguage(langParam) ? langParam : undefined;

    const payload = {
      call_ref: params.CallSid,
      // Whisper (whisper-asr.ts) decodes WAV only; Twilio serves WAV when
      // ".wav" is appended to the RecordingUrl.
      audio_url: toWavRecordingUrl(params.RecordingUrl),
      ...(dtmfLanguage ? { dtmf_language: dtmfLanguage } : {}),
      ...(params.From ? { caller_id: params.From } : {}),
    };

    // Same validation the real webhook applies, guaranteeing the pipeline
    // receives an identical shape from both entry points.
    const parsed = webhookPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      console.error('Twilio recording payload failed validation:', parsed.error.flatten());
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await processIncomingCall(parsed.data);

    const confirmation = new twiml.VoiceResponse();
    confirmation.say(result.spoken_confirmation_text);
    return twimlResponse(confirmation.toString());
  } catch (err) {
    console.error('Twilio recording webhook error:', err);
    // The caller is still on the line — apologize rather than letting
    // Twilio play its generic error handling.
    const apology = new twiml.VoiceResponse();
    apology.say('We are sorry — an error occurred while filing your complaint. Please call again.');
    return twimlResponse(apology.toString());
  }
}
