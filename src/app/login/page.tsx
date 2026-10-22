'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Mic } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    // Only follow same-site paths ("/admin"), never "//evil.com" or full URLs
    const requested = searchParams.get('redirect')
    const redirect =
      requested && requested.startsWith('/') && !requested.startsWith('//') ? requested : '/admin'
    router.push(redirect)
    router.refresh()
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-sidebar px-4">
      <div className="pointer-events-none absolute -top-40 -right-32 size-[520px] rounded-full bg-primary/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-48 -left-24 size-[420px] rounded-full bg-sky-500/20 blur-3xl" />
      <div className="relative w-full max-w-sm">
        <Link href="/" className="mb-6 flex items-center justify-center gap-2.5 text-white">
          <span className="flex size-9 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
            <Mic size={18} strokeWidth={2.5} />
          </span>
          <span className="text-lg font-semibold">StreetVoice</span>
        </Link>
        <Card className="shadow-2xl shadow-black/30">
          <form onSubmit={handleLogin}>
            <CardHeader>
              <CardTitle className="text-xl font-semibold">Control room</CardTitle>
              <CardDescription>Sign in to see and route complaints</CardDescription>
            </CardHeader>
            <CardContent className="mt-2 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label htmlFor="email" className="text-sm font-medium">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  className="h-10"
                  placeholder="admin@streetvoice.pk"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  className="h-10"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
              )}
            </CardContent>
            <CardFooter className="mt-4 border-t-0 bg-transparent">
              <Button type="submit" className="h-10 w-full" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in'}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-sidebar" />
      }
    >
      <LoginForm />
    </Suspense>
  )
}
