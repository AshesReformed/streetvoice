'use client'

import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/page-header'
import { DashboardCards } from '@/components/dashboard-cards'
import { ComplaintsTable } from '@/components/complaints-table'
import type { DashboardSummary, Complaint } from '@/lib/types'

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [recentComplaints, setRecentComplaints] = useState<Complaint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const [summaryRes, complaintsRes] = await Promise.all([
          fetch('/api/dashboard/summary'),
          fetch('/api/complaints?limit=5'),
        ])

        if (!summaryRes.ok || !complaintsRes.ok) {
          throw new Error('Failed to fetch dashboard data')
        }

        const summaryJson = await summaryRes.json()
        const complaintsJson = await complaintsRes.json()

        setSummary(summaryJson.data)
        setRecentComplaints(complaintsJson.data.complaints)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" description="Loading..." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" />
        <div className="flex h-32 items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      </div>
    )
  }

  const byStatus = summary?.by_status ?? {}
  const cardItems = [
    { label: 'Total Complaints', value: summary?.total_complaints ?? 0 },
    { label: 'Needs Review', value: byStatus.needs_review ?? 0 },
    { label: 'Open', value: byStatus.open ?? 0 },
    { label: 'In Progress', value: byStatus.in_progress ?? 0 },
    { label: 'Resolved', value: byStatus.resolved ?? 0 },
  ]

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Overview of your department's complaints" />

      <DashboardCards items={cardItems} />

      <div>
        <h2 className="mb-3 text-base font-medium">Recent Complaints</h2>
        <ComplaintsTable complaints={recentComplaints} />
      </div>
    </div>
  )
}
