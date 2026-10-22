'use client'

import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { Copy, Inbox } from 'lucide-react'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { StatusBadge } from './status-badge'
import { PriorityBadge } from './priority-badge'
import type { Complaint } from '@/lib/types'

interface ComplaintsTableProps {
  complaints: Complaint[]
  showDepartment?: boolean
  onRowClick?: (complaint: Complaint) => void
}

function Reports({ complaint }: { complaint: Complaint }) {
  if (complaint.report_count > 1) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-orange-800">
        <Copy size={10} />×{complaint.report_count}
      </span>
    )
  }
  if (complaint.duplicate_of) {
    return <span className="rounded-full bg-muted px-1.5 py-0.5 font-sans text-[10px] text-muted-foreground">linked</span>
  }
  return null
}

function when(date: string) {
  return formatDistanceToNow(new Date(date), { addSuffix: true }).replace('about ', '')
}

export function ComplaintsTable({
  complaints,
  showDepartment = false,
  onRowClick,
}: ComplaintsTableProps) {
  const router = useRouter()

  function handleClick(complaint: Complaint) {
    if (onRowClick) {
      onRowClick(complaint)
    } else {
      router.push(`/portal/complaints/${complaint.id}`)
    }
  }

  if (complaints.length === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-card">
        <Inbox size={20} className="text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No complaints found.</p>
      </div>
    )
  }

  return (
    <>
      {/* Phones: one card per complaint */}
      <ul className="space-y-2 md:hidden">
        {complaints.map((c) => (
          <li key={c.id}>
            <button
              onClick={() => handleClick(c)}
              className="w-full rounded-xl border bg-card p-3 text-left transition-colors active:bg-muted"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-mono text-sm font-medium">
                  {c.tracking_id}
                  <Reports complaint={c} />
                </span>
                <StatusBadge status={c.status} />
              </div>
              <p className="mt-1.5 line-clamp-2 text-sm">{c.summary || 'Waiting for the AI…'}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <PriorityBadge priority={c.priority} />
                {c.area && <span>{c.area}</span>}
                {showDepartment && c.department?.name && <span>· {c.department.name}</span>}
                <span>· {when(c.created_at)}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {/* Larger screens: a table */}
      <div className="hidden rounded-xl border bg-card p-2 md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Complaint</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Area</TableHead>
              {showDepartment && <TableHead>Department</TableHead>}
              <TableHead className="text-right">Filed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {complaints.map((c) => (
              <TableRow key={c.id} className="cursor-pointer border-border/60" onClick={() => handleClick(c)}>
                <TableCell className="max-w-md whitespace-normal">
                  <div className="flex items-center gap-1.5 font-mono text-xs font-medium">
                    {c.tracking_id}
                    <Reports complaint={c} />
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                    {c.summary || (c.status === 'processing' ? 'Waiting for the AI…' : c.category || '—')}
                  </p>
                </TableCell>
                <TableCell>
                  <StatusBadge status={c.status} />
                </TableCell>
                <TableCell>
                  <PriorityBadge priority={c.priority} />
                </TableCell>
                <TableCell>{c.area || <span className="text-muted-foreground">—</span>}</TableCell>
                {showDepartment && (
                  <TableCell>{c.department?.name || <span className="text-muted-foreground">—</span>}</TableCell>
                )}
                <TableCell className="text-right text-muted-foreground">{when(c.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
