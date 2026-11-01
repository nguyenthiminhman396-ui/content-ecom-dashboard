import { defaultTaskCategories, TEAM_GROUPS } from '@/shared/data/mockData';
import type { Member, MonthlyKPITarget, TeamGroup } from '@/shared/types';

// Phân bổ KPI: KPI tổng (theo đầu việc × site) → team → từng người.
// Các cấp liên kết với nhau bằng khoá period + taskType + siteId (không cần id cha),
// nên target tạo tay ở trang danh sách hay copy từ tháng trước vẫn được nhận vào đúng cây.

export const REAL_TEAMS = TEAM_GROUPS.filter(t => t !== 'Tất cả team') as TeamGroup[];

export const normSite = (siteId?: string) => siteId || '';

export const isTotal = (t: MonthlyKPITarget) => t.level === 'total';

/** Cùng đầu việc + site + kỳ với KPI tổng */
export function sameScope(t: MonthlyKPITarget, total: MonthlyKPITarget): boolean {
  return t.period === total.period
    && (t.taskType || '') === (total.taskType || '')
    && normSite(t.siteId) === normSite(total.siteId);
}

/** Team mặc định phụ trách đầu việc (theo TaskCategory) */
export function ownerTeamOf(taskType?: string): TeamGroup | null {
  const cat = defaultTaskCategories.find(c => c.taskTypeName === taskType);
  return (cat?.teamName as TeamGroup) ?? null;
}

/** Hệ số chia cho người: productivityFactor, mặc định Leader 0.6 / Member 1.0 */
export function memberWeight(m: Member): number {
  if (m.productivityFactor && m.productivityFactor > 0) return m.productivityFactor;
  return m.kpiRole === 'leader' || m.role === 'Leader' ? 0.6 : 1;
}

/** Nhân sự nhận KPI của team (Leader + Member) */
export function teamMembersOf(members: Member[], team: TeamGroup): Member[] {
  return members.filter(m => m.teamGroup === team && (m.role === 'Leader' || m.role === 'Member'));
}

/**
 * Chia `total` theo trọng số, làm tròn kiểu largest remainder để tổng luôn đúng bằng `total`.
 * Trọng số toàn 0 → chia đều.
 */
export function allocateByWeights(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const sumW = weights.reduce((s, w) => s + Math.max(0, w), 0);
  const ws = sumW > 0 ? weights.map(w => Math.max(0, w)) : weights.map(() => 1);
  const denom = ws.reduce((s, w) => s + w, 0);
  const raw = ws.map(w => (total * w) / denom);
  const out = raw.map(Math.floor);
  let rest = total - out.reduce((s, v) => s + v, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; rest > 0; k = (k + 1) % order.length, rest--) out[order[k].i]++;
  return out;
}

/** Target cấp team của một KPI tổng (gộp nếu bị trùng) */
export function teamTargetsOf(targets: MonthlyKPITarget[], total: MonthlyKPITarget, team: TeamGroup) {
  return targets.filter(t => !isTotal(t) && !t.employeeName && t.teamGroup === team && sameScope(t, total));
}

/** Target cá nhân của một người trong phạm vi KPI tổng */
export function memberTargetsOf(targets: MonthlyKPITarget[], total: MonthlyKPITarget, team: TeamGroup, name: string) {
  return targets.filter(t => !isTotal(t) && t.employeeName === name && t.teamGroup === team && sameScope(t, total));
}

export const sumLinks = (ts: MonthlyKPITarget[]) => ts.reduce((s, t) => s + t.targetLinks, 0);

// ── Độ gấp ────────────────────────────────────────────────────────────────
// Kết hợp ưu tiên Manager gắn (Cao/TB/Thấp) với tiến độ thực tế so với thời gian đã trôi qua.

export type Urgency = 'overdue' | 'urgent' | 'watch' | 'ok' | 'done';

export const URGENCY_RANK: Record<Urgency, number> = { overdue: 4, urgent: 3, watch: 2, ok: 1, done: 0 };
export const PRIORITY_RANK: Record<string, number> = { high: 2, medium: 1, low: 0 };

/** Số ngày đầu kỳ chưa đánh giá theo tốc độ (tránh mọi KPI đều "gấp" vào ngày 1–2) */
const GRACE_DAYS = 3;
/** Còn ≤ ngần này ngày mà chưa xong → gấp */
const FINAL_DAYS = 3;

const parseDay = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const dayDiff = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400_000);

/** Ngày bắt đầu / hạn chót của kỳ (deadline nếu có, ngược lại cuối tháng) */
export function periodRange(period: string, deadline?: string): { start: Date; end: Date } {
  const [y, m] = period.split('-').map(Number);
  return { start: new Date(y, m - 1, 1), end: deadline ? parseDay(deadline) : new Date(y, m, 0) };
}

export interface UrgencyInfo {
  level: Urgency;
  remaining: number;
  /** Số ngày còn lại, tính cả hôm nay */
  daysLeft: number;
  /** Link/ngày cần đạt từ hôm nay tới hạn */
  needPerDay: number;
  /** Link/ngày trung bình từ đầu kỳ tới hôm nay */
  pace: number;
  /** % thời gian đã trôi qua (0–100) */
  expectedPct: number;
  /** % đã đạt (0–100) */
  actualPct: number;
}

export function computeUrgency(opts: {
  target: number; actual: number; period: string;
  deadline?: string; priority?: string; today?: Date;
}): UrgencyInfo {
  const { target, actual, period, deadline, priority } = opts;
  const now = opts.today ?? new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const { start, end } = periodRange(period, deadline);
  const totalDays = Math.max(1, dayDiff(start, end) + 1);
  const elapsed = Math.min(totalDays, Math.max(0, dayDiff(start, today) + 1));
  // Kỳ chưa bắt đầu → đếm từ ngày đầu kỳ
  const daysLeft = Math.max(0, dayDiff(today < start ? start : today, end) + 1);
  const remaining = Math.max(0, target - actual);
  const expectedPct = (elapsed / totalDays) * 100;
  const actualPct = target > 0 ? (actual / target) * 100 : 100;
  const info = {
    remaining, daysLeft, expectedPct, actualPct,
    needPerDay: daysLeft > 0 ? remaining / daysLeft : remaining,
    pace: elapsed > 0 ? actual / elapsed : 0,
  };

  let level: Urgency;
  if (remaining === 0) level = 'done';
  else if (daysLeft === 0) level = 'overdue';
  else if (daysLeft <= FINAL_DAYS) level = 'urgent';
  else if (elapsed < GRACE_DAYS) level = 'ok';
  else if (actualPct < expectedPct * 0.7) level = 'urgent';
  else if (actualPct < expectedPct * 0.9) level = 'watch';
  else level = 'ok';

  // Ưu tiên Cao: đang chậm nhẹ cũng coi là gấp
  if (priority === 'high' && level === 'watch') level = 'urgent';
  return { level, ...info };
}

/** Điểm sắp xếp: độ gấp trước, ưu tiên sau */
export const urgencyScore = (u: Urgency, priority?: string) =>
  URGENCY_RANK[u] * 10 + (PRIORITY_RANK[priority ?? 'medium'] ?? 1);
