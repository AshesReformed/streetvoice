'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import { ComplaintsTable } from '@/components/complaints-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Complaint } from '@/lib/types'

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'needs_review', label: 'Needs Review' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
]

const PRIORITY_OPTIONS = [
  { value: '', label: 'All Priorities' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

const PAGE_SIZE = 20

export default function ComplaintsPage() {
  const router = useRouter()
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [area, setArea] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const fetchComplaints = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', String(PAGE_SIZE))
      if (status) params.set('status', status)
      if (priority) params.set('priority', priority)
      if (area) params.set('area', area)

      const res = await fetch(`/api/complaints?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch complaints')

      const json = await res.json()
      setComplaints(json.data.complaints)
      setTotal(json.data.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [page, status, priority, area])

  useEffect(() => {
    fetchComplaints()
  }, [fetchComplaints])

  // Reset to page 1 when filters change
  function handleStatusChange(val: string | null) {
    setStatus(val ?? '')
    setPage(1)
  }
  function handlePriorityChange(val: string | null) {
    setPriority(val ?? '')
    setPage(1)
  }
  function handleAreaSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
    fetchComplaints()
  }

  function handleRowClick(complaint: Complaint) {
    router.push(`/portal/complaints/${complaint.id}`)
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Complaints" description={`${total} total complaints`} />

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Status</label>
          <Select value={status} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Priority</label>
          <Select value={priority} onValueChange={handlePriorityChange}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Priorities" />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <form onSubmit={handleAreaSubmit} className="flex items-end gap-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Area</label>
            <Input
              placeholder="Filter by area..."
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className="h-8 w-48"
            />
          </div>
        </form>
      </div>

      {/* Table */}
      {error ? (
        <div className="flex h-32 items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      ) : loading ? (
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      ) : (
        <ComplaintsTable complaints={complaints} onRowClick={handleRowClick} />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="size-3.5" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
