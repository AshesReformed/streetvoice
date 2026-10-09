import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { processPendingComplaints } from '@/lib/pipeline/process-call';

// Retry sweep for complaints stuck in 'processing' (server restarted
// mid-analysis, AI rate-limited, ...). Call it every few minutes from a free
// scheduler (e.g. cron-job.org or a Render cron job):
//
//   POST /api/jobs/process-pending   header: x-webhook-secret: <WEBHOOK_SECRET>
//
// Each run analyzes up to 5 complaints, oldest first.

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    try {
      if (request.headers.get('x-webhook-secret') !== config.webhookSecret()) {
        return NextResponse.json({ error: 'Invalid webhook secret' }, { status: 401 });
      }
    } catch {
      // WEBHOOK_SECRET not set — allow in dev mode
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
      }
    }

    const results = await processPendingComplaints();
    return NextResponse.json({ data: { processed: results.length, results } });
  } catch (err) {
    console.error('Process-pending sweep error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
