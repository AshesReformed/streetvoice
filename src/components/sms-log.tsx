'use client'

import { useEffect } from 'react'
import { format } from 'date-fns'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { useApi } from '@/lib/hooks/use-api'
import { cn } from '@/lib/utils'

export interface SmsMessage {
  id: string
  direction: 'in' | 'out'
  phone: string
  body: string
  purpose: string | null
  status: 'queued' | 'sent' | 'failed' | 'received'
  error: string | null
  created_at: string
  complaint: { tracking_id: string } | null
}

const PURPOSE_LABELS: Record<string, string> = {
  citizen_filed: 'Citizen: registered',
  citizen_routed: 'Citizen: sent to department',
  citizen_in_progress: 'Citizen: work started',
  citizen_resolved: 'Citizen: resolved',
  department_dispatch: 'Department: new complaint',
  command_reply: 'Reply',
  command_start: 'Department: started',
  command_done: 'Department: done',
  command_status: 'Status check',
  command_unknown: 'Unrecognised',
}

/** SMS in and out, newest first, refreshed every 5 seconds. */
export function SmsLog({ complaintId, limit = 50 }: { complaintId?: string; limit?: number }) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (complaintId) params.set('complaint_id', complaintId)
  const { data, loading, error, reload } = useApi<SmsMessage[]>(`/api/sms?${params}`)

  useEffect(() => {
    const timer = setInterval(reload, 5000)
    return () => clearInterval(timer)
  }, [reload])

  if (loading) return <div className="h-24 animate-pulse rounded-lg bg-muted" />
  if (error) return <p className="text-sm text-destructive">{error}</p>

  const messages = data ?? []
  if (messages.length === 0) {
    return <p className="text-sm text-muted-foreground">No SMS yet.</p>
  }

  return (
    <ul className="space-y-3">
      {messages.map((m) => (
        <li key={m.id} className="flex gap-3">
          <div
            className={cn(
              'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full',
              m.direction === 'in' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
            )}
          >
            {m.direction === 'in' ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {PURPOSE_LABELS[m.purpose ?? ''] ?? m.purpose ?? 'SMS'}
              </span>
              <span className="font-mono">
                {m.direction === 'in' ? 'from' : 'to'} {m.phone}
              </span>
              {!complaintId && m.complaint && <span className="font-mono">#{m.complaint.tracking_id}</span>}
              <span>{format(new Date(m.created_at), 'MMM d, h:mm:ss a')}</span>
              {m.status === 'failed' && (
                <span className="text-destructive" title={m.error ?? undefined}>
                  failed
                </span>
              )}
              {m.status === 'queued' && <span>sending…</span>}
            </div>
            <p dir="auto" className="mt-1 whitespace-pre-wrap rounded-lg bg-muted/60 px-3 py-2 text-sm">
              {m.body}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}
