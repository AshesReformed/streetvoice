import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Fills the database with realistic, already-analyzed complaints from
// across Pakistan so the control room has something to show in a demo.
// No AI calls are made. Rows are tagged call_ref "demo-…"; run with
// --clear to remove them again.
//
// Usage: npx tsx scripts/seed-demo-data.ts [--clear]

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Status = 'needs_review' | 'open' | 'in_progress' | 'resolved';

interface DemoComplaint {
  department: string | null;
  language: string;
  area: string;
  urgency: 'low' | 'medium' | 'high';
  en: string;
  ur: string;
}

const COMPLAINTS: DemoComplaint[] = [
  { department: 'Electricity', language: 'pa', area: 'Model Town, Lahore', urgency: 'high', en: 'Transformer sparking and power out since last night.', ur: 'رات سے ٹرانسفارمر سے چنگاریاں نکل رہی ہیں اور بجلی بند ہے۔' },
  { department: 'Electricity', language: 'ur', area: 'Gulberg III, Lahore', urgency: 'medium', en: 'Load-shedding for 10 hours a day this week.', ur: 'اس ہفتے روزانہ دس گھنٹے لوڈ شیڈنگ ہو رہی ہے۔' },
  { department: 'Electricity', language: 'skr', area: 'Gulgasht Colony, Multan', urgency: 'high', en: 'Live wire hanging low over the street near a school.', ur: 'اسکول کے قریب گلی میں ننگی تار نیچے لٹک رہی ہے۔' },
  { department: 'Electricity', language: 'sd', area: 'Latifabad Unit 7, Hyderabad', urgency: 'medium', en: 'Very low voltage; fans and pumps not working.', ur: 'وولٹیج بہت کم ہے، پنکھے اور پمپ نہیں چل رہے۔' },
  { department: 'Electricity', language: 'ps', area: 'University Town, Peshawar', urgency: 'low', en: 'Electric meter showing wrong reading, bill too high.', ur: 'میٹر غلط ریڈنگ دکھا رہا ہے، بل بہت زیادہ آیا ہے۔' },
  { department: 'Electricity', language: 'ur', area: 'North Nazimabad Block H, Karachi', urgency: 'high', en: 'Electric pole leaning after rain, could fall on houses.', ur: 'بارش کے بعد بجلی کا کھمبا جھک گیا ہے، گھروں پر گر سکتا ہے۔' },
  { department: 'Water & Sanitation', language: 'ps', area: 'Hayatabad Phase 3, Peshawar', urgency: 'high', en: 'No water supply to the house for three days.', ur: 'تین دن سے گھر میں پانی نہیں آ رہا۔' },
  { department: 'Water & Sanitation', language: 'ur', area: 'G-9, Islamabad', urgency: 'medium', en: 'Blocked sewerage line; dirty water on the road.', ur: 'سیوریج لائن بند ہے، گندا پانی سڑک پر آ رہا ہے۔' },
  { department: 'Water & Sanitation', language: 'pa', area: 'Satellite Town, Rawalpindi', urgency: 'high', en: 'Sewage water mixing into drinking water supply.', ur: 'پینے کے پانی میں گٹر کا پانی مل رہا ہے۔' },
  { department: 'Water & Sanitation', language: 'sd', area: 'Qasimabad, Hyderabad', urgency: 'medium', en: 'Burst water pipe flooding the street for two days.', ur: 'پانی کی پائپ پھٹ گئی ہے، دو دن سے گلی میں پانی کھڑا ہے۔' },
  { department: 'Water & Sanitation', language: 'ur', area: 'Korangi Sector 5, Karachi', urgency: 'high', en: 'Open manhole on the main road, a child nearly fell in.', ur: 'مین روڈ پر گٹر کا ڈھکن نہیں، ایک بچہ گرتے گرتے بچا۔' },
  { department: 'Water & Sanitation', language: 'skr', area: 'Shah Rukn-e-Alam Colony, Multan', urgency: 'low', en: 'Water pressure very low in the mornings.', ur: 'صبح کے وقت پانی کا پریشر بہت کم ہوتا ہے۔' },
  { department: 'Water & Sanitation', language: 'ur', area: 'Johar Town, Lahore', urgency: 'medium', en: 'Rainwater has not drained from the street for a week.', ur: 'ایک ہفتے سے بارش کا پانی گلی سے نہیں نکلا۔' },
  { department: 'Roads & Infrastructure', language: 'skr', area: 'Shah Rukn-e-Alam Colony, Multan', urgency: 'medium', en: 'Large pothole; a motorcyclist fell last night.', ur: 'سڑک پر بڑا گڑھا ہے، کل رات ایک موٹر سائیکل سوار گر گیا۔' },
  { department: 'Roads & Infrastructure', language: 'sd', area: 'Qasimabad, Hyderabad', urgency: 'medium', en: 'Streetlights off for two weeks; the road is dark at night.', ur: 'دو ہفتوں سے اسٹریٹ لائٹس بند ہیں، رات کو اندھیرا رہتا ہے۔' },
  { department: 'Roads & Infrastructure', language: 'ur', area: 'Saddar, Rawalpindi', urgency: 'high', en: 'Traffic signal not working at a busy crossing.', ur: 'مصروف چوک پر ٹریفک سگنل کام نہیں کر رہا۔' },
  { department: 'Roads & Infrastructure', language: 'pa', area: 'Peoples Colony, Faisalabad', urgency: 'low', en: 'Footpath broken and blocked by shop encroachments.', ur: 'فٹ پاتھ ٹوٹا ہوا ہے اور دکانوں نے قبضہ کر رکھا ہے۔' },
  { department: 'Roads & Infrastructure', language: 'ps', area: 'Saddar, Peshawar', urgency: 'medium', en: 'Road dug up for months and never repaired.', ur: 'سڑک مہینوں سے کھدی پڑی ہے، مرمت نہیں ہوئی۔' },
  { department: 'Roads & Infrastructure', language: 'ur', area: 'Gulshan-e-Iqbal Block 13, Karachi', urgency: 'medium', en: 'Bridge railing broken on one side.', ur: 'پل کی ریلنگ ایک طرف سے ٹوٹ گئی ہے۔' },
  { department: 'Sanitation & Waste', language: 'ur', area: 'Gulshan-e-Iqbal Block 13, Karachi', urgency: 'medium', en: 'Garbage not collected for a week; children falling sick.', ur: 'ایک ہفتے سے کچرا نہیں اٹھایا گیا، بچے بیمار ہو رہے ہیں۔' },
  { department: 'Sanitation & Waste', language: 'pa', area: 'Ichhra, Lahore', urgency: 'medium', en: 'Garbage heap next to the mosque, burning every evening.', ur: 'مسجد کے ساتھ کچرے کا ڈھیر ہے، ہر شام آگ لگائی جاتی ہے۔' },
  { department: 'Sanitation & Waste', language: 'sd', area: 'Hirabad, Hyderabad', urgency: 'low', en: 'Street has not been swept for a month.', ur: 'ایک مہینے سے گلی میں جھاڑو نہیں لگی۔' },
  { department: 'Sanitation & Waste', language: 'ps', area: 'Gulbahar, Peshawar', urgency: 'high', en: 'Dead animal on the road for two days.', ur: 'دو دن سے سڑک پر مردہ جانور پڑا ہے۔' },
  { department: 'Sanitation & Waste', language: 'ur', area: 'I-10, Islamabad', urgency: 'low', en: 'Overflowing garbage bins at the market.', ur: 'مارکیٹ میں کچرے کے ڈبے بھرے ہوئے ہیں۔' },
  { department: null, language: 'ur', area: 'Unknown', urgency: 'medium', en: 'Caller line very noisy; complaint not clear.', ur: 'لائن خراب تھی، شکایت واضح نہیں۔' },
  { department: null, language: 'bal', area: 'Quetta', urgency: 'medium', en: 'Caller reports a problem in their area but the type is unclear.', ur: 'علاقے میں مسئلہ بتایا گیا لیکن نوعیت واضح نہیں۔' },
];

// Status mix: older complaints are further along
function statusFor(daysAgo: number, i: number): Status {
  if (daysAgo > 10) return i % 4 === 0 ? 'in_progress' : 'resolved';
  if (daysAgo > 4) return (['open', 'in_progress', 'resolved'] as const)[i % 3];
  return i % 3 === 0 ? 'in_progress' : 'open';
}

async function clear() {
  const { error, count } = await supabase
    .from('complaints')
    .delete({ count: 'exact' })
    .like('call_ref', 'demo-%');
  if (error) throw new Error(error.message);
  console.log(`Removed ${count ?? 0} demo complaints.`);
}

async function seed() {
  const { data: departments, error } = await supabase.from('departments').select('id, name');
  if (error || !departments) throw new Error(error?.message ?? 'No departments');
  const deptId = new Map(departments.map((d) => [d.name, d.id]));

  const now = Date.now();
  const rows: Record<string, unknown>[] = [];
  // Two rounds with different dates make ~50 complaints over three weeks
  for (let round = 0; round < 2; round++) {
    COMPLAINTS.forEach((c, i) => {
      const daysAgo = round === 0 ? (i * 7) % 21 : (i * 5 + 3) % 18;
      const created = new Date(now - daysAgo * 86_400_000 - ((i * 37) % 600) * 60_000);
      const routed = c.department !== null;
      rows.push({
        call_ref: `demo-${round}-${i}`,
        created_at: created.toISOString(),
        department_id: routed ? deptId.get(c.department!) ?? null : null,
        category: c.department ?? 'unclassified',
        status: routed ? statusFor(daysAgo, i + round) : 'needs_review',
        priority: c.urgency,
        area: c.area,
        language: c.language,
        summary: c.en,
        summary_urdu: c.ur,
        transcript_english: c.en,
        transcript_urdu: c.ur,
        confidence_score: routed ? 0.85 + ((i * 3) % 15) / 100 : 0.4,
        review_reason: routed ? null : 'Speech was unclear',
        dispatched_at: routed ? new Date(created.getTime() + 60_000).toISOString() : null,
      });
    });
  }

  const { data: inserted, error: insertError } = await supabase
    .from('complaints')
    .insert(rows)
    .select('id, status, created_at');
  if (insertError || !inserted) throw new Error(insertError?.message ?? 'Insert failed');

  // A believable history for each one
  const order: Status[] = ['open', 'in_progress', 'resolved'];
  const history = inserted.flatMap((c) => {
    const start = new Date(c.created_at).getTime();
    const steps: { complaint_id: string; status: string; remark: string; created_at: string }[] = [
      { complaint_id: c.id, status: 'processing', remark: 'Complaint received via phone call', created_at: new Date(start).toISOString() },
    ];
    if (c.status === 'needs_review') {
      steps.push({ complaint_id: c.id, status: 'needs_review', remark: 'Held for review: Speech was unclear', created_at: new Date(start + 40_000).toISOString() });
      return steps;
    }
    const reached = order.indexOf(c.status as Status);
    order.slice(0, reached + 1).forEach((s, k) => {
      steps.push({
        complaint_id: c.id,
        status: s,
        remark: k === 0 ? 'Routed automatically' : 'Updated by department SMS',
        created_at: new Date(start + 40_000 + k * (8 + (k * 13) % 40) * 3_600_000).toISOString(),
      });
    });
    return steps;
  });
  const { error: historyError } = await supabase.from('status_history').insert(history);
  if (historyError) throw new Error(historyError.message);

  console.log(`Seeded ${inserted.length} demo complaints with ${history.length} history entries.`);
}

(process.argv.includes('--clear') ? clear() : clear().then(seed)).catch((err) => {
  console.error('Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
