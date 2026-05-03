import type { Member, KPISubmission, ProjectTask, RnDLog, KPIScaleConfig, BonusPoint } from '@/shared/types';

/**
 * Leadership Score 2 chiều cốt lõi (50/50):
 *   - KPI Team   (50%): % team đạt target tổng — đo Lead có dẫn dắt team đạt KPI không
 *   - Deadline   (50%): % project task team Lead phụ trách hoàn thành đúng deadline
 *
 * Spot-check & R&D vẫn track để Manager tham khảo nhưng KHÔNG tự cộng vào Score.
 * Manager đánh giá những mảng phụ này qua thưởng/phạt (Bonus).
 */
export interface LeadershipMetrics {
  leaderName: string;
  teamGroup: string;
  period: string;            // 'YYYY-MM'
  // KPI Team
  teamMembers: number;
  teamPointsActual: number;
  teamPointsTarget: number;
  kpiTeamScore: number;      // 0-100 (% target)
  // SLA / Deadline
  totalTasks: number;
  onTimeTasks: number;
  slaScore: number;          // 0-100
  // Phụ — chỉ tham khảo, không vào tổng
  teamSubmissions: number;
  spotCheckedCount: number;
  spotCoverage: number;      // 0-100
  avgQualityScore: number;   // 0-5
  rndLogsCount: number;
  rndCompletedCount: number;
  rndImpactSum: number;
  // Tổng
  totalScore: number;        // 0-100 (= avg KPI + SLA)
}

const KPI_WEIGHT = 0.50;
const SLA_WEIGHT = 0.50;

function getMonthKey(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function computeLeadershipMetrics(
  leader: Member,
  period: string,
  members: Member[],
  submissions: KPISubmission[],
  projectTasks: ProjectTask[],
  rndLogs: RnDLog[],
  scaleConfig: KPIScaleConfig,
  bonusPoints: BonusPoint[] = [],
): LeadershipMetrics {
  const teamGroup = leader.teamGroup ?? '';

  // ── Member của team Lead phụ trách ──
  const teamMembersList = members.filter(m =>
    m.teamGroup === teamGroup && m.kpiRole === 'member'
  );
  const teamMemberNames = teamMembersList.map(m => m.name);

  // ── Submissions của team trong tháng ──
  const teamSubs = submissions.filter(s =>
    teamMemberNames.includes(s.employeeName) && getMonthKey(s.submittedAt) === period
  );

  // ── 1. KPI Team — % team đạt target ──
  const teamPointsBase = teamSubs.reduce((sum, s) => sum + s.totalPoints, 0);
  const teamBonus = bonusPoints
    .filter(b => teamMemberNames.includes(b.employeeName) && b.period === period && b.status === 'approved')
    .reduce((sum, b) => sum + b.amount, 0);
  const teamPointsActual = teamPointsBase + teamBonus;
  const teamPointsTarget = teamMembersList.length * scaleConfig.memberTargetPoints;
  const kpiTeamScore = teamPointsTarget > 0
    ? Math.min(150, Math.round((teamPointsActual / teamPointsTarget) * 100))  // có thể vượt 100 (cap 150)
    : 0;
  // Score đóng góp vào tổng: cap 100
  const kpiTeamScoreCapped = Math.min(100, kpiTeamScore);

  // ── 2. SLA — % task cứng đúng deadline ──
  const monthEnd = (() => {
    const [y, m] = period.split('-').map(Number);
    return new Date(y, m, 0, 23, 59, 59).getTime();
  })();
  const monthStart = (() => {
    const [y, m] = period.split('-').map(Number);
    return new Date(y, m - 1, 1).getTime();
  })();

  // Task của team Lead phụ trách: assignee thuộc team, hoặc deadline trong tháng
  const tasksThisPeriod = projectTasks.filter(t => {
    if (!t.deadline) return false;
    const dl = new Date(t.deadline).getTime();
    if (isNaN(dl) || dl < monthStart || dl > monthEnd) return false;
    // Filter task thuộc team: assignee match, hoặc submissions liên quan đều của team
    if (t.assignee && !teamMemberNames.includes(t.assignee)) return false;
    return true;
  });

  let onTimeTasks = 0;
  for (const t of tasksThisPeriod) {
    const dl = new Date(t.deadline!).getTime();
    const matched = submissions.filter(s => {
      if (s.projectTaskId === t.id) return true;
      if (s.projectTaskId) return false;
      if (t.taskType && s.taskType !== t.taskType) return false;
      if (t.taskDetail && s.taskDetail !== t.taskDetail) return false;
      if (t.assignee && s.employeeName !== t.assignee) return false;
      return !!t.taskType || !!t.taskDetail;
    });
    const totalLinks = matched.reduce((sum, s) => sum + s.links.length, 0);
    if (totalLinks < t.targetLinks) continue;
    const lastSubmitTime = Math.max(0, ...matched.map(s => new Date(s.submittedAt).getTime()));
    if (lastSubmitTime <= dl) onTimeTasks++;
  }
  const slaScore = tasksThisPeriod.length > 0
    ? Math.round((onTimeTasks / tasksThisPeriod.length) * 100)
    : 0;

  // ── Phụ: spot-check & R&D (chỉ track, không vào tổng) ──
  const spotChecked = teamSubs.filter(s => s.qualityCheck && s.qualityCheck.score > 0);
  const spotCoverage = teamSubs.length > 0
    ? (spotChecked.length / teamSubs.length) * 100
    : 0;
  const avgQualityScore = spotChecked.length > 0
    ? spotChecked.reduce((s, x) => s + (x.qualityCheck!.score), 0) / spotChecked.length
    : 0;

  const myLogs = rndLogs.filter(l => l.leaderName === leader.name && l.period === period);
  const rndCompleted = myLogs.filter(l => l.status === 'completed');

  // ── Tổng: 50/50 ──
  const totalScore = Math.round(
    kpiTeamScoreCapped * KPI_WEIGHT +
    slaScore * SLA_WEIGHT
  );

  return {
    leaderName: leader.name,
    teamGroup,
    period,
    teamMembers: teamMembersList.length,
    teamPointsActual: Math.round(teamPointsActual * 10) / 10,
    teamPointsTarget,
    kpiTeamScore,
    totalTasks: tasksThisPeriod.length,
    onTimeTasks,
    slaScore,
    teamSubmissions: teamSubs.length,
    spotCheckedCount: spotChecked.length,
    spotCoverage: Math.round(spotCoverage * 10) / 10,
    avgQualityScore: Math.round(avgQualityScore * 10) / 10,
    rndLogsCount: myLogs.length,
    rndCompletedCount: rndCompleted.length,
    rndImpactSum: rndCompleted.reduce((sum, l) => sum + l.impact, 0),
    totalScore,
  };
}

export const LEADERSHIP_WEIGHTS = {
  kpi: KPI_WEIGHT,
  sla: SLA_WEIGHT,
};
