import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordingUrl } from '@/lib/recordings';

// Recording for the no-login department page (/c/<token>): the complaint's
// unguessable public token is the access key. Redirects to a signed link.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!/^[0-9a-f]{32}$/.test(token)) {
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
    }

    const { data: complaint } = await createAdminClient()
      .from('complaints')
      .select('audio_url')
      .eq('public_token', token)
      .maybeSingle();
    if (!complaint?.audio_url) {
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
    }

    return NextResponse.redirect(await recordingUrl(complaint.audio_url, 300));
  } catch (err) {
    console.error('Public recording link error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
