/**
 * Dựng dữ liệu (ReportContext) gửi cho AI khi tạo đánh giá báo cáo tuần.
 * Hàm thuần — không phụ thuộc React/store — để test được và dùng lại được.
 */

import type { KPISubmission, WeeklyReportProject } from '@/shared/types';
import type { ReportContext } from '@/shared/services/aiService';

type Category = 'baiMoi' | 'sku' | 'multimedia' | 'toiUu' | 'khac';

/** Số lượng sản phẩm của 1 lượt submit: ưu tiên `quantity`, không có thì đếm link. */
export function submissionQty(s: KPISubmission): number {
  return s.quantity && s.quantity > 0 ? s.quantity : s.links.length;
}

export function taskCategory(taskType: string | undefined): Category {
  const t = taskType || '';
  if (t === 'Bài Góc sức khỏe - Bệnh lý - Thành phần') return 'baiMoi';
  if (t === 'Sản phẩm') return 'sku';
  if (t === 'Multimedia' || t === 'Tin nhanh') return 'multimedia';
  if (t === 'Tối ưu Sản phẩm - Bài viết') return 'toiUu';
  const tl = t.toLowerCase();
  if (tl.includes('bài góc sức khỏe') || (tl.includes('bài viết') && !tl.includes('tối ưu'))) return 'baiMoi';
  if (tl.includes('sản phẩm') && !tl.includes('tối ưu')) return 'sku';
  if (tl.includes('multimedia') || tl.includes('tin nhanh')) return 'multimedia';
  if (tl.includes('tối ưu')) return 'toiUu';
  return 'khac';
}

/** 'YYYY-MM-DD' → khoảng [thứ Hai 00:00, Chủ nhật 23:59:59] theo giờ máy. */
export function weekRange(weekStart: string): { start: number; end: number } {
  const [y, m, d] = weekStart.split('-').map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d + 6, 23, 59, 59, 999);
  return { start: start.getTime(), end: end.getTime() };
}

export function shiftWeek(weekStart: string, weeks: number): string {
  const [y, m, d] = weekStart.split('-').map(Number);
  const dt = new Date(y, m - 1, d + weeks * 7);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

export function submissionsInWeek(submissions: KPISubmission[], weekStart: string): KPISubmission[] {
  const { start, end } = weekRange(weekStart);
  return submissions.filter(s => {
    const t = new Date(s.submittedAt).getTime();
    return !isNaN(t) && t >= start && t <= end;
  });
}

/** % thay đổi; null khi kỳ trước không có dữ liệu (không so sánh được). */
export function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function weekTotals(rows: KPISubmission[]) {
  return {
    links: rows.reduce((sum, s) => sum + submissionQty(s), 0),
    points: rows.reduce((sum, s) => sum + (s.totalPoints || 0), 0),
    submits: rows.length,
  };
}

const POSITIVE = /(tốt|ok|duyệt|hay|xuất sắc|đạt)/i;
const NEGATIVE = /(lỗi|sai|chậm|thiếu|chưa đạt|vi phạm|sửa|cảnh báo|chặn)/i;

function formatWeekLabel(weekStart: string): string {
  const { start, end } = weekRange(weekStart);
  const s = new Date(start).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  const e = new Date(end).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `Tuần ${s} — ${e}`;
}

export interface WeeklyContextInput {
  submissions: KPISubmission[];
  weekStart: string;
  projectProgress?: WeeklyReportProject[];
  /** Số tổng đã chốt/sửa tay trên form (nếu có) — ưu tiên hơn số tự tính. */
  totalsOverride?: { links?: number; points?: number; submits?: number };
  customerCommentsRaw?: string;
  additionalContext?: string;
}

export function buildWeeklyReportContext(input: WeeklyContextInput): ReportContext {
  const { submissions, weekStart, projectProgress = [], totalsOverride = {} } = input;
  const inRange = submissionsInWeek(submissions, weekStart);
  const prevRange = submissionsInWeek(submissions, shiftWeek(weekStart, -1));

  const cur = weekTotals(inRange);
  const prev = weekTotals(prevRange);

  const byCat: Record<Category, number> = { baiMoi: 0, sku: 0, multimedia: 0, toiUu: 0, khac: 0 };
  inRange.forEach(s => { byCat[taskCategory(s.taskType)] += submissionQty(s); });

  const empMap = new Map<string, { links: number; points: number }>();
  const teamMap = new Map<string, { links: number; points: number }>();
  const taskMap = new Map<string, Map<string, { links: number; points: number }>>();
  inRange.forEach(s => {
    const qty = submissionQty(s);
    const add = (m: Map<string, { links: number; points: number }>, k: string) => {
      const p = m.get(k) || { links: 0, points: 0 };
      m.set(k, { links: p.links + qty, points: p.points + s.totalPoints });
    };
    add(empMap, s.employeeName);
    add(teamMap, s.teamGroup || 'Khác');
    const type = s.taskType || 'Khác';
    if (!taskMap.has(type)) taskMap.set(type, new Map());
    add(taskMap.get(type)!, s.taskDetail || s.taskType || 'Khác');
  });

  const topEmployees = Array.from(empMap.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.points - a.points);
  const teamBreakdown = Array.from(teamMap.entries()).sort((a, b) => b[1].points - a[1].points);
  const tasksBreakdown = Array.from(taskMap.entries())
    .map(([type, details]) => ({
      type,
      details: Array.from(details.entries()).map(([name, d]) => ({ name, ...d })).sort((a, b) => b.points - a.points),
    }))
    .sort((a, b) => a.type.localeCompare(b.type));

  // Hậu kiểm chất lượng: điểm 1–5 → quy về thang 10
  const withQc = inRange.filter(s => !!s.qualityCheck);
  const totalReviews = withQc.length;
  const avgScore = totalReviews > 0
    ? (withQc.reduce((sum, s) => sum + s.qualityCheck!.score, 0) / totalReviews) * 2
    : 0;
  const notes = withQc.map(s => s.qualityCheck!.note?.trim() || '').filter(Boolean);
  const positive = notes.filter(n => POSITIVE.test(n)).length;
  const negative = notes.filter(n => !POSITIVE.test(n) && NEGATIVE.test(n)).length;
  const pct = (n: number) => (notes.length > 0 ? Math.round((n / notes.length) * 100) : 0);

  const totalLinks = totalsOverride.links ?? cur.links;
  const totalPoints = totalsOverride.points ?? cur.points;
  const totalSubmits = totalsOverride.submits ?? cur.submits;

  return {
    periodLabel: formatWeekLabel(weekStart),
    stats: {
      totalLinks, totalPoints, totalSubmits,
      baiMoi: byCat.baiMoi, sku: byCat.sku, multimedia: byCat.multimedia, toiUu: byCat.toiUu,
      employeeCount: empMap.size,
      avgPointsPerEmp: empMap.size > 0 ? totalPoints / empMap.size : 0,
      // So sánh tự tính với tự tính để cùng một cách đếm
      deltaLinks: pctChange(cur.links, prev.links),
      deltaPoints: pctChange(cur.points, prev.points),
      deltaSubmits: pctChange(cur.submits, prev.submits),
    },
    teamBreakdown,
    topEmployees,
    qualityStats: {
      avgScore, totalReviews, totalComments: notes.length,
      pctPositive: pct(positive), pctNegative: pct(negative),
    },
    projectProgress: projectProgress.map(p => ({ name: p.projectName, progress: p.progress })),
    projectsFocus: projectProgress
      .map(p => ({
        name: p.projectName, type: 'Campaign',
        links: inRange.filter(s => s.projectId === p.projectId).reduce((sum, s) => sum + submissionQty(s), 0),
      }))
      .filter(p => p.links > 0)
      .sort((a, b) => b.links - a.links),
    tasksBreakdown,
    customerCommentsRaw: input.customerCommentsRaw,
    additionalContext: input.additionalContext,
  };
}
