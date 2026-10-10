import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { pcmToWav, sleep, synthesize, TTS_PACING_MS } from './tts';

// Generates demo complaint recordings with Gemini text-to-speech and saves
// them as 8 kHz mono WAV (phone quality) in public/samples/. They feed the
// "Simulate a test call" button and give the analyzer real audio to test on.
// They are synthetic — real callers' recordings are still needed for a fair
// accuracy test.
//
// Usage: npx tsx scripts/make-samples.ts [name ...]

config({ path: '.env.local' });

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

async function makeSample(name: string): Promise<void> {
  const sample = SAMPLES[name];
  const { pcm, rate } = await synthesize(sample.text, sample.voice);
  const wav = pcmToWav(pcm, rate, PHONE_RATE);
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
    if (i > 0) await sleep(TTS_PACING_MS);
    try {
      await makeSample(name);
    } catch (err) {
      console.error(`✗ ${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

main();
