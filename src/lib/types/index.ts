export interface Department {
  id: string;
  name: string;
  keywords: string[];
  contact_info: string | null;
  created_at: string;
}

export interface Officer {
  id: string;
  department_id: string | null;
  role: 'officer' | 'admin';
  full_name: string;
  created_at: string;
  department?: Department;
}

export interface Citizen {
  id: string;
  phone_hash: string | null;
  preferred_language: string | null;
  area_guess: string | null;
  created_at: string;
}

export interface Complaint {
  id: string;
  tracking_id: string;
  citizen_id: string | null;
  department_id: string | null;
  category: string | null;
  audio_url: string | null;
  transcript_regional: string | null;
  transcript_urdu: string | null;
  transcript_english: string | null;
  confidence_score: number | null;
  status: 'needs_review' | 'open' | 'in_progress' | 'resolved';
  priority: 'low' | 'medium' | 'high';
  area: string | null;
  assigned_officer_id: string | null;
  created_at: string;
  department?: Department;
  assigned_officer?: Officer;
}

export interface StatusHistory {
  id: string;
  complaint_id: string;
  status: string;
  remark: string | null;
  updated_by: string | null;
  created_at: string;
  officer?: Officer;
}

export interface CallLog {
  id: string;
  call_ref: string | null;
  duration_sec: number | null;
  language_selected: string | null;
  outcome: string | null;
  complaint_id: string | null;
  created_at: string;
}

export interface DashboardSummary {
  total_complaints: number;
  by_status: Record<string, number>;
  by_department: Array<{ department_id: string; department_name: string; count: number }>;
  by_category: Array<{ category: string; count: number }>;
  avg_resolution_hours: number | null;
}
