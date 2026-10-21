import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/middleware/require-admin';

// Unblock a caller (admins only)
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const { error } = await createAdminClient().from('blocked_numbers').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data: { id } });
  } catch (err) {
    console.error('Unblock error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
