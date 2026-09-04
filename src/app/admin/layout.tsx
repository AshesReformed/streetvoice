'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { signOut } from '@/app/login/actions'
import {
  LayoutDashboard,
  FileText,
  AlertTriangle,
  Building2,
  Users,
  ClipboardList,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const NAV_LINKS = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/complaints', label: 'All Complaints', icon: FileText },
  { href: '/admin/needs-review', label: 'Needs Review', icon: AlertTriangle },
  { href: '/admin/departments', label: 'Departments', icon: Building2 },
  { href: '/admin/officers', label: 'Officers', icon: Users },
  { href: '/admin/audit-log', label: 'Audit Log', icon: ClipboardList },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [officerName, setOfficerName] = useState<string>('Admin')

  useEffect(() => {
    async function fetchOfficer() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase
          .from('officers')
          .select('full_name')
          .eq('id', user.id)
          .single()
        if (data?.full_name) setOfficerName(data.full_name)
      }
    }
    fetchOfficer()
  }, [])

  function isActive(href: string) {
    if (href === '/admin') return pathname === '/admin'
    return pathname.startsWith(href)
  }

  async function handleSignOut() {
    await signOut()
  }

  return (
    <div className="flex h-screen overflow-hidden bg-muted/30">
      {/* Sidebar */}
      <aside className="flex w-60 shrink-0 flex-col border-r bg-card">
        <div className="flex h-14 items-center border-b px-4">
          <Link href="/admin" className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-bold">
              SV
            </div>
            <span className="font-semibold text-sm">StreetVoice</span>
          </Link>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 p-2">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors',
                isActive(href)
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              )}
            >
              <Icon size={16} />
              {label}
            </Link>
          ))}
        </nav>

        <div className="border-t p-3">
          <div className="mb-2 flex items-center gap-2 px-1">
            <div className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
              {officerName.charAt(0).toUpperCase()}
            </div>
            <span className="truncate text-sm text-foreground">{officerName}</span>
          </div>
          <form action={handleSignOut}>
            <Button type="submit" variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground">
              <LogOut size={14} />
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </main>
    </div>
  )
}
