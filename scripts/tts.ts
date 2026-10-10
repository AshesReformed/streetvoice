// Shared Gemini text-to-speech helpers for the scripts that generate audio
// (sample complaints, voice-menu prompts). Free tier: 3 requests a minute.

const TTS_MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-tts';
export const TTS_PACING_MS = 21_000;

/** 16-bit PCM mono → WAV, optionally decimated (e.g. to 8 kHz phone quality). */
export function pcmToWav(pcm: Buffer, rate: number, targetRate = rate): Buffer {
  const factor = Math.max(1, Math.round(rate / targetRate));
  const outSamples = Math.floor(pcm.length / 2 / factor);
  const data = Buffer.alloc(outSamples * 2);
  for (let i = 0; i < outSamples; i++) {
    let sum = 0;
    for (let j = 0; j < factor; j++) sum += pcm.readInt16LE((i * factor + j) * 2);
    data.writeInt16LE(Math.round(sum / factor), i * 2);
  }
  const outRate = Math.round(rate / factor);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(outRate, 24);
  header.writeUInt32LE(outRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** Speak `text` with a prebuilt Gemini voice; returns raw 16-bit PCM and its rate. */
export async function synthesize(text: string, voice: string): Promise<{ pcm: Buffer; rate: number }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY must be set in .env.local');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Only the words to speak: style instructions get read out loud.
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      }),
    }
  );
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  const json = await response.json();
  const inline = json.candidates?.[0]?.content?.parts?.find(
    (p: { inlineData?: { data: string; mimeType: string } }) => p.inlineData
  )?.inlineData;
  if (!inline) throw new Error('No audio in the response');

  return {
    pcm: Buffer.from(inline.data, 'base64'),
    rate: Number(/rate=(\d+)/.exec(inline.mimeType)?.[1] ?? 24000),
  };
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
