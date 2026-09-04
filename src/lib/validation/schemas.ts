import { z } from 'zod';

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
  keywords: z.array(z.string()).default([]),
  contact_info: z.string().optional(),
});

export const updateDepartmentSchema = z.object({
  name: z.string().min(1).optional(),
  keywords: z.array(z.string()).optional(),
  contact_info: z.string().optional(),
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
