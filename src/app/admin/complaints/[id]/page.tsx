'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { PriorityBadge } from '@/components/priority-badge'
import { StatusTimeline } from '@/components/status-timeline'
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
import type { Complaint, StatusHistory, Department } from '@/lib/types'

const STATUSES = ['needs_review', 'open', 'in_progress', 'resolved']

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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => router.push('/admin/complaints')}>
          <ArrowLeft size={16} />
        </Button>
        <PageHeader
          title={complaint.tracking_id}
          description={`Filed ${format(new Date(complaint.created_at), 'MMM d, yyyy h:mm a')}`}
        >
          <StatusBadge status={complaint.status} />
          <PriorityBadge priority={complaint.priority} />
        </PageHeader>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: details */}
        <div className="space-y-6 lg:col-span-2">
          {/* Complaint info */}
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Category</dt>
                  <dd className="font-medium capitalize">{complaint.category?.replace(/_/g, ' ') || '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Area</dt>
                  <dd className="font-medium">{complaint.area || '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Department</dt>
                  <dd className="font-medium">{complaint.department?.name || 'Unassigned'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Confidence</dt>
                  <dd className="font-medium">
                    {complaint.confidence_score != null
                      ? `${Math.round(complaint.confidence_score * 100)}%`
                      : '—'}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Audio */}
          {complaint.audio_url && (
            <Card>
              <CardHeader>
                <CardTitle>Audio Recording</CardTitle>
              </CardHeader>
              <CardContent>
                <audio controls src={complaint.audio_url} className="w-full" />
              </CardContent>
            </Card>
          )}

          {/* Transcripts */}
          {(complaint.transcript_regional || complaint.transcript_urdu || complaint.transcript_english) && (
            <Card>
              <CardHeader>
                <CardTitle>Transcripts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {complaint.transcript_regional && (
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">Regional</p>
                      <p className="text-sm leading-relaxed rounded-lg bg-muted/50 p-3">
                        {complaint.transcript_regional}
                      </p>
                    </div>
                  )}
                  {complaint.transcript_urdu && (
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">Urdu</p>
                      <p className="text-sm leading-relaxed rounded-lg bg-muted/50 p-3" dir="rtl">
                        {complaint.transcript_urdu}
                      </p>
                    </div>
                  )}
                  {complaint.transcript_english && (
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">English</p>
                      <p className="text-sm leading-relaxed rounded-lg bg-muted/50 p-3">
                        {complaint.transcript_english}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Status Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Status History</CardTitle>
            </CardHeader>
            <CardContent>
              <StatusTimeline entries={statusHistory} />
            </CardContent>
          </Card>
        </div>

        {/* Right: actions */}
        <div className="space-y-6">
          {/* Re-route */}
          <Card>
            <CardHeader>
              <CardTitle>Re-route Complaint</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Department</label>
                  <Select value={selectedDeptId} onValueChange={(v: string | null) => setSelectedDeptId(v ?? '')}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  size="sm"
                  className="w-full"
                  disabled={rerouting || !selectedDeptId || selectedDeptId === complaint.department_id}
                  onClick={handleReroute}
                >
                  <Save size={14} />
                  {rerouting ? 'Saving...' : 'Save Department'}
                </Button>
                {rerouteMsg && (
                  <p className="text-xs text-muted-foreground">{rerouteMsg}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Status update */}
          <Card>
            <CardHeader>
              <CardTitle>Update Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">New Status</label>
                  <Select value={newStatus} onValueChange={(v: string | null) => setNewStatus(v ?? '')}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Remark</label>
                  <Input
                    placeholder="Optional remark..."
                    value={remark}
                    onChange={(e) => setRemark(e.target.value)}
                  />
                </div>
                <Button
                  size="sm"
                  className="w-full"
                  disabled={updating || !newStatus || newStatus === complaint.status}
                  onClick={handleStatusUpdate}
                >
                  {updating ? 'Updating...' : 'Update Status'}
                </Button>
                {statusMsg && (
                  <p className="text-xs text-muted-foreground">{statusMsg}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
