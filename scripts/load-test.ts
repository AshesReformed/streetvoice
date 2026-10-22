import { config } from 'dotenv';
import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';

// ===========================================================================
// Load test: fires many phone calls at once and shows that every caller gets
// a tracking number fast, then watches the AI queue drain.
//
//   npm run load-test -- --calls 200
//
// Each call goes through POST /api/calls/webhook, the same path a telephone
// provider uses: spam guard → complaint saved → tracking number returned →
// analysis in the background. Callers get random fake numbers, so the
// per-number limits don't apply (the flood alarm will go off, as it should).
//
// Run it against a LOCAL server started with the mock AI and mock SMS, so it
// costs nothing and texts nobody:
//
//   AI_PROVIDER=staged ASR_PROVIDER=mock SMS_PROVIDER=mock npm run build && npm start
//
// (PowerShell: $env:AI_PROVIDER="staged"; $env:ASR_PROVIDER="mock";
//  $env:SMS_PROVIDER="mock"; npm run build; npm start)
//
// Options:
//   --url <base>        server to test (default http://localhost:3000)
//   --calls <n>         number of calls (default 100)
//   --concurrency <n>   calls in flight at once (default: all of them)
//   --keep              keep the test complaints (default: delete them after)
//   --allow-remote      allow a non-localhost --url
//
// Needs WEBHOOK_SECRET, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// in .env.local (the same database the server uses).
// ===========================================================================

config({ path: '.env.local' });

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const baseUrl = (arg('url', 'http://localhost:3000') as string).replace(/\/$/, '');
const calls = Number(arg('calls', '100'));
const concurrency = Number(arg('concurrency', String(calls)));
const keep = flag('keep');

const secret = process.env.WEBHOOK_SECRET;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SAMPLES = ['electricity', 'water', 'pothole', 'garbage', 'streetlight', 'mixed'];

function fail(message: string): never {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

const fakeNumber = () => `+92399${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!Number.isInteger(calls) || calls < 1 || calls > 2000) fail('--calls must be 1 to 2000');
  if (!secret) fail('WEBHOOK_SECRET must be set in .env.local');
  if (!supabaseUrl || !serviceRoleKey) fail('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  const host = new URL(baseUrl).hostname;
  if (!['localhost', '127.0.0.1'].includes(host) && !flag('allow-remote')) {
    fail(`${baseUrl} is not local. Use --allow-remote only if that server runs the mock AI and mock SMS.`);
  }

  // Never text real people or spend AI quota by accident
  const health = await fetch(`${baseUrl}/api/health`).then((r) => r.json()).catch(() => null);
  if (!health) fail(`Could not reach ${baseUrl}/api/health. Is the server running?`);
  if (health.sms_provider !== 'mock') {
    fail(`The server sends real SMS (sms_provider=${health.sms_provider}). Restart it with SMS_PROVIDER=mock.`);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const runId = randomUUID().slice(0, 8);
  const prefix = `loadtest-${runId}-`;

  console.log(`\nStreetVoice load test ${runId}: ${calls} calls, ${concurrency} at once, against ${baseUrl}\n`);

  const latencies: number[] = [];
  const failures: Record<string, number> = {};
  const trackingIds: string[] = [];
  let next = 0;

  async function oneCall(i: number) {
    const sample = SAMPLES[i % SAMPLES.length];
    const started = performance.now();
    try {
      const res = await fetch(`${baseUrl}/api/calls/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-webhook-secret': secret! },
        body: JSON.stringify({
          call_ref: `${prefix}${i}`,
          audio_url: `${baseUrl}/samples/${sample}.wav`,
          caller_id: fakeNumber(),
        }),
      });
      const ms = performance.now() - started;
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.data?.tracking_id) {
        latencies.push(ms);
        trackingIds.push(json.data.tracking_id);
      } else {
        const key = `HTTP ${res.status}${json.error ? ` ${json.error}` : ''}`;
        failures[key] = (failures[key] ?? 0) + 1;
      }
    } catch (err) {
      const key = err instanceof Error ? err.message : String(err);
      failures[key] = (failures[key] ?? 0) + 1;
    }
  }

  const wallStart = performance.now();
  await Promise.all(
    Array.from({ length: Math.min(concurrency, calls) }, async () => {
      while (next < calls) await oneCall(next++);
    })
  );
  const wallSec = (performance.now() - wallStart) / 1000;

  const sorted = [...latencies].sort((a, b) => a - b);
  const unique = new Set(trackingIds).size;
  console.log('Filing (the part the caller waits for)');
  console.log(`  filed           ${latencies.length}/${calls} (${unique} unique tracking numbers)`);
  console.log(`  time to file    median ${percentile(sorted, 50).toFixed(0)} ms · p95 ${percentile(sorted, 95).toFixed(0)} ms · slowest ${(sorted.at(-1) ?? 0).toFixed(0)} ms`);
  console.log(`  all calls in    ${wallSec.toFixed(1)} s (${(latencies.length / wallSec).toFixed(1)} calls/s)`);
  if (Object.keys(failures).length) console.log('  failures       ', failures);

  // Watch the background analysis drain
  console.log('\nAI queue (background analysis)');
  const drainStart = Date.now();
  let lastLine = '';
  for (;;) {
    const { data } = await supabase.from('complaints').select('status').like('call_ref', `${prefix}%`);
    const counts: Record<string, number> = {};
    for (const row of data ?? []) counts[row.status] = (counts[row.status] ?? 0) + 1;
    const waiting = counts.processing ?? 0;
    const line = `  +${Math.round((Date.now() - drainStart) / 1000)}s  waiting ${waiting} · ${Object.entries(counts)
      .filter(([s]) => s !== 'processing')
      .map(([s, n]) => `${s} ${n}`)
      .join(' · ')}`;
    if (line.replace(/\+\d+s/, '') !== lastLine.replace(/\+\d+s/, '')) console.log(line);
    lastLine = line;
    if (!waiting) break;
    if (Date.now() - drainStart > 10 * 60_000) {
      console.log('  still waiting after 10 min; the 5-minute retry sweep will finish the rest');
      break;
    }
    await sleep(2000);
  }

  const { data: grouped } = await supabase
    .from('complaints')
    .select('id')
    .like('call_ref', `${prefix}%`)
    .not('duplicate_of', 'is', null);
  console.log(`  duplicates merged into existing complaints: ${grouped?.length ?? 0}`);

  if (keep) {
    console.log(`\nKept the test complaints (call_ref starting "${prefix}").`);
    return;
  }

  // Clean up everything the run created
  const { data: rows } = await supabase
    .from('complaints')
    .select('id, citizen_id, audio_url')
    .like('call_ref', `${prefix}%`);
  const ids = (rows ?? []).map((r) => r.id);
  const citizenIds = [...new Set((rows ?? []).map((r) => r.citizen_id).filter(Boolean))];
  const files = (rows ?? [])
    .map((r) => r.audio_url as string | null)
    .filter((u): u is string => Boolean(u?.startsWith('storage://recordings/')))
    .map((u) => u.slice('storage://recordings/'.length));
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    await supabase.from('complaints').update({ duplicate_of: null }).in('duplicate_of', batch);
    await supabase.from('call_attempts').delete().in('complaint_id', batch);
    await supabase.from('sms_messages').delete().in('complaint_id', batch);
    await supabase.from('call_logs').delete().in('complaint_id', batch);
    await supabase.from('status_history').delete().in('complaint_id', batch);
    await supabase.from('complaints').delete().in('id', batch);
  }
  for (let i = 0; i < citizenIds.length; i += 100) {
    await supabase.from('citizens').delete().in('id', citizenIds.slice(i, i + 100));
  }
  for (let i = 0; i < files.length; i += 100) {
    await supabase.storage.from('recordings').remove(files.slice(i, i + 100));
  }
  console.log(`\nCleaned up ${ids.length} test complaints and ${files.length} recordings.`);
  console.log('Any alerts the run raised (e.g. the flood alarm) are left for you to see; dismiss them in the control room.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
