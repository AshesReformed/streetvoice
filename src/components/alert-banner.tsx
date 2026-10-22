'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { AlertTriangle, X } from 'lucide-react'
import { useApi } from '@/lib/hooks/use-api'
import { Button } from '@/components/ui/button'

// Open alarms (floods, repeat callers, area spikes, AI backlog, failing
// SMS) as red banners on every control-room page. Checked every 15 s.

interface SystemAlert {
  id: string
  kind: string
  message: string
  created_at: string
}

const TITLES: Record<string, string> = {
  flood: 'Call flood',
  repeat_caller: 'Repeat caller',
  area_spike: 'Spike in one area',
  ai_backlog: 'AI backlog',
  sms_failing: 'SMS failing',
}

export function AlertBanner() {
  const { data, reload } = useApi<SystemAlert[]>('/api/admin/alerts', { refreshMs: 15_000 })
  const [dismissing, setDismissing] = useState<string | null>(null)

  async function dismiss(id: string) {
    setDismissing(id)
    try {
      await fetch(`/api/admin/alerts/${id}`, { method: 'PATCH' })
      reload()
    } finally {
      setDismissing(null)
    }
  }

  if (!data?.length) return null

  return (
    <div className="space-y-2 border-b border-red-200 bg-red-50/80 px-4 py-2.5 sm:px-6 lg:px-8" role="alert">
      {data.map((a) => (
        <div key={a.id} className="flex items-start gap-3 text-sm text-red-900">
          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
            <AlertTriangle size={12} strokeWidth={2.5} />
          </span>
          <p className="min-w-0 flex-1 leading-relaxed">
            <span className="font-semibold">{TITLES[a.kind] ?? 'Alert'}</span>
            <span className="text-red-900/50"> · {formatDistanceToNow(new Date(a.created_at))} ago</span>
            <span className="block text-red-900/80 sm:inline sm:before:content-['_—_']">{a.message}</span>
          </p>
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-red-900/60 hover:bg-red-100 hover:text-red-900"
            aria-label="Dismiss alert"
            disabled={dismissing === a.id}
            onClick={() => dismiss(a.id)}
          >
            <X size={14} />
          </Button>
        </div>
      ))}
    </div>
  )
}
