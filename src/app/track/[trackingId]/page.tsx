import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { toAsciiDigits } from "@/lib/sms/phone";
import { Mic } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

// Public complaint tracker, in Urdu and English. Shows only the status, the
// department and when each step happened: no transcripts, remarks or
// caller details.

const STEPS = [
  { status: "processing", ur: "شکایت موصول ہوئی", en: "Received" },
  { status: "open", ur: "محکمے کو بھیج دی گئی", en: "Sent to department" },
  { status: "in_progress", ur: "کام جاری ہے", en: "Work in progress" },
  { status: "resolved", ur: "حل ہو گئی", en: "Resolved" },
] as const;

// needs_review sits between "received" and "sent": still being checked
const STEP_INDEX: Record<string, number> = {
  processing: 0,
  needs_review: 0,
  spam: 0, // shown as "being checked", like needs_review
  open: 1,
  in_progress: 2,
  resolved: 3,
};

function Brand() {
  return (
    <Link href="/" className="flex items-center justify-center gap-2 text-sm font-semibold">
      <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Mic size={14} strokeWidth={2.5} />
      </span>
      StreetVoice
    </Link>
  );
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Karachi",
  });
}

export default async function TrackPage({
  params,
}: {
  params: Promise<{ trackingId: string }>;
}) {
  const { trackingId: raw } = await params;
  const trackingId = toAsciiDigits(decodeURIComponent(raw)).trim();

  const supabase = createAdminClient();
  const { data: complaint } = await supabase
    .from("complaints")
    .select("id, status, tracking_id, created_at, department:departments(name, name_ur)")
    .eq("tracking_id", trackingId)
    .maybeSingle();

  if (!complaint) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-background px-4">
        <Brand />
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle dir="rtl" className="text-right">شکایت نہیں ملی</CardTitle>
            <p className="text-sm text-muted-foreground">
              No complaint found with number{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                {trackingId}
              </code>
            </p>
          </CardHeader>
          <CardFooter>
            <Link href="/#track" className="text-sm font-medium text-primary hover:underline">
              Check another number
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const { data: history } = await supabase
    .from("status_history")
    .select("status, created_at")
    .eq("complaint_id", complaint.id)
    .order("created_at", { ascending: true });

  // When each step was first reached
  const reachedAt: Record<string, string> = { processing: complaint.created_at as string };
  for (const h of history ?? []) {
    reachedAt[h.status] ??= h.created_at;
  }

  const current = STEP_INDEX[complaint.status] ?? 0;
  const dept = complaint.department as unknown as { name: string; name_ur: string | null } | null;
  const underReview = complaint.status === "needs_review" || complaint.status === "spam";

  return (
    <div className="flex flex-1 items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <Brand />
        <div className="rounded-2xl bg-sidebar px-6 py-6 text-center text-white shadow-lg">
          <p className="text-sm text-white/60">
            Complaint number · <span dir="rtl">شکایت نمبر</span>
          </p>
          <h1 className="mt-1 font-mono text-4xl font-semibold tracking-[0.2em]">{complaint.tracking_id}</h1>
          {dept && (
            <p className="mt-2 text-sm text-sidebar-primary">
              {dept.name}
              {dept.name_ur && dept.name_ur !== dept.name && (
                <>
                  {" "}
                  · <span dir="rtl">{dept.name_ur}</span>
                </>
              )}
            </p>
          )}
        </div>

        <Card>
          <CardContent>
            <ol>
              {STEPS.map((step, i) => {
                const done = i <= current;
                const time = reachedAt[step.status];
                const last = i === STEPS.length - 1;
                return (
                  <li key={step.status} className="relative flex gap-3 pb-6 last:pb-0">
                    {!last && (
                      <span
                        className={`absolute top-6 bottom-0 left-[11px] w-0.5 ${i < current ? "bg-primary" : "bg-border"}`}
                        aria-hidden
                      />
                    )}
                    <span
                      className={`relative mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        done ? "bg-primary text-primary-foreground" : "border-2 border-border bg-card text-transparent"
                      }`}
                      aria-hidden
                    >
                      ✓
                    </span>
                    <div className="flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className={done ? "font-medium" : "text-muted-foreground"}>{step.en}</p>
                        <p dir="rtl" className={done ? "font-medium" : "text-muted-foreground"}>
                          {step.ur}
                        </p>
                      </div>
                      {done && time && <p className="text-xs text-muted-foreground">{formatTime(time)}</p>}
                      {i === 0 && underReview && (
                        <p className="mt-1 text-xs text-amber-700">
                          Being checked by our team · <span dir="rtl">ہماری ٹیم جانچ رہی ہے</span>
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </CardContent>
          <CardFooter className="flex justify-between text-sm">
            <Link href="/#track" className="font-medium text-primary hover:underline">
              Check another
            </Link>
            <span className="text-muted-foreground">Updates also come by SMS</span>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
