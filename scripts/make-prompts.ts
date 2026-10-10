import { config } from 'dotenv';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { pcmToWav, sleep, synthesize, TTS_PACING_MS } from './tts';

// Generates the Urdu voice-menu prompts for the web phone simulator (/call)
// into public/prompts/ur/. Generated with Gemini text-to-speech; replace any
// file with a real human recording of the same words for a warmer demo.
//
// Usage: npx tsx scripts/make-prompts.ts [--force] [name ...]
// Existing files are skipped unless --force is given, so a run cut short by
// the free tier's quota can simply be repeated.

config({ path: '.env.local' });

const OUT_DIR = path.join(process.cwd(), 'public', 'prompts', 'ur');
const VOICE = 'Kore';

export const PROMPTS: Record<string, string> = {
  welcome: 'اسٹریٹ وائس شکایت لائن پر کال کرنے کا شکریہ۔',
  menu: 'اردو کے لیے ایک دبائیں۔ پنجابی کے لیے دو۔ پشتو کے لیے تین۔ سندھی کے لیے چار۔ سرائیکی کے لیے پانچ۔',
  record: 'بیپ کے بعد اپنی شکایت اور اپنے علاقے کا نام بتائیں۔ بات ختم ہو جائے تو ہیش کا بٹن دبائیں۔',
  registered: 'آپ کی شکایت درج ہو گئی ہے۔ آپ کا شکایت نمبر ہے',
  goodbye: 'یہ نمبر آپ کو ایس ایم ایس پر بھی بھیج دیا جائے گا۔ شکریہ، خدا حافظ۔',
  error: 'معذرت، آپ کی شکایت درج نہیں ہو سکی۔ براہ کرم دوبارہ کال کریں۔',
  '0': 'صفر',
  '1': 'ایک',
  '2': 'دو',
  '3': 'تین',
  '4': 'چار',
  '5': 'پانچ',
  '6': 'چھ',
  '7': 'سات',
  '8': 'آٹھ',
  '9': 'نو',
};

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const requested = args.filter((a) => a !== '--force');
  const names = (requested.length ? requested : Object.keys(PROMPTS)).filter(
    (name) => force || !existsSync(path.join(OUT_DIR, `${name}.wav`))
  );

  for (const [i, name] of names.entries()) {
    if (!PROMPTS[name]) {
      console.error(`✗ Unknown prompt "${name}"`);
      continue;
    }
    if (i > 0) await sleep(TTS_PACING_MS);
    try {
      const { pcm, rate } = await synthesize(PROMPTS[name], VOICE);
      writeFileSync(path.join(OUT_DIR, `${name}.wav`), pcmToWav(pcm, rate, 16000));
      console.log(`✓ ${name}.wav`);
    } catch (err) {
      console.error(`✗ ${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(names.length ? 'Done.' : 'All prompts already exist (use --force to regenerate).');
}

main();
