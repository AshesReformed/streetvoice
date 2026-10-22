'use client'

import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { Activity, Cpu, MessageSquare, PhoneIncoming, TimerReset } from 'lucide-react'
import { useApi } from '@/lib/hooks/use-api'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { SystemHealth } from '@/lib/ops/health'

// Live system health for the control room: calls, the AI queue, SMS,
// overdue complaints and free-tier usage. Refreshes every 10 seconds.

type Tone = 'ok' | 'warn' | 'bad'

const TONE_DOT: Record<Tone, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  bad: 'bg-red-500',
}

function mb(bytes: number | null) {
  return bytes == null ? '—' : `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

function Stat({
  icon: Icon,
  label,
  value,
  detail,
  tone = 'ok',
  href,
}: {
  icon: typeof Activity
  label: string
  value: string | number
  detail?: string
  tone?: Tone
  href?: string
}) {
  const body = (
    <div
      className={cn(
        'flex h-full gap-3 rounded-lg p-3 transition-colors',
        href && 'hover:bg-muted/70',
        tone === 'warn' && 'bg-amber-50 hover:bg-amber-100/70',
        tone === 'bad' && 'bg-red-50 hover:bg-red-100/70'
      )}
    >
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon size={16} />
      </span>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn('size-1.5 rounded-full', TONE_DOT[tone])} />
          {label}
        </p>
        <p className="text-lg leading-tight font-semibold tabular-nums">{value}</p>
        {detail && <p className="truncate text-xs text-muted-foreground">{detail}</p>}
      </div>
    </div>
  )
  return href ? <Link href={href}>{body}</Link> : body
}

function Meter({ label, used, pct, detail }: { label: string; used: string; pct: number | null; detail?: string }) {
  const tone: Tone = pct == null ? 'ok' : pct >= 90 ? 'bad' : pct >= 70 ? 'warn' : 'ok'
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {used}
          {pct != null && ` · ${pct.toFixed(1)}%`}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full', tone === 'ok' ? 'bg-primary' : TONE_DOT[tone])}
          style={{ width: `${Math.max(pct ?? 0, 1.5)}%` }}
        />
      </div>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
    </div>
  )
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
  if (!h) return <div className="h-48 animate-pulse rounded-xl bg-muted" />

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
  const allOk = queueTone === 'ok' && smsTone === 'ok' && !h.overdue && h.ai_failures_24h < 5

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            System health
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-medium',
                allOk ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              )}
            >
              {allOk ? 'All good' : 'Needs a look'}
            </span>
          </CardTitle>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            Live · {formatDistanceToNow(new Date(h.checked_at))} ago
          </span>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="grid gap-1 sm:grid-cols-2">
          <Stat
            icon={PhoneIncoming}
            label="Calls, last hour"
            value={h.calls_last_hour}
            detail={h.refused_last_hour ? `${h.refused_last_hour} refused by the spam guard` : 'none refused'}
            tone={h.refused_last_hour >= 10 ? 'warn' : 'ok'}
            href="/admin/flagged"
          />
          <Stat
            icon={Cpu}
            label="Waiting for the AI"
            value={h.waiting_for_ai}
            detail={
              h.oldest_waiting_minutes != null
                ? `oldest ${h.oldest_waiting_minutes} min · ${h.ai_failures_24h} failed today`
                : `queue empty · ${h.ai_failures_24h} failed today`
            }
            tone={queueTone}
            href="/admin/needs-review"
          />
          <Stat
            icon={MessageSquare}
            label="SMS, last 24 h"
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
          <Stat
            icon={TimerReset}
            label="Overdue (7+ days)"
            value={h.overdue}
            detail={`${h.duplicates_merged_24h} duplicate reports merged today`}
            tone={h.overdue ? 'warn' : 'ok'}
            href="/admin/complaints?overdue=1"
          />
        </div>
        <div className="flex flex-col justify-center gap-4 rounded-lg bg-muted/50 p-4">
          <Meter
            label="Recordings"
            used={mb(h.recording_bytes)}
            pct={storagePct}
            detail={
              h.recording_files != null
                ? `${h.recording_files.toLocaleString()} calls${callsLeft != null ? ` · room for ~${callsLeft.toLocaleString()} more` : ''} (free 1 GB)`
                : 'free 1 GB'
            }
          />
          <Meter label="Database" used={mb(h.database_bytes)} pct={dbPct} detail="free 500 MB" />
        </div>
      </CardContent>
    </Card>
  )
}
