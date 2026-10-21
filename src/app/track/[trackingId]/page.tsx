import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { toAsciiDigits } from "@/lib/sms/phone";
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
      <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle dir="rtl" className="text-right">شکایت نہیں ملی</CardTitle>
            <p className="text-sm text-muted-foreground">
              No complaint found with number{" "}
              <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                {trackingId}
              </code>
            </p>
          </CardHeader>
          <CardFooter>
            <Link href="/" className="text-sm underline">
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
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-8 dark:bg-zinc-950">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">StreetVoice · شکایت نمبر</p>
          <h1 className="font-mono text-4xl font-bold tracking-[0.2em]">{complaint.tracking_id}</h1>
          {dept && (
            <p className="mt-1 text-sm text-muted-foreground">
              <span dir="rtl">{dept.name_ur ?? dept.name}</span> · {dept.name}
            </p>
          )}
        </div>

        <Card>
          <CardContent>
            <ol className="space-y-5">
              {STEPS.map((step, i) => {
                const done = i <= current;
                const time = reachedAt[step.status];
                return (
                  <li key={step.status} className="flex items-start gap-3">
                    <span
                      className={`mt-1 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                        done ? "bg-emerald-600 text-white" : "border-2 border-zinc-300 text-transparent"
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
                        <p className="text-xs text-amber-700">
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
            <Link href="/" className="underline">
              Check another
            </Link>
            <span className="text-muted-foreground">Updates also come by SMS</span>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
