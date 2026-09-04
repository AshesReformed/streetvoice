import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/middleware/require-admin';
import { validateBody } from '@/lib/middleware/validate';
import { updateDepartmentSchema } from '@/lib/validation/schemas';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const data = await validateBody(request, updateDepartmentSchema);
    if (data instanceof NextResponse) return data;

    const supabase = await createClient();

    const updatePayload: Record<string, unknown> = {};
    if (data.name !== undefined) updatePayload.name = data.name;
    if (data.keywords !== undefined) updatePayload.keywords = data.keywords;
    if (data.contact_info !== undefined) updatePayload.contact_info = data.contact_info;

    const { data: department, error } = await supabase
      .from('departments')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!department) {
      return NextResponse.json({ error: 'Department not found' }, { status: 404 });
    }

    return NextResponse.json({ data: department });
  } catch (err) {
    console.error('Department update error:', err);
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
    const supabase = await createClient();

    const { error } = await supabase
      .from('departments')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data: { success: true } });
  } catch (err) {
    console.error('Department delete error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
