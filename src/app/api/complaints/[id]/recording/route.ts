import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/middleware/auth';
import { recordingUrl } from '@/lib/recordings';

// Plays a complaint's recording: redirects to a short-lived signed link.
// The lookup uses the officer's own session, so Row-Level Security decides
// whether they may hear it (own department, or admin).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const supabase = await createClient();
    const { data: complaint } = await supabase
      .from('complaints')
      .select('audio_url')
      .eq('id', id)
      .maybeSingle();

    if (!complaint?.audio_url) {
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
    }

    return NextResponse.redirect(await recordingUrl(complaint.audio_url, 300));
  } catch (err) {
    console.error('Recording link error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
