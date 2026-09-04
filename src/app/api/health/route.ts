import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const supabase = createAdminClient()
    const { error } = await supabase.from('departments').select('id').limit(1)

    if (error) {
      return NextResponse.json({ status: 'unhealthy', error: error.message }, { status: 503 })
    }

    return NextResponse.json({ status: 'healthy', timestamp: new Date().toISOString() })
  } catch {
    return NextResponse.json({ status: 'unhealthy', error: 'Failed to connect to database' }, { status: 503 })
  }
}
