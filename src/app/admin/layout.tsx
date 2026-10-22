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
  MessageSquare,
  LogOut,
  ShieldAlert,
  Menu,
  Mic,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AlertBanner } from '@/components/alert-banner'

const NAV_GROUPS = [
  {
    label: 'Complaints',
    links: [
      { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/admin/complaints', label: 'All complaints', icon: FileText },
      { href: '/admin/needs-review', label: 'Needs review', icon: AlertTriangle },
      { href: '/admin/flagged', label: 'Flagged', icon: ShieldAlert },
    ],
  },
  {
    label: 'Operations',
    links: [
      { href: '/admin/sms', label: 'SMS', icon: MessageSquare },
      { href: '/admin/departments', label: 'Departments', icon: Building2 },
      { href: '/admin/officers', label: 'Officers', icon: Users },
      { href: '/admin/audit-log', label: 'Audit log', icon: ClipboardList },
    ],
  },
]

function Logo() {
  return (
    <Link href="/admin" className="flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
        <Mic size={16} strokeWidth={2.5} />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold text-white">StreetVoice</span>
        <span className="block text-[11px] text-sidebar-foreground/60">Control room</span>
      </span>
    </Link>
  )
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [officerName, setOfficerName] = useState<string>('Admin')
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPath, setMenuPath] = useState(pathname)

  // Close the phone menu after navigating
  if (menuPath !== pathname) {
    setMenuPath(pathname)
    setMenuOpen(false)
  }

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

  const sidebar = (
    <>
      <div className="flex h-16 items-center px-5">
        <Logo />
      </div>

      <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 px-3 text-[11px] font-medium tracking-wider text-sidebar-foreground/45 uppercase">
              {group.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {group.links.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                    isActive(href)
                      ? 'bg-sidebar-accent font-medium text-white'
                      : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-white'
                  )}
                >
                  <Icon size={17} className={isActive(href) ? 'text-sidebar-primary' : undefined} />
                  {label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="flex size-8 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-white">
            {officerName.charAt(0).toUpperCase()}
          </div>
          <span className="flex-1 truncate text-sm text-white">{officerName}</span>
          <form action={handleSignOut}>
            <button
              type="submit"
              aria-label="Sign out"
              title="Sign out"
              className="rounded-md p-1.5 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-white"
            >
              <LogOut size={16} />
            </button>
          </form>
        </div>
      </div>
    </>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar: fixed on large screens, a slide-in menu on phones */}
      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground lg:flex">{sidebar}</aside>
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="relative flex h-full w-72 max-w-[85%] flex-col bg-sidebar text-sidebar-foreground shadow-xl">
            <button
              aria-label="Close menu"
              className="absolute top-4 right-3 rounded-md p-1.5 text-sidebar-foreground/70 hover:text-white"
              onClick={() => setMenuOpen(false)}
            >
              <X size={18} />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main content */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-sidebar px-4 text-sidebar-foreground lg:hidden">
          <button
            aria-label="Open menu"
            className="rounded-md p-1.5 hover:bg-sidebar-accent"
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={20} />
          </button>
          <Logo />
        </header>
        <AlertBanner />
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
        </div>
      </main>
    </div>
  )
}
