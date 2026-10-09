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

    const { data: current } = await supabase
      .from('complaints')
      .select('status')
      .eq('id', id)
      .maybeSingle();
    if (!current) {
      return NextResponse.json({ error: 'Complaint not found' }, { status: 404 });
    }

    // Routing a held complaint releases it to the department's queue
    const update: { department_id: string; status?: string } = {
      department_id: data.department_id,
    };
    if (current.status === 'needs_review' || current.status === 'processing') {
      update.status = 'open';
    }

    const { data: complaint, error } = await supabase
      .from('complaints')
      .update(update)
      .eq('id', id)
      .select('id, department_id, status')
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
        status: complaint.status,
      },
    });
  } catch (err) {
    console.error('Reroute complaint error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
