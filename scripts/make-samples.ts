import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

// Generates demo complaint recordings with Gemini text-to-speech and saves
// them as 8 kHz mono WAV (phone quality) in public/samples/. They feed the
// "Simulate a test call" button and give the analyzer real audio to test on.
// They are synthetic — real callers' recordings are still needed for a fair
// accuracy test.
//
// Usage: npx tsx scripts/make-samples.ts [name ...]

config({ path: '.env.local' });

const TTS_MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-tts';
const OUT_DIR = path.join(process.cwd(), 'public', 'samples');
const PHONE_RATE = 8000;

export const SAMPLES: Record<string, { language: string; voice: string; text: string }> = {
  electricity: {
    language: 'Punjabi',
    voice: 'Charon',
    text: 'السلام علیکم، میں ماڈل ٹاؤن لاہور توں گل کر رہیا واں۔ ساڈی گلی دے ٹرانسفارمر چوں کل رات توں چنگاریاں نکل رہیاں نیں تے بجلی وی بند اے۔ مہربانی کر کے جلدی کسے نوں گھلو۔',
  },
  water: {
    language: 'Pashto',
    voice: 'Puck',
    text: 'سلام، زه د پېښور حیات آباد فیز درې څخه خبرې کوم. درې ورځې کېږي چې زموږ کور ته اوبه نه راځي. مهرباني وکړئ ژر یې حل کړئ.',
  },
  garbage: {
    language: 'Urdu',
    voice: 'Kore',
    text: 'میں کراچی گلشن اقبال بلاک تیرہ سے بول رہی ہوں۔ ہماری گلی میں ایک ہفتے سے کچرا نہیں اٹھایا گیا، بہت بدبو ہے اور بچے بیمار ہو رہے ہیں۔',
  },
  streetlight: {
    language: 'Sindhi',
    voice: 'Fenrir',
    text: 'منهنجو نالو علي آهي، حيدرآباد قاسم آباد مان ڳالهائي رهيو آهيان. اسان جي روڊ جون بتيون ٻن هفتن کان بند آهن ۽ رات جو تمام اونداهي ٿئي ٿي.',
  },
  pothole: {
    language: 'Saraiki',
    voice: 'Orus',
    text: 'میں ملتان شاہ رکن عالم کالونی توں ڳالھ کریندا پیا ہاں۔ ساڈی سڑک تے وݙا کھڈا ہے، کل رات ہک موٹر سائیکل آلا ڈھے پیا۔',
  },
  mixed: {
    language: 'Urdu mixed with English',
    voice: 'Aoede',
    text: 'ہیلو، میں اسلام آباد جی نائن سے بول رہا ہوں۔ ہمارے ایریا میں sewerage line block ہو گئی ہے اور گندا پانی road پر آ رہا ہے۔',
  },
  unclear: {
    language: 'Urdu',
    voice: 'Kore',
    text: 'ہیلو؟ ہیلو؟ آواز آ رہی ہے؟ اچھا میں بعد میں کال کرتا ہوں۔',
  },
};

/** 16-bit PCM mono → WAV, decimated to phone quality. */
function pcmToPhoneWav(pcm: Buffer, rate: number): Buffer {
  const factor = Math.max(1, Math.round(rate / PHONE_RATE));
  const inSamples = pcm.length / 2;
  const outSamples = Math.floor(inSamples / factor);
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

async function synthesize(name: string): Promise<void> {
  const sample = SAMPLES[name];
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY must be set in .env.local');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              // Only the words to speak: style instructions get read out loud.
              { text: sample.text },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: sample.voice } } },
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

  const rate = Number(/rate=(\d+)/.exec(inline.mimeType)?.[1] ?? 24000);
  const wav = pcmToPhoneWav(Buffer.from(inline.data, 'base64'), rate);
  writeFileSync(path.join(OUT_DIR, `${name}.wav`), wav);
  console.log(`✓ ${name}.wav (${sample.language}, ${(wav.length / 1024).toFixed(0)} KB)`);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SAMPLES);
  for (const [i, name] of names.entries()) {
    if (!SAMPLES[name]) {
      console.error(`✗ Unknown sample "${name}"`);
      continue;
    }
    // The free tier allows 3 text-to-speech requests per minute.
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, 21_000));
    try {
      await synthesize(name);
    } catch (err) {
      console.error(`✗ ${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

main();
