import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getComplaintAnalyzer } from '@/lib/services';
import { recordingUrl, storeRecording } from '@/lib/recordings';
import { announceRouted, notifyCitizen } from '@/lib/sms/notify';
import { hashPhone, normalizePhone } from '@/lib/sms/phone';
import { autoBlockIfRepeatSpammer } from '@/lib/abuse/guard';
import { findOpenDuplicate, linkDuplicate } from '@/lib/pipeline/duplicates';
import { TelephonyWebhookInput, TelephonyWebhookOutput } from '@/lib/services/types';

// ===========================================================================
// Call pipeline, in two halves:
//
// 1. fileComplaint — runs while the caller is on the line. Saves the
//    complaint as 'processing' and returns its tracking number in well under
//    a second, so the caller hears it before hanging up.
// 2. analyzeComplaint — runs after the response (Next.js after()) or from
//    the retry sweep. Copies the recording into private storage, asks the AI
//    analyzer what the complaint is, and routes it ('open'), holds it for
//    an admin ('needs_review') or flags it as spam ('spam', never sent to a
//    department; repeat spammers are blocked automatically). A routed
//    complaint about the same department and area as an open one is linked
//    to it instead of being sent again (see duplicates.ts).
//
// The AI takes 10–40 s per call; a phone webhook gives about 15 s, which is
// why analysis can't happen while the caller waits.
// ===========================================================================

/** After this many failed analyses a complaint goes to manual review. */
export const MAX_ANALYSIS_ATTEMPTS = 3;

/** Pauses before the in-request retries of a failed analysis (attempts 2 and 3). */
export const RETRY_DELAYS_MS = [20_000, 45_000];

export interface FiledComplaint extends TelephonyWebhookOutput {
  complaint_id: string;
  /** false when this call_ref was already filed (a retried webhook) */
  created: boolean;
}

/** "482913" → "4 8 2 9 1 3", so text-to-speech reads digits one by one. */
export function spokenDigits(trackingId: string): string {
  return trackingId.replace(/\D/g, '').split('').join(' ') || trackingId;
}

function confirmationText(trackingId: string): string {
  const digits = spokenDigits(trackingId);
  return `Your complaint has been registered. Your tracking number is ${digits}. Again, your tracking number is ${digits}. You will receive updates by SMS.`;
}

export async function fileComplaint(payload: TelephonyWebhookInput): Promise<FiledComplaint> {
  const supabase = createAdminClient();

  // A retried webhook for the same call returns the complaint already filed
  const { data: existing } = await supabase
    .from('complaints')
    .select('id, tracking_id')
    .eq('call_ref', payload.call_ref)
    .maybeSingle();
  if (existing) {
    return {
      complaint_id: existing.id,
      tracking_id: existing.tracking_id,
      spoken_confirmation_text: confirmationText(existing.tracking_id),
      created: false,
    };
  }

  // Upsert citizen (if the caller's number is known). Returning callers are
  // found by a keyed hash; the number itself is kept server-side for SMS.
  let citizenId: string | null = null;
  const phone = normalizePhone(payload.caller_id);
  if (phone) {
    const phoneHash = hashPhone(phone);

    const { data: existingCitizen } = await supabase
      .from('citizens')
      .select('id')
      .eq('phone_hash', phoneHash)
      .maybeSingle();

    if (existingCitizen) {
      citizenId = existingCitizen.id;
    } else {
      const { data: newCitizen } = await supabase
        .from('citizens')
        .insert({ phone_hash: phoneHash, phone, preferred_language: payload.dtmf_language ?? null })
        .select('id')
        .single();
      citizenId = newCitizen?.id || null;
    }
  }

  // Insert complaint (tracking_id is a random 6-digit number from Postgres)
  const { data: complaint, error: complaintError } = await supabase
    .from('complaints')
    .insert({
      call_ref: payload.call_ref,
      citizen_id: citizenId,
      audio_url: payload.audio_url,
      status: 'processing',
    })
    .select('id, tracking_id')
    .single();

  if (complaintError || !complaint) {
    throw new Error(`Failed to create complaint: ${complaintError?.message}`);
  }

  await supabase.from('call_logs').insert({
    call_ref: payload.call_ref,
    duration_sec: 0, // Will be updated by telephony provider
    language_selected: payload.dtmf_language ?? null,
    outcome: 'completed',
    complaint_id: complaint.id,
  });

  await supabase.from('status_history').insert({
    complaint_id: complaint.id,
    status: 'processing',
    remark: 'Complaint received via phone call',
    updated_by: null, // System-generated
  });

  return {
    complaint_id: complaint.id,
    tracking_id: complaint.tracking_id,
    spoken_confirmation_text: confirmationText(complaint.tracking_id),
    created: true,
  };
}

export type AnalysisOutcome =
  | { result: 'routed' | 'needs_review'; department: string | null }
  | { result: 'spam'; reason: string; caller_blocked: boolean }
  | { result: 'duplicate'; department: string; duplicate_of: string; reports: number }
  | { result: 'retry' | 'gave_up'; error: string }
  | { result: 'skipped' };

/** Add a remark to the status_history row the status-change trigger just wrote. */
async function remarkLatestHistory(complaintId: string, remark: string) {
  const supabase = createAdminClient();
  const { data: latest } = await supabase
    .from('status_history')
    .select('id')
    .eq('complaint_id', complaintId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest) {
    await supabase.from('status_history').update({ remark }).eq('id', latest.id);
  }
}

export async function analyzeComplaint(complaintId: string): Promise<AnalysisOutcome> {
  const supabase = createAdminClient();

  const { data: complaint } = await supabase
    .from('complaints')
    .select('id, status, audio_url, processing_attempts, citizen_id')
    .eq('id', complaintId)
    .maybeSingle();
  if (!complaint || complaint.status !== 'processing' || !complaint.audio_url) {
    return { result: 'skipped' };
  }

  // Claim this attempt. If the retry sweep and after() race for the same
  // complaint, only one of them gets the row.
  const attempt = complaint.processing_attempts + 1;
  const { data: claimed } = await supabase
    .from('complaints')
    .update({ processing_attempts: attempt })
    .eq('id', complaintId)
    .eq('status', 'processing')
    .eq('processing_attempts', complaint.processing_attempts)
    .select('id')
    .maybeSingle();
  if (!claimed) return { result: 'skipped' };

  try {
    // 1. Keep our own copy of the recording (Twilio URLs need credentials)
    const storedUrl = await storeRecording(complaintId, complaint.audio_url);
    if (storedUrl !== complaint.audio_url) {
      await supabase.from('complaints').update({ audio_url: storedUrl }).eq('id', complaintId);
    }

    // 2. What the caller picked on the phone menu, if anything
    const { data: callLog } = await supabase
      .from('call_logs')
      .select('language_selected')
      .eq('complaint_id', complaintId)
      .limit(1)
      .maybeSingle();

    const { data: departments } = await supabase
      .from('departments')
      .select('id, name, keywords, description');

    // 3. Ask the AI what the complaint is
    const analysis = await getComplaintAnalyzer().analyze({
      audio_url: await recordingUrl(storedUrl),
      language_hint: callLog?.language_selected ?? undefined,
      departments: (departments || []).map((d) => ({
        id: d.id,
        name: d.name,
        keywords: d.keywords || [],
        description: d.description ?? null,
      })),
    });

    // 4. Spam never reaches a department. Otherwise the low-confidence gate:
    // unclear complaints wait for an admin to route them.
    const spam = Boolean(analysis.is_spam);
    const status = spam ? 'spam' : analysis.needs_review ? 'needs_review' : 'open';
    const departmentId = spam || analysis.needs_review ? null : analysis.department_id;

    const { error: updateError } = await supabase
      .from('complaints')
      .update({
        status,
        department_id: departmentId,
        category: analysis.category,
        transcript_regional: analysis.transcript_original,
        transcript_urdu: analysis.transcript_urdu,
        transcript_english: analysis.transcript_english,
        summary: analysis.summary,
        summary_urdu: analysis.summary_urdu,
        language: analysis.language,
        confidence_score: analysis.confidence,
        priority: analysis.urgency,
        area: analysis.area,
        review_reason: analysis.review_reason,
        spam_reason: spam ? analysis.spam_reason ?? 'Not a genuine complaint' : null,
        processing_error: null,
      })
      .eq('id', complaintId);
    if (updateError) throw new Error(`Failed to save analysis: ${updateError.message}`);

    if (spam) {
      const reason = analysis.spam_reason ?? 'Not a genuine complaint';
      await remarkLatestHistory(complaintId, `Flagged as spam: ${reason}`);
      const blocked = await autoBlockIfRepeatSpammer(complaint.citizen_id).catch((err) => {
        console.error(`Auto-block check failed for complaint ${complaintId}:`, err);
        return false;
      });
      return { result: 'spam', reason, caller_blocked: blocked };
    }

    await remarkLatestHistory(
      complaintId,
      analysis.needs_review
        ? `Held for review: ${analysis.review_reason ?? 'unclear'}`
        : `Routed automatically to ${analysis.category}`
    );

    // 5. Same problem as an open complaint? Link it instead of sending it again
    if (departmentId) {
      const parent = await findOpenDuplicate(complaintId, departmentId, analysis.area);
      if (parent) {
        const { data: child } = await supabase
          .from('complaints')
          .select('id, tracking_id, citizen:citizens(phone), department:departments(sms_number)')
          .eq('id', complaintId)
          .single();
        const reports = await linkDuplicate(
          {
            id: complaintId,
            tracking_id: child?.tracking_id ?? '',
            citizenPhone: (child?.citizen as unknown as { phone: string | null } | null)?.phone ?? null,
          },
          parent,
          (child?.department as unknown as { sms_number: string | null } | null) ?? null
        );
        await remarkLatestHistory(
          complaintId,
          `Same issue as ${parent.tracking_id} (${reports} reports); not sent to the department again`
        );
        return { result: 'duplicate', department: analysis.category, duplicate_of: parent.tracking_id, reports };
      }
    }

    // 6. Routed: SMS the department (Urdu, no-login link) and the citizen
    // (the complaint is already saved, so an SMS problem must not fail it)
    if (!analysis.needs_review) {
      await announceRouted(complaintId).catch((err) =>
        console.error(`Routing SMS failed for complaint ${complaintId}:`, err)
      );
    }

    return {
      result: analysis.needs_review ? 'needs_review' : 'routed',
      department: analysis.needs_review ? null : analysis.category,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Analysis attempt ${attempt} failed for complaint ${complaintId}:`, err);

    if (attempt >= MAX_ANALYSIS_ATTEMPTS) {
      // Out of retries — a human routes it from the Needs Review page
      await supabase
        .from('complaints')
        .update({
          status: 'needs_review',
          processing_error: message,
          review_reason: 'Automatic analysis failed; please listen to the recording',
        })
        .eq('id', complaintId);
      await remarkLatestHistory(complaintId, 'Automatic analysis failed; held for review');
      return { result: 'gave_up', error: message };
    }

    await supabase.from('complaints').update({ processing_error: message }).eq('id', complaintId);
    return { result: 'retry', error: message };
  }
}

/**
 * Retry sweep: analyze complaints left in 'processing' (the server restarted
 * mid-analysis, the AI was rate-limited, ...). Skips complaints filed in the
 * last `minAgeSeconds`, whose first attempt is probably still running.
 */
export async function processPendingComplaints(
  { limit = 5, minAgeSeconds = 60 }: { limit?: number; minAgeSeconds?: number } = {}
): Promise<Array<{ complaint_id: string } & AnalysisOutcome>> {
  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - minAgeSeconds * 1000).toISOString();
  const { data: pending } = await supabase
    .from('complaints')
    .select('id')
    .eq('status', 'processing')
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(limit);

  const results: Array<{ complaint_id: string } & AnalysisOutcome> = [];
  for (const { id } of pending || []) {
    results.push({ complaint_id: id, ...(await analyzeComplaint(id)) });
  }
  return results;
}

/**
 * File a call and analyze it. By default analysis runs after the response
 * is sent; `wait: true` analyzes inline (used by the admin "simulate a call"
 * button, which shows where the complaint was routed).
 */
export async function processIncomingCall(
  payload: TelephonyWebhookInput,
  { wait = false }: { wait?: boolean } = {}
): Promise<FiledComplaint> {
  const filed = await fileComplaint(payload);
  if (filed.created) {
    // Confirm by SMS (the caller has the number in hand), then analyze
    const followUp = async () => {
      await notifyCitizen(filed.complaint_id, 'filed');
      // The AI is sometimes briefly overloaded: wait and retry in the same
      // background task, so one busy moment doesn't leave the call stuck
      // until the retry sweep runs.
      for (const delayMs of [0, ...RETRY_DELAYS_MS]) {
        if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
        const outcome = await analyzeComplaint(filed.complaint_id);
        if (outcome.result !== 'retry') break;
      }
    };
    if (wait) {
      await followUp();
    } else {
      after(() =>
        followUp().catch((err) =>
          console.error(`Background analysis crashed for ${filed.complaint_id}:`, err)
        )
      );
    }
  }
  return filed;
}
