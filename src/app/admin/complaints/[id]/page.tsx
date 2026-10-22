'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { PriorityBadge } from '@/components/priority-badge'
import { StatusTimeline } from '@/components/status-timeline'
import { SmsLog } from '@/components/sms-log'
import { CallerCard } from '@/components/caller-card'
import { LinkedReports } from '@/components/linked-reports'
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
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, Save } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Complaint, StatusHistory, Department } from '@/lib/types'

const STATUSES = ['needs_review', 'open', 'in_progress', 'resolved']
const STATUS_LABELS: Record<string, string> = {
  needs_review: 'Needs review',
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
}

export default function ComplaintDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [complaint, setComplaint] = useState<Complaint | null>(null)
  const [statusHistory, setStatusHistory] = useState<StatusHistory[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Re-route state
  const [selectedDeptId, setSelectedDeptId] = useState('')
  const [rerouting, setRerouting] = useState(false)
  const [rerouteMsg, setRerouteMsg] = useState('')

  // Status update state
  const [newStatus, setNewStatus] = useState('')
  const [remark, setRemark] = useState('')
  const [updating, setUpdating] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')

  useEffect(() => {
    async function fetchAll() {
      try {
        const supabase = createClient()

        // Fetch complaint with related data
        const { data: comp, error: compErr } = await supabase
          .from('complaints')
          .select('*, department:departments(name)')
          .eq('id', id)
          .single()

        if (compErr || !comp) throw new Error(compErr?.message || 'Complaint not found')
        setComplaint(comp as unknown as Complaint)
        setSelectedDeptId(comp.department_id || '')

        // Fetch status history
        const { data: history } = await supabase
          .from('status_history')
          .select('*, officer:officers(full_name)')
          .eq('complaint_id', id)
          .order('created_at', { ascending: false })

        setStatusHistory((history || []) as unknown as StatusHistory[])

        // Fetch departments for re-route
        const { data: depts } = await supabase
          .from('departments')
          .select('*')
          .order('name')

        setDepartments((depts || []) as Department[])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [id])

  async function refreshComplaint() {
    const supabase = createClient()
    const { data: comp } = await supabase
      .from('complaints')
      .select('*, department:departments(name)')
      .eq('id', id)
      .single()
    if (comp) setComplaint(comp as unknown as Complaint)
    const { data: history } = await supabase
      .from('status_history')
      .select('*, officer:officers(full_name)')
      .eq('complaint_id', id)
      .order('created_at', { ascending: false })
    setStatusHistory((history || []) as unknown as StatusHistory[])
  }

  async function handleReroute() {
    if (!selectedDeptId || !complaint) return
    setRerouting(true)
    setRerouteMsg('')
    try {
      const res = await fetch(`/api/complaints/${complaint.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ department_id: selectedDeptId }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Failed to reroute')
      }
      setRerouteMsg('Department updated successfully.')
      // Refresh complaint
      const supabase = createClient()
      const { data } = await supabase
        .from('complaints')
        .select('*, department:departments(name)')
        .eq('id', id)
        .single()
      if (data) setComplaint(data as unknown as Complaint)
    } catch (err) {
      setRerouteMsg(err instanceof Error ? err.message : 'Error')
    } finally {
      setRerouting(false)
    }
  }

  async function handleStatusUpdate() {
    if (!newStatus || !complaint || newStatus === complaint.status) return
    setUpdating(true)
    setStatusMsg('')
    try {
      const res = await fetch(`/api/complaints/${complaint.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          remark: remark || undefined,
        }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Failed to update status')
      }
      setStatusMsg('Status updated.')
      setRemark('')

      // Refresh data
      const supabase = createClient()
      const { data: comp } = await supabase
        .from('complaints')
        .select('*, department:departments(name)')
        .eq('id', id)
        .single()
      if (comp) setComplaint(comp as unknown as Complaint)

      const { data: history } = await supabase
        .from('status_history')
        .select('*, officer:officers(full_name)')
        .eq('complaint_id', id)
        .order('created_at', { ascending: false })
      setStatusHistory((history || []) as unknown as StatusHistory[])
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Error')
    } finally {
      setUpdating(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Loading..." />
        <div className="h-40 rounded-xl bg-muted animate-pulse" />
      </div>
    )
  }

  if (error || !complaint) {
    return (
      <div className="space-y-6">
        <PageHeader title="Error" />
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error || 'Complaint not found'}
        </div>
        <Button variant="outline" onClick={() => router.push('/admin/complaints')}>
          <ArrowLeft size={14} /> Back
        </Button>
      </div>
    )
  }

  const transcripts = [
    { key: 'en', label: 'English', text: complaint.transcript_english, rtl: false },
    { key: 'ur', label: 'Urdu', text: complaint.transcript_urdu, rtl: true },
    { key: 'regional', label: 'As spoken', text: complaint.transcript_regional, rtl: true },
  ].filter((t) => t.text)

  const facts = [
    { label: 'Department', value: complaint.department?.name || 'Unassigned' },
    { label: 'Area', value: complaint.area || '—' },
    { label: 'Category', value: complaint.category?.replace(/_/g, ' ') || '—' },
    { label: 'Language', value: complaint.language?.toUpperCase() || '—' },
    {
      label: 'AI confidence',
      value: complaint.confidence_score != null ? `${Math.round(complaint.confidence_score * 100)}%` : '—',
    },
    {
      label: 'Sent to department',
      value: complaint.dispatched_at ? format(new Date(complaint.dispatched_at), 'MMM d, h:mm a') : 'Not yet',
    },
  ]
  if (complaint.reminded_at || complaint.escalated_at) {
    facts.push({
      label: 'Follow-up',
      value: complaint.escalated_at
        ? `Escalated ${format(new Date(complaint.escalated_at), 'MMM d')}`
        : `Reminded ${format(new Date(complaint.reminded_at!), 'MMM d, h:mm a')}`,
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/complaints"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} /> All complaints
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="font-mono text-2xl font-semibold tracking-tight sm:text-3xl">{complaint.tracking_id}</h1>
          <StatusBadge status={complaint.status} />
          <PriorityBadge priority={complaint.priority} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Filed {format(new Date(complaint.created_at), 'MMM d, yyyy · h:mm a')}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: details */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardContent className="space-y-5">
              {complaint.status === 'spam' && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                  Flagged as spam: {complaint.spam_reason || 'not a genuine complaint'}. Not sent to any department.
                </p>
              )}
              {complaint.review_reason && complaint.status === 'needs_review' && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Held for review: {complaint.review_reason}
                </p>
              )}
              <div className="space-y-2">
                <p className="text-lg leading-snug font-medium">
                  {complaint.summary || (complaint.status === 'processing' ? 'The AI is still listening to this call…' : 'No summary')}
                </p>
                {complaint.summary_urdu && (
                  <p dir="rtl" className="text-lg leading-loose text-muted-foreground">
                    {complaint.summary_urdu}
                  </p>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t pt-5 text-sm sm:grid-cols-3">
                {facts.map((f) => (
                  <div key={f.label}>
                    <dt className="text-xs text-muted-foreground">{f.label}</dt>
                    <dd className="mt-0.5 font-medium capitalize">{f.value}</dd>
                  </div>
                ))}
              </dl>
              {complaint.audio_url && (
                <div className="rounded-lg bg-muted/60 p-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Call recording</p>
                  <audio controls src={`/api/complaints/${complaint.id}/recording`} className="w-full" preload="none" />
                </div>
              )}
            </CardContent>
          </Card>

          <LinkedReports complaint={complaint} />

          {transcripts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>What the caller said</CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue={transcripts[0].key}>
                  <TabsList>
                    {transcripts.map((t) => (
                      <TabsTrigger key={t.key} value={t.key}>
                        {t.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {transcripts.map((t) => (
                    <TabsContent key={t.key} value={t.key}>
                      <p
                        dir={t.rtl ? 'rtl' : undefined}
                        className={t.rtl ? 'mt-3 rounded-lg bg-muted/50 p-4 text-base leading-loose' : 'mt-3 rounded-lg bg-muted/50 p-4 text-sm leading-relaxed'}
                      >
                        {t.text}
                      </p>
                    </TabsContent>
                  ))}
                </Tabs>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>History</CardTitle>
              </CardHeader>
              <CardContent>
                <StatusTimeline entries={statusHistory} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>SMS</CardTitle>
              </CardHeader>
              <CardContent>
                <SmsLog complaintId={complaint.id} />
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Right: actions */}
        <div className="space-y-6">
          <CallerCard complaintId={complaint.id} status={complaint.status} onChanged={refreshComplaint} />

          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Send to department</label>
                <Select
                  items={departments.map((d) => ({ value: d.id, label: d.name }))}
                  value={selectedDeptId}
                  onValueChange={(v: string | null) => setSelectedDeptId(v ?? '')}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={rerouting || !selectedDeptId || selectedDeptId === complaint.department_id}
                  onClick={handleReroute}
                >
                  <Save size={14} />
                  {rerouting ? 'Saving…' : 'Re-route'}
                </Button>
                {rerouteMsg && <p className="text-xs text-muted-foreground">{rerouteMsg}</p>}
              </div>

              <div className="space-y-2 border-t pt-5">
                <label className="text-xs font-medium text-muted-foreground">Change status</label>
                <Select
                  items={STATUSES.map((st) => ({ value: st, label: STATUS_LABELS[st] }))}
                  value={newStatus}
                  onValueChange={(v: string | null) => setNewStatus(v ?? '')}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((st) => (
                      <SelectItem key={st} value={st}>
                        {STATUS_LABELS[st]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Remark (optional)"
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                />
                <Button
                  className="w-full"
                  disabled={updating || !newStatus || newStatus === complaint.status}
                  onClick={handleStatusUpdate}
                >
                  {updating ? 'Updating…' : 'Update status'}
                </Button>
                {statusMsg && <p className="text-xs text-muted-foreground">{statusMsg}</p>}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
