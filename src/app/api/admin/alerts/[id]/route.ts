import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/middleware/require-admin';

// Dismiss an alert, and any open copies of it (same kind and key) (admins only)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const supabase = createAdminClient();
    const { data: alert } = await supabase
      .from('system_alerts')
      .select('kind, dedupe_key')
      .eq('id', id)
      .maybeSingle();
    if (!alert) return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    const { error } = await supabase
      .from('system_alerts')
      .update({ resolved_at: new Date().toISOString(), resolved_by: auth.officer.id })
      .eq('kind', alert.kind)
      .eq('dedupe_key', alert.dedupe_key)
      .is('resolved_at', null);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data: { id } });
  } catch (err) {
    console.error('Resolve alert error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
