import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthUser } from './auth';

export async function requireAdmin(request: NextRequest): Promise<AuthUser | NextResponse> {
  const result = await requireAuth(request);
  if (result instanceof NextResponse) return result;

  if (result.officer.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  return result;
}
