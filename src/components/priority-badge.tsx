import { Badge } from '@/components/ui/badge'

const priorityConfig: Record<string, { label: string; className: string }> = {
  low: {
    label: 'Low',
    className: 'bg-gray-100 text-gray-700 border-gray-200',
  },
  medium: {
    label: 'Medium',
    className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
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
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  )
}
