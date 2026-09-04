"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";

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
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            StreetVoice
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Track your complaint status
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Check Status</CardTitle>
            <CardDescription>
              Enter the tracking ID you received when filing your complaint.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                value={trackingId}
                onChange={(e) => setTrackingId(e.target.value)}
                placeholder="Enter tracking ID, e.g. SV-000001"
                className="flex-1"
                required
              />
              <Button type="submit">Track</Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-zinc-400 dark:text-zinc-500">
          <Link href="/login" className="underline hover:text-zinc-600 dark:hover:text-zinc-300">
            Officer/Admin Login
          </Link>
        </p>
      </div>
    </div>
  );
}
