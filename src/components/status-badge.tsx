import { Badge } from '@/components/ui/badge'

const statusConfig: Record<string, { label: string; className: string }> = {
  processing: {
    label: 'Processing',
    className: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  needs_review: {
    label: 'Needs Review',
    className: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  open: {
    label: 'Open',
    className: 'bg-sky-100 text-sky-800 border-sky-200',
  },
  in_progress: {
    label: 'In Progress',
    className: 'bg-orange-100 text-orange-800 border-orange-200',
  },
  resolved: {
    label: 'Resolved',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  spam: {
    label: 'Spam',
    className: 'bg-red-100 text-red-800 border-red-200',
  },
}

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || {
    label: status,
    className: 'bg-muted text-muted-foreground border-border',
  }

  return (
    <Badge variant="outline" className={`gap-1.5 rounded-full border-transparent px-2 font-medium ${config.className}`}>
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {config.label}
    </Badge>
  )
}
