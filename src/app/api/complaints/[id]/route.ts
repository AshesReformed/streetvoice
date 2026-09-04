import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/middleware/require-admin';
import { validateBody } from '@/lib/middleware/validate';
import { rerouteComplaintSchema } from '@/lib/validation/schemas';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const data = await validateBody(request, rerouteComplaintSchema);
    if (data instanceof NextResponse) return data;

    const supabase = createAdminClient();

    const { data: complaint, error } = await supabase
      .from('complaints')
      .update({ department_id: data.department_id })
      .eq('id', id)
      .select('id, department_id')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!complaint) {
      return NextResponse.json({ error: 'Complaint not found' }, { status: 404 });
    }

    return NextResponse.json({
      data: {
        id: complaint.id,
        department_id: complaint.department_id,
      },
    });
  } catch (err) {
    console.error('Reroute complaint error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
