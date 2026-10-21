'use client'

import { useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { useApi } from '@/lib/hooks/use-api'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import { Ban, Eye, EyeOff, ShieldAlert, ShieldCheck } from 'lucide-react'

interface CallerInfo {
  known: boolean
  masked?: string | null
  phone?: string | null
  first_seen?: string
  complaint_count?: number
  spam_count?: number
  recent?: Array<{ id: string; tracking_id: string; status: string; summary: string | null; created_at: string }>
  block?: { id: string; reason: string | null; blocked_until: string | null; created_at: string } | null
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

/**
 * Who called, for the control room: masked number, how often they've called,
 * any block, and the spam / block actions. Departments never see this.
 */
export function CallerCard({
  complaintId,
  status,
  onChanged,
}: {
  complaintId: string
  status: string
  onChanged: () => void
}) {
  const { data: caller, loading, error, reload } = useApi<CallerInfo>(`/api/complaints/${complaintId}/caller`)
  const [showFull, setShowFull] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function send(url: string, method: string, body?: unknown) {
    setBusy(true)
    setMessage('')
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Request failed')
      reload()
      onChanged()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  const block = (hours: number | null) =>
    send(`/api/complaints/${complaintId}/caller`, 'POST', { hours })
  const unblock = () => send(`/api/complaints/${complaintId}/caller`, 'DELETE')
  const markSpam = (spam: boolean) => send(`/api/complaints/${complaintId}/spam`, 'POST', { spam })

  const others = (caller?.recent ?? []).filter((c) => c.id !== complaintId)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Caller</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {loading ? (
          <div className="h-16 rounded bg-muted animate-pulse" />
        ) : error ? (
          <p className="text-destructive">{error}</p>
        ) : !caller?.known ? (
          <div className="space-y-1">
            <p className="font-medium">No caller number</p>
            <p className="text-xs text-muted-foreground">
              No SMS updates for this complaint. On the real phone line the number comes from caller ID
              automatically; the browser demo only has it when the caller types it.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-base">{showFull ? caller.phone : caller.masked}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={showFull ? 'Hide number' : 'Show full number'}
                  onClick={() => setShowFull((v) => !v)}
                >
                  {showFull ? <EyeOff size={14} /> : <Eye size={14} />}
                </Button>
              </div>
              <p className="text-muted-foreground">
                {caller.complaint_count === 1
                  ? 'First complaint from this number'
                  : `${ordinal(caller.complaint_count ?? 0)} complaint from this number`}
                {caller.first_seen && ` · first call ${format(new Date(caller.first_seen), 'MMM d')}`}
              </p>
              {(caller.spam_count ?? 0) > 0 && (
                <p className="text-red-700">{caller.spam_count} of the latest flagged as spam</p>
              )}
            </div>

            {others.length > 0 && (
              <ul className="space-y-1">
                {others.slice(0, 5).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2">
                    <Link href={`/admin/complaints/${c.id}`} className="font-mono text-xs hover:underline">
                      {c.tracking_id}
                    </Link>
                    <span className="truncate text-xs text-muted-foreground">
                      {format(new Date(c.created_at), 'MMM d')}
                    </span>
                    <StatusBadge status={c.status} />
                  </li>
                ))}
              </ul>
            )}

            {caller.block ? (
              <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">
                <p className="flex items-center gap-1.5 font-medium">
                  <Ban size={14} />
                  {caller.block.blocked_until
                    ? `Blocked until ${format(new Date(caller.block.blocked_until), 'MMM d, h:mm a')}`
                    : 'Blocked until unblocked'}
                </p>
                {caller.block.reason && <p className="text-xs">{caller.block.reason}</p>}
                <Button size="xs" variant="outline" disabled={busy} onClick={unblock}>
                  Unblock
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={busy} onClick={() => block(24)}>
                  <Ban size={14} /> Block 24 h
                </Button>
                <Button size="sm" variant="destructive" disabled={busy} onClick={() => block(null)}>
                  <Ban size={14} /> Block number
                </Button>
              </div>
            )}
          </>
        )}

        <div className="border-t pt-3">
          {status === 'spam' ? (
            <Button size="sm" variant="outline" className="w-full" disabled={busy} onClick={() => markSpam(false)}>
              <ShieldCheck size={14} /> Not spam, send to review
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="w-full" disabled={busy} onClick={() => markSpam(true)}>
              <ShieldAlert size={14} /> Mark as spam
            </Button>
          )}
        </div>

        {message && <p className="text-xs text-destructive">{message}</p>}
      </CardContent>
    </Card>
  )
}
