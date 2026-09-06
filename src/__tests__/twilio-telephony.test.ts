import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createHmac } from 'crypto';

// Only the pipeline is mocked — the real twilio SDK (validateRequest +
// VoiceResponse) runs so signature validation is exercised for real.
vi.mock('@/lib/pipeline/process-call', () => ({
  processIncomingCall: vi.fn(),
}));

import { POST as voicePOST } from '@/app/api/telephony/twilio/voice/route';
import { POST as recordingPOST } from '@/app/api/telephony/twilio/recording/route';
import { processIncomingCall } from '@/lib/pipeline/process-call';

const mockProcessIncomingCall = vi.mocked(processIncomingCall);

const AUTH_TOKEN = 'test-twilio-auth-token';
// Obviously-fake fixture value: a realistic "AC" + 32 hex string trips
// GitHub push protection even when synthetic. The webhook only compares
// AccountSid for equality, so any non-SID-shaped value works.
const ACCOUNT_SID = 'FIXTURE-ACCOUNT-SID-0001';

const HOST = 'streetvoice.example.com';

/**
 * Compute a genuine Twilio signature: base64(HMAC-SHA1(authToken,
 * url + sorted "key"+"value" pairs)) — the algorithm from Twilio's
 * "Validate Twilio Requests" documentation, matching what their servers
 * put in the X-Twilio-Signature header.
 */
function signTwilioRequest(url: string, params: Record<string, string>, token: string): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return createHmac('sha1', token).update(Buffer.from(data, 'utf-8')).digest('base64');
}

/**
 * Build a Twilio-style webhook request: form-encoded POST body plus the
 * proxy headers getTwilioRequestUrl reconstructs the public URL from.
 * `signature` is omitted for unsigned requests.
 */
function makeTwilioRequest(path: string, params: Record<string, string>, signature?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Forwarded-Proto': 'https',
  };
  if (signature !== undefined) {
    headers['X-Twilio-Signature'] = signature;
  }
  return new NextRequest(`https://${HOST}${path}`, {
    method: 'POST',
    headers,
    body: new URLSearchParams(params).toString(),
  });
}

function signedRequest(path: string, params: Record<string, string>) {
  const url = `https://${HOST}${path}`;
  return makeTwilioRequest(path, params, signTwilioRequest(url, params, AUTH_TOKEN));
}

function stubTwilioEnv() {
  vi.stubEnv('TWILIO_AUTH_TOKEN', AUTH_TOKEN);
  vi.stubEnv('TWILIO_ACCOUNT_SID', ACCOUNT_SID);
}

beforeEach(() => {
  vi.clearAllMocks();
  stubTwilioEnv();
  mockProcessIncomingCall.mockResolvedValue({
    tracking_id: 'SV-000001',
    spoken_confirmation_text:
      'Your complaint has been registered. Your tracking ID is SV-000001. Please save this for future reference.',
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ───────────────────────────── Voice route ─────────────────────────────

describe('Twilio voice webhook', () => {
  it('answers with greeting + language Gather + fallback Record TwiML', async () => {
    const res = await voicePOST(
      signedRequest('/api/telephony/twilio/voice', {
        CallSid: 'CA000000000000000000000000000001',
        AccountSid: ACCOUNT_SID,
        From: '+923001234567',
        To: '+923217654321',
      })
    );
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/xml');

    // Well-formed TwiML response document
    expect(body).toContain('<?xml');
    expect(body).toContain('<Response>');

    // Greeting is spoken to the caller
    expect(body).toContain('Thank you for calling');

    // <Gather> collects exactly one DTMF digit and forwards it to the
    // recording route
    expect(body).toContain('<Gather');
    expect(body).toContain('numDigits="1"');
    expect(body).toContain('action="/api/telephony/twilio/recording"');

    // The full menu: 1=Urdu, 2=Punjabi, 3=Pashto, 4=Sindhi, 5=Saraiki
    for (const label of ['Urdu', 'Punjabi', 'Pashto', 'Sindhi', 'Saraiki']) {
      expect(body).toContain(label);
    }

    // Fallback <Record> for callers who press nothing (~2 minute cap),
    // also reporting to the recording route
    expect(body).toContain('<Record');
    expect(body).toContain('maxLength="120"');
    expect(body).toContain('action="/api/telephony/twilio/recording"');
  });

  it('rejects a request without a signature header', async () => {
    const res = await voicePOST(
      makeTwilioRequest('/api/telephony/twilio/voice', { CallSid: 'CA1' })
    );

    expect(res.status).toBe(403);
  });

  it('rejects a request with an invalid signature', async () => {
    const res = await voicePOST(
      makeTwilioRequest('/api/telephony/twilio/voice', { CallSid: 'CA1' }, 'bogus-signature')
    );

    expect(res.status).toBe(403);
  });

  it('rejects a valid signature computed with the wrong auth token', async () => {
    const url = `https://${HOST}/api/telephony/twilio/voice`;
    const forged = signTwilioRequest(url, { CallSid: 'CA1' }, 'attacker-known-token');
    const res = await voicePOST(
      makeTwilioRequest('/api/telephony/twilio/voice', { CallSid: 'CA1' }, forged)
    );

    expect(res.status).toBe(403);
  });
});

// ──────────────────────────── Recording route ───────────────────────────

describe('Twilio recording webhook — language selection phase', () => {
  it('responds with a Record whose action URL carries the chosen language', async () => {
    const res = await recordingPOST(
      signedRequest('/api/telephony/twilio/recording', {
        CallSid: 'CA000000000000000000000000000002',
        AccountSid: ACCOUNT_SID,
        From: '+923001234567',
        Digits: '2', // Punjabi
      })
    );
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/xml');
    expect(body).toContain('<Record');
    // The digit does not survive to the recording callback — it travels
    // as a query parameter on the Record action URL instead.
    expect(body).toContain('action="/api/telephony/twilio/recording?lang=pa"');
    expect(mockProcessIncomingCall).not.toHaveBeenCalled();
  });

  it('records without a language hint when the digit is not on the menu', async () => {
    const res = await recordingPOST(
      signedRequest('/api/telephony/twilio/recording', {
        CallSid: 'CA000000000000000000000000000003',
        AccountSid: ACCOUNT_SID,
        From: '+923001234567',
        Digits: '9',
      })
    );
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toContain('<Record');
    expect(body).toContain('action="/api/telephony/twilio/recording"');
    expect(body).not.toContain('lang=');
  });

  it('closes the call politely when there is neither a digit nor a recording', async () => {
    const res = await recordingPOST(
      signedRequest('/api/telephony/twilio/recording', {
        CallSid: 'CA000000000000000000000000000004',
        AccountSid: ACCOUNT_SID,
        From: '+923001234567',
      })
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('did not receive your complaint');
    expect(mockProcessIncomingCall).not.toHaveBeenCalled();
  });
});

describe('Twilio recording webhook — completion phase', () => {
  // Fixture URL with placeholder account/recording segments — the payload
  // schema only requires a valid URL and nothing inspects the path, so no
  // real-SID-shaped values are needed.
  const RECORDING_URL =
    'https://api.twilio.com/2010-04-01/Accounts/FIXTURE-ACCOUNT/Recordings/FIXTURE-RECORDING-0001';

  function completionParams() {
    return {
      CallSid: 'CA000000000000000000000000000005',
      AccountSid: ACCOUNT_SID,
      From: '+923001234567',
      To: '+923217654321',
      RecordingUrl: RECORDING_URL,
      RecordingSid: 'RE000000000000000000000000000001',
      RecordingDuration: '42',
      // Digits here is the key that STOPPED the recording — it must NOT
      // be mistaken for a language selection.
      Digits: '#',
    };
  }

  it('maps the Twilio payload onto the pipeline contract, requesting WAV audio', async () => {
    const res = await recordingPOST(
      signedRequest('/api/telephony/twilio/recording?lang=pa', completionParams())
    );
    const body = await res.text();

    // CallSid → call_ref, RecordingUrl (+.wav) → audio_url, ?lang →
    // dtmf_language, From → caller_id; the stop-key Digits is ignored.
    expect(mockProcessIncomingCall).toHaveBeenCalledWith({
      call_ref: 'CA000000000000000000000000000005',
      audio_url: `${RECORDING_URL}.wav`,
      dtmf_language: 'pa',
      caller_id: '+923001234567',
    });

    // The tracking ID from the pipeline is spoken back to the caller.
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/xml');
    expect(body).toContain('SV-000001');
  });

  it('omits dtmf_language when the caller never selected a language', async () => {
    await recordingPOST(signedRequest('/api/telephony/twilio/recording', completionParams()));

    expect(mockProcessIncomingCall).toHaveBeenCalledWith({
      call_ref: 'CA000000000000000000000000000005',
      audio_url: `${RECORDING_URL}.wav`,
      caller_id: '+923001234567',
    });
  });

  it('ignores a tampered lang parameter that is not a menu language', async () => {
    await recordingPOST(
      signedRequest('/api/telephony/twilio/recording?lang=fr', completionParams())
    );

    const payload = mockProcessIncomingCall.mock.calls[0][0];
    expect(payload.dtmf_language).toBeUndefined();
  });

  it('does not append .wav twice when Twilio already serves a WAV URL', async () => {
    const params = { ...completionParams(), RecordingUrl: `${RECORDING_URL}.wav` };
    await recordingPOST(signedRequest('/api/telephony/twilio/recording?lang=ur', params));

    expect(mockProcessIncomingCall).toHaveBeenCalledWith(
      expect.objectContaining({ audio_url: `${RECORDING_URL}.wav` })
    );
  });
});

// ────────────────────────── Signature enforcement ───────────────────────

describe('Twilio webhook signature enforcement', () => {
  it('rejects a recording callback with a missing signature', async () => {
    const res = await recordingPOST(
      makeTwilioRequest('/api/telephony/twilio/recording?lang=ur', {
        CallSid: 'CA1',
        From: '+923001234567',
        RecordingUrl: 'https://api.twilio.com/Recordings/RE1',
      })
    );

    expect(res.status).toBe(403);
    expect(mockProcessIncomingCall).not.toHaveBeenCalled();
  });

  it('rejects a recording callback with an invalid signature', async () => {
    const res = await recordingPOST(
      makeTwilioRequest(
        '/api/telephony/twilio/recording?lang=ur',
        { CallSid: 'CA1', RecordingUrl: 'https://api.twilio.com/Recordings/RE1' },
        'not-a-valid-signature'
      )
    );

    expect(res.status).toBe(403);
    expect(mockProcessIncomingCall).not.toHaveBeenCalled();
  });

  it('rejects a correctly signed request from a different Twilio account', async () => {
    const params = {
      CallSid: 'CA1',
      AccountSid: 'FIXTURE-ACCOUNT-SID-OTHER',
      RecordingUrl: 'https://api.twilio.com/Recordings/RE1',
    };
    const url = `https://${HOST}/api/telephony/twilio/recording`;
    const res = await recordingPOST(
      makeTwilioRequest('/api/telephony/twilio/recording', params, signTwilioRequest(url, params, AUTH_TOKEN))
    );

    expect(res.status).toBe(403);
    expect(mockProcessIncomingCall).not.toHaveBeenCalled();
  });

  it('allows unsigned requests when no auth token is configured in non-production', async () => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', '');

    const res = await recordingPOST(
      makeTwilioRequest('/api/telephony/twilio/recording?lang=ur', {
        CallSid: 'CA1',
        RecordingUrl: 'https://api.twilio.com/Recordings/RE1',
      })
    );

    // Open in development (mirrors the WEBHOOK_SECRET convention)
    expect(res.status).toBe(200);
    expect(mockProcessIncomingCall).toHaveBeenCalledTimes(1);
  });

  it('refuses all requests when no auth token is configured in production', async () => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', '');
    vi.stubEnv('NODE_ENV', 'production');

    const res = await recordingPOST(
      makeTwilioRequest('/api/telephony/twilio/recording?lang=ur', {
        CallSid: 'CA1',
        RecordingUrl: 'https://api.twilio.com/Recordings/RE1',
      })
    );

    expect(res.status).toBe(500);
    expect(mockProcessIncomingCall).not.toHaveBeenCalled();
  });
});
