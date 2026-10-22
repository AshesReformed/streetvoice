'use client'

import { Suspense, useState } from 'react'
import { useApi } from '@/lib/hooks/use-api'
import { useRouter, useSearchParams } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import { ComplaintsTable } from '@/components/complaints-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import type { Complaint, Department } from '@/lib/types'

const STATUSES = ['', 'processing', 'needs_review', 'open', 'in_progress', 'resolved', 'spam']
const PRIORITIES = ['', 'low', 'medium', 'high']
const PAGE_SIZE = 20

// useSearchParams needs a Suspense boundary for the static build
export default function AllComplaintsPage() {
  return (
    <Suspense>
      <AllComplaints />
    </Suspense>
  )
}

function AllComplaints() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [page, setPage] = useState(1)

  // Filters
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [areaSearch, setAreaSearch] = useState('')
  // The health panel links here with ?overdue=1
  const [overdue, setOverdue] = useState(searchParams.get('overdue') === '1')

  const { data: departmentsData } = useApi<Department[]>('/api/departments')
  const departments = departmentsData ?? []

  const params = new URLSearchParams({
    page: String(page),
    limit: String(PAGE_SIZE),
  })
  if (status) params.set('status', status)
  if (priority) params.set('priority', priority)
  if (departmentId) params.set('department_id', departmentId)
  if (areaSearch) params.set('area', areaSearch)
  if (overdue) params.set('overdue', '1')

  const { data, loading, error } = useApi<{ complaints: Complaint[]; total: number }>(
    `/api/complaints?${params}`,
    { refreshMs: 10_000 }
  )
  const complaints = data?.complaints ?? []
  const total = data?.total ?? 0

  function handleResetFilters() {
    setStatus('')
    setPriority('')
    setDepartmentId('')
    setAreaSearch('')
    setOverdue(false)
    setPage(1)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const hasFilters = status || priority || departmentId || areaSearch || overdue

  return (
    <div className="space-y-6">
      <PageHeader
        title="All Complaints"
        description={`${total} total complaints`}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Status</label>
          <Select value={status} onValueChange={(v: string | null) => { setStatus(v ?? ''); setPage(1) }}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s || 'all'} value={s}>
                  {s ? s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'All statuses'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Priority</label>
          <Select value={priority} onValueChange={(v: string | null) => { setPriority(v ?? ''); setPage(1) }}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="All priorities" />
            </SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((p) => (
                <SelectItem key={p || 'all'} value={p}>
                  {p ? p.charAt(0).toUpperCase() + p.slice(1) : 'All priorities'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Department</label>
          <Select value={departmentId} onValueChange={(v: string | null) => { setDepartmentId(v ?? ''); setPage(1) }}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All departments</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Area</label>
          <div className="relative">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search area..."
              value={areaSearch}
              onChange={(e) => { setAreaSearch(e.target.value); setPage(1) }}
              className="w-40 pl-7"
            />
          </div>
        </div>

        <Button
          variant={overdue ? 'default' : 'outline'}
          size="sm"
          onClick={() => { setOverdue((v) => !v); setPage(1) }}
        >
          Overdue only
        </Button>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={handleResetFilters}>
            Clear
          </Button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 rounded bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <ComplaintsTable
          complaints={complaints}
          showDepartment
          onRowClick={(c) => router.push(`/admin/complaints/${c.id}`)}
        />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} · {total} results
          </p>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={14} />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
