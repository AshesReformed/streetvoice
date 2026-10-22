'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/status-badge'
import type { Complaint } from '@/lib/types'

type Linked = Pick<Complaint, 'id' | 'tracking_id' | 'status' | 'area' | 'created_at'>

/** Other callers reporting the same problem (duplicate grouping). */
export function LinkedReports({ complaint }: { complaint: Complaint }) {
  const [parent, setParent] = useState<Linked | null>(null)
  const [children, setChildren] = useState<Linked[]>([])

  useEffect(() => {
    const supabase = createClient()
    const columns = 'id, tracking_id, status, area, created_at'
    if (complaint.duplicate_of) {
      supabase
        .from('complaints')
        .select(columns)
        .eq('id', complaint.duplicate_of)
        .maybeSingle()
        .then(({ data }) => setParent((data as Linked) ?? null))
    } else if (complaint.report_count > 1) {
      supabase
        .from('complaints')
        .select(columns)
        .eq('duplicate_of', complaint.id)
        .order('created_at', { ascending: true })
        .then(({ data }) => setChildren((data as Linked[]) ?? []))
    }
  }, [complaint.id, complaint.duplicate_of, complaint.report_count])

  if (!complaint.duplicate_of && complaint.report_count <= 1) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Same issue</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {complaint.duplicate_of ? (
          <p>
            Linked to{' '}
            {parent ? (
              <Link href={`/admin/complaints/${parent.id}`} className="font-mono font-medium hover:underline">
                {parent.tracking_id}
              </Link>
            ) : (
              'the first report'
            )}
            , which the department already has. This caller gets its updates by SMS; nothing was sent to the
            department again.
          </p>
        ) : (
          <>
            <p className="font-medium">
              {complaint.report_count} callers reported this. The department got one SMS, and every caller
              hears when it moves.
            </p>
            <ul className="space-y-1">
              {children.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2">
                  <Link href={`/admin/complaints/${c.id}`} className="font-mono text-xs hover:underline">
                    {c.tracking_id}
                  </Link>
                  <span className="truncate text-xs text-muted-foreground">
                    {c.area || '—'} · {format(new Date(c.created_at), 'MMM d, h:mm a')}
                  </span>
                  <StatusBadge status={c.status} />
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}
