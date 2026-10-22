import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// No-login complaint page for the department. Its link arrives in the
// department's SMS; the long random token in the URL is the access key.
// Urdu first, English underneath.

export const metadata: Metadata = {
  title: 'StreetVoice — شکایت',
  robots: { index: false, follow: false },
}

const URGENCY_UR: Record<string, string> = { high: 'فوری', medium: 'درمیانی', low: 'کم' }
const STATUS_UR: Record<string, string> = {
  processing: 'جانچ جاری ہے',
  needs_review: 'جانچ جاری ہے',
  open: 'نئی',
  in_progress: 'کام جاری ہے',
  resolved: 'حل ہو گئی',
  spam: 'جانچ جاری ہے',
}

export default async function DepartmentComplaintPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  if (!/^[0-9a-f]{32}$/.test(token)) notFound()

  const { data: complaint } = await createAdminClient()
    .from('complaints')
    .select(
      'tracking_id, status, priority, area, summary, summary_urdu, transcript_urdu, transcript_english, audio_url, created_at, department:departments(name, name_ur)'
    )
    .eq('public_token', token)
    .maybeSingle()
  if (!complaint) notFound()

  const department = complaint.department as unknown as { name: string; name_ur: string | null } | null
  const filedAt = new Date(complaint.created_at as string).toLocaleString('en-PK', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Karachi',
  })

  return (
    <div className="flex flex-1 justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md space-y-4">
        <div className="rounded-2xl bg-sidebar px-6 py-5 text-center text-white shadow-lg">
          <p className="text-sm text-white/60">StreetVoice</p>
          <h1 className="mt-1 font-mono text-3xl font-semibold tracking-widest">{complaint.tracking_id}</h1>
          <p className="mt-2 text-sm text-sidebar-primary">
            <span dir="rtl">{department?.name_ur ?? department?.name ?? '—'}</span>
            <span> · </span>
            <span dir="ltr">{filedAt}</span>
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle dir="rtl" className="text-right text-lg">
              شکایت
              {complaint.priority === 'high' && (
                <span className="mr-2 rounded bg-red-100 px-2 py-0.5 text-sm text-red-800">فوری</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl dir="rtl" className="space-y-2 text-right text-base">
              {complaint.area && (
                <div>
                  <dt className="inline font-semibold">علاقہ: </dt>
                  <dd className="inline">{complaint.area}</dd>
                </div>
              )}
              <div>
                <dt className="inline font-semibold">نوعیت: </dt>
                <dd className="inline">{URGENCY_UR[complaint.priority] ?? complaint.priority}</dd>
              </div>
              <div>
                <dt className="inline font-semibold">صورتحال: </dt>
                <dd className="inline">{STATUS_UR[complaint.status] ?? complaint.status}</dd>
              </div>
            </dl>

            {complaint.summary_urdu && (
              <p dir="rtl" className="text-right text-lg leading-relaxed">
                {complaint.summary_urdu}
              </p>
            )}

            {complaint.audio_url && (
              <div className="space-y-1">
                <p dir="rtl" className="text-right text-sm font-semibold">شہری کی آواز سنیں</p>
                <audio controls preload="none" className="w-full" src={`/api/public/recording/${token}`} />
              </div>
            )}

            {complaint.transcript_urdu && (
              <details dir="rtl" className="text-right">
                <summary className="cursor-pointer text-sm font-semibold">شہری نے کیا کہا</summary>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{complaint.transcript_urdu}</p>
              </details>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent dir="rtl" className="space-y-1 text-right text-sm">
            <p className="font-semibold">جواب کیسے دیں</p>
            <p>
              کام شروع ہو تو اسی نمبر پر SMS کریں:{' '}
              <span dir="ltr" className="font-mono font-semibold">{complaint.tracking_id} OK</span>
            </p>
            <p>
              مکمل ہو جائے تو:{' '}
              <span dir="ltr" className="font-mono font-semibold">{complaint.tracking_id} DONE</span>
            </p>
          </CardContent>
        </Card>

        {(complaint.summary || complaint.transcript_english) && (
          <details className="rounded-xl border bg-card p-4 text-sm">
            <summary className="cursor-pointer font-semibold">English</summary>
            {complaint.summary && <p className="mt-2 font-medium">{complaint.summary}</p>}
            {complaint.transcript_english && (
              <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{complaint.transcript_english}</p>
            )}
          </details>
        )}
      </div>
    </div>
  )
}
