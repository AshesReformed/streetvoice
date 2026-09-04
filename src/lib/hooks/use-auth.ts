'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Officer } from '@/lib/types'

interface AuthState {
  user: { id: string; email: string } | null
  officer: Officer | null
  loading: boolean
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ user: null, officer: null, loading: true })

  useEffect(() => {
    const supabase = createClient()

    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setState({ user: null, officer: null, loading: false })
        return
      }

      const { data: officer } = await supabase
        .from('officers')
        .select('*')
        .eq('id', user.id)
        .single()

      setState({
        user: { id: user.id, email: user.email! },
        officer: officer as Officer | null,
        loading: false,
      })
    }

    loadUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      loadUser()
    })

    return () => subscription.unsubscribe()
  }, [])

  return state
}
