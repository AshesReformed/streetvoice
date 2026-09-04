import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export interface AuthUser {
  id: string;
  email: string;
  officer: {
    id: string;
    department_id: string | null;
    role: 'officer' | 'admin';
    full_name: string;
  };
}

export async function requireAuth(request: NextRequest): Promise<AuthUser | NextResponse> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: officer } = await supabase
    .from('officers')
    .select('id, department_id, role, full_name')
    .eq('id', user.id)
    .single();

  if (!officer) {
    return NextResponse.json({ error: 'Officer profile not found' }, { status: 403 });
  }

  return {
    id: user.id,
    email: user.email!,
    officer,
  };
}
