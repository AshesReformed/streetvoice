import { Badge } from '@/components/ui/badge'

const priorityConfig: Record<string, { label: string; className: string }> = {
  low: {
    label: 'Low',
    className: 'bg-slate-100 text-slate-600 border-slate-200',
  },
  medium: {
    label: 'Medium',
    className: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  high: {
    label: 'High',
    className: 'bg-red-100 text-red-800 border-red-200',
  },
}

export function PriorityBadge({ priority }: { priority: string }) {
  const config = priorityConfig[priority] || {
    label: priority,
    className: 'bg-muted text-muted-foreground border-border',
  }

  return (
    <Badge variant="outline" className={`gap-1.5 rounded-full border-transparent px-2 font-medium ${config.className}`}>
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {config.label}
    </Badge>
  )
}
