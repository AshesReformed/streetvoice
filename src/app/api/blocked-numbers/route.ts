import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/middleware/require-admin';

// Blocked callers (admins only), newest first. Expired blocks are left out.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const { data, error } = await createAdminClient()
      .from('blocked_numbers')
      .select('id, phone_masked, reason, blocked_until, blocked_by, created_at, officer:officers(full_name)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const now = Date.now();
    const active = (data ?? []).filter((b) => !b.blocked_until || Date.parse(b.blocked_until) > now);
    return NextResponse.json({ data: active });
  } catch (err) {
    console.error('Blocked numbers error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
