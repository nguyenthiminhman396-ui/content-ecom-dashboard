import type { KPIScaleConfig, KPISubmission, KpiRole, Member, RoleChange } from '../types/index.ts';

/**
 * Target KPI (điểm) theo ngày công — nguồn tính DUY NHẤT cho Dashboard, Performance, Leadership.
 *
 * Target 1 người trong khoảng [from, to] = Σ_ngày  memberTargetPoints × hệ số(ngày) / số ngày của tháng đó,
 * chỉ cộng những ngày người đó còn trong team (joinedAt ≤ ngày ≤ leftAt).
 *   - Thêm member giữa tháng  → target tính từ ngày vào.
 *   - Bớt member (cho nghỉ)   → target dừng sau ngày làm việc cuối; điểm đã làm vẫn giữ.
 *   - Member → Leader giữa tháng → ngày trước dùng hệ số Member, từ ngày đổi dùng hệ số Leader.
 * Đủ cả tháng với 1 vai trò → đúng bằng memberTargetPoints × hệ số (như công thức cũ).
 *
 * Module thuần (không import runtime) để test được bằng `node --test`.
 */

export type DayKey = string; // 'YYYY-MM-DD'

export function toDayKey(d: Date): DayKey {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** ISO / 'YYYY-MM-DD' → DayKey theo giờ địa phương; invalid → undefined */
export function dayKeyOf(s: string | undefined): DayKey | undefined {
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s.trim())) return s.trim();
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : toDayKey(d);
}

/** Ngày đầu / cuối tháng chứa `day` */
export function monthBounds(day: DayKey): { from: DayKey; to: DayKey } {
  const [y, m] = day.split('-').map(Number);
  return { from: toDayKey(new Date(y, m - 1, 1)), to: toDayKey(new Date(y, m, 0)) };
}

export interface RoleState {
  kpiRole: KpiRole;
  productivityFactor?: number;
}

function currentState(m: Member): RoleState {
  return {
    kpiRole: m.kpiRole ?? (m.role === 'Leader' ? 'leader' : 'member'),
    productivityFactor: m.productivityFactor,
  };
}

/** Vai trò KPI của người đó tại 1 ngày, dựa trên roleHistory (không có lịch sử → vai trò hiện tại) */
export function roleStateAt(m: Member, day: DayKey): RoleState {
  const hist = [...(m.roleHistory ?? [])].sort((a, b) => a.from.localeCompare(b.from));
  if (hist.length === 0) return currentState(m);
  let pick = hist[0];
  for (const h of hist) if (h.from <= day) pick = h;
  return { kpiRole: pick.kpiRole, productivityFactor: pick.productivityFactor };
}

/** Hệ số sản xuất: productivityFactor riêng → mặc định Leader = leaderProductionWeight, Member = 1 */
export function factorOf(state: RoleState, scale: Pick<KPIScaleConfig, 'leaderProductionWeight'>): number {
  if (state.productivityFactor !== undefined && state.productivityFactor > 0) return state.productivityFactor;
  return state.kpiRole === 'leader' ? scale.leaderProductionWeight : 1;
}

/** Còn trong team ngày đó không (leftAt = ngày làm việc cuối, vẫn tính) */
export function isEmployedOn(m: Member, day: DayKey): boolean {
  if (m.joinedAt && day < m.joinedAt) return false;
  if (m.leftAt && day > m.leftAt) return false;
  return true;
}

/** Người nhận KPI: chỉ Leader / Member (Manager, Client không có target sản xuất) */
export function isKpiEligible(m: Member): boolean {
  return m.role === 'Leader' || m.role === 'Member';
}

function eachDay(from: DayKey, to: DayKey, fn: (day: DayKey, daysInMonth: number) => void) {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const end = new Date(ty, tm - 1, td).getTime();
  for (let d = new Date(fy, fm - 1, fd); d.getTime() <= end; d.setDate(d.getDate() + 1)) {
    fn(toDayKey(d), new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate());
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Target điểm của 1 người trong [from, to].
 * `onlyRole` = chỉ cộng những ngày người đó giữ vai trò này (VD KPI team của Lead chỉ tính ngày làm Member).
 */
export function memberTarget(
  m: Member, from: DayKey, to: DayKey,
  scale: Pick<KPIScaleConfig, 'memberTargetPoints' | 'leaderProductionWeight'>,
  onlyRole?: KpiRole,
): number {
  if (from > to) return 0;
  let sum = 0;
  eachDay(from, to, (day, dim) => {
    if (!isEmployedOn(m, day)) return;
    const st = roleStateAt(m, day);
    if (onlyRole && st.kpiRole !== onlyRole) return;
    sum += (scale.memberTargetPoints * factorOf(st, scale)) / dim;
  });
  return round2(sum);
}

export interface RosterOptions {
  /** Chỉ lấy team này (undefined = toàn bộ) */
  team?: string;
  /** Tên đã từng submit — member cũ chưa khai ngày vào chỉ được tính nếu có submission */
  submitterNames?: Set<string>;
  /** Loại khỏi roster (VD tài khoản Manager dùng thử) */
  excludeNames?: string[];
}

/**
 * Danh sách người tính target trong [from, to]:
 * Leader/Member, đúng team, còn làm ít nhất 1 ngày trong khoảng, và
 * (có joinedAt — tức được thêm qua form mới) hoặc đã từng submit (dữ liệu cũ, tránh tính người "treo" trong danh sách).
 */
export function kpiRoster(members: Member[], from: DayKey, to: DayKey, opts: RosterOptions = {}): Member[] {
  return members.filter(m => {
    if (!isKpiEligible(m)) return false;
    if (opts.excludeNames?.includes(m.name)) return false;
    if (opts.team !== undefined && m.teamGroup !== opts.team) return false;
    if (m.joinedAt && m.joinedAt > to) return false;
    if (m.leftAt && m.leftAt < from) return false;
    if (!m.joinedAt && opts.submitterNames && !opts.submitterNames.has(m.name)) return false;
    return true;
  });
}

export interface TeamTarget {
  total: number;
  perMember: { name: string; target: number }[];
}

export function teamTarget(
  roster: Member[], from: DayKey, to: DayKey,
  scale: Pick<KPIScaleConfig, 'memberTargetPoints' | 'leaderProductionWeight'>,
  onlyRole?: KpiRole,
): TeamTarget {
  const perMember = roster.map(m => ({ name: m.name, target: memberTarget(m, from, to, scale, onlyRole) }));
  return { total: round2(perMember.reduce((s, x) => s + x.target, 0)), perMember };
}

/** Submission có được tính cho vai trò `role` không (theo vai trò người nộp tại ngày nộp) */
export function submittedAsRole(sub: KPISubmission, members: Member[], role: KpiRole): boolean {
  const m = members.find(x => x.name === sub.employeeName);
  const day = dayKeyOf(sub.submittedAt);
  if (!m || !day) return false;
  return roleStateAt(m, day).kpiRole === role;
}

// ── Ghi lịch sử vai trò khi Manager sửa member ───────────────────────────────

/**
 * Trả về roleHistory mới nếu vai trò KPI / hệ số thay đổi, áp dụng từ `effectiveFrom`.
 * Lần đổi đầu tiên sẽ lưu thêm trạng thái cũ (từ joinedAt hoặc từ đầu) để các ngày trước vẫn tính đúng.
 * Không đổi gì → undefined.
 */
export function nextRoleHistory(prev: Member, next: Partial<Member>, effectiveFrom: DayKey): RoleChange[] | undefined {
  const before = currentState(prev);
  const after = currentState({ ...prev, ...next } as Member);
  const sameFactor = (before.productivityFactor ?? null) === (after.productivityFactor ?? null);
  if (before.kpiRole === after.kpiRole && sameFactor) return undefined;

  const hist = [...(prev.roleHistory ?? [])];
  if (hist.length === 0) {
    hist.push({ from: prev.joinedAt || '0000-01-01', ...before });
  }
  // Cùng ngày hiệu lực → ghi đè (sửa nhầm trong ngày), các mốc sau ngày hiệu lực bị thay thế
  const kept = hist.filter(h => h.from < effectiveFrom);
  kept.push({ from: effectiveFrom, ...after });
  return kept.sort((a, b) => a.from.localeCompare(b.from));
}
