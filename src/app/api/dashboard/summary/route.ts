import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/middleware/auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;

    const isAdmin = auth.officer.role === 'admin';
    // Admin uses service-role client (bypasses RLS), officers use authenticated client (RLL auto-scopes)
    const supabase = isAdmin ? createAdminClient() : await createClient();

    // 1. Total complaints + by_status
    const { data: allComplaints, error: complaintsError } = await supabase
      .from('complaints')
      .select('id, status, category, department_id, created_at');

    if (complaintsError) {
      return NextResponse.json({ error: complaintsError.message }, { status: 500 });
    }

    const complaints = allComplaints || [];
    const totalComplaints = complaints.length;

    const byStatus = {
      needs_review: 0,
      open: 0,
      in_progress: 0,
      resolved: 0,
    };
    for (const c of complaints) {
      if (c.status in byStatus) {
        byStatus[c.status as keyof typeof byStatus]++;
      }
    }

    // 2. By department
    const { data: departments } = await supabase
      .from('departments')
      .select('id, name');

    const deptMap = new Map((departments || []).map((d) => [d.id, d.name]));

    const deptCounts = new Map<string, number>();
    for (const c of complaints) {
      const deptId = c.department_id || 'unassigned';
      deptCounts.set(deptId, (deptCounts.get(deptId) || 0) + 1);
    }

    const byDepartment = Array.from(deptCounts.entries()).map(([department_id, count]) => ({
      department_id,
      department_name: deptMap.get(department_id) ?? 'Unassigned',
      count,
    }));

    // 3. By category
    const catCounts = new Map<string, number>();
    for (const c of complaints) {
      const cat = c.category || 'uncategorized';
      catCounts.set(cat, (catCounts.get(cat) || 0) + 1);
    }

    const byCategory = Array.from(catCounts.entries()).map(([category, count]) => ({
      category,
      count,
    }));

    // 4. Avg resolution hours
    // Query resolved complaints and their most recent 'resolved' status_history entry
    let avgResolutionHours: number | null = null;
    const resolvedComplaints = complaints.filter((c) => c.status === 'resolved');

    if (resolvedComplaints.length > 0) {
      const resolvedIds = resolvedComplaints.map((c) => c.id);
      const { data: resolvedHistory } = await supabase
        .from('status_history')
        .select('complaint_id, created_at')
        .in('complaint_id', resolvedIds)
        .eq('status', 'resolved')
        .order('created_at', { ascending: false });

      if (resolvedHistory && resolvedHistory.length > 0) {
        // Build a map of complaint_id -> first resolved_at (latest entry per complaint)
        const resolvedAtMap = new Map<string, string>();
        for (const h of resolvedHistory) {
          // Keep the latest (first encountered since ordered DESC)
          if (!resolvedAtMap.has(h.complaint_id)) {
            resolvedAtMap.set(h.complaint_id, h.created_at);
          }
        }

        let totalHours = 0;
        let count = 0;
        for (const c of resolvedComplaints) {
          const resolvedAt = resolvedAtMap.get(c.id);
          if (resolvedAt) {
            const createdMs = new Date(c.created_at).getTime();
            const resolvedMs = new Date(resolvedAt).getTime();
            totalHours += (resolvedMs - createdMs) / (1000 * 60 * 60);
            count++;
          }
        }

        if (count > 0) {
          avgResolutionHours = Math.round((totalHours / count) * 100) / 100;
        }
      }
    }

    return NextResponse.json({
      data: {
        total_complaints: totalComplaints,
        by_status: byStatus,
        by_department: byDepartment,
        by_category: byCategory,
        avg_resolution_hours: avgResolutionHours,
      },
    });
  } catch (err) {
    console.error('Dashboard summary error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
