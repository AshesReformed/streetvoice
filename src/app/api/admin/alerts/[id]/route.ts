import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/middleware/require-admin';

// Dismiss an alert (admins only)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const { error } = await createAdminClient()
      .from('system_alerts')
      .update({ resolved_at: new Date().toISOString(), resolved_by: auth.officer.id })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data: { id } });
  } catch (err) {
    console.error('Resolve alert error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
