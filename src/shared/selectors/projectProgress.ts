import type { KPISubmission, Project, ProjectTask } from '../types/index.ts';

/**
 * Tiến độ dự án — nguồn tính DUY NHẤT cho Dashboard, ProjectsPage, ProjectDetailPage.
 *
 * Mỗi task cứng tính % theo trackingMode:
 *   - link      : số link submit / targetLinks
 *   - quantity  : tổng quantity / targetQuantity
 *   - hours     : tổng giờ làm (hoursWorked) / targetHours — cho dự án tính theo thời gian thực hiện
 *   - milestone : manualProgress (hoặc isDone) — mốc quản lý, không tính KPI
 * Tiến độ dự án = trung bình % các task. Không có task → project.manualProgress.
 *
 * Module thuần (không import runtime) để test được bằng `node --test`.
 */

/** Giờ làm của 1 submission: submit theo giờ lưu hoursWorked, submit theo link dùng timePerLink × số link */
export function submissionHours(s: KPISubmission): number {
  if (s.hoursWorked !== undefined && s.hoursWorked > 0) return s.hoursWorked;
  return (s.timePerLink ?? 0) * s.links.length;
}

/** Submission nào đóng góp vào task: gắn trực tiếp projectTaskId, hoặc match taskType/taskDetail/assignees */
export function matchTaskSubmissions(task: ProjectTask, projectSubs: KPISubmission[]): KPISubmission[] {
  return projectSubs.filter(s => {
    if (s.projectTaskId === task.id) return true;
    if (s.projectTaskId) return false; // đã gắn task khác
    if (task.taskType && s.taskType !== task.taskType) return false;
    if (task.taskDetail && s.taskDetail !== task.taskDetail) return false;
    if (task.assignees && task.assignees.length > 0 && !task.assignees.includes(s.employeeName)) return false;
    return !!task.taskType || !!task.taskDetail;
  });
}

export interface TaskProgress {
  task: ProjectTask;
  matched: KPISubmission[];
  links: number;
  qty: number;
  hours: number;
  points: number;
  progress: number;
}

const pct = (done: number, target: number) =>
  Math.max(0, Math.min(100, Math.round((done / target) * 100)));

export function computeTaskProgress(task: ProjectTask, projectSubs: KPISubmission[]): TaskProgress {
  const matched = matchTaskSubmissions(task, projectSubs);
  const links = matched.reduce((sum, s) => sum + s.links.length, 0);
  const qty = matched.reduce((sum, s) => sum + (s.quantity ?? 0), 0);
  const hours = Math.round(matched.reduce((sum, s) => sum + submissionHours(s), 0) * 10) / 10;
  const points = matched.reduce((sum, s) => sum + s.totalPoints, 0);

  let progress = 0;
  const mode = task.trackingMode || 'link';
  if (mode === 'milestone') {
    progress = task.manualProgress !== undefined ? task.manualProgress : (task.isDone ? 100 : 0);
  } else if (mode === 'hours') {
    if (task.targetHours && task.targetHours > 0) progress = pct(hours, task.targetHours);
  } else if (mode === 'quantity') {
    if (task.targetQuantity && task.targetQuantity > 0) progress = pct(qty, task.targetQuantity);
  } else if (task.targetLinks > 0) {
    progress = pct(links, task.targetLinks);
  }
  return { task, matched, links, qty, hours, points, progress };
}

/** Tiến độ tổng: trung bình % task; không có task → manualProgress của project */
export function overallProgress(project: Pick<Project, 'manualProgress'> | undefined, taskProgress: TaskProgress[]): number {
  if (taskProgress.length === 0) return project?.manualProgress ?? 0;
  return Math.round(taskProgress.reduce((s, x) => s + x.progress, 0) / taskProgress.length);
}

// ── Tiến độ theo thời gian (so % việc với % thời gian đã trôi) ────────────────

export type ScheduleStatus = 'done' | 'ahead' | 'on_track' | 'behind' | 'overdue' | 'no_deadline' | 'not_started';

export interface ProjectSchedule {
  status: ScheduleStatus;
  /** % thời gian đã trôi từ ngày bắt đầu → deadline; undefined nếu không xác định được ngày bắt đầu */
  elapsedPct?: number;
  /** Số ngày còn lại tới deadline (âm = đã quá hạn) */
  daysLeft?: number;
  /** progress − elapsedPct (điểm %) */
  gap?: number;
  /** Dự án chưa bắt đầu: số ngày tới ngày bắt đầu dự kiến (âm = lẽ ra đã phải bắt đầu) */
  startsIn?: number;
  startDate?: string;
}

/** Biên độ ± (điểm %) vẫn coi là đúng tiến độ */
export const SCHEDULE_TOLERANCE = 10;

const DAY_MS = 86_400_000;

/** 'YYYY-MM-DD' | ISO → mốc 00:00 giờ địa phương; invalid → NaN */
function dayStart(d: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.trim());
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
  const t = new Date(d);
  return isNaN(t.getTime()) ? NaN : new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
}

function toIsoDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Ngày bắt đầu dự án: project.startDate → tháng sớm nhất trong activeMonths → submission sớm nhất.
 */
export function resolveStartDate(
  project: Pick<Project, 'startDate' | 'activeMonths'>,
  projectSubs: KPISubmission[],
): string | undefined {
  if (project.startDate && !isNaN(dayStart(project.startDate))) return project.startDate;
  const months = (project.activeMonths ?? '')
    .split(',').map(s => s.trim()).filter(s => /^\d{4}-\d{2}$/.test(s)).sort();
  if (months.length > 0) return `${months[0]}-01`;
  const times = projectSubs.map(s => dayStart(s.submittedAt)).filter(t => !isNaN(t));
  if (times.length > 0) return toIsoDay(Math.min(...times));
  return undefined;
}

export function computeSchedule(
  progress: number,
  deadline: string | undefined,
  startDate: string | undefined,
  today: Date,
): ProjectSchedule {
  const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const end = deadline ? dayStart(deadline) : NaN;
  if (progress >= 100) {
    return { status: 'done', daysLeft: isNaN(end) ? undefined : Math.round((end - todayMs) / DAY_MS), startDate };
  }
  if (isNaN(end)) return { status: 'no_deadline', startDate };

  const daysLeft = Math.round((end - todayMs) / DAY_MS);
  if (daysLeft < 0) return { status: 'overdue', daysLeft, elapsedPct: 100, gap: progress - 100, startDate };

  const start = startDate ? dayStart(startDate) : NaN;
  if (isNaN(start) || start >= end) {
    // Không biết ngày bắt đầu → chỉ báo còn bao nhiêu ngày
    return { status: 'on_track', daysLeft, startDate };
  }
  const elapsedPct = Math.max(0, Math.min(100, Math.round(((todayMs - start) / (end - start)) * 100)));
  const gap = progress - elapsedPct;
  const status: ScheduleStatus =
    gap >= SCHEDULE_TOLERANCE ? 'ahead' : gap <= -SCHEDULE_TOLERANCE ? 'behind' : 'on_track';
  return { status, elapsedPct, daysLeft, gap, startDate };
}

/**
 * Lịch theo TRẠNG THÁI dự án do Manager đặt:
 *   - Hoàn thành   → luôn 'done' (không báo quá hạn dù % task chưa đủ 100)
 *   - Chưa bắt đầu → 'not_started' + số ngày tới ngày bắt đầu dự kiến
 *   - còn lại      → so % việc với % thời gian (computeSchedule)
 */
export function projectSchedule(
  project: Pick<Project, 'status' | 'deadline' | 'startDate' | 'activeMonths'>,
  progress: number,
  projectSubs: KPISubmission[],
  today: Date,
): ProjectSchedule {
  const startDate = resolveStartDate(project, projectSubs);
  const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const end = project.deadline ? dayStart(project.deadline) : NaN;
  const daysLeft = isNaN(end) ? undefined : Math.round((end - todayMs) / DAY_MS);
  if (project.status === 'Hoàn thành') return { status: 'done', daysLeft, startDate };
  if (project.status === 'Chưa bắt đầu') {
    const start = project.startDate ? dayStart(project.startDate) : NaN;
    return {
      status: 'not_started', daysLeft, startDate: project.startDate || undefined,
      startsIn: isNaN(start) ? undefined : Math.round((start - todayMs) / DAY_MS),
    };
  }
  return computeSchedule(progress, project.deadline, startDate, today);
}

// ── Tóm tắt dự án cho Dashboard ──────────────────────────────────────────────

export interface ProjectSummary {
  project: Project;
  progress: number;
  taskCount: number;
  milestoneCount: number;
  milestoneDone: number;
  /** Luỹ kế toàn dự án (khớp với cách tính % tiến độ) */
  links: number;
  hours: number;
  points: number;
  /** Phần phát sinh trong kỳ đang lọc */
  periodLinks: number;
  periodHours: number;
  periodPoints: number;
  /** 'time' = dự án chỉ có mốc / tính theo giờ → không nên hiển thị bằng link */
  kind: 'output' | 'time';
  /** Có task tracking theo giờ → luôn hiển thị số giờ, kể cả khi dự án cũng có link */
  tracksHours: boolean;
  schedule: ProjectSchedule;
}

const SCHEDULE_RANK: Record<ScheduleStatus, number> = {
  overdue: 0, behind: 1, on_track: 2, no_deadline: 3, ahead: 4, not_started: 5, done: 6,
};

export function summarizeProject(
  project: Project,
  allTasks: ProjectTask[],
  allSubs: KPISubmission[],
  opts: { today: Date; periodFrom?: number; periodTo?: number },
): ProjectSummary {
  const tasks = allTasks.filter(t => t.projectId === project.id);
  const subs = allSubs.filter(s => s.projectId === project.id);
  const tp = tasks.map(t => computeTaskProgress(t, subs));
  const progress = overallProgress(project, tp);

  const inPeriod = (s: KPISubmission) => {
    const t = new Date(s.submittedAt).getTime();
    if (isNaN(t)) return false;
    return (opts.periodFrom === undefined || t >= opts.periodFrom) && (opts.periodTo === undefined || t <= opts.periodTo);
  };
  const periodSubs = subs.filter(inPeriod);
  const sumLinks = (xs: KPISubmission[]) => xs.reduce((n, s) => n + s.links.length, 0);
  const sumHours = (xs: KPISubmission[]) => Math.round(xs.reduce((n, s) => n + submissionHours(s), 0) * 10) / 10;
  const sumPoints = (xs: KPISubmission[]) => xs.reduce((n, s) => n + s.totalPoints, 0);

  const milestones = tasks.filter(t => t.trackingMode === 'milestone');
  const milestoneDone = tp.filter(x => x.task.trackingMode === 'milestone' && x.progress >= 100).length;
  const timeBased = tasks.length === 0
    || tasks.every(t => t.trackingMode === 'milestone' || t.trackingMode === 'hours');
  const links = sumLinks(subs);

  return {
    project,
    progress,
    taskCount: tasks.length,
    milestoneCount: milestones.length,
    milestoneDone,
    links,
    hours: sumHours(subs),
    points: sumPoints(subs),
    periodLinks: sumLinks(periodSubs),
    periodHours: sumHours(periodSubs),
    periodPoints: sumPoints(periodSubs),
    kind: timeBased && links === 0 ? 'time' : 'output',
    tracksHours: tasks.some(t => t.trackingMode === 'hours'),
    schedule: projectSchedule(project, progress, subs, opts.today),
  };
}

/** Sắp xếp ưu tiên rủi ro: quá hạn → chậm → đúng tiến độ → … → xong; cùng nhóm thì deadline gần trước */
export function sortByRisk(a: ProjectSummary, b: ProjectSummary): number {
  const r = SCHEDULE_RANK[a.schedule.status] - SCHEDULE_RANK[b.schedule.status];
  if (r !== 0) return r;
  const da = a.schedule.daysLeft ?? Number.POSITIVE_INFINITY;
  const db = b.schedule.daysLeft ?? Number.POSITIVE_INFINITY;
  if (da !== db) return da - db;
  return a.progress - b.progress;
}
