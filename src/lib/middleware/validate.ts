import { NextRequest, NextResponse } from 'next/server';
import { ZodType } from 'zod';

export async function validateBody<T>(request: NextRequest, schema: ZodType<T>): Promise<T | NextResponse> {
  try {
    const body = await request.json();
    const result = schema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: result.error.flatten() },
        { status: 400 }
      );
    }
    return result.data;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
}
