import { z } from 'zod';
import { normalizePhone } from '@/lib/sms/phone';

// Optional phone number: blank clears it, anything else must be a valid
// number and is stored in E.164 form ("+923001234567").
const optionalPhone = z
  .string()
  .trim()
  .nullable()
  .optional()
  .refine((v) => !v || normalizePhone(v) !== null, 'Enter a valid phone number, e.g. 03001234567')
  .transform((v) => (v === undefined ? undefined : v ? normalizePhone(v) : null));

export const webhookPayloadSchema = z.object({
  call_ref: z.string(),
  audio_url: z.string().url(),
  // Language the caller picked via DTMF. Optional: when absent, the ASR
  // provider auto-detects the language from the audio itself.
  dtmf_language: z.string().optional(),
  caller_id: z.string().optional(),
});

export const updateComplaintStatusSchema = z.object({
  status: z.enum(['needs_review', 'open', 'in_progress', 'resolved']),
  remark: z.string().optional(),
});

export const rerouteComplaintSchema = z.object({
  department_id: z.string().uuid(),
});

export const createDepartmentSchema = z.object({
  name: z.string().min(1),
  name_ur: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  sms_number: optionalPhone,
  supervisor_sms_number: optionalPhone,
  keywords: z.array(z.string()).default([]),
  contact_info: z.string().nullable().optional(),
});

export const updateDepartmentSchema = z.object({
  name: z.string().min(1).optional(),
  name_ur: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  sms_number: optionalPhone,
  supervisor_sms_number: optionalPhone,
  keywords: z.array(z.string()).optional(),
  contact_info: z.string().nullable().optional(),
});

export const updateOfficerSchema = z.object({
  full_name: z.string().min(1).optional(),
  role: z.enum(['officer', 'admin']).optional(),
  department_id: z.string().uuid().nullable().optional(),
});

export const createOfficerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(1),
  role: z.enum(['officer', 'admin']),
  department_id: z.string().uuid().nullable().optional(),
});

// Block a complaint's caller; hours = null blocks until someone unblocks
export const blockCallerSchema = z.object({
  hours: z.number().int().positive().max(24 * 365).nullable().optional(),
  reason: z.string().trim().max(200).optional(),
});

export const markSpamSchema = z.object({
  spam: z.boolean(),
  reason: z.string().trim().max(200).optional(),
});
