import { Badge } from '@/components/ui/badge'

const statusConfig: Record<string, { label: string; className: string }> = {
  needs_review: {
    label: 'Needs Review',
    className: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  open: {
    label: 'Open',
    className: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  in_progress: {
    label: 'In Progress',
    className: 'bg-orange-100 text-orange-800 border-orange-200',
  },
  resolved: {
    label: 'Resolved',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
}

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || {
    label: status,
    className: 'bg-muted text-muted-foreground border-border',
  }

  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  )
}
