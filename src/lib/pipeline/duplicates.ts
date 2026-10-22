import { createAdminClient } from '@/lib/supabase/admin';
import { sendSms } from '@/lib/sms/notify';
import { sms } from '@/lib/sms/messages';

// ===========================================================================
// Duplicate grouping. Thirty calls about one broken transformer should be
// one complaint with "30 reports", not thirty SMS to the department.
//
// A newly routed complaint with the same department and area as an open
// one from the last 48 hours is linked to it (duplicate_of). The first
// complaint counts the reports, its priority rises (3 reports → at least
// medium, 5 → high), and the department hears about the growing count at
// a few milestones. Linked callers still get their own tracking number, and
// an SMS when the first complaint moves to in progress or resolved.
// ===========================================================================

const WINDOW_HOURS = 48;
const MILESTONES = [3, 10, 25, 50, 100];

/** "Model Town, Lahore." → "model town lahore" */
export function normalizeArea(area: string | null | undefined): string {
  return (area ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Same place: equal, or one name contains the other ("model town" / "model town lahore"). */
export function sameArea(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizeArea(a);
  const y = normalizeArea(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [shorter, longer] = x.length <= y.length ? [x, y] : [y, x];
  return shorter.length >= 4 && ` ${longer} `.includes(` ${shorter} `);
}

export function priorityFor(reports: number, current: string): string {
  const rank = { low: 0, medium: 1, high: 2 } as Record<string, number>;
  const wanted = reports >= 5 ? 'high' : reports >= 3 ? 'medium' : 'low';
  return (rank[wanted] ?? 0) > (rank[current] ?? 1) ? wanted : current;
}

interface Candidate {
  id: string;
  tracking_id: string;
  status: string;
  area: string | null;
  priority: string;
  report_count: number;
  duplicate_of: string | null;
  created_at: string;
}

/** The oldest open complaint about the same department and area, if any. */
export async function findOpenDuplicate(
  complaintId: string,
  departmentId: string,
  area: string | null
): Promise<Candidate | null> {
  if (!normalizeArea(area)) return null;
  const { data } = await createAdminClient()
    .from('complaints')
    .select('id, tracking_id, status, area, priority, report_count, duplicate_of, created_at')
    .eq('department_id', departmentId)
    .gte('created_at', new Date(Date.now() - WINDOW_HOURS * 3600_000).toISOString())
    .order('created_at', { ascending: true })
    .limit(100);
  return (
    ((data ?? []) as Candidate[]).find(
      (c) =>
        c.id !== complaintId &&
        !c.duplicate_of &&
        (c.status === 'open' || c.status === 'in_progress') &&
        sameArea(c.area, area)
    ) ?? null
  );
}

/**
 * Link `childId` to `parent`: count the report, raise the parent's priority,
 * tell the department at milestones and the caller that it was linked.
 */
export async function linkDuplicate(
  child: { id: string; tracking_id: string; citizenPhone: string | null },
  parent: Candidate,
  department: { sms_number: string | null } | null
): Promise<number> {
  const supabase = createAdminClient();
  const reports = (parent.report_count ?? 1) + 1;

  await supabase
    .from('complaints')
    .update({ report_count: reports, priority: priorityFor(reports, parent.priority) })
    .eq('id', parent.id);
  // The child follows the parent's status, so the department's list and the
  // caller's tracking page agree with what is actually happening
  await supabase
    .from('complaints')
    .update({ duplicate_of: parent.id, status: parent.status })
    .eq('id', child.id);

  if (child.citizenPhone) {
    await sendSms({
      to: child.citizenPhone,
      body: sms.citizenLinked(child.tracking_id, parent.tracking_id),
      purpose: 'citizen_linked',
      complaintId: child.id,
    });
  }
  if (department?.sms_number && MILESTONES.includes(reports)) {
    await sendSms({
      to: department.sms_number,
      body: sms.departmentMoreReports(parent.tracking_id, reports),
      purpose: 'department_more_reports',
      complaintId: parent.id,
    });
  }
  return reports;
}

/** Linked complaints follow the first one to in progress / resolved. Returns their ids. */
export async function propagateStatus(parentId: string, status: string): Promise<string[]> {
  if (status !== 'in_progress' && status !== 'resolved') return [];
  const supabase = createAdminClient();
  const { data: children } = await supabase
    .from('complaints')
    .select('id, status')
    .eq('duplicate_of', parentId);
  const changed = (children ?? []).filter((c) => c.status !== status && c.status !== 'resolved');
  for (const child of changed) {
    await supabase.from('complaints').update({ status }).eq('id', child.id);
  }
  return changed.map((c) => c.id as string);
}
