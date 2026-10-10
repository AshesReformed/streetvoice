import { createAdminClient } from '@/lib/supabase/admin';

// ===========================================================================
// Call recordings live in the private Supabase Storage bucket "recordings".
// A complaint's audio_url holds "storage://recordings/<path>" once copied;
// officers play it through short-lived signed links, never a public URL.
//
// Copying matters for Twilio: its recording URLs need the account's
// credentials, so a browser (or the AI) can't fetch them directly.
// ===========================================================================

const BUCKET = 'recordings';
const PREFIX = `storage://${BUCKET}/`;
const MAX_BYTES = 15 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/flac': 'flac',
};

export function isStoredRecording(audioUrl: string | null | undefined): boolean {
  return Boolean(audioUrl?.startsWith(PREFIX));
}

/** Twilio recording URLs require HTTP basic auth with the account SID + token. */
function authHeaders(url: string): Record<string, string> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (sid && token && new URL(url).hostname.endsWith('twilio.com')) {
    return { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}` };
  }
  return {};
}

/**
 * Download a recording and save it in the private bucket as
 * "<complaintId>.<ext>". Returns the "storage://recordings/…" reference to
 * store on the complaint. Already-stored references are returned unchanged.
 */
export async function storeRecording(complaintId: string, sourceUrl: string): Promise<string> {
  if (isStoredRecording(sourceUrl)) return sourceUrl;

  const response = await fetch(sourceUrl, {
    headers: authHeaders(sourceUrl),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch recording: HTTP ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error('Recording is empty');
  if (bytes.length > MAX_BYTES) throw new Error(`Recording is too large (${bytes.length} bytes)`);

  const header = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
  const urlExt = new URL(sourceUrl).pathname.split('.').pop()?.toLowerCase() ?? '';
  const ext = EXTENSIONS[header] ?? (Object.values(EXTENSIONS).includes(urlExt) ? urlExt : 'wav');
  const contentType = header.startsWith('audio/') ? header : `audio/${ext === 'mp3' ? 'mpeg' : ext}`;
  const path = `${complaintId}.${ext}`;

  const { error } = await createAdminClient()
    .storage.from(BUCKET)
    .upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Failed to store recording: ${error.message}`);

  return `${PREFIX}${path}`;
}

/** Save recording bytes we already have (e.g. a browser upload) under `name`. */
export async function uploadRecording(name: string, bytes: Uint8Array, contentType: string): Promise<string> {
  if (bytes.length === 0) throw new Error('Recording is empty');
  if (bytes.length > MAX_BYTES) throw new Error(`Recording is too large (${bytes.length} bytes)`);
  const { error } = await createAdminClient()
    .storage.from(BUCKET)
    .upload(name, bytes, { contentType, upsert: false });
  if (error) throw new Error(`Failed to store recording: ${error.message}`);
  return `${PREFIX}${name}`;
}

/**
 * A URL the recording can be fetched from: a signed link for stored
 * recordings (valid for `expiresIn` seconds), or the original URL.
 */
export async function recordingUrl(audioUrl: string, expiresIn = 600): Promise<string> {
  if (!isStoredRecording(audioUrl)) return audioUrl;
  const { data, error } = await createAdminClient()
    .storage.from(BUCKET)
    .createSignedUrl(audioUrl.slice(PREFIX.length), expiresIn);
  if (error || !data) throw new Error(`Failed to sign recording URL: ${error?.message}`);
  return data.signedUrl;
}
