import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/middleware/require-admin';
import { validateBody } from '@/lib/middleware/validate';
import { updateOfficerSchema } from '@/lib/validation/schemas';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const data = await validateBody(request, updateOfficerSchema);
    if (data instanceof NextResponse) return data;

    const supabase = createAdminClient();

    const updatePayload: Record<string, unknown> = {};
    if (data.full_name !== undefined) updatePayload.full_name = data.full_name;
    if (data.role !== undefined) updatePayload.role = data.role;
    if (data.department_id !== undefined) updatePayload.department_id = data.department_id;

    const { data: officer, error } = await supabase
      .from('officers')
      .update(updatePayload)
      .eq('id', id)
      .select('*, departments(name)')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!officer) {
      return NextResponse.json({ error: 'Officer not found' }, { status: 404 });
    }

    return NextResponse.json({ data: officer });
  } catch (err) {
    console.error('Officer update error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const supabase = createAdminClient();

    const { error } = await supabase
      .from('officers')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Also delete the auth user
    await supabase.auth.admin.deleteUser(id);

    return NextResponse.json({ data: { success: true } });
  } catch (err) {
    console.error('Officer delete error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
