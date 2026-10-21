import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/middleware/require-admin';
import { validateBody } from '@/lib/middleware/validate';
import { markSpamSchema } from '@/lib/validation/schemas';

// Admins correct the AI's spam label:
//   { spam: true, reason? }  → 'spam' (taken off the department's list)
//   { spam: false }          → back to 'needs_review', to be routed by hand
//                               (Needs Review lists it again)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const data = await validateBody(request, markSpamSchema);
    if (data instanceof NextResponse) return data;

    const supabase = createAdminClient();
    const update = data.spam
      ? { status: 'spam', spam_reason: data.reason || `Marked as spam by ${auth.officer.full_name}` }
      : {
          status: 'needs_review',
          department_id: null,
          spam_reason: null,
          review_reason: 'An admin marked this as not spam; please route it',
        };

    const { data: complaint, error } = await supabase
      .from('complaints')
      .update(update)
      .eq('id', id)
      .select('id, status')
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!complaint) return NextResponse.json({ error: 'Complaint not found' }, { status: 404 });

    // The status trigger wrote a history row; say who did it and why
    const { data: latest } = await supabase
      .from('status_history')
      .select('id')
      .eq('complaint_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest) {
      await supabase
        .from('status_history')
        .update({
          remark: data.spam ? `Marked as spam: ${update.spam_reason}` : 'Marked as not spam',
          updated_by: auth.officer.id,
        })
        .eq('id', latest.id);
    }

    return NextResponse.json({ data: complaint });
  } catch (err) {
    console.error('Mark spam error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
