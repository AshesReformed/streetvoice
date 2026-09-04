'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PhoneCall } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { DashboardCards } from '@/components/dashboard-cards'
import {
  Card,
  CardHeader,
  CardTitle,
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { DashboardSummary } from '@/lib/types'

interface SimulatedCallResult {
  tracking_id: string
  complaint_id: string | null
  status: string | null
  category: string | null
  department_name: string | null
}

// Language hint sent with a simulated call. An explicit choice mirrors a
// real caller's DTMF selection; 'unspecified' lets the ASR auto-detect from
// the recording itself.
type SimulateLanguage = 'unspecified' | 'ur' | 'en'

export default function AdminDashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Test call simulation (admin-only)
  const [simulating, setSimulating] = useState(false)
  const [simulated, setSimulated] = useState<SimulatedCallResult | null>(null)
  const [simulateError, setSimulateError] = useState<string | null>(null)
  const [customAudioUrl, setCustomAudioUrl] = useState('')
  const [simulateLanguage, setSimulateLanguage] = useState<SimulateLanguage>('unspecified')

  useEffect(() => {
    async function loadSummary() {
      try {
        const res = await window.fetch('/api/dashboard/summary')
        if (!res.ok) throw new Error('Failed to fetch summary')
        const json = await res.json()
        setSummary(json.data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    loadSummary()
  }, [])

  async function refreshSummary() {
    try {
      const res = await window.fetch('/api/dashboard/summary')
      if (!res.ok) return
      const json = await res.json()
      if (json.data) setSummary(json.data)
    } catch {
      // Background refresh — keep the stale summary on failure
    }
  }

  async function handleSimulateCall() {
    setSimulating(true)
    setSimulated(null)
    setSimulateError(null)
    try {
      const res = await window.fetch('/api/dev/simulate-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // JSON.stringify drops undefined — an empty audioUrl keeps the
        // random-scenario behavior on the server, and 'unspecified' leaves
        // the language to ASR auto-detection.
        body: JSON.stringify({
          audioUrl: customAudioUrl.trim() || undefined,
          language: simulateLanguage,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to simulate call')
      setSimulated(json.data as SimulatedCallResult)
      await refreshSummary()
    } catch (err) {
      setSimulateError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSimulating(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" description="Overview of all complaints" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" description="Overview of all complaints" />
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      </div>
    )
  }

  if (!summary) return null

  const statItems = [
    { label: 'Total Complaints', value: summary.total_complaints },
    { label: 'Needs Review', value: summary.by_status.needs_review ?? 0 },
    { label: 'Open', value: summary.by_status.open ?? 0 },
    { label: 'In Progress', value: summary.by_status.in_progress ?? 0 },
    { label: 'Resolved', value: summary.by_status.resolved ?? 0 },
    {
      label: 'Avg Resolution',
      value: summary.avg_resolution_hours != null ? `${summary.avg_resolution_hours}h` : '—',
      description: 'Average time to resolve',
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Overview of all complaints across departments">
        <>
          <Input
            className="h-7 w-72"
            placeholder="Custom audio URL (optional)"
            aria-label="Custom audio URL for simulated test call"
            value={customAudioUrl}
            onChange={(e) => setCustomAudioUrl(e.target.value)}
            disabled={simulating}
          />
          <Select
            value={simulateLanguage}
            onValueChange={(v: string | null) =>
              setSimulateLanguage(v === 'ur' || v === 'en' ? v : 'unspecified')
            }
          >
            <SelectTrigger
              size="sm"
              className="w-44"
              aria-label="Language hint for simulated test call"
              disabled={simulating}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unspecified">Auto-detect language</SelectItem>
              <SelectItem value="ur">Urdu (ur)</SelectItem>
              <SelectItem value="en">English (en)</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleSimulateCall} disabled={simulating}>
            <PhoneCall size={14} />
            {simulating ? 'Simulating...' : 'Simulate a test call'}
          </Button>
        </>
      </PageHeader>

      {simulated && (
        <p className="text-sm text-muted-foreground">
          Test call registered as{' '}
          {simulated.complaint_id ? (
            <Link
              href={`/admin/complaints/${simulated.complaint_id}`}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {simulated.tracking_id}
            </Link>
          ) : (
            <span className="font-medium">{simulated.tracking_id}</span>
          )}{' '}
          — {simulated.category?.replace(/_/g, ' ') ?? 'unclassified'},{' '}
          {simulated.department_name
            ? `routed to ${simulated.department_name}`
            : 'flagged for manual review'}
          {simulated.status ? ` (${simulated.status.replace(/_/g, ' ')})` : ''}.
        </p>
      )}
      {simulateError && <p className="text-sm text-destructive">{simulateError}</p>}

      <DashboardCards items={statItems} />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* By Department */}
        <Card>
          <CardHeader>
            <CardTitle>Complaints by Department</CardTitle>
          </CardHeader>
          <CardContent>
            {summary.by_department.length === 0 ? (
              <p className="text-sm text-muted-foreground">No department data yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Department</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...summary.by_department]
                    .sort((a, b) => b.count - a.count)
                    .map((dept) => (
                      <TableRow key={dept.department_id}>
                        <TableCell className="font-medium">{dept.department_name}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">{dept.count}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* By Category */}
        <Card>
          <CardHeader>
            <CardTitle>Complaints by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {summary.by_category.length === 0 ? (
              <p className="text-sm text-muted-foreground">No category data yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...summary.by_category]
                    .sort((a, b) => b.count - a.count)
                    .map((cat) => (
                      <TableRow key={cat.category}>
                        <TableCell className="font-medium capitalize">
                          {cat.category.replace(/_/g, ' ')}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">{cat.count}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
