// ===========================================================================
// SMS providers. Pick one with SMS_PROVIDER:
//
// - mock    (default) logs the message instead of sending it.
// - android sends through "SMS Gateway for Android" (https://sms-gate.app):
//           an Android phone with a local SIM sends the SMS from its own
//           number. Cloud mode needs no public IP on the phone.
//           SMS_GATEWAY_USERNAME / SMS_GATEWAY_PASSWORD come from the app's
//           Cloud Server section; SMS_GATEWAY_URL overrides the server
//           (default https://api.sms-gate.app/3rdparty/v1).
// ===========================================================================

export interface SmsProvider {
  readonly name: string;
  /** Send one SMS; resolves with the provider's message reference. */
  send(to: string, text: string): Promise<{ ref: string | null }>;
}

export class MockSmsProvider implements SmsProvider {
  readonly name = 'mock';

  async send(to: string, text: string) {
    console.log(`[sms:mock] → ${to}\n${text}`);
    return { ref: `mock-${Date.now()}` };
  }
}

export class SmsGateProvider implements SmsProvider {
  readonly name = 'android';

  async send(to: string, text: string) {
    const base = (process.env.SMS_GATEWAY_URL || 'https://api.sms-gate.app/3rdparty/v1').replace(/\/$/, '');
    const username = process.env.SMS_GATEWAY_USERNAME;
    const password = process.env.SMS_GATEWAY_PASSWORD;
    if (!username || !password) {
      throw new Error('SMS_GATEWAY_USERNAME and SMS_GATEWAY_PASSWORD must be set');
    }

    const response = await fetch(`${base}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ textMessage: { text }, phoneNumbers: [to] }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`SMS gateway error: HTTP ${response.status} ${detail.slice(0, 200)}`);
    }
    const json = (await response.json().catch(() => ({}))) as { id?: string };
    return { ref: json.id ?? null };
  }
}

export function getSmsProvider(): SmsProvider {
  switch ((process.env.SMS_PROVIDER || 'mock').trim().toLowerCase()) {
    case 'android':
      return new SmsGateProvider();
    case 'mock':
    default:
      return new MockSmsProvider();
  }
}
