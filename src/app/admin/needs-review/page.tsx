'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/lib/hooks/use-api'
import { PageHeader } from '@/components/page-header'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select'
import { StatusBadge } from '@/components/status-badge'
import { PriorityBadge } from '@/components/priority-badge'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'
import type { Complaint, Department } from '@/lib/types'

export default function NeedsReviewPage() {
  const router = useRouter()
  const {
    data: complaintsData,
    loading,
    error: loadError,
    reload: reloadComplaints,
  } = useApi<{ complaints: Complaint[] }>('/api/complaints?status=needs_review&limit=100', {
    refreshMs: 10_000,
  })
  const { data: departmentsData } = useApi<Department[]>('/api/departments')
  const departments = departmentsData ?? []
  // Only unassigned complaints (department_id is null)
  const complaints = (complaintsData?.complaints ?? []).filter((c) => !c.department_id)
  const [actionError, setActionError] = useState<string | null>(null)
  const error = loadError ?? actionError

  // Assign state: { complaintId -> deptId }
  const [assignMap, setAssignMap] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  async function handleAssign(complaintId: string) {
    const deptId = assignMap[complaintId]
    if (!deptId) return

    setSavingId(complaintId)
    setActionError(null)
    try {
      const res = await fetch(`/api/complaints/${complaintId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ department_id: deptId }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Failed to assign')
      }
      // Refetch; the assigned complaint drops out of the list
      reloadComplaints()
      setAssignMap((prev) => {
        const next = { ...prev }
        delete next[complaintId]
        return next
      })
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Error assigning')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Needs Review"
        description={`${complaints.length} unassigned complaints requiring manual review`}
      />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 rounded bg-muted animate-pulse" />
          ))}
        </div>
      ) : complaints.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed">
          <p className="text-sm text-muted-foreground">
            No unassigned complaints. All caught up!
          </p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tracking ID</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Assign Department</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {complaints.map((complaint) => (
                  <TableRow key={complaint.id}>
                    <TableCell
                      className="cursor-pointer font-mono text-xs hover:underline"
                      onClick={() => router.push(`/admin/complaints/${complaint.id}`)}
                    >
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
                    <TableCell>
                      {complaint.confidence_score != null
                        ? `${Math.round(complaint.confidence_score * 100)}%`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Select
                          items={departments.map((d) => ({ value: d.id, label: d.name }))}
                          value={assignMap[complaint.id] || ''}
                          onValueChange={(v: string | null) =>
                            setAssignMap((prev) => ({ ...prev, [complaint.id]: v ?? '' }))
                          }
                        >
                          <SelectTrigger size="sm">
                            <SelectValue placeholder="Select..." />
                          </SelectTrigger>
                          <SelectContent>
                            {departments.map((d) => (
                              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="xs"
                          disabled={!assignMap[complaint.id] || savingId === complaint.id}
                          onClick={() => handleAssign(complaint.id)}
                        >
                          {savingId === complaint.id ? '...' : 'Assign'}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
