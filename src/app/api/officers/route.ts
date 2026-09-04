import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/middleware/require-admin';
import { validateBody } from '@/lib/middleware/validate';
import { createOfficerSchema } from '@/lib/validation/schemas';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const supabase = createAdminClient();
    const { data: officers, error } = await supabase
      .from('officers')
      .select('*, department:departments(name)')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: officers || [] });
  } catch (err) {
    console.error('Officers list error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const data = await validateBody(request, createOfficerSchema);
    if (data instanceof NextResponse) return data;

    const supabase = createAdminClient();

    // 1. Create auth user via Supabase admin API
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });

    if (authError || !authUser?.user) {
      return NextResponse.json(
        { error: authError?.message || 'Failed to create auth user' },
        { status: 400 }
      );
    }

    // 2. Insert officer row with the auth user's id
    const { data: officer, error: officerError } = await supabase
      .from('officers')
      .insert({
        id: authUser.user.id,
        full_name: data.full_name,
        role: data.role,
        department_id: data.department_id ?? null,
      })
      .select('*, department:departments(name)')
      .single();

    if (officerError || !officer) {
      // Rollback: remove the auth user we just created
      await supabase.auth.admin.deleteUser(authUser.user.id);
      return NextResponse.json(
        { error: officerError?.message || 'Failed to create officer record' },
        { status: 400 }
      );
    }

    return NextResponse.json({ data: officer });
  } catch (err) {
    console.error('Officer create error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
