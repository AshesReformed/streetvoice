import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

const STATUS_STYLES: Record<string, string> = {
  needs_review:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  open: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  in_progress:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  resolved:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
};

function StatusBadge({ status }: { status: string }) {
  const style =
    STATUS_STYLES[status] ??
    "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default async function TrackPage({
  params,
}: {
  params: Promise<{ trackingId: string }>;
}) {
  const { trackingId } = await params;

  const supabase = createAdminClient();
  const { data: complaint } = await supabase
    .from("complaints")
    .select("status, tracking_id, created_at, department:departments(name)")
    .eq("tracking_id", trackingId)
    .single();

  if (!complaint) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Complaint not found</CardTitle>
            <CardDescription>
              No complaint found with tracking ID{" "}
              <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-mono dark:bg-zinc-800">
                {trackingId}
              </code>
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex gap-4">
            <Link
              href="/"
              className="text-sm text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              Back
            </Link>
            <Link
              href="/"
              className="text-sm text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              Check another
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const dept = complaint.department as unknown as { name: string } | null;
  const deptName = dept?.name ?? "Unassigned";
  const createdAt = complaint.created_at
    ? new Date(complaint.created_at as string).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            StreetVoice
          </h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Complaint Status</CardTitle>
            <CardDescription>
              <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-mono dark:bg-zinc-800">
                {complaint.tracking_id}
              </code>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4">
              <div className="flex items-center justify-between">
                <dt className="text-sm text-zinc-500 dark:text-zinc-400">
                  Status
                </dt>
                <dd>
                  <StatusBadge status={complaint.status as string} />
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-sm text-zinc-500 dark:text-zinc-400">
                  Department
                </dt>
                <dd className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {deptName}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-sm text-zinc-500 dark:text-zinc-400">
                  Filed on
                </dt>
                <dd className="text-sm text-zinc-700 dark:text-zinc-300">
                  {createdAt}
                </dd>
              </div>
            </dl>
          </CardContent>
          <CardFooter className="flex gap-4">
            <Link
              href="/"
              className="text-sm text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              Back
            </Link>
            <Link
              href="/"
              className="text-sm text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              Check another
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
