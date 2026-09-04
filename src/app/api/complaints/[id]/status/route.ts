import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/middleware/auth';
import { validateBody } from '@/lib/middleware/validate';
import { updateComplaintStatusSchema } from '@/lib/validation/schemas';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const data = await validateBody(request, updateComplaintStatusSchema);
    if (data instanceof NextResponse) return data;

    const supabase = await createClient();

    // Update complaint status — RLS enforces department scope
    const { data: complaint, error } = await supabase
      .from('complaints')
      .update({ status: data.status })
      .eq('id', id)
      .select('id, status, tracking_id')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!complaint) {
      return NextResponse.json({ error: 'Complaint not found' }, { status: 404 });
    }

    // The DB trigger auto-inserts a status_history row with remark=NULL.
    // We use admin client to update that row with the remark (no UPDATE policy exists for officers).
    if (data.remark) {
      const admin = createAdminClient();
      const { data: latestHistory } = await admin
        .from('status_history')
        .select('id')
        .eq('complaint_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (latestHistory) {
        await admin
          .from('status_history')
          .update({ remark: data.remark })
          .eq('id', latestHistory.id);
      }
    }

    return NextResponse.json({
      data: {
        id: complaint.id,
        status: complaint.status,
        tracking_id: complaint.tracking_id,
      },
    });
  } catch (err) {
    console.error('Status update error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
