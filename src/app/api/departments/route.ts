import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/middleware/auth';
import { requireAdmin } from '@/lib/middleware/require-admin';
import { validateBody } from '@/lib/middleware/validate';
import { createDepartmentSchema } from '@/lib/validation/schemas';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;

    const supabase = await createClient();
    const { data: departments, error } = await supabase
      .from('departments')
      .select('*')
      .order('name');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: departments || [] });
  } catch (err) {
    console.error('Departments list error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const data = await validateBody(request, createDepartmentSchema);
    if (data instanceof NextResponse) return data;

    const supabase = await createClient();
    const { data: department, error } = await supabase
      .from('departments')
      .insert({
        name: data.name,
        keywords: data.keywords,
        contact_info: data.contact_info ?? null,
      })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data: department });
  } catch (err) {
    console.error('Department create error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
