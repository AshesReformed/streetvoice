import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSmsProvider } from '@/lib/sms/provider'

export async function GET() {
  try {
    const supabase = createAdminClient()
    const { error } = await supabase.from('departments').select('id').limit(1)

    if (error) {
      return NextResponse.json({ status: 'unhealthy', error: error.message }, { status: 503 })
    }

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      // Which SMS sender is active (mock or android): useful after changing env vars
      sms_provider: getSmsProvider().name,
      // true when the Android gateway login is configured (values never shown)
      sms_gateway_configured: Boolean(
        process.env.SMS_GATEWAY_USERNAME && process.env.SMS_GATEWAY_PASSWORD
      ),
      sms_webhook_signed: Boolean(process.env.SMS_WEBHOOK_SIGNING_KEY),
    })
  } catch {
    return NextResponse.json({ status: 'unhealthy', error: 'Failed to connect to database' }, { status: 503 })
  }
}
