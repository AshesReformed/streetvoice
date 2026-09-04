'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
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
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { ArrowLeft } from 'lucide-react'
import type { Complaint, StatusHistory } from '@/lib/types'

interface ComplaintDetail extends Omit<Complaint, 'department'> {
  department?: { name: string } | null
  status_history?: (StatusHistory & { officer?: { full_name: string } | null })[]
}

const STATUS_OPTIONS = [
  { value: 'needs_review', label: 'Needs Review' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
]

export default function ComplaintDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [complaint, setComplaint] = useState<ComplaintDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Status update form
  const [newStatus, setNewStatus] = useState('')
  const [remark, setRemark] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    async function fetchComplaint() {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('complaints')
        .select('*, department:departments(name), status_history(*, officer:officers(full_name))')
        .eq('id', id)
        .single()

      if (error) {
        setError(error.message)
      } else {
        setComplaint(data as ComplaintDetail)
        setNewStatus(data.status)
      }
      setLoading(false)
    }

    fetchComplaint()
  }, [id])

  async function handleStatusUpdate(e: React.FormEvent) {
    e.preventDefault()
    if (!newStatus || newStatus === complaint?.status) return

    setSubmitting(true)
    setSubmitMessage(null)

    try {
      const body: { status: string; remark?: string } = { status: newStatus };
      if (remark.trim()) {
        body.remark = remark.trim();
      }

      const res = await fetch(`/api/complaints/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Failed to update status')
      }

      setSubmitMessage({ type: 'success', text: 'Status updated successfully.' })
      setRemark('')

      // Refresh complaint data
      const supabase = createClient()
      const { data } = await supabase
        .from('complaints')
        .select('*, department:departments(name), status_history(*, officer:officers(full_name))')
        .eq('id', id)
        .single()
      if (data) setComplaint(data as ComplaintDetail)
    } catch (err) {
      setSubmitMessage({ type: 'error', text: err instanceof Error ? err.message : 'Something went wrong' })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    )
  }

  if (error || !complaint) {
    return (
      <div className="space-y-6">
        <PageHeader title="Complaint Not Found" />
        <div className="flex h-32 items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5">
          <p className="text-sm text-destructive">{error || 'Complaint not found.'}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => router.push('/portal/complaints')}>
          <ArrowLeft className="size-3.5" />
          Back to complaints
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => router.push('/portal/complaints')}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{complaint.tracking_id}</h1>
          <StatusBadge status={complaint.status} />
        </div>
      </div>

      {/* Info grid */}
      <Card>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Category</dt>
              <dd className="mt-0.5 text-sm font-medium">{complaint.category || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Priority</dt>
              <dd className="mt-0.5"><PriorityBadge priority={complaint.priority} /></dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Area</dt>
              <dd className="mt-0.5 text-sm font-medium">{complaint.area || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Department</dt>
              <dd className="mt-0.5 text-sm font-medium">{complaint.department?.name || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Confidence Score</dt>
              <dd className="mt-0.5 text-sm font-medium">
                {complaint.confidence_score != null ? `${(complaint.confidence_score * 100).toFixed(0)}%` : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Created</dt>
              <dd className="mt-0.5 text-sm font-medium">
                {format(new Date(complaint.created_at), 'MMM d, yyyy h:mm a')}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Audio player */}
      {complaint.audio_url && (
        <Card>
          <CardHeader>
            <CardTitle>Audio Recording</CardTitle>
          </CardHeader>
          <CardContent>
            <audio controls src={complaint.audio_url} className="w-full" preload="none">
              Your browser does not support the audio element.
            </audio>
          </CardContent>
        </Card>
      )}

      {/* Transcripts */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Regional Transcript</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {complaint.transcript_regional || 'No regional transcript available.'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Urdu Transcript</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground" dir="rtl">
              {complaint.transcript_urdu || 'No Urdu transcript available.'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>English Transcript</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {complaint.transcript_english || 'No English transcript available.'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Status update form + history */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle>Update Status</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleStatusUpdate} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">New Status</label>
                <Select value={newStatus} onValueChange={(val) => setNewStatus(val ?? '')}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select status" />
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
                <label className="text-xs font-medium text-muted-foreground">Remark</label>
                <textarea
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder="Add a note about this status change..."
                  rows={3}
                  className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </div>

              {submitMessage && (
                <div
                  className={`rounded-lg px-3 py-2 text-sm ${
                    submitMessage.type === 'success'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}
                >
                  {submitMessage.text}
                </div>
              )}

              <Button
                type="submit"
                disabled={submitting || newStatus === complaint.status}
                className="w-full"
              >
                {submitting ? 'Updating...' : 'Update Status'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Status history */}
        <Card>
          <CardHeader>
            <CardTitle>Status History</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusTimeline entries={complaint.status_history ?? []} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
