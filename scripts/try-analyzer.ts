import { config } from 'dotenv';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { GeminiComplaintAnalyzer } from '../src/lib/services/gemini-analyzer';
import type { AnalyzerDepartment } from '../src/lib/services/types';

// Runs the Gemini analyzer on local recordings and prints what it extracted.
// Usage: npx tsx scripts/try-analyzer.ts [file-or-folder ...]
// Defaults to every .wav/.mp3/.ogg in public/samples/.
//
// Departments mirror supabase/migrations/003 + 005, so this works without a
// database connection.

config({ path: '.env.local' });

const DEPARTMENTS: AnalyzerDepartment[] = [
  {
    id: 'water',
    name: 'Water & Sanitation',
    keywords: [],
    description:
      'Drinking water supply, no water, dirty or contaminated water, burst or leaking pipes, water tankers, sewerage lines, blocked drains, overflowing gutters, flooding in streets after rain.',
  },
  {
    id: 'electricity',
    name: 'Electricity',
    keywords: [],
    description:
      'Power outages, load-shedding, low voltage, sparking or damaged transformers, fallen or dangling electric wires, electric poles, meters and electricity bills.',
  },
  {
    id: 'roads',
    name: 'Roads & Infrastructure',
    keywords: [],
    description:
      'Broken roads, potholes, damaged bridges, footpaths, broken or non-working streetlights, traffic signals, encroachments blocking roads.',
  },
  {
    id: 'waste',
    name: 'Sanitation & Waste',
    keywords: [],
    description:
      'Garbage not collected, rubbish heaps, overflowing bins, dead animals, street sweeping, burning trash, open dumping.',
  },
  {
    id: 'general',
    name: 'General/Unclassified',
    keywords: [],
    description: 'Anything that does not clearly belong to another department.',
  },
];

const AUDIO = /\.(wav|mp3|ogg|flac|m4a|webm)$/i;

function collect(target: string): string[] {
  try {
    return readdirSync(target)
      .filter((f) => AUDIO.test(f))
      .map((f) => path.join(target, f));
  } catch {
    return [target];
  }
}

async function main() {
  const targets = process.argv.slice(2);
  const files = (targets.length ? targets : [path.join('public', 'samples')]).flatMap(collect);
  const analyzer = new GeminiComplaintAnalyzer();

  for (const file of files) {
    const ext = path.extname(file).slice(1).toLowerCase();
    const mime = ext === 'mp3' ? 'audio/mp3' : ext === 'm4a' ? 'audio/mp4' : `audio/${ext}`;
    const url = `data:${mime};base64,${readFileSync(file).toString('base64')}`;
    const started = Date.now();
    try {
      const r = await analyzer.analyze({ audio_url: url, departments: DEPARTMENTS });
      console.log(`\n■ ${path.basename(file)}  (${((Date.now() - started) / 1000).toFixed(1)}s)`);
      console.log(`  language    ${r.language}`);
      console.log(`  heard       ${r.transcript_original}`);
      console.log(`  english     ${r.transcript_english}`);
      console.log(`  summary     ${r.summary}`);
      console.log(`  department  ${r.category}   confidence ${r.confidence}`);
      console.log(`  area        ${r.area ?? '—'}   urgency ${r.urgency}`);
      console.log(`  review      ${r.needs_review ? `yes: ${r.review_reason}` : 'no'}`);
    } catch (err) {
      console.log(`\n■ ${path.basename(file)}  FAILED: ${err instanceof Error ? err.message : err}`);
    }
  }
}

main();
