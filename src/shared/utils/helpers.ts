import { format, isAfter, isBefore, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';
import type { ContentStatus, ProjectStatus } from '@/shared/types';

export function formatCurrency(amount: number): string {
  if (amount >= 1_000_000_000) {
    return (amount / 1_000_000_000).toFixed(1) + ' tỷ';
  }
  if (amount >= 1_000_000) {
    return (amount / 1_000_000).toFixed(0) + ' tr';
  }
  return new Intl.NumberFormat('vi-VN').format(amount);
}

export function formatFullCurrency(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

// ── CSV Export ─────────────────────────────────────────────────────────────
function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Tải xuống file CSV. `rows` là mảng object, header lấy từ key của row đầu (hoặc tham số).
 * BOM ﻿ để Excel đọc UTF-8 đúng tiếng Việt.
 */
export function exportCsv<T extends Record<string, unknown>>(
  rows: T[],
  filename: string,
  headers?: (keyof T)[],
): void {
  if (rows.length === 0) return;
  const cols = headers ?? (Object.keys(rows[0]) as (keyof T)[]);
  const header = cols.map(c => csvEscape(String(c))).join(',');
  const body = rows.map(r => cols.map(c => csvEscape(r[c])).join(',')).join('\n');
  const csv = '﻿' + header + '\n' + body;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function formatDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'dd/MM/yyyy');
  } catch {
    return dateStr;
  }
}

export function formatDateShort(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'dd/MM');
  } catch {
    return dateStr;
  }
}

export function formatDateFull(dateStr: string): string {
  try {
    return format(parseISO(dateStr), "dd 'thg' MM, yyyy", { locale: vi });
  } catch {
    return dateStr;
  }
}

export function isOverdue(deadline: string): boolean {
  try {
    return isBefore(parseISO(deadline), new Date());
  } catch {
    return false;
  }
}

export function isThisWeek(dateStr: string): boolean {
  try {
    const date = parseISO(dateStr);
    const now = new Date();
    return isAfter(date, startOfWeek(now, { weekStartsOn: 1 })) &&
           isBefore(date, endOfWeek(now, { weekStartsOn: 1 }));
  } catch {
    return false;
  }
}

export function isThisMonth(dateStr: string): boolean {
  try {
    const date = parseISO(dateStr);
    const now = new Date();
    return isAfter(date, startOfMonth(now)) && isBefore(date, endOfMonth(now));
  } catch {
    return false;
  }
}

export function getContentStatusClass(status: ContentStatus): string {
  const map: Record<ContentStatus, string> = {
    'Chờ bắt đầu': 'status-waiting',
    'Đang làm': 'status-working',
    'Chờ duyệt': 'status-review',
    'Đã duyệt': 'status-approved',
    'Đã đăng': 'status-published',
    'Đã xuất bản': 'status-published',
    'Trễ hạn': 'status-overdue',
  };
  return map[status] || '';
}

export function getProjectStatusClass(status: ProjectStatus): string {
  const map: Record<ProjectStatus, string> = {
    'Đang chạy': 'status-running',
    'Hoàn thành': 'status-completed',
    'Tạm dừng': 'status-paused',
    'Hủy': 'status-cancelled',
  };
  return map[status] || '';
}

export function generateId(prefix: string, items: { id: string }[]): string {
  const max = items.reduce((acc, item) => {
    const num = parseInt(item.id.replace(prefix, ''));
    return num > acc ? num : acc;
  }, 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}
