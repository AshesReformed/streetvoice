'use client'

import { useState } from 'react'
import { useApi } from '@/lib/hooks/use-api'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Clock, Inbox, PhoneCall } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card'
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
import { SystemHealthCard } from '@/components/system-health'

interface SimulatedCallResult {
  tracking_id: string
  complaint_id: string | null
  status: string | null
  category: string | null
  department_name: string | null
}

// Language hint sent with a simulated call. An explicit choice mirrors a
// real caller's DTMF selection; 'unspecified' lets the AI auto-detect from
// the recording itself. Codes match LANGUAGE_MENU in lib/twilio.ts.
const SIMULATE_LANGUAGES = [
  { code: 'unspecified', label: 'Auto-detect language' },
  { code: 'ur', label: 'Urdu (ur)' },
  { code: 'pa', label: 'Punjabi (pa)' },
  { code: 'ps', label: 'Pashto (ps)' },
  { code: 'sd', label: 'Sindhi (sd)' },
  { code: 'skr', label: 'Saraiki (skr)' },
  { code: 'en', label: 'English (en)' },
] as const
type SimulateLanguage = (typeof SIMULATE_LANGUAGES)[number]['code']

export default function AdminDashboard() {
  // Refreshes every 10 s so new calls show up live during a demo
  const {
    data: summary,
    loading,
    error,
    reload: refreshSummary,
  } = useApi<DashboardSummary>('/api/dashboard/summary', { refreshMs: 10_000 })

  // Test call simulation (admin-only)
  const [showSimulator, setShowSimulator] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const [simulated, setSimulated] = useState<SimulatedCallResult | null>(null)
  const [simulateError, setSimulateError] = useState<string | null>(null)
  const [customAudioUrl, setCustomAudioUrl] = useState('')
  const [simulateLanguage, setSimulateLanguage] = useState<SimulateLanguage>('unspecified')

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
      refreshSummary()
    } catch (err) {
      setSimulateError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSimulating(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" description="Live overview of every complaint" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" description="Live overview of every complaint" />
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      </div>
    )
  }

  if (!summary) return null

  const s = summary.by_status
  const active = (s.open ?? 0) + (s.in_progress ?? 0)
  const attention = (s.needs_review ?? 0) + (s.processing ?? 0)
  const kpis = [
    { label: 'Total complaints', value: summary.total_complaints, detail: `${s.spam ?? 0} flagged as spam`, icon: Inbox, href: '/admin/complaints' },
    { label: 'With departments', value: active, detail: `${s.open ?? 0} open · ${s.in_progress ?? 0} in progress`, icon: Clock, href: '/admin/complaints' },
    { label: 'Need a person', value: attention, detail: `${s.needs_review ?? 0} to review · ${s.processing ?? 0} with the AI`, icon: AlertTriangle, href: '/admin/needs-review', warn: (s.needs_review ?? 0) > 0 },
    {
      label: 'Resolved',
      value: s.resolved ?? 0,
      detail: summary.avg_resolution_hours != null ? `in ${summary.avg_resolution_hours} h on average` : 'none yet',
      icon: CheckCircle2,
      href: '/admin/complaints',
    },
  ]
  const statusTotal = STATUS_BAR.reduce((n, st) => n + (s[st.key] ?? 0), 0)

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Live overview of every complaint · updates every 10 seconds">
        <Button variant="outline" size="sm" onClick={() => setShowSimulator((v) => !v)}>
          <PhoneCall size={14} />
          Test call
        </Button>
      </PageHeader>

      {showSimulator && (
        <Card>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Send a sample recording through the full pipeline. Leave the URL empty for a random sample call.
            </p>
            <div className="flex flex-wrap gap-2">
              <Input
                className="min-w-0 flex-1 sm:max-w-sm"
                placeholder="Custom audio URL (optional)"
                aria-label="Custom audio URL for simulated test call"
                value={customAudioUrl}
                onChange={(e) => setCustomAudioUrl(e.target.value)}
                disabled={simulating}
              />
              <Select
                items={SIMULATE_LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
                value={simulateLanguage}
                onValueChange={(v: string | null) =>
                  setSimulateLanguage(
                    SIMULATE_LANGUAGES.find((l) => l.code === v)?.code ?? 'unspecified'
                  )
                }
              >
                <SelectTrigger className="w-48" aria-label="Language hint for simulated test call" disabled={simulating}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SIMULATE_LANGUAGES.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleSimulateCall} disabled={simulating}>
                <PhoneCall size={14} />
                {simulating ? 'Calling…' : 'Send test call'}
              </Button>
            </div>
            {simulated && (
              <p className="text-sm text-muted-foreground">
                Registered as{' '}
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
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {kpis.map((k) => (
          <Link key={k.label} href={k.href} className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardContent className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">{k.label}</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{k.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground sm:truncate">{k.detail}</p>
                </div>
                <span
                  className={
                    k.warn
                      ? 'hidden size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 sm:flex'
                      : 'hidden size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground sm:flex'
                  }
                >
                  <k.icon size={18} />
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Where complaints stand</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex h-3 overflow-hidden rounded-full bg-muted">
            {statusTotal > 0 &&
              STATUS_BAR.map((st) =>
                s[st.key] ? (
                  <div
                    key={st.key}
                    className={st.color}
                    style={{ width: `${((s[st.key] ?? 0) / statusTotal) * 100}%` }}
                    title={`${st.label}: ${s[st.key]}`}
                  />
                ) : null
              )}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {STATUS_BAR.map((st) => (
              <Link
                key={st.key}
                href={`/admin/complaints?status=${st.key}`}
                className="flex items-center gap-2 text-sm hover:underline"
              >
                <span className={`size-2.5 rounded-full ${st.color}`} />
                <span className="text-muted-foreground">{st.label}</span>
                <span className="font-semibold tabular-nums">{s[st.key] ?? 0}</span>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <SystemHealthCard />

      <div className="grid gap-6 lg:grid-cols-2">
        <BarList title="By department" rows={summary.by_department.map((d) => ({ label: d.department_name, count: d.count }))} empty="No department data yet." />
        <BarList title="By category" rows={summary.by_category.map((c) => ({ label: c.category.replace(/_/g, ' '), count: c.count }))} empty="No category data yet." />
      </div>
    </div>
  )
}

const STATUS_BAR = [
  { key: 'processing', label: 'With the AI', color: 'bg-slate-400' },
  { key: 'needs_review', label: 'Needs review', color: 'bg-amber-400' },
  { key: 'open', label: 'Open', color: 'bg-sky-500' },
  { key: 'in_progress', label: 'In progress', color: 'bg-orange-400' },
  { key: 'resolved', label: 'Resolved', color: 'bg-emerald-500' },
  { key: 'spam', label: 'Spam', color: 'bg-red-400' },
]

function BarList({ title, rows, empty }: { title: string; rows: { label: string; count: number }[]; empty: string }) {
  const sorted = [...rows].sort((a, b) => b.count - a.count)
  const max = sorted[0]?.count || 1
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="space-y-3">
            {sorted.map((r) => (
              <li key={r.label}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate capitalize">{r.label}</span>
                  <span className="font-medium tabular-nums">{r.count}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary/80" style={{ width: `${(r.count / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
