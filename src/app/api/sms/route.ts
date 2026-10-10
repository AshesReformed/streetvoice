import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/middleware/require-admin';

// Admin: recent SMS in and out, newest first. ?complaint_id= narrows it to
// one complaint. RLS also limits sms_messages to admins.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const complaintId = searchParams.get('complaint_id');
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));

    const supabase = await createClient();
    let query = supabase
      .from('sms_messages')
      .select('*, complaint:complaints(tracking_id)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (complaintId) query = query.eq('complaint_id', complaintId);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data: data || [] });
  } catch (err) {
    console.error('SMS list error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
