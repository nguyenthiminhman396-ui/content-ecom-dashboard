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

export function vnDay(iso?: string): string {
  if (!iso) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(iso) && iso.endsWith('+07:00')) return iso.slice(0, 10);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

export type DatePreset = 'all' | 'today' | '7d' | '30d' | 'month' | 'custom';

export interface DateFilterValue {
  preset: DatePreset;
  from: string;
  to: string;
}

export const DEFAULT_DATE_FILTER: DateFilterValue = {
  preset: 'all',
  from: '',
  to: '',
};

const shiftDays = (ymd: string, days: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export function matchDateFilter(isoDate: string | undefined, filter: DateFilterValue): boolean {
  if (filter.preset === 'all') return true;
  const day = vnDay(isoDate);
  if (!day) return false;
  const today = todayVN();
  if (filter.preset === 'today') return day === today;
  if (filter.preset === '7d') return day >= shiftDays(today, -6) && day <= today;
  if (filter.preset === '30d') return day >= shiftDays(today, -29) && day <= today;
  if (filter.preset === 'month') return day.slice(0, 7) === today.slice(0, 7);
  if (filter.preset === 'custom') {
    if (filter.from && day < filter.from) return false;
    if (filter.to && day > filter.to) return false;
    return true;
  }
  return true;
}

export function matchSearch(query: string, ...fields: (string | undefined | null)[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some(f => (f || '').toLowerCase().includes(q));
}

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
