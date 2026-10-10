import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/middleware/require-admin';
import { validateBody } from '@/lib/middleware/validate';
import { rerouteComplaintSchema } from '@/lib/validation/schemas';
import { announceRouted } from '@/lib/sms/notify';

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
      .select('status, department_id')
      .eq('id', id)
      .maybeSingle();
    if (!current) {
      return NextResponse.json({ error: 'Complaint not found' }, { status: 404 });
    }

    const { data: department } = await supabase
      .from('departments')
      .select('name')
      .eq('id', data.department_id)
      .maybeSingle();
    if (!department) {
      return NextResponse.json({ error: 'Department not found' }, { status: 400 });
    }

    // Routing a held complaint releases it to the department's queue
    const update: { department_id: string; category: string; status?: string } = {
      department_id: data.department_id,
      category: department.name,
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

    // New department: send it the complaint, and tell the citizen where it went
    if (current.department_id !== data.department_id) {
      await announceRouted(id).catch((err) => console.error('Routing SMS failed:', err));
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
