'use client'

import { useCallback, useEffect, useState } from 'react'

interface ApiState<T> {
  url: string | null
  data: T | null
  error: string | null
}

/**
 * GET a JSON endpoint that responds with `{ data }` and keep the result in
 * state. Refetches whenever `url` changes, or when `reload()` is called
 * (e.g. after a mutation). `loading` is true until the current URL has
 * answered once; a reload keeps showing the previous data meanwhile.
 * Pass `null` to skip fetching.
 */
export function useApi<T>(url: string | null) {
  const [state, setState] = useState<ApiState<T>>({ url: null, data: null, error: null })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!url) return
    let ignore = false

    fetch(url)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`)
        return json.data as T
      })
      .then(
        (data) => {
          if (!ignore) setState({ url, data, error: null })
        },
        (err: unknown) => {
          if (!ignore) {
            setState({
              url,
              data: null,
              error: err instanceof Error ? err.message : 'Unknown error',
            })
          }
        }
      )

    return () => {
      ignore = true
    }
  }, [url, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  return {
    data: state.data,
    error: state.error,
    loading: url !== null && state.url !== url,
    reload,
  }
}
