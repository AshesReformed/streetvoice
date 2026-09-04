import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'

interface DashboardCardItem {
  label: string
  value: number | string
  description?: string
}

export function DashboardCards({ items }: { items: DashboardCardItem[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label} size="sm">
          <CardHeader>
            <CardDescription>{item.label}</CardDescription>
            <CardTitle className="text-2xl font-semibold">
              {item.value}
            </CardTitle>
          </CardHeader>
          {item.description && (
            <CardContent>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  )
}
