import { NextRequest } from 'next/server';
import { twiml } from 'twilio';
import {
  LANGUAGE_MENU,
  parseFormParams,
  twimlResponse,
  validateTwilioWebhook,
} from '@/lib/twilio';

// ===========================================================================
// Twilio voice webhook — the entry point for every phone call.
//
// Configure this URL (HTTP POST) as the "When a call comes in" webhook in
// the Twilio console. The response is TwiML:
//
//   <Say>   a short greeting
//   <Gather> DTMF language selection — 1=Urdu, 2=Punjabi, 3=Pashto,
//           4=Sindhi, 5=Saraiki. Its action URL is the recording route,
//           which receives the pressed digit and starts the recording.
//   <Record> fallback for callers who press nothing — no language hint is
//           passed, so the pipeline's ASR auto-detects from the audio.
//
// The recording callback on both <Record> verbs points at the recording
// route below, which feeds the complaint into the existing
// processIncomingCall pipeline.
// ===========================================================================

/** ~2 minutes — long enough to describe a complaint, short enough to keep
 *  Twilio recording storage and transcription-free processing manageable. */
const MAX_RECORDING_SECONDS = 120;

const RECORDING_ACTION_URL = '/api/telephony/twilio/recording';

export async function POST(request: NextRequest) {
  try {
    const params = parseFormParams(await request.text());
    const rejection = validateTwilioWebhook(request, params);
    if (rejection) return rejection;

    const response = new twiml.VoiceResponse();

    response.say('Thank you for calling the StreetVoice citizen complaint helpline.');

    const gather = response.gather({
      action: RECORDING_ACTION_URL,
      method: 'POST',
      input: ['dtmf'],
      numDigits: 1,
      timeout: 5,
    });
    const menu = LANGUAGE_MENU.map(({ digit, label }) => `For ${label}, press ${digit}.`).join(' ');
    gather.say(`Please select your language. ${menu}`);

    // Reached only when the caller presses nothing before the timeout —
    // record anyway; the ASR auto-detects the spoken language.
    response.record({
      action: RECORDING_ACTION_URL,
      method: 'POST',
      maxLength: MAX_RECORDING_SECONDS,
      playBeep: true,
    });

    return twimlResponse(response.toString());
  } catch (err) {
    console.error('Twilio voice webhook error:', err);
    // Speak a graceful apology so the caller hears something sane instead
    // of Twilio's generic error tone.
    const response = new twiml.VoiceResponse();
    response.say('We are sorry — something went wrong. Please call again later.');
    return twimlResponse(response.toString());
  }
}
