export interface User { id: string; name: string; email: string; email_verified: boolean; created_at: string; is_admin: boolean; admin_role: string | null }
export interface Vehicle {
  id: string; plate_number: string; vehicle_type: string; brand: string | null; model: string | null; color: string | null;
  owner_display_name: string; status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'; created_at: string;
  qr: { id: string; created_at: string; public_url: string } | null; report_count: number; new_report_count: number;
}
export type ReportStatus = 'NEW' | 'READ' | 'IN_PROGRESS' | 'RESOLVED' | 'ARCHIVED';
export interface Report {
  id: string; reference: string; vehicle_id: string; plate_number: string; category: string; message: string; status: ReportStatus;
  reporter_name: string | null; created_at: string; updated_at: string; resolved_at: string | null; photo_count: number;
}
export interface ReportDetail extends Report { reporter_phone: string | null; attachments: { id: string; mime_type: string; width: number; height: number }[]; source_blocked: boolean }
export interface CallRow {
  id: string; reference: string; plate_number: string; vehicle_id: string; call_type: 'WEBRTC' | 'PSTN';
  status: 'RINGING' | 'ACCEPTED' | 'COMPLETED' | 'MISSED' | 'REJECTED' | 'FAILED';
  started_at: string; answered_at: string | null; ended_at: string | null; duration_seconds: number | null; end_reason: string | null;
}
export interface Category { code: string; label: string; description: string }
