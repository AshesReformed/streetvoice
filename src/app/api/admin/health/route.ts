import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/require-admin';
import { systemHealth } from '@/lib/ops/health';

// System health numbers for the control room (admins only)
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;
    return NextResponse.json({ data: await systemHealth() });
  } catch (err) {
    console.error('System health error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
