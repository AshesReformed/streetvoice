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
    <div className="space-y-2 border-b bg-red-50 px-6 py-3" role="alert">
      {data.map((a) => (
        <div key={a.id} className="flex items-start gap-3 text-sm text-red-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p className="flex-1">
            <span className="font-semibold">{TITLES[a.kind] ?? 'Alert'}:</span> {a.message}{' '}
            <span className="text-red-700/70">{formatDistanceToNow(new Date(a.created_at))} ago</span>
          </p>
          <Button
            variant="ghost"
            size="icon-sm"
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
