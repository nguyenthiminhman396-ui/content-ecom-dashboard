import { useMemo, useState } from 'react';
import { useAppStore } from '@/shared/store/appStore';
import {
  TrendingUp, TrendingDown, Minus, Trophy, Link2, Users,
  FolderKanban, Sparkles, Target, Calendar, X, BarChart3 as BarChart3Icon, Download
} from 'lucide-react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Tooltip, Legend, Filler
} from 'chart.js';
import { Doughnut, Line } from 'react-chartjs-2';
import type { KPISubmission } from '@/shared/types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler);

// ── Helpers ─────────────────────────────────────────────────────────────────
function getMonthKey(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(yyyymm: string, delta: number): string {
  const [y, m] = yyyymm.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonth(yyyymm: string): string {
  const [y, m] = yyyymm.split('-');
  return `Tháng ${parseInt(m)}/${y}`;
}

function pct(now: number, prev: number): number {
  if (prev === 0) return now > 0 ? 100 : 0;
  return Math.round(((now - prev) / prev) * 100);
}

// ── Component ───────────────────────────────────────────────────────────────
function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function startOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }

export default function DashboardPage() {
  const { submissions, projects, scaleConfig, members, currentUser, projectTasks, bonusPoints } = useAppStore();

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prevMonth = shiftMonth(thisMonth, -1);

  // ── Date range state — default: full current month ────────────────────────
  const [dateFrom, setDateFrom] = useState<string>(fmtDate(startOfMonth(now)));
  const [dateTo,   setDateTo]   = useState<string>(fmtDate(endOfMonth(now)));
  const [filterTeam, setFilterTeam] = useState('');
  const [filterTask, setFilterTask] = useState('');
  // ── Personnel filter (Manager/Leader) ────────────────────────────────────
  const [filterEmployee, setFilterEmployee] = useState('');

  const setRange = (preset: 'today' | '7d' | '30d' | 'thisMonth' | 'prevMonth' | 'all') => {
    const today = new Date();
    if (preset === 'today') {
      setDateFrom(fmtDate(today)); setDateTo(fmtDate(today));
    } else if (preset === '7d') {
      const ago = new Date(today); ago.setDate(today.getDate() - 6);
      setDateFrom(fmtDate(ago)); setDateTo(fmtDate(today));
    } else if (preset === '30d') {
      const ago = new Date(today); ago.setDate(today.getDate() - 29);
      setDateFrom(fmtDate(ago)); setDateTo(fmtDate(today));
    } else if (preset === 'thisMonth') {
      setDateFrom(fmtDate(startOfMonth(today))); setDateTo(fmtDate(endOfMonth(today)));
    } else if (preset === 'prevMonth') {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last  = new Date(today.getFullYear(), today.getMonth(), 0);
      setDateFrom(fmtDate(first)); setDateTo(fmtDate(last));
    } else {
      setDateFrom(''); setDateTo('');
    }
  };

  // ── Filter submissions for the user's scope ──
  const scopedSubs = useMemo<KPISubmission[]>(() => {
    if (!currentUser) return [];
    let base: KPISubmission[] = [];
    if (currentUser.role === 'Manager') {
      base = submissions;
    } else if (currentUser.role === 'Leader') {
      const me = members.find(m => m.name === currentUser.name || m.id === currentUser.id);
      if (!me?.teamGroup) {
        base = submissions.filter(s => s.employeeName === currentUser.name);
      } else {
        base = submissions.filter(s => {
          const emp = members.find(mm => mm.name === s.employeeName);
          return emp?.teamGroup === me.teamGroup || s.employeeName === currentUser.name;
        });
      }
    } else {
      base = submissions.filter(s => s.employeeName === currentUser.name);
    }
    // Apply personnel filter (Manager/Leader only)
    if (filterEmployee && (currentUser.role === 'Manager' || currentUser.role === 'Leader')) {
      base = base.filter(s => s.employeeName === filterEmployee);
    }
    return base;
  }, [submissions, currentUser, members, filterEmployee]);

  // ── Available employees for filter (based on scope) ──
  const availableEmployees = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'Manager') {
      return Array.from(new Set(submissions.map(s => s.employeeName))).sort();
    }
    if (currentUser.role === 'Leader') {
      const me = members.find(m => m.name === currentUser.name || m.id === currentUser.id);
      if (!me?.teamGroup) return [currentUser.name];
      const teamMembers = members.filter(m => m.teamGroup === me.teamGroup).map(m => m.name);
      return Array.from(new Set([...teamMembers, currentUser.name])).sort();
    }
    return [];
  }, [currentUser, members, submissions]);

  // ── Range filter ─────────────────────────────────────────────────────────
  const fromMs = dateFrom ? new Date(dateFrom + 'T00:00:00').getTime() : -Infinity;
  const toMs   = dateTo   ? new Date(dateTo   + 'T23:59:59').getTime() : Infinity;
  const rangeDays = (dateFrom && dateTo)
    ? Math.max(1, Math.ceil((toMs - fromMs) / 86400_000))
    : 30;

  // ── So sánh: CÙNG KỲ THÁNG TRƯỚC ──
  // Nếu xem 1-15/5/2026 → so sánh 1-15/4/2026 (lùi đúng 1 tháng âm lịch, giữ ngày)
  function shiftMonthDate(iso: string, deltaMonths: number): string {
    if (!iso) return '';
    const d = new Date(iso + (iso.length <= 10 ? 'T00:00:00' : ''));
    d.setMonth(d.getMonth() + deltaMonths);
    return d.toISOString().slice(0, 10);
  }
  const prevDateFrom = dateFrom ? shiftMonthDate(dateFrom, -1) : '';
  const prevDateTo   = dateTo   ? shiftMonthDate(dateTo, -1)   : '';
  const prevFromMs = prevDateFrom ? new Date(prevDateFrom + 'T00:00:00').getTime() : -Infinity;
  const prevToMs   = prevDateTo   ? new Date(prevDateTo   + 'T23:59:59').getTime() : Infinity;

  const thisMonthSubs = useMemo(
    () => scopedSubs.filter(s => {
      const t = new Date(s.submittedAt).getTime();
      return !isNaN(t) && t >= fromMs && t <= toMs;
    }),
    [scopedSubs, fromMs, toMs]
  );
  const prevMonthSubs = useMemo(
    () => scopedSubs.filter(s => {
      const t = new Date(s.submittedAt).getTime();
      return !isNaN(t) && t >= prevFromMs && t <= prevToMs;
    }),
    [scopedSubs, prevFromMs, prevToMs]
  );

  const rangeLabel = (!dateFrom && !dateTo)
    ? 'Toàn bộ thời gian'
    : `${dateFrom || '…'} → ${dateTo || '…'} (${rangeDays} ngày)`;
  const prevRangeLabel = (!dateFrom && !dateTo)
    ? '—'
    : `cùng kỳ tháng trước (${prevDateFrom} → ${prevDateTo})`;

  // ── Bonus trong range (chỉ tính approved + cùng scope nhân sự) ──
  const scopedBonus = useMemo(() => {
    let base = bonusPoints.filter(b => b.status === 'approved');
    if (!currentUser) return [];
    // Scope theo role
    if (currentUser.role === 'Leader') {
      const me = members.find(m => m.name === currentUser.name || m.id === currentUser.id);
      if (!me?.teamGroup) {
        base = base.filter(b => b.employeeName === currentUser.name);
      } else {
        base = base.filter(b => {
          const emp = members.find(mm => mm.name === b.employeeName);
          return emp?.teamGroup === me.teamGroup || b.employeeName === currentUser.name;
        });
      }
    } else if (currentUser.role === 'Member') {
      base = base.filter(b => b.employeeName === currentUser.name);
    }
    // Scope theo personnel filter
    if (filterEmployee && (currentUser.role === 'Manager' || currentUser.role === 'Leader')) {
      base = base.filter(b => b.employeeName === filterEmployee);
    }
    return base;
  }, [bonusPoints, currentUser, members, filterEmployee]);

  const bonusInRange = useMemo(() => {
    if (!dateFrom && !dateTo) return scopedBonus;
    return scopedBonus.filter(b => {
      const t = new Date(b.awardedAt).getTime();
      return !isNaN(t) && t >= fromMs && t <= toMs;
    });
  }, [scopedBonus, dateFrom, dateTo, fromMs, toMs]);
  const bonusInPrevRange = useMemo(() => {
    if (!dateFrom && !dateTo) return [];
    return scopedBonus.filter(b => {
      const t = new Date(b.awardedAt).getTime();
      return !isNaN(t) && t >= prevFromMs && t <= prevToMs;
    });
  }, [scopedBonus, dateFrom, dateTo, prevFromMs, prevToMs]);

  const totalBonusNow  = bonusInRange.reduce((s, b) => s + b.amount, 0);
  const totalBonusPrev = bonusInPrevRange.reduce((s, b) => s + b.amount, 0);

  // ── Top-level stats ──
  const stats = useMemo(() => {
    const tNow = {
      links:  thisMonthSubs.reduce((s, x) => s + x.links.length, 0),
      points: thisMonthSubs.reduce((s, x) => s + x.totalPoints, 0) + totalBonusNow,
      time:   thisMonthSubs.reduce((s, x) => s + (x.timePerLink * x.links.length), 0),
      employees: new Set(thisMonthSubs.map(s => s.employeeName)).size,
      submissions: thisMonthSubs.length,
    };
    const tPrev = {
      links:  prevMonthSubs.reduce((s, x) => s + x.links.length, 0),
      points: prevMonthSubs.reduce((s, x) => s + x.totalPoints, 0) + totalBonusPrev,
      time:   prevMonthSubs.reduce((s, x) => s + (x.timePerLink * x.links.length), 0),
      employees: new Set(prevMonthSubs.map(s => s.employeeName)).size,
      submissions: prevMonthSubs.length,
    };
    return { now: tNow, prev: tPrev, bonusNow: totalBonusNow, bonusPrev: totalBonusPrev };
  }, [thisMonthSubs, prevMonthSubs, totalBonusNow, totalBonusPrev]);

  // ── Doughnut: tỉ trọng 3 nhóm ──
  const teamData = useMemo(() => {
    const m: Record<string, number> = { 'Bài viết': 0, 'Sản phẩm': 0, 'Multimedia - Tin nhanh': 0 };
    for (const s of thisMonthSubs) {
      if (s.teamGroup && s.teamGroup in m) m[s.teamGroup] += s.links.length;
    }
    return {
      labels: Object.keys(m),
      datasets: [{
        data: Object.values(m),
        backgroundColor: ['#2453d6', '#7a9af6', '#2dc4ab'],
        borderWidth: 0,
      }]
    };
  }, [thisMonthSubs]);

  // ── Line: 6 tháng gần nhất ──
  const trendData = useMemo(() => {
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) months.push(shiftMonth(thisMonth, -i));
    const linksByMonth = months.map(m =>
      scopedSubs.filter(s => getMonthKey(s.submittedAt) === m).reduce((sum, x) => sum + x.links.length, 0)
    );
    const pointsByMonth = months.map(m =>
      scopedSubs.filter(s => getMonthKey(s.submittedAt) === m).reduce((sum, x) => sum + x.totalPoints, 0)
    );
    return {
      labels: months.map(m => formatMonth(m).replace('Tháng ', 'T')),
      datasets: [
        {
          label: 'Link nộp',
          data: linksByMonth,
          borderColor: '#2453d6',
          backgroundColor: 'rgba(36, 83, 214, 0.12)',
          tension: 0.35,
          fill: true,
          yAxisID: 'y',
        },
        {
          label: 'Điểm',
          data: pointsByMonth,
          borderColor: '#2dc4ab',
          backgroundColor: 'rgba(45, 196, 171, 0.10)',
          tension: 0.35,
          fill: false,
          yAxisID: 'y1',
        },
      ]
    };
  }, [scopedSubs, thisMonth]);

  // ── Project progress (auto từ tasks cứng) ──
  const projectProgress = useMemo(() => {
    return projects.filter(p => p.status === 'Đang chạy').map(p => {
      const subs = thisMonthSubs.filter(s => s.projectId === p.id);
      const links = subs.reduce((sum, x) => sum + x.links.length, 0);
      const points = subs.reduce((sum, x) => sum + x.totalPoints, 0);

      // Tiến độ task cứng: avg(taskProgress)
      const tasks = projectTasks.filter(t => t.projectId === p.id);
      let taskProgress = 0;
      if (tasks.length > 0) {
        const allSubs = submissions.filter(s => s.projectId === p.id);
        const total = tasks.reduce((acc, t) => {
          const matched = allSubs.filter(s => {
            if (s.projectTaskId === t.id) return true;
            if (s.projectTaskId) return false;
            if (t.taskType && s.taskType !== t.taskType) return false;
            if (t.taskDetail && s.taskDetail !== t.taskDetail) return false;
            if (t.assignees && t.assignees.length > 0 && !t.assignees.includes(s.employeeName)) return false;
            return !!t.taskType || !!t.taskDetail;
          });
          const linkCount = matched.reduce((sum, s) => sum + s.links.length, 0);
          return acc + Math.min(100, Math.round((linkCount / Math.max(t.targetLinks, 1)) * 100));
        }, 0);
        taskProgress = Math.round(total / tasks.length);
      } else if (links > 0) {
        taskProgress = 50;
      }
      return { project: p, links, points, taskProgress, taskCount: tasks.length };
    }).sort((a, b) => b.links - a.links);
  }, [projects, thisMonthSubs, projectTasks, submissions]);

  // ── Chi tiết đầu việc — kỳ này vs cùng kỳ tháng trước ──
  // Leader: xem TOÀN BỘ submissions (cross-team) để quản lý đầu việc mình phụ trách
  const taskDetailNowSubs = useMemo(() => {
    if (currentUser?.role === 'Leader') {
      let all = submissions.filter(s => {
        const t = new Date(s.submittedAt).getTime();
        return !isNaN(t) && t >= fromMs && t <= toMs;
      });
      if (filterEmployee) all = all.filter(s => s.employeeName === filterEmployee);
      return all;
    }
    return thisMonthSubs;
  }, [currentUser, submissions, thisMonthSubs, fromMs, toMs, filterEmployee]);

  const taskDetailPrevSubs = useMemo(() => {
    if (currentUser?.role === 'Leader') {
      let all = submissions.filter(s => {
        const t = new Date(s.submittedAt).getTime();
        return !isNaN(t) && t >= prevFromMs && t <= prevToMs;
      });
      if (filterEmployee) all = all.filter(s => s.employeeName === filterEmployee);
      return all;
    }
    return prevMonthSubs;
  }, [currentUser, submissions, prevMonthSubs, prevFromMs, prevToMs, filterEmployee]);

  const taskDetailBreakdown = useMemo(() => {
    type Row = { teamGroup: string; taskType: string; taskDetail: string;
                 nowLinks: number; nowPoints: number;
                 prevLinks: number; prevPoints: number; };
    const map = new Map<string, Row>();

    const upsert = (s: typeof scopedSubs[number], side: 'now' | 'prev') => {
      const key = `${s.teamGroup}|${s.taskType}|${s.taskDetail}`;
      const cur = map.get(key) ?? {
        teamGroup: s.teamGroup, taskType: s.taskType, taskDetail: s.taskDetail,
        nowLinks: 0, nowPoints: 0, prevLinks: 0, prevPoints: 0,
      };
      if (side === 'now') {
        cur.nowLinks  += s.links.length;
        cur.nowPoints += s.totalPoints;
      } else {
        cur.prevLinks  += s.links.length;
        cur.prevPoints += s.totalPoints;
      }
      map.set(key, cur);
    };

    taskDetailNowSubs.forEach(s => upsert(s, 'now'));
    taskDetailPrevSubs.forEach(s => upsert(s, 'prev'));

    return Array.from(map.values())
      .sort((a, b) => (b.nowLinks + b.prevLinks) - (a.nowLinks + a.prevLinks));
  }, [taskDetailNowSubs, taskDetailPrevSubs]);

  // Lọc chi tiết đầu việc
  const filteredBreakdown = useMemo(() => {
    let data = taskDetailBreakdown;
    if (filterTeam) data = data.filter(r => r.teamGroup === filterTeam);
    if (filterTask) data = data.filter(r => r.taskDetail === filterTask || r.taskType === filterTask);
    return data;
  }, [taskDetailBreakdown, filterTeam, filterTask]);

  // Unique task details cho bộ lọc
  const uniqueTeams = useMemo(() => Array.from(new Set(taskDetailBreakdown.map(r => r.teamGroup))).sort(), [taskDetailBreakdown]);
  const uniqueTasks = useMemo(() => {
    const set = new Set<string>();
    taskDetailBreakdown.forEach(r => { if (r.taskDetail) set.add(r.taskDetail); });
    return Array.from(set).sort();
  }, [taskDetailBreakdown]);

  // Export CSV
  const exportCSV = () => {
    const headers = ['Đầu việc', 'Chi tiết', 'Nhóm', 'Link kỳ này', 'Link T-1', 'Δ Link %', 'Điểm kỳ này', 'Điểm T-1', 'Δ Điểm %'];
    const rows = filteredBreakdown.map(r => [
      r.taskType, r.taskDetail, r.teamGroup,
      r.nowLinks, r.prevLinks, pct(r.nowLinks, r.prevLinks),
      r.nowPoints.toFixed(0), r.prevPoints.toFixed(0), pct(r.nowPoints, r.prevPoints),
    ]);
    // Tổng
    const totNow = filteredBreakdown.reduce((s, x) => s + x.nowLinks, 0);
    const totPrev = filteredBreakdown.reduce((s, x) => s + x.prevLinks, 0);
    const totPtNow = filteredBreakdown.reduce((s, x) => s + x.nowPoints, 0);
    const totPtPrev = filteredBreakdown.reduce((s, x) => s + x.prevPoints, 0);
    rows.push(['', 'TỔNG', '', totNow, totPrev, pct(totNow, totPrev), totPtNow.toFixed(0), totPtPrev.toFixed(0), pct(totPtNow, totPtPrev)] as any);

    const csvContent = '\uFEFF' + [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chi-tiet-dau-viec_${dateFrom || 'all'}_${dateTo || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Top performers (Manager/Leader: top 5 of scope, Member: team ranking) ──
  const isMember = currentUser?.role === 'Member';
  const myTeamGroup = useMemo(() => {
    if (!currentUser) return null;
    const me = members.find(m => m.name === currentUser.name || m.id === currentUser.id);
    return me?.teamGroup ?? null;
  }, [currentUser, members]);

  // Full team rankings — dùng ALL submissions (không chỉ scopedSubs) để tính ranking thực
  const teamRanking = useMemo(() => {
    // Lọc submissions cùng kỳ + cùng team
    const teamMemberNames = myTeamGroup
      ? new Set(members.filter(m => m.teamGroup === myTeamGroup).map(m => m.name))
      : new Set<string>();

    const teamSubs = submissions.filter(s => {
      const t = new Date(s.submittedAt).getTime();
      if (isNaN(t) || t < fromMs || t > toMs) return false;
      return teamMemberNames.has(s.employeeName);
    });

    const map = new Map<string, { name: string; links: number; points: number }>();
    teamSubs.forEach(s => {
      const cur = map.get(s.employeeName) ?? { name: s.employeeName, links: 0, points: 0 };
      cur.links += s.links.length;
      cur.points += s.totalPoints;
      map.set(s.employeeName, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.points - a.points);
  }, [submissions, members, myTeamGroup, fromMs, toMs]);

  const topPerformers = useMemo(() => {
    const map = new Map<string, { name: string; links: number; points: number }>();
    thisMonthSubs.forEach(s => {
      const cur = map.get(s.employeeName) ?? { name: s.employeeName, links: 0, points: 0 };
      cur.links += s.links.length;
      cur.points += s.totalPoints;
      map.set(s.employeeName, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.points - a.points).slice(0, 5);
  }, [thisMonthSubs]);

  const myRank = useMemo(() => {
    if (!currentUser) return null;
    const idx = teamRanking.findIndex(p => p.name === currentUser.name);
    if (idx === -1) return null;
    return { rank: idx + 1, total: teamRanking.length, me: teamRanking[idx], top: teamRanking[0] };
  }, [teamRanking, currentUser]);

  // ── Auto-evaluation (so với tháng trước) ──
  const evaluation = useMemo(() => {
    const linkPct = pct(stats.now.links, stats.prev.links);
    const pointPct = pct(stats.now.points, stats.prev.points);
    const empPct = pct(stats.now.employees, stats.prev.employees);
    const lines: { tone: 'good' | 'bad' | 'neutral'; text: string }[] = [];
    if (stats.prev.submissions === 0 && stats.now.submissions === 0) {
      lines.push({ tone: 'neutral', text: 'Chưa có dữ liệu submit để so sánh.' });
    } else {
      lines.push({
        tone: pointPct >= 0 ? 'good' : 'bad',
        text: `Điểm KPI ${pointPct >= 0 ? 'tăng' : 'giảm'} ${Math.abs(pointPct)}% so với cùng kỳ tháng trước (${stats.now.points.toFixed(0)}đ vs ${stats.prev.points.toFixed(0)}đ).`,
      });
      lines.push({
        tone: linkPct >= 0 ? 'good' : 'bad',
        text: `Số link nộp ${linkPct >= 0 ? 'tăng' : 'giảm'} ${Math.abs(linkPct)}% (${stats.now.links} vs ${stats.prev.links}).`,
      });
      if (empPct !== 0) {
        lines.push({
          tone: empPct >= 0 ? 'good' : 'bad',
          text: `Số nhân viên hoạt động ${empPct >= 0 ? 'tăng' : 'giảm'} ${Math.abs(empPct)}% (${stats.now.employees} vs ${stats.prev.employees}).`,
        });
      }
      // Target
      const target = scaleConfig.memberTargetPoints * Math.max(stats.now.employees, 1);
      const achievement = (stats.now.points / target) * 100;
      lines.push({
        tone: achievement >= 90 ? 'good' : achievement >= 70 ? 'neutral' : 'bad',
        text: `Đạt ${achievement.toFixed(0)}% mục tiêu tháng (target/người ${scaleConfig.memberTargetPoints}đ).`,
      });
      // Bonus
      if (stats.bonusNow !== 0) {
        lines.push({
          tone: stats.bonusNow >= 0 ? 'good' : 'bad',
          text: `Tổng bonus kỳ này: ${stats.bonusNow > 0 ? '+' : ''}${stats.bonusNow.toFixed(0)}đ (kỳ trước: ${stats.bonusPrev > 0 ? '+' : ''}${stats.bonusPrev.toFixed(0)}đ).`,
        });
      }
      // Top performer
      if (topPerformers[0]) {
        lines.push({
          tone: 'good',
          text: `Top performer: ${topPerformers[0].name} với ${topPerformers[0].points.toFixed(0)}đ.`,
        });
      }
    }
    return lines;
  }, [stats, prevMonth, scaleConfig, topPerformers]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">
            <Sparkles size={20} style={{ color: 'var(--primary-500)' }} />
            Dashboard
          </h2>
          <p className="page-subtitle">
            {rangeLabel} · Phạm vi: {currentUser?.role === 'Manager' ? 'Toàn team'
              : currentUser?.role === 'Leader' ? 'Team của bạn' : 'Cá nhân'}
          </p>
        </div>
      </div>

      {/* Date range filter */}
      <div className="card" style={{ padding: '12px 14px', marginBottom: '16px',
                                     display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <Calendar size={14} color="var(--primary-500)" />
          <input className="form-input" type="date" value={dateFrom}
            onChange={e => setDateFrom(e.target.value)} style={{ width: 'auto', fontSize: '0.85rem' }} />
          <span style={{ color: 'var(--text-tertiary)' }}>→</span>
          <input className="form-input" type="date" value={dateTo}
            onChange={e => setDateTo(e.target.value)} style={{ width: 'auto', fontSize: '0.85rem' }} />
          {(dateFrom || dateTo) && (
            <button className="btn btn-ghost" onClick={() => setRange('all')}
              style={{ padding: '4px 8px', fontSize: '0.78rem' }}>
              <X size={12} /> Bỏ lọc
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => setRange('today')}
            style={{ fontSize: '0.78rem', padding: '4px 10px' }}>Hôm nay</button>
          <button className="btn btn-secondary" onClick={() => setRange('7d')}
            style={{ fontSize: '0.78rem', padding: '4px 10px' }}>7 ngày</button>
          <button className="btn btn-secondary" onClick={() => setRange('30d')}
            style={{ fontSize: '0.78rem', padding: '4px 10px' }}>30 ngày</button>
          <button className="btn btn-secondary" onClick={() => setRange('thisMonth')}
            style={{ fontSize: '0.78rem', padding: '4px 10px' }}>Tháng này</button>
          <button className="btn btn-secondary" onClick={() => setRange('prevMonth')}
            style={{ fontSize: '0.78rem', padding: '4px 10px' }}>Tháng trước</button>
        </div>
        {/* Personnel filter — Manager/Leader only */}
        {(currentUser?.role === 'Manager' || currentUser?.role === 'Leader') && availableEmployees.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <Users size={14} color="var(--primary-500)" />
            <select className="form-select" value={filterEmployee}
              onChange={e => setFilterEmployee(e.target.value)}
              style={{ width: 'auto', fontSize: '0.82rem', padding: '4px 8px' }}>
              <option value="">
                {currentUser?.role === 'Manager' ? 'Tất cả nhân sự' : 'Tất cả team'}
              </option>
              {availableEmployees.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            {filterEmployee && (
              <button className="btn btn-ghost" onClick={() => setFilterEmployee('')}
                style={{ padding: '4px 8px', fontSize: '0.78rem' }}>
                <X size={12} /> Bỏ lọc
              </button>
            )}
          </div>
        )}
        <span style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
          📊 So sánh: <strong>{prevRangeLabel}</strong>
        </span>
      </div>

      {/* Stats cards — hiển thị cho tất cả roles */}
      <div className="stats-grid" style={{ marginBottom: '20px' }}>
        <CompareCard icon={<Target size={18} />} label="% Target hoàn thành"
          now={Math.round((stats.now.points / Math.max(scaleConfig.memberTargetPoints * Math.max(stats.now.employees, 1), 1)) * 100)}
          prev={Math.round((stats.prev.points / Math.max(scaleConfig.memberTargetPoints * Math.max(stats.prev.employees, 1), 1)) * 100)}
          color="var(--success)" suffix="%" />
        <CompareCard icon={<Trophy size={18} />} label="Điểm"
          now={Math.round(stats.now.points * 10) / 10} prev={Math.round(stats.prev.points * 10) / 10} color="var(--accent-500)" suffix="đ" />
        <CompareCard icon={<Calendar size={18} />} label="Thời gian"
          now={Math.round(stats.now.time * 10) / 10} prev={Math.round(stats.prev.time * 10) / 10} color="#7a9af6" suffix="h" />
        <CompareCard icon={<Link2 size={18} />} label="Tổng link"
          now={stats.now.links} prev={stats.prev.links} color="var(--primary-500)" />
      </div>

      {/* Auto evaluation card */}
      <div className="card" style={{ padding: '18px', marginBottom: '20px',
        background: 'var(--bg-evaluation, linear-gradient(135deg, var(--primary-50) 0%, var(--accent-50) 100%))',
        border: '1px solid var(--border-evaluation, var(--primary-100))' }}>
        <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '10px',
                      display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={15} color="var(--primary-600)" />
          Nhận xét tự động — So với cùng kỳ tháng trước
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {evaluation.map((line, i) => {
            const toneColor = line.tone === 'good' ? 'var(--success)' : line.tone === 'bad' ? 'var(--danger)' : 'var(--text-secondary)';
            const Icon = line.tone === 'good' ? TrendingUp : line.tone === 'bad' ? TrendingDown : Minus;
            return (
              <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start',
                                    fontSize: '0.85rem', color: toneColor }}>
                <Icon size={14} style={{ marginTop: '2px', flexShrink: 0 }} />
                <span>{line.text}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Charts row + Project progress + Top 5 — chỉ Manager mới thấy */}
      {currentUser?.role === 'Manager' && (<>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '16px', marginBottom: '20px' }}>
        {/* Trend */}
        <div className="card" style={{ padding: '18px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '12px',
                        display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={15} color="var(--primary-500)" /> Xu hướng 6 tháng
          </div>
          <div style={{ height: 280 }}>
            <Line data={trendData} options={{
              responsive: true, maintainAspectRatio: false,
              interaction: { mode: 'index', intersect: false },
              plugins: { legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 6, font: { size: 11 } } } },
              scales: {
                y:  { type: 'linear', position: 'left',  beginAtZero: true, grid: { color: '#f1f5f9' }, title: { display: true, text: 'Link', font: { size: 11 } } },
                y1: { type: 'linear', position: 'right', beginAtZero: true, grid: { display: false }, title: { display: true, text: 'Điểm', font: { size: 11 } } },
                x:  { grid: { display: false } },
              }
            }} />
          </div>
        </div>

        {/* Doughnut 3 nhóm */}
        <div className="card" style={{ padding: '18px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '12px',
                        display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Target size={15} color="var(--primary-500)" /> Tỉ trọng 3 nhóm — tháng này
          </div>
          <div style={{ height: 240, display: 'flex', justifyContent: 'center' }}>
            {teamData.datasets[0].data.some(v => v > 0) ? (
              <Doughnut data={teamData} options={{
                responsive: true, maintainAspectRatio: true, cutout: '55%',
                plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, font: { size: 11 } } } },
              }} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
                Chưa có submission tháng này
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Project progress + Top performers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '16px' }}>
        <div className="card" style={{ padding: '18px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '12px',
                        display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FolderKanban size={15} color="var(--primary-500)" /> Tiến độ dự án (đang chạy)
          </div>
          {projectProgress.length === 0 && (
            <div style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', padding: '10px' }}>
              Chưa có dự án đang chạy.
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {projectProgress.slice(0, 6).map(({ project, links, points, taskProgress, taskCount }) => (
              <div key={project.id} style={{
                padding: '12px', border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                              marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                    {project.isMonthly ? '📅 ' : ''}{project.name}
                    <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: 6, fontSize: '0.78rem' }}>
                      · {project.type}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    <strong style={{ color: 'var(--primary-600)' }}>{links}</strong> link ·{' '}
                    <strong style={{ color: 'var(--success)' }}>{points.toFixed(0)}</strong> điểm
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem',
                              color: 'var(--text-tertiary)', marginBottom: '4px' }}>
                  <span>
                    {project.deadline && <><Calendar size={11} style={{ verticalAlign: 'middle' }} /> {project.deadline} · </>}
                    {taskCount} task cứng
                  </span>
                  <span style={{ fontWeight: 700,
                                 color: taskProgress >= 100 ? 'var(--success)' : taskProgress >= 50 ? 'var(--primary-600)' : 'var(--warning)' }}>
                    Tiến độ: {taskProgress}%
                  </span>
                </div>
                <div className="progress-bar-bg" style={{ height: 6 }}>
                  <div className={`progress-bar-fill ${taskProgress >= 100 ? 'complete' : taskProgress >= 70 ? 'high' : taskProgress >= 30 ? 'medium' : 'low'}`}
                    style={{ width: `${taskProgress}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: '18px' }}>
          {!isMember ? (
            /* Manager / Leader: Top 5 */
            <>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '12px',
                            display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Trophy size={15} color="#F59E0B" /> Top 5 — tháng này
              </div>
              {topPerformers.length === 0 && (
                <div style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>Chưa có dữ liệu.</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {topPerformers.map((p, i) => (
                  <div key={p.name} style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '8px 10px', borderRadius: 'var(--radius-md)',
                    background: i === 0 ? 'linear-gradient(90deg, #fef3c7, #fef9c3)' : 'var(--bg-secondary)',
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: i === 0 ? '#f59e0b' : 'var(--primary-500)', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, fontSize: '0.85rem',
                    }}>{i + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{p.name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{p.links} link</div>
                    </div>
                    <div style={{ fontWeight: 800, color: 'var(--success)', fontSize: '0.95rem' }}>
                      {p.points.toFixed(0)}đ
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            /* Member: Vị trí thực tế trong team */
            <>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '12px',
                            display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Trophy size={15} color="#F59E0B" /> Vị trí của bạn trong team
              </div>
              {myRank ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Rank badge lớn */}
                  <div style={{ textAlign: 'center', padding: '16px',
                                background: myRank.rank <= 3
                                  ? 'linear-gradient(135deg, #fef3c7, #fef9c3)'
                                  : 'var(--bg-secondary)',
                                borderRadius: 'var(--radius-lg)' }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: '50%', margin: '0 auto 8px',
                      background: myRank.rank === 1 ? '#f59e0b' : myRank.rank === 2 ? '#94a3b8' : myRank.rank === 3 ? '#cd7f32' : 'var(--primary-500)',
                      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, fontSize: '1.4rem',
                    }}>
                      {myRank.rank <= 3 ? ['🥇', '🥈', '🥉'][myRank.rank - 1] : `#${myRank.rank}`}
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                      Hạng {myRank.rank} / {myRank.total}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
                      trong nhóm {myTeamGroup || 'team'}
                    </div>
                  </div>

                  {/* Stats so sánh */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div style={{ padding: '10px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>Điểm của bạn</div>
                      <div style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--primary-600)' }}>
                        {myRank.me.points.toFixed(0)}đ
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{myRank.me.links} link</div>
                    </div>
                    <div style={{ padding: '10px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>TB nhóm</div>
                      <div style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--text-secondary)' }}>
                        {myRank.total > 0 ? (teamRanking.reduce((s, p) => s + p.points, 0) / myRank.total).toFixed(0) : 0}đ
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
                        {myRank.total > 0 ? Math.round(teamRanking.reduce((s, p) => s + p.links, 0) / myRank.total) : 0} link
                      </div>
                    </div>
                  </div>

                  {/* So với top 1 */}
                  {myRank.rank > 1 && myRank.top && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', textAlign: 'center',
                                  padding: '8px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                      🏆 Top 1: <strong style={{ color: 'var(--text-primary)' }}>{myRank.top.name}</strong> ({myRank.top.points.toFixed(0)}đ)
                      {' · '}Cách bạn <strong style={{ color: 'var(--warning)' }}>{(myRank.top.points - myRank.me.points).toFixed(0)}đ</strong>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', textAlign: 'center', padding: '20px' }}>
                  Chưa có submission trong kỳ này.
                </div>
              )}
            </>
          )}
        </div>
      </div>
      </>)}

      {/* ── Chi tiết đầu việc — so sánh với cùng kỳ T-1 ── */}
      <div className="card" style={{ padding: '18px', marginTop: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem',
                        display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BarChart3Icon size={15} color="var(--primary-500)" />
            Chi tiết đầu việc
            <span style={{ fontSize: '0.78rem', fontWeight: 400, color: 'var(--text-tertiary)' }}>
              ({filteredBreakdown.length} đầu việc)
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="form-select" value={filterTeam} onChange={e => setFilterTeam(e.target.value)}
              style={{ width: 'auto', fontSize: '0.82rem', padding: '4px 8px' }}>
              <option value="">Tất cả nhóm</option>
              {uniqueTeams.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className="form-select" value={filterTask} onChange={e => setFilterTask(e.target.value)}
              style={{ width: 'auto', fontSize: '0.82rem', padding: '4px 8px' }}>
              <option value="">Đầu việc: Tất cả</option>
              {uniqueTasks.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {(filterTeam || filterTask) && (
              <button className="btn btn-ghost" onClick={() => { setFilterTeam(''); setFilterTask(''); }}
                style={{ padding: '4px 8px', fontSize: '0.78rem' }}>
                <X size={12} /> Bỏ lọc
              </button>
            )}
            <button className="btn btn-secondary" onClick={exportCSV}
              style={{ padding: '4px 10px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Download size={12} /> Export CSV
            </button>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)' }}>
              Kỳ này vs <strong>cùng kỳ tháng trước</strong>
            </span>
          </div>
        </div>

        {filteredBreakdown.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
            Chưa có submission nào trong kỳ.
          </div>
        ) : (
          <div className="data-table-wrapper" style={{ margin: 0, boxShadow: 'none', border: '1px solid var(--border-light)' }}>
            <table className="data-table" style={{ marginBottom: 0, fontSize: '0.82rem' }}>
              <thead>
                <tr>
                  <th>Đầu việc / Chi tiết</th>
                  <th>Nhóm</th>
                  <th style={{ textAlign: 'right' }}>Link kỳ này</th>
                  <th style={{ textAlign: 'right' }}>Link T-1</th>
                  <th style={{ textAlign: 'right' }}>Δ Link</th>
                  <th style={{ textAlign: 'right' }}>Điểm kỳ này</th>
                  <th style={{ textAlign: 'right' }}>Điểm T-1</th>
                  <th style={{ textAlign: 'right' }}>Δ Điểm</th>
                </tr>
              </thead>
              <tbody>
                {filteredBreakdown.map((r, i) => {
                  const teamColor =
                    r.teamGroup === 'Bài viết' ? '#1D9E75' :
                    r.teamGroup === 'Sản phẩm' ? '#8B5CF6' :
                    r.teamGroup === 'Multimedia - Tin nhanh' ? '#F59E0B' : '#94A3B8';
                  const linkPct = pct(r.nowLinks, r.prevLinks);
                  const pointPct = pct(r.nowPoints, r.prevPoints);
                  const linkColor  = linkPct > 0 ? 'var(--success)' : linkPct < 0 ? 'var(--danger)' : 'var(--text-tertiary)';
                  const pointColor = pointPct > 0 ? 'var(--success)' : pointPct < 0 ? 'var(--danger)' : 'var(--text-tertiary)';
                  return (
                    <tr key={i}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{r.taskDetail || '—'}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{r.taskType}</div>
                      </td>
                      <td>
                        <span style={{
                          background: `${teamColor}15`, color: teamColor,
                          padding: '2px 8px', borderRadius: 'var(--radius-full)',
                          fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap',
                        }}>{r.teamGroup}</span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary-600)' }}>
                        {r.nowLinks.toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--text-tertiary)' }}>
                        {r.prevLinks.toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: linkColor }}>
                        {linkPct > 0 ? '↑' : linkPct < 0 ? '↓' : '—'}
                        {linkPct !== 0 && ` ${Math.abs(linkPct)}%`}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--success)' }}>
                        {r.nowPoints.toFixed(0)}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--text-tertiary)' }}>
                        {r.prevPoints.toFixed(0)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: pointColor }}>
                        {pointPct > 0 ? '↑' : pointPct < 0 ? '↓' : '—'}
                        {pointPct !== 0 && ` ${Math.abs(pointPct)}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--bg-secondary)', fontWeight: 700 }}>
                  <td colSpan={2}>Tổng ({filteredBreakdown.length} đầu việc)</td>
                  <td style={{ textAlign: 'right', color: 'var(--primary-600)' }}>
                    {filteredBreakdown.reduce((s, x) => s + x.nowLinks, 0).toLocaleString()}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--text-tertiary)' }}>
                    {filteredBreakdown.reduce((s, x) => s + x.prevLinks, 0).toLocaleString()}
                  </td>
                  <td></td>
                  <td style={{ textAlign: 'right', color: 'var(--success)' }}>
                    {filteredBreakdown.reduce((s, x) => s + x.nowPoints, 0).toFixed(0)}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--text-tertiary)' }}>
                    {filteredBreakdown.reduce((s, x) => s + x.prevPoints, 0).toFixed(0)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── CompareCard ─────────────────────────────────────────────────────────────
function CompareCard({ icon, label, now, prev, color, suffix = '' }: {
  icon: React.ReactNode; label: string; now: number; prev: number; color: string; suffix?: string;
}) {
  const change = pct(now, prev);
  const Icon = change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus;
  const tone = change > 0 ? 'var(--success)' : change < 0 ? 'var(--danger)' : 'var(--text-tertiary)';

  return (
    <div className="stat-card">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-tertiary)' }}>
            <span style={{ color }}>{icon}</span>
            <span style={{ fontSize: '0.78rem' }}>{label}</span>
          </div>
          <div style={{ fontWeight: 800, fontSize: '1.6rem', color: 'var(--text-primary)', marginTop: 4 }}>
            {now.toLocaleString('vi-VN')}{suffix}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
            Cùng kỳ T-1: {prev.toLocaleString('vi-VN')}{suffix}
          </div>
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '3px',
          padding: '4px 8px', background: `${tone}1A`, color: tone,
          borderRadius: 'var(--radius-full)', fontSize: '0.78rem', fontWeight: 700,
        }}>
          <Icon size={12} /> {change > 0 ? '+' : ''}{change}%
        </div>
      </div>
    </div>
  );
}
