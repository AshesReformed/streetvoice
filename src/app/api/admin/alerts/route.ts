import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/middleware/require-admin';

// Open alerts from the last 6 hours, newest first, one per kind and key (admins only)
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const { data, error } = await createAdminClient()
      .from('system_alerts')
      .select('id, kind, dedupe_key, message, details, created_at')
      .is('resolved_at', null)
      .gte('created_at', new Date(Date.now() - 6 * 3600_000).toISOString())
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const seen = new Set<string>();
    const alerts = (data ?? []).filter((a) => {
      const key = `${a.kind}:${a.dedupe_key}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return NextResponse.json({ data: alerts.slice(0, 10) });
  } catch (err) {
    console.error('Alerts error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
