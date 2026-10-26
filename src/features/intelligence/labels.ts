import type { CiCategory, CiDecision, CiSeverity, CiTaskStatus } from '@/shared/types';

export const SEVERITY_META: Record<CiSeverity, { label: string; color: string; bg: string }> = {
  P0: { label: 'Nguy hại khẩn cấp', color: '#991B1B', bg: '#FEE2E2' },
  P1: { label: 'Lỗi y khoa lớn', color: '#DC2626', bg: '#FEE2E2' },
  P2: { label: 'Lỗi nội dung', color: '#B45309', bg: '#FEF3C7' },
  P3: { label: 'Chỉnh nhỏ', color: '#475569', bg: '#F1F5F9' },
};
export const SEVERITY_ORDER: Record<CiSeverity, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

export const CATEGORY_LABEL: Record<CiCategory, string> = {
  quality_issue: 'Lỗi chất lượng',
  content_opportunity: 'Cơ hội nội dung',
  medical_verification: 'Cần xác minh y khoa',
};

export const DECISION_LABEL: Record<CiDecision, string> = {
  pending: 'Chờ duyệt',
  confirmed: 'Đã xác nhận',
  rejected: 'Đã bác bỏ',
  needs_medical_verification: 'Cần xác minh y khoa',
};

export const TASK_STATUS: Record<CiTaskStatus, { label: string; cls: string }> = {
  assigned: { label: 'Đang xử lý', cls: 'status-working' },
  submitted: { label: 'Chờ nghiệm thu', cls: 'status-review' },
  accepted: { label: 'Đã nghiệm thu', cls: 'status-approved' },
  changes_requested: { label: 'Yêu cầu sửa thêm', cls: 'status-overdue' },
  needs_medical_verification: { label: 'Cần xác minh y khoa', cls: 'status-paused' },
};

export const scoreColor = (n?: number | null) =>
  n == null ? 'var(--text-tertiary)' : n >= 85 ? 'var(--success)' : n >= 70 ? 'var(--warning)' : 'var(--danger)';

export const todayVN = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

export function fmtDate(s?: string) {
  if (!s) return '—';
  const d = new Date(s.length === 10 ? `${s}T00:00:00+07:00` : s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

/** Hiển thị thời điểm chấm: kèm giờ nếu có. */
export function fmtCheckedAt(s?: string) {
  if (!s) return '—';
  if (s.length === 10) return fmtDate(s);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export const mutedStyle = { fontSize: '0.8rem', color: 'var(--text-tertiary)' } as const;
