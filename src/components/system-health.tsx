'use client'

import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { useApi } from '@/lib/hooks/use-api'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { SystemHealth } from '@/lib/ops/health'

// Live system health for the control room: calls, the AI queue, SMS,
// overdue complaints and free-tier usage. Refreshes every 10 seconds.

type Tone = 'ok' | 'warn' | 'bad'

function mb(bytes: number | null) {
  return bytes == null ? '—' : `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

function Tile({
  label,
  value,
  detail,
  tone = 'ok',
  href,
}: {
  label: string
  value: string | number
  detail?: string
  tone?: Tone
  href?: string
}) {
  const body = (
    <div
      className={cn(
        'h-full rounded-lg border px-3 py-2',
        tone === 'warn' && 'border-amber-200 bg-amber-50',
        tone === 'bad' && 'border-red-200 bg-red-50',
        href && 'transition-colors hover:bg-muted/60'
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'text-xl font-semibold',
          tone === 'warn' && 'text-amber-800',
          tone === 'bad' && 'text-red-700'
        )}
      >
        {value}
      </p>
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
    </div>
  )
  return href ? <Link href={href}>{body}</Link> : body
}

export function SystemHealthCard() {
  const { data: h, error } = useApi<SystemHealth>('/api/admin/health', { refreshMs: 10_000 })

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>System health</CardTitle>
          <CardDescription className="text-destructive">{error}</CardDescription>
        </CardHeader>
      </Card>
    )
  }
  if (!h) return <div className="h-32 rounded-xl bg-muted animate-pulse" />

  const storagePct = h.recording_bytes != null ? (h.recording_bytes / h.limits.storageBytes) * 100 : null
  const dbPct = h.database_bytes != null ? (h.database_bytes / h.limits.databaseBytes) * 100 : null
  const avgRecording =
    h.recording_files && h.recording_bytes ? h.recording_bytes / h.recording_files : null
  const callsLeft =
    avgRecording && h.recording_bytes != null
      ? Math.floor((h.limits.storageBytes - h.recording_bytes) / avgRecording)
      : null

  const queueTone: Tone =
    h.waiting_for_ai >= 20 || (h.oldest_waiting_minutes ?? 0) >= 15
      ? 'bad'
      : h.waiting_for_ai > 0
        ? 'warn'
        : 'ok'
  const smsTone: Tone = h.sms_stuck > 0 || h.sms_failed_24h >= 3 ? 'bad' : h.sms_failed_24h > 0 ? 'warn' : 'ok'
  const usageTone = (pct: number | null): Tone => (pct == null ? 'ok' : pct >= 90 ? 'bad' : pct >= 70 ? 'warn' : 'ok')

  return (
    <Card>
      <CardHeader>
        <CardTitle>System health</CardTitle>
        <CardDescription>
          Live, refreshed every 10 seconds · checked {formatDistanceToNow(new Date(h.checked_at))} ago
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile
            label="Calls in the last hour"
            value={h.calls_last_hour}
            detail={h.refused_last_hour ? `${h.refused_last_hour} refused by the spam guard` : 'none refused'}
            tone={h.refused_last_hour >= 10 ? 'warn' : 'ok'}
            href="/admin/flagged"
          />
          <Tile
            label="Waiting for the AI"
            value={h.waiting_for_ai}
            detail={
              h.oldest_waiting_minutes != null
                ? `oldest ${h.oldest_waiting_minutes} min · retried every 5 min`
                : 'queue empty'
            }
            tone={queueTone}
            href="/admin/complaints"
          />
          <Tile
            label="SMS in the last 24 h"
            value={`${h.sms_sent_24h} sent`}
            detail={
              h.sms_stuck
                ? `${h.sms_stuck} stuck: is the SMS phone online?`
                : h.sms_failed_24h
                  ? `${h.sms_failed_24h} failed`
                  : h.last_sms_sent_at
                    ? `last ${formatDistanceToNow(new Date(h.last_sms_sent_at))} ago`
                    : 'none yet'
            }
            tone={smsTone}
            href="/admin/sms"
          />
          <Tile
            label="Overdue (7+ days)"
            value={h.overdue}
            detail={`${h.duplicates_merged_24h} duplicate reports merged today`}
            tone={h.overdue ? 'warn' : 'ok'}
            href="/admin/complaints?overdue=1"
          />
          <Tile
            label="AI failures (24 h)"
            value={h.ai_failures_24h}
            detail="retried, then sent to Needs Review"
            tone={h.ai_failures_24h >= 5 ? 'warn' : 'ok'}
            href="/admin/needs-review"
          />
          <Tile
            label="Recording storage"
            value={mb(h.recording_bytes)}
            detail={
              storagePct != null
                ? `${storagePct.toFixed(1)}% of free 1 GB${callsLeft != null ? ` · room for ~${callsLeft.toLocaleString()} more calls` : ''}`
                : undefined
            }
            tone={usageTone(storagePct)}
          />
          <Tile
            label="Database"
            value={mb(h.database_bytes)}
            detail={dbPct != null ? `${dbPct.toFixed(1)}% of free 500 MB` : undefined}
            tone={usageTone(dbPct)}
          />
          <Tile label="Recordings stored" value={h.recording_files ?? '—'} detail="private, signed links only" />
        </div>
      </CardContent>
    </Card>
  )
}
