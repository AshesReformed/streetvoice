'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { useApi } from '@/lib/hooks/use-api'
import { PageHeader } from '@/components/page-header'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import type { Complaint } from '@/lib/types'

// ===========================================================================
// Flagged: calls the AI (or an admin) marked as spam, and blocked numbers.
// Spam is never sent to a department. "Not spam" moves a call back to
// Needs Review; numbers are blocked from the complaint page or
// automatically after repeated spam.
// ===========================================================================

interface BlockedNumber {
  id: string
  phone_masked: string | null
  reason: string | null
  blocked_until: string | null
  blocked_by: string | null
  created_at: string
  officer: { full_name: string } | null
}

export default function FlaggedPage() {
  const router = useRouter()
  const spam = useApi<{ complaints: Complaint[]; total: number }>('/api/complaints?status=spam&limit=100', {
    refreshMs: 10_000,
  })
  const blocked = useApi<BlockedNumber[]>('/api/blocked-numbers', { refreshMs: 10_000 })
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function act(id: string, url: string, init: RequestInit, reload: () => void) {
    setBusyId(id)
    setActionError(null)
    try {
      const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Request failed')
      reload()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Error')
    } finally {
      setBusyId(null)
    }
  }

  const complaints = spam.data?.complaints ?? []
  const numbers = blocked.data ?? []
  const error = spam.error ?? blocked.error ?? actionError

  return (
    <div className="space-y-6">
      <PageHeader
        title="Flagged"
        description="Spam calls and blocked numbers. Nothing here reaches a department."
      />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Spam calls ({spam.data?.total ?? complaints.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {spam.loading ? (
            <div className="m-4 h-20 rounded bg-muted animate-pulse" />
          ) : complaints.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No spam calls. All clear.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tracking ID</TableHead>
                  <TableHead>Why it was flagged</TableHead>
                  <TableHead>What was said</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {complaints.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell
                      className="cursor-pointer font-mono text-xs hover:underline"
                      onClick={() => router.push(`/admin/complaints/${c.id}`)}
                    >
                      {c.tracking_id}
                    </TableCell>
                    <TableCell className="max-w-56 whitespace-normal">{c.spam_reason || '—'}</TableCell>
                    <TableCell className="max-w-72 truncate text-muted-foreground">
                      {c.transcript_english || c.summary || '—'}
                    </TableCell>
                    <TableCell>{format(new Date(c.created_at), 'MMM d, h:mm a')}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={busyId === c.id}
                        onClick={() =>
                          act(
                            c.id,
                            `/api/complaints/${c.id}/spam`,
                            { method: 'POST', body: JSON.stringify({ spam: false }) },
                            spam.reload
                          )
                        }
                      >
                        Not spam
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Blocked numbers ({numbers.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {blocked.loading ? (
            <div className="m-4 h-20 rounded bg-muted animate-pulse" />
          ) : numbers.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No blocked numbers. Block a caller from their complaint page.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Blocked by</TableHead>
                  <TableHead>Until</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {numbers.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-xs">{b.phone_masked || '•••'}</TableCell>
                    <TableCell className="max-w-64 whitespace-normal">{b.reason || '—'}</TableCell>
                    <TableCell>{b.blocked_by ? b.officer?.full_name || 'Admin' : 'Automatic'}</TableCell>
                    <TableCell>
                      {b.blocked_until ? format(new Date(b.blocked_until), 'MMM d, h:mm a') : 'Until unblocked'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={busyId === b.id}
                        onClick={() =>
                          act(b.id, `/api/blocked-numbers/${b.id}`, { method: 'DELETE' }, blocked.reload)
                        }
                      >
                        Unblock
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
