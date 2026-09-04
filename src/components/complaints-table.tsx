'use client'

import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
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
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed">
        <p className="text-sm text-muted-foreground">No complaints found.</p>
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tracking ID</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Priority</TableHead>
          <TableHead>Area</TableHead>
          <TableHead>Date</TableHead>
          {showDepartment && <TableHead>Department</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {complaints.map((complaint) => (
          <TableRow
            key={complaint.id}
            className="cursor-pointer"
            onClick={() => handleClick(complaint)}
          >
            <TableCell className="font-mono text-xs">
              {complaint.tracking_id}
            </TableCell>
            <TableCell>{complaint.category || '—'}</TableCell>
            <TableCell>
              <StatusBadge status={complaint.status} />
            </TableCell>
            <TableCell>
              <PriorityBadge priority={complaint.priority} />
            </TableCell>
            <TableCell>{complaint.area || '—'}</TableCell>
            <TableCell>
              {format(new Date(complaint.created_at), 'MMM d, yyyy')}
            </TableCell>
            {showDepartment && (
              <TableCell>
                {complaint.department?.name || '—'}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
