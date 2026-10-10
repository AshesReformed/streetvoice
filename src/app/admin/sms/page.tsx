'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SmsLog } from '@/components/sms-log'

export default function SmsPage() {
  // Test an incoming SMS without a phone, e.g. a department replying "482913 DONE"
  const [from, setFrom] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  async function handleSimulate(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    setResult(null)
    try {
      const res = await fetch('/api/dev/simulate-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, text }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to simulate SMS')
      setResult({ ok: true, text: `Handled as: ${json.data.action}` })
      setText('')
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : 'Something went wrong' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="SMS"
        description="Every SMS to citizens and departments, and every reply they send"
      />

      <Card>
        <CardHeader>
          <CardTitle>Test an incoming SMS</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSimulate} className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="From, e.g. a department's number"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="sm:w-56"
              required
            />
            <Input
              placeholder='Message, e.g. "482913 DONE"'
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="flex-1"
              required
            />
            <Button type="submit" disabled={sending}>
              {sending ? 'Sending...' : 'Receive'}
            </Button>
          </form>
          {result && (
            <p className={`mt-2 text-sm ${result.ok ? 'text-emerald-700' : 'text-destructive'}`}>
              {result.text}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Messages</CardTitle>
        </CardHeader>
        <CardContent>
          <SmsLog limit={100} />
        </CardContent>
      </Card>
    </div>
  )
}
