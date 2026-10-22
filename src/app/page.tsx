"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Bell, Building2, Mic, PhoneCall, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    icon: PhoneCall,
    title: "Call and speak",
    urdu: "کال کریں اور بولیں",
    text: "Describe the problem in Urdu, Punjabi, Pashto, Sindhi, Saraiki or English. No app or internet needed.",
  },
  {
    icon: Building2,
    title: "It reaches the right office",
    urdu: "صحیح محکمے تک",
    text: "Our AI understands the call and sends it by SMS to the department that can fix it.",
  },
  {
    icon: Bell,
    title: "You hear back",
    urdu: "آپ کو اطلاع ملے گی",
    text: "You get a 6-digit tracking number, and an SMS when work starts and when it's fixed.",
  },
];

export default function Home() {
  const router = useRouter();
  const [trackingId, setTrackingId] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const id = trackingId.trim();
    if (id) {
      router.push(`/track/${encodeURIComponent(id)}`);
    }
  }

  return (
    <div className="flex flex-1 flex-col bg-background">
      {/* Hero */}
      <section className="relative overflow-hidden bg-sidebar text-white">
        <div className="pointer-events-none absolute -top-40 -right-32 size-[520px] rounded-full bg-primary/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-48 -left-24 size-[420px] rounded-full bg-sky-500/20 blur-3xl" />

        <div className="relative mx-auto max-w-5xl px-5 pt-6 pb-16 sm:pb-24">
          <nav className="flex items-center justify-between">
            <span className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
                <Mic size={18} strokeWidth={2.5} />
              </span>
              <span className="text-lg font-semibold">StreetVoice</span>
            </span>
            <Link href="/login" className="text-sm text-white/70 transition-colors hover:text-white">
              Control room
            </Link>
          </nav>

          <div className="mt-14 max-w-2xl sm:mt-20">
            <p className="text-xl text-sidebar-primary">
              <span dir="rtl">آپ کی آواز، آپ کا شہر</span>
            </p>
            <h1 className="mt-3 text-4xl leading-[1.1] font-semibold tracking-tight sm:text-5xl">
              Report a civic problem with a simple phone call.
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-white/75">
              Broken transformer, overflowing sewer, a pothole on your street. Call, speak in your own language, and
              StreetVoice gets it to the department that can fix it.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/call"
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-sidebar-primary px-5 font-medium text-sidebar-primary-foreground shadow-lg shadow-black/20 transition-transform hover:-translate-y-0.5"
              >
                <PhoneCall size={18} />
                Call the complaint line
              </Link>
              <a
                href="#track"
                className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/20 px-5 font-medium text-white transition-colors hover:bg-white/10"
              >
                Track a complaint
                <ArrowRight size={16} />
              </a>
            </div>
            <p className="mt-4 text-sm text-white/50">The call line opens in your browser for this demo.</p>
          </div>
        </div>
      </section>

      {/* Track */}
      <section id="track" className="relative mx-auto -mt-10 w-full max-w-5xl px-5">
        <div className="rounded-2xl border bg-card p-5 shadow-xl shadow-black/5 sm:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Track your complaint</h2>
              <p className="text-sm text-muted-foreground">
                Enter the 6-digit number you heard on the call. <span dir="rtl">اپنا شکایت نمبر درج کریں</span>
              </p>
            </div>
            <form onSubmit={handleSubmit} className="flex w-full gap-2 sm:w-auto">
              <div className="relative flex-1 sm:w-56">
                <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={trackingId}
                  onChange={(e) => setTrackingId(e.target.value)}
                  placeholder="e.g. 482913"
                  inputMode="numeric"
                  aria-label="Tracking number"
                  className="h-11 pl-9 font-mono text-base"
                  required
                />
              </div>
              <Button type="submit" className="h-11 px-5">
                Track
              </Button>
            </form>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto w-full max-w-5xl px-5 py-16 sm:py-20">
        <h2 className="text-sm font-medium tracking-wider text-primary uppercase">How it works</h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <div key={step.title} className="rounded-2xl border bg-card p-6">
              <div className="flex items-center justify-between">
                <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <step.icon size={20} />
                </span>
                <span className="text-4xl font-semibold text-muted/80 tabular-nums">{i + 1}</span>
              </div>
              <h3 className="mt-5 font-semibold">{step.title}</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                <span dir="rtl">{step.urdu}</span>
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mt-auto border-t">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-5 py-6 text-sm text-muted-foreground">
          <span>StreetVoice · any phone, any language</span>
          <Link href="/login" className="hover:text-foreground">
            Control room login
          </Link>
        </div>
      </footer>
    </div>
  );
}
