import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/middleware/require-admin';
import { validateBody } from '@/lib/middleware/validate';
import { blockCallerSchema } from '@/lib/validation/schemas';
import { activeBlock, blockNumber, maskPhone } from '@/lib/abuse/guard';

// ===========================================================================
// The caller behind a complaint, for the control room (admins only):
//
//   GET     masked number (full number on request), how many complaints this
//           caller has made, their latest ones, and any active block
//   POST    block this caller   { hours: number | null, reason? }
//   DELETE  unblock this caller
//
// Departments never see the number; they get the complaint and a link.
// ===========================================================================

async function loadCaller(complaintId: string) {
  const supabase = createAdminClient();
  const { data: complaint } = await supabase
    .from('complaints')
    .select('citizen_id')
    .eq('id', complaintId)
    .maybeSingle();
  if (!complaint) return { found: false as const };
  if (!complaint.citizen_id) return { found: true as const, citizen: null };
  const { data: citizen } = await supabase
    .from('citizens')
    .select('id, phone, phone_hash, created_at')
    .eq('id', complaint.citizen_id)
    .maybeSingle();
  return { found: true as const, citizen };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const caller = await loadCaller(id);
    if (!caller.found) return NextResponse.json({ error: 'Complaint not found' }, { status: 404 });
    if (!caller.citizen?.phone_hash) {
      return NextResponse.json({ data: { known: false } });
    }

    const supabase = createAdminClient();
    const { data: complaints, count } = await supabase
      .from('complaints')
      .select('id, tracking_id, status, summary, created_at', { count: 'exact' })
      .eq('citizen_id', caller.citizen.id)
      .order('created_at', { ascending: false })
      .limit(10);

    const block = await activeBlock(caller.citizen.phone_hash);

    return NextResponse.json({
      data: {
        known: true,
        masked: maskPhone(caller.citizen.phone),
        phone: caller.citizen.phone,
        first_seen: caller.citizen.created_at,
        complaint_count: count ?? complaints?.length ?? 0,
        spam_count: (complaints ?? []).filter((c) => c.status === 'spam').length,
        recent: complaints ?? [],
        block,
      },
    });
  } catch (err) {
    console.error('Caller lookup error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const data = await validateBody(request, blockCallerSchema);
    if (data instanceof NextResponse) return data;

    const caller = await loadCaller(id);
    if (!caller.found) return NextResponse.json({ error: 'Complaint not found' }, { status: 404 });
    if (!caller.citizen?.phone_hash) {
      return NextResponse.json({ error: 'This complaint has no caller number to block' }, { status: 400 });
    }

    const blockId = await blockNumber({
      phone: caller.citizen.phone,
      phoneHash: caller.citizen.phone_hash,
      reason: data.reason || `Blocked from complaint by ${auth.officer.full_name}`,
      hours: data.hours ?? null,
      blockedBy: auth.officer.id,
    });

    return NextResponse.json({ data: { id: blockId } });
  } catch (err) {
    console.error('Block caller error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const caller = await loadCaller(id);
    if (!caller.found) return NextResponse.json({ error: 'Complaint not found' }, { status: 404 });
    if (!caller.citizen?.phone_hash) return NextResponse.json({ data: { unblocked: false } });

    await createAdminClient().from('blocked_numbers').delete().eq('phone_hash', caller.citizen.phone_hash);
    return NextResponse.json({ data: { unblocked: true } });
  } catch (err) {
    console.error('Unblock caller error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
