import { format } from 'date-fns'
import { StatusBadge } from './status-badge'
import type { StatusHistory } from '@/lib/types'

export function StatusTimeline({ entries }: { entries: StatusHistory[] }) {
  const sorted = [...entries].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  if (sorted.length === 0) {
    return <p className="text-sm text-muted-foreground">No status history yet.</p>
  }

  return (
    <div className="relative space-y-0">
      {sorted.map((entry, index) => (
        <div key={entry.id} className="relative flex gap-4 pb-6">
          {/* Vertical line */}
          {index < sorted.length - 1 && (
            <div className="absolute left-[7px] top-4 bottom-0 w-px bg-border" />
          )}
          {/* Dot */}
          <div className="relative mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-background bg-muted-foreground ring-2 ring-muted" />
          {/* Content */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <StatusBadge status={entry.status} />
              <span className="text-xs text-muted-foreground">
                {format(new Date(entry.created_at), 'MMM d, yyyy h:mm a')}
              </span>
            </div>
            {entry.remark && (
              <p className="text-sm text-foreground">{entry.remark}</p>
            )}
            {entry.officer && (
              <p className="text-xs text-muted-foreground">
                by {entry.officer.full_name}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
