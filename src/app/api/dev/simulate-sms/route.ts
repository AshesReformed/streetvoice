import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/require-admin';
import { handleIncomingSms } from '@/lib/sms/commands';

// Admin-only: pretend an SMS arrived ({ from, text }) and run it through the
// same handler as the real gateway webhook. Lets the demo and tests drive
// department replies ("482913 DONE") without a phone.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const body = (await request.json().catch(() => ({}))) as { from?: unknown; text?: unknown };
    if (typeof body.from !== 'string' || typeof body.text !== 'string' || !body.from.trim()) {
      return NextResponse.json({ error: "Body must be { from: string, text: string }" }, { status: 400 });
    }

    const result = await handleIncomingSms(body.from, body.text);
    return NextResponse.json({ data: result });
  } catch (err) {
    console.error('Simulate SMS error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
