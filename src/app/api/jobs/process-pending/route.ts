import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { processPendingComplaints } from '@/lib/pipeline/process-call';
import { checkForAlerts } from '@/lib/ops/alerts';
import { escalateOverdue, sendReminders } from '@/lib/ops/escalation';

// The 5-minute housekeeping job. Call it every few minutes from a free
// scheduler (e.g. cron-job.org or a Render cron job):
//
//   POST /api/jobs/process-pending   header: x-webhook-secret: <WEBHOOK_SECRET>
//
// Each run:
// 1. analyzes up to 5 complaints stuck in 'processing' (server restarted
//    mid-analysis, AI rate-limited, ...), oldest first
// 2. checks for alarms (floods, repeat callers, area spikes, AI backlog,
//    failing SMS)
// 3. reminds departments about unanswered complaints and escalates overdue
//    ones to a supervisor
// A failure in one step doesn't stop the others.

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
    const step = <T,>(name: string, run: () => Promise<T>) =>
      run().catch((err) => {
        console.error(`Housekeeping step ${name} failed:`, err);
        return null;
      });
    const alerts = await step('alerts', checkForAlerts);
    const reminded = await step('reminders', () => sendReminders());
    const escalated = await step('escalation', () => escalateOverdue());

    return NextResponse.json({
      data: { processed: results.length, results, alerts_raised: alerts, reminded, escalated },
    });
  } catch (err) {
    console.error('Process-pending sweep error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
