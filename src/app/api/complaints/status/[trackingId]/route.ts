import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ trackingId: string }> }
) {
  const { trackingId } = await params;

  try {
    const supabase = createAdminClient();

    const { data: complaint, error } = await supabase
      .from('complaints')
      .select('status, departments(name)')
      .eq('tracking_id', trackingId)
      .single();

    if (error || !complaint) {
      return NextResponse.json({ error: 'Complaint not found' }, { status: 404 });
    }

    return NextResponse.json({
      data: {
        status: complaint.status,
        department_name: (complaint.departments as unknown as { name: string } | null)?.name ?? null,
      },
    });
  } catch (err) {
    console.error('Status check error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
