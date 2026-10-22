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
const STATUS_LABELS: Record<string, string> = {
  processing: 'With the AI',
  needs_review: 'Needs review',
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  spam: 'Spam',
}
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
  const [status, setStatus] = useState(searchParams.get('status') ?? '')
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
        title="All complaints"
        description={`${total} complaint${total === 1 ? '' : 's'}${hasFilters ? ' match these filters' : ''}`}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-56">
          <Search size={15} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search area…"
            aria-label="Search area"
            value={areaSearch}
            onChange={(e) => { setAreaSearch(e.target.value); setPage(1) }}
            className="h-9 bg-card pl-8"
          />
        </div>

        <Select
          items={STATUSES.map((s) => ({ value: s, label: s ? STATUS_LABELS[s] : 'All statuses' }))}
          value={status}
          onValueChange={(v: string | null) => { setStatus(v ?? ''); setPage(1) }}
        >
          <SelectTrigger className="h-9 w-40 bg-card" aria-label="Status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s || 'all'} value={s}>
                {s ? STATUS_LABELS[s] : 'All statuses'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          items={PRIORITIES.map((p) => ({ value: p, label: p ? p.charAt(0).toUpperCase() + p.slice(1) : 'All priorities' }))}
          value={priority}
          onValueChange={(v: string | null) => { setPriority(v ?? ''); setPage(1) }}
        >
          <SelectTrigger className="h-9 w-36 bg-card" aria-label="Priority">
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

        <Select
          items={[{ value: '', label: 'All departments' }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
          value={departmentId}
          onValueChange={(v: string | null) => { setDepartmentId(v ?? ''); setPage(1) }}
        >
          <SelectTrigger className="h-9 w-48 bg-card" aria-label="Department">
            <SelectValue placeholder="All departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant={overdue ? 'default' : 'outline'}
          className={overdue ? 'h-9' : 'h-9 bg-card'}
          onClick={() => { setOverdue((v) => !v); setPage(1) }}
        >
          Overdue only
        </Button>

        {hasFilters && (
          <Button variant="ghost" className="h-9" onClick={handleResetFilters}>
            Clear filters
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
