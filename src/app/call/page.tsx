'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Phone, PhoneOff } from 'lucide-react'
import { blobToMp3, blobToWav } from '@/lib/audio/wav'
import { cn } from '@/lib/utils'

// ===========================================================================
// Web phone simulator: a phone-shaped page that behaves like the StreetVoice
// helpline. Voice menu in Urdu, keypad language choice, the complaint is
// recorded from the microphone and filed through the same pipeline as a
// real phone call. Lets anyone (judges included) "call" from a browser.
// ===========================================================================

const MAX_RECORDING_SECONDS = 60
const MENU_TIMEOUT_MS = 8000

const LANGUAGES: Record<string, { code: string; label: string }> = {
  '1': { code: 'ur', label: 'اردو · Urdu' },
  '2': { code: 'pa', label: 'پنجابی · Punjabi' },
  '3': { code: 'ps', label: 'پښتو · Pashto' },
  '4': { code: 'sd', label: 'سنڌي · Sindhi' },
  '5': { code: 'skr', label: 'سرائیکی · Saraiki' },
}

const CAPTIONS: Record<string, { ur: string; en: string }> = {
  welcome: {
    ur: 'اسٹریٹ وائس شکایت لائن پر کال کرنے کا شکریہ۔',
    en: 'Thank you for calling the StreetVoice complaint line.',
  },
  menu: {
    ur: 'اردو 1 · پنجابی 2 · پشتو 3 · سندھی 4 · سرائیکی 5',
    en: 'Choose your language on the keypad.',
  },
  record: {
    ur: 'بیپ کے بعد اپنی شکایت اور اپنے علاقے کا نام بتائیں۔ بات ختم ہو جائے تو # دبائیں۔',
    en: 'After the beep, describe the problem and your area. Press # when you are done.',
  },
  registered: {
    ur: 'آپ کی شکایت درج ہو گئی ہے۔',
    en: 'Your complaint has been registered.',
  },
  goodbye: {
    ur: 'یہ نمبر آپ کو ایس ایم ایس پر بھی بھیج دیا جائے گا۔ شکریہ، خدا حافظ۔',
    en: 'We will also send you this number by SMS. Thank you, goodbye.',
  },
  error: {
    ur: 'معذرت، آپ کی شکایت درج نہیں ہو سکی۔ براہ کرم دوبارہ کال کریں۔',
    en: 'Sorry, your complaint could not be filed. Please call again.',
  },
}

type Phase = 'idle' | 'connecting' | 'menu' | 'recording' | 'sending' | 'done' | 'error'

class HungUp extends Error {}

/** Refused by the server (spam guard): carries the bilingual message. */
class Refused extends Error {
  constructor(public caption: { ur: string; en: string }) {
    super(caption.en)
  }
}

/** Compress to MP3 (about 8x smaller); fall back to WAV if encoding fails. */
async function compress(recording: Blob): Promise<{ blob: Blob; name: string }> {
  try {
    return { blob: await blobToMp3(recording), name: 'call.mp3' }
  } catch (err) {
    console.warn('MP3 encoding failed, sending WAV:', err)
    return { blob: await blobToWav(recording), name: 'call.wav' }
  }
}

export default function CallPage() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [caption, setCaption] = useState<{ ur: string; en: string } | null>(null)
  const [phone, setPhone] = useState('')
  const [language, setLanguage] = useState<string | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [trackingId, setTrackingId] = useState<string | null>(null)
  const [errorText, setErrorText] = useState<string | null>(null)

  // Live call plumbing, kept out of React state
  const hungUp = useRef(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const keyWaiter = useRef<((key: string) => void) | null>(null)

  const releaseMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  // Stop everything if the page is closed mid-call
  useEffect(() => {
    return () => {
      hungUp.current = true
      audioRef.current?.pause()
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
      releaseMic()
    }
  }, [releaseMic])

  // Recording timer, with an automatic stop at the limit
  useEffect(() => {
    if (phase !== 'recording') return
    const started = Date.now()
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - started) / 1000)
      setSeconds(elapsed)
      if (elapsed >= MAX_RECORDING_SECONDS && recorderRef.current?.state === 'recording') {
        recorderRef.current.stop()
      }
    }, 250)
    return () => clearInterval(timer)
  }, [phase])

  function checkLine() {
    if (hungUp.current) throw new HungUp()
  }

  /** Play one prompt from /prompts/ur/; a missing file just shows the caption briefly. */
  function playPrompt(name: string): Promise<void> {
    checkLine()
    return new Promise((resolve) => {
      const audio = new Audio(`/prompts/ur/${name}.wav`)
      audioRef.current = audio
      const done = () => resolve()
      audio.onended = done
      audio.onerror = () => setTimeout(done, name.length === 1 ? 300 : 2500)
      audio.play().catch(() => setTimeout(done, 2500))
    })
  }

  function beep(): Promise<void> {
    return new Promise((resolve) => {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = 1000
      gain.gain.value = 0.2
      osc.connect(gain).connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.35)
      osc.onended = () => {
        ctx.close()
        resolve()
      }
    })
  }

  /** Resolve with the next keypad press, or null after `ms`. */
  function waitForKey(ms: number): Promise<string | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        keyWaiter.current = null
        resolve(null)
      }, ms)
      keyWaiter.current = (key) => {
        clearTimeout(timer)
        keyWaiter.current = null
        resolve(key)
      }
    })
  }

  function record(stream: MediaStream): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const recorder = new MediaRecorder(stream)
      const chunks: Blob[] = []
      recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType }))
      recorder.onerror = () => reject(new Error('Recording failed'))
      recorderRef.current = recorder
      recorder.start()
    })
  }

  async function startCall() {
    hungUp.current = false
    setErrorText(null)
    setTrackingId(null)
    setLanguage(null)
    setSeconds(0)
    setPhase('connecting')
    setCaption(null)

    try {
      // Ask for the microphone first, while the user's tap still counts
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true })
      checkLine()

      setCaption(CAPTIONS.welcome)
      await playPrompt('welcome')

      // Language menu: one key, or carry on without (the AI detects it)
      setPhase('menu')
      setCaption(CAPTIONS.menu)
      // The menu keeps playing while we listen for a key (a press cuts it off)
      void playPrompt('menu')
      const key = await waitForKey(MENU_TIMEOUT_MS + 6000)
      audioRef.current?.pause()
      checkLine()
      const choice = key ? LANGUAGES[key] : undefined
      if (choice) setLanguage(choice.code)

      setCaption(CAPTIONS.record)
      await playPrompt('record')
      checkLine()
      await beep()

      setSeconds(0)
      setPhase('recording')
      const recording = await record(streamRef.current)
      releaseMic()
      checkLine()

      // File it through the real pipeline
      setPhase('sending')
      setCaption(null)
      const audio = await compress(recording)
      const form = new FormData()
      form.append('audio', audio.blob, audio.name)
      if (choice) form.append('language', choice.code)
      if (phone.trim()) form.append('phone', phone.trim())
      const res = await fetch('/api/simulator/call', { method: 'POST', body: form })
      const json = await res.json().catch(() => ({}))
      if (!res.ok && json.error_ur) throw new Refused({ ur: json.error_ur, en: json.error })
      if (!res.ok) throw new Error(json.error || 'Could not file the complaint')
      checkLine()

      const id: string = json.data.tracking_id
      setTrackingId(id)
      setPhase('done')
      setCaption(CAPTIONS.registered)
      await playPrompt('registered')
      for (const digit of id) await playPrompt(digit)
      setCaption(CAPTIONS.goodbye)
      await playPrompt('goodbye')
    } catch (err) {
      releaseMic()
      if (err instanceof HungUp) return
      const message =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone access was blocked. Allow it in your browser and call again.'
          : err instanceof Error
            ? err.message
            : 'Something went wrong'
      setPhase('error')
      if (err instanceof Refused) {
        // Spam guard: show why instead of the generic apology
        setErrorText(null)
        setCaption(err.caption)
        return
      }
      setErrorText(message)
      setCaption(CAPTIONS.error)
      await playPrompt('error').catch(() => undefined)
    }
  }

  function hangUp() {
    hungUp.current = true
    audioRef.current?.pause()
    keyWaiter.current?.('')
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    releaseMic()
    setPhase('idle')
    setCaption(null)
  }

  function pressKey(key: string) {
    if (phase === 'recording' && key === '#') {
      recorderRef.current?.stop()
      return
    }
    keyWaiter.current?.(key)
  }

  const inCall = phase !== 'idle' && phase !== 'done' && phase !== 'error'

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-100 px-4 py-8 dark:bg-zinc-950">
      <div className="w-full max-w-[340px] space-y-4">
        <div className="rounded-[2.5rem] border-8 border-zinc-900 bg-zinc-900 shadow-2xl">
          <div className="flex min-h-[600px] flex-col rounded-[2rem] bg-gradient-to-b from-emerald-950 to-zinc-950 p-6 text-white">
            {/* Header */}
            <div className="text-center">
              <p className="text-xs uppercase tracking-widest text-emerald-300/80">StreetVoice</p>
              <p className="mt-1 text-lg font-semibold">شکایت لائن · Complaint Line</p>
              <p className="mt-1 h-5 text-sm text-emerald-200/80">
                {phase === 'idle' && 'Tap the green button to call'}
                {phase === 'connecting' && 'Connecting…'}
                {phase === 'menu' && 'Choose a language'}
                {phase === 'recording' && `● Recording ${seconds}s / ${MAX_RECORDING_SECONDS}s`}
                {phase === 'sending' && 'Filing your complaint…'}
                {phase === 'done' && 'Call complete'}
                {phase === 'error' && 'Call failed'}
              </p>
            </div>

            {/* Screen */}
            <div className="mt-4 flex flex-1 flex-col justify-center gap-3 text-center">
              {phase === 'idle' && (
                <div className="space-y-2 text-left">
                  <label htmlFor="phone" className="flex justify-between text-xs text-emerald-100/80">
                    <span>Calling from</span>
                    <span dir="rtl">آپ کا موبائل نمبر</span>
                  </label>
                  <input
                    id="phone"
                    inputMode="tel"
                    placeholder="03xx xxxxxxx"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-lg bg-white/10 px-3 py-2 text-center font-mono text-lg tracking-wider outline-none placeholder:text-white/30 focus:ring-2 focus:ring-emerald-400"
                  />
                  <p className="text-[11px] leading-snug text-white/50">
                    On a real phone line your number is detected automatically (caller ID). In this browser
                    demo, type it to get SMS updates.
                  </p>
                </div>
              )}

              {caption && (
                <div className="space-y-1">
                  <p dir="rtl" className="text-lg leading-relaxed">{caption.ur}</p>
                  <p className="text-xs text-white/60">{caption.en}</p>
                </div>
              )}

              {language && phase !== 'done' && (
                <p className="text-sm text-emerald-300">
                  {Object.values(LANGUAGES).find((l) => l.code === language)?.label}
                </p>
              )}

              {phase === 'recording' && (
                <div className="mx-auto size-16 animate-pulse rounded-full bg-red-500/80" aria-hidden />
              )}

              {phase === 'done' && trackingId && (
                <div className="space-y-2">
                  <p className="text-xs text-white/60">شکایت نمبر · Complaint number</p>
                  <p className="font-mono text-4xl font-bold tracking-[0.3em]">{trackingId}</p>
                  {!phone.trim() && (
                    <p className="text-xs text-white/50">No number given, so no SMS updates.</p>
                  )}
                  <Link
                    href={`/track/${trackingId}`}
                    className="inline-block rounded-full bg-white/10 px-4 py-1.5 text-sm hover:bg-white/20"
                  >
                    Track this complaint →
                  </Link>
                </div>
              )}

              {phase === 'error' && errorText && <p className="text-sm text-red-300">{errorText}</p>}
            </div>

            {/* Keypad */}
            <div className="mt-4 grid grid-cols-3 gap-3">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => pressKey(key)}
                  disabled={!inCall}
                  className={cn(
                    'h-12 rounded-full bg-white/10 text-xl font-medium transition active:scale-95 disabled:opacity-40',
                    phase === 'menu' && LANGUAGES[key] && 'bg-emerald-500/30',
                    phase === 'recording' && key === '#' && 'bg-red-500/40'
                  )}
                >
                  {key}
                </button>
              ))}
            </div>

            {/* Call / hang up */}
            <div className="mt-5 flex justify-center">
              {inCall ? (
                <button
                  type="button"
                  onClick={hangUp}
                  aria-label="Hang up"
                  className="flex size-16 items-center justify-center rounded-full bg-red-600 shadow-lg transition active:scale-95"
                >
                  <PhoneOff />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startCall}
                  aria-label="Call"
                  className="flex size-16 items-center justify-center rounded-full bg-emerald-500 shadow-lg transition active:scale-95"
                >
                  <Phone />
                </button>
              )}
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          A demo of the StreetVoice phone line in your browser. Your recording is sent to the AI and filed as a
          real complaint.
        </p>
      </div>
    </div>
  )
}
