import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3, Calendar, X, ChevronDown, ChevronUp,
  Target, AlertTriangle, FileText, Package, Film, Settings, Users
} from 'lucide-react';
import { useAppStore } from '@/shared/store/appStore';
import { TEAM_GROUPS } from '@/shared/data/mockData';
import type { TeamGroup, KPISubmission } from '@/shared/types';

function fmtDate(d: Date): string { return d.toISOString().slice(0, 10); }
function startOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59); }
function periodOf(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }

const TEAM_META: Record<string, { color: string; bg: string; icon: typeof FileText }> = {
  'Bài viết':                 { color: '#1D9E75', bg: '#e6f7f0', icon: FileText },
  'Sản phẩm':                 { color: '#8B5CF6', bg: '#ede9fe', icon: Package },
  'Multimedia - Tin nhanh':   { color: '#F59E0B', bg: '#fef3c7', icon: Film },
};

export default function DailyWorkPage() {
  const navigate = useNavigate();
  const { submissions, sites, kpiTargets, currentUser, members } = useAppStore();

  const isManager = currentUser?.role === 'Manager';
  const isLeader  = currentUser?.role === 'Leader';

  // Xác định team mà Leader quản lý
  const myTeamGroup = useMemo(() => {
    if (!currentUser) return null;
    const me = members.find(m => m.name === currentUser.name || m.id === currentUser.id);
    return me?.teamGroup ?? null;
  }, [currentUser, members]);

  // Lọc team groups theo role
  const visibleTeams = useMemo(() => {
    if (isManager) return TEAM_GROUPS;
    if (isLeader && myTeamGroup) return [myTeamGroup]; // Leader chỉ thấy team mình
    
    // Member: Thấy team chính + các team khác mà mình có đi hỗ trợ (có nộp link)
    if (!isManager && !isLeader) {
      const mySubs = submissions.filter(s => s.employeeName === currentUser?.name);
      const teamsWithSubs = new Set(mySubs.map(s => s.teamGroup));
      if (myTeamGroup) teamsWithSubs.add(myTeamGroup);
      return TEAM_GROUPS.filter(t => teamsWithSubs.has(t));
    }
    
    return []; // Fallback
  }, [isManager, isLeader, myTeamGroup, submissions, currentUser]);

  const today = new Date();
  const [dateFrom, setDateFrom] = useState<string>(fmtDate(startOfMonth(today)));
  const [dateTo,   setDateTo]   = useState<string>(fmtDate(endOfMonth(today)));
  const [siteFilter, setSiteFilter] = useState<string>(''); // '' = All
  const [expanded, setExpanded] = useState<Set<TeamGroup>>(new Set());
  const [showMemberBreakdown, setShowMemberBreakdown] = useState(true);

  const period = periodOf(new Date(dateFrom || fmtDate(today)));

  // Filter submissions by date range + site + role
  const filtered = useMemo<KPISubmission[]>(() => {
    const fromMs = dateFrom ? new Date(dateFrom + 'T00:00:00').getTime() : -Infinity;
    const toMs   = dateTo   ? new Date(dateTo   + 'T23:59:59').getTime() : Infinity;
    return submissions.filter(s => {
      const t = new Date(s.submittedAt).getTime();
      if (isNaN(t) || t < fromMs || t > toMs) return false;
      if (siteFilter && s.siteId !== siteFilter) return false;
      // Role-based filtering
      if (!isManager && !isLeader) {
        // Member: chỉ thấy submission của mình
        if (s.employeeName !== currentUser?.name) return false;
      } else if (isLeader && myTeamGroup) {
        // Leader: chỉ thấy submission của team mình
        if (s.teamGroup !== myTeamGroup) return false;
      }
      return true;
    });
  }, [submissions, dateFrom, dateTo, siteFilter, isManager, isLeader, myTeamGroup, currentUser]);

  // Targets cho period (chỉ lấy target tổng nhóm cho mỗi team — siteId/taskType undefined)
  // Nếu user filter site, ưu tiên target có siteId match
  const targetsByTeam = useMemo(() => {
    const m: Record<string, number> = {};
    const isMember = !isManager && !isLeader;

    for (const team of TEAM_GROUPS) {
      const periodTargets = kpiTargets.filter(t => t.period === period && t.teamGroup === team);
      
      if (isMember) {
        // Member: Tính KPI cá nhân (cộng dồn các target được phân công)
        const personalTargets = periodTargets.filter(t => t.employeeName === currentUser?.name);
        if (siteFilter) {
          m[team] = personalTargets.filter(t => t.siteId === siteFilter).reduce((s, t) => s + t.targetLinks, 0);
        } else {
          m[team] = personalTargets.reduce((s, t) => s + t.targetLinks, 0);
        }
      } else {
        // Manager / Leader: Tính KPI tổng của nhóm (lọc các target không gắn với nhân viên cụ thể)
        const teamTargets = periodTargets.filter(t => !t.employeeName);
        if (siteFilter) {
          const sumWithSite = teamTargets
            .filter(t => t.siteId === siteFilter)
            .reduce((s, t) => s + t.targetLinks, 0);
          if (sumWithSite > 0) {
            m[team] = sumWithSite;
          } else {
            const totalNoSite = teamTargets
              .filter(t => !t.siteId && !t.taskType)
              .reduce((s, t) => s + t.targetLinks, 0);
            m[team] = Math.round(totalNoSite / 2);
          }
        } else {
          const sum = teamTargets
            .filter(t => !t.taskType)
            .reduce((s, t) => s + t.targetLinks, 0);
          m[team] = sum;
        }
      }
    }
    return m;
  }, [kpiTargets, period, siteFilter, isManager, isLeader, currentUser]);

  // Aggregate by team — only visible teams
  const teamStats = useMemo(() => {
    return visibleTeams.map(team => {
      const teamSubs = filtered.filter(s => s.teamGroup === team);
      const links  = teamSubs.reduce((sum, s) => sum + s.links.length, 0);
      const points = teamSubs.reduce((sum, s) => sum + s.totalPoints, 0);
      const target = targetsByTeam[team] ?? 0;
      const progress = target > 0 ? (links / target) * 100 : 0;

      // Breakdown chi tiết theo taskType + taskDetail
      const detailMap = new Map<string, { type: string; detail: string; links: number; points: number }>();
      for (const s of teamSubs) {
        const key = `${s.taskType}|${s.taskDetail}`;
        const cur = detailMap.get(key) ?? { type: s.taskType, detail: s.taskDetail, links: 0, points: 0 };
        cur.links  += s.links.length;
        cur.points += s.totalPoints;
        detailMap.set(key, cur);
      }
      const details = Array.from(detailMap.values()).sort((a, b) => b.links - a.links);

      // Phân tỉ trọng theo site
      const siteStats: Record<string, { links: number; points: number }> = {};
      for (const s of teamSubs) {
        const k = s.siteId ?? 'unknown';
        if (!siteStats[k]) siteStats[k] = { links: 0, points: 0 };
        siteStats[k].links  += s.links.length;
        siteStats[k].points += s.totalPoints;
      }

      // Tính pace + eta + status
      const now = new Date();
      const fromD = new Date(dateFrom || fmtDate(startOfMonth(now)));
      const toD   = new Date(dateTo   || fmtDate(endOfMonth(now)));
      const totalDays = Math.max(1, Math.ceil((toD.getTime() - fromD.getTime()) / 86400_000) + 1);
      const elapsedDays = Math.max(1, Math.ceil((Math.min(now.getTime(), toD.getTime()) - fromD.getTime()) / 86400_000) + 1);
      const remainingDays = Math.max(0, totalDays - elapsedDays);
      const pace = elapsedDays > 0 ? links / elapsedDays : 0;
      const expectedProgress = totalDays > 0 ? (elapsedDays / totalDays) * 100 : 0;
      const onTrack = progress >= expectedProgress * 0.9; // tolerance 10%
      const requiredPace = remainingDays > 0 ? Math.max(0, target - links) / remainingDays : 0;

      return {
        team, links, points, target, progress,
        details, siteStats,
        pace, requiredPace, remainingDays, onTrack, expectedProgress,
      };
    });
  }, [filtered, targetsByTeam, dateFrom, dateTo]);

  // Tổng theo site (cho phần tỉ trọng 2 site)
  const siteTotals = useMemo(() => {
    const m: Record<string, { name: string; links: number; points: number; color: string }> = {};
    for (const s of filtered) {
      const siteId = s.siteId ?? 'unknown';
      const site = sites.find(x => x.id === siteId);
      if (!m[siteId]) {
        m[siteId] = {
          name: site?.name ?? 'Khác / chưa gắn',
          links: 0, points: 0,
          color: site?.color ?? '#94A3B8',
        };
      }
      m[siteId].links  += s.links.length;
      m[siteId].points += s.totalPoints;
    }
    return Object.values(m).sort((a, b) => b.links - a.links);
  }, [filtered, sites]);

  const grandLinks  = filtered.reduce((s, x) => s + x.links.length, 0);
  const grandPoints = filtered.reduce((s, x) => s + x.totalPoints, 0);
  const grandTarget = teamStats.reduce((s, x) => s + x.target, 0);

  // ── Member KPI breakdown ────────────────────────────────────────────
  const memberStats = useMemo(() => {
    const empNames = Array.from(new Set(filtered.map(s => s.employeeName))).sort();
    return empNames.map(name => {
      const empSubs = filtered.filter(s => s.employeeName === name);
      const links   = empSubs.reduce((sum, s) => sum + s.links.length, 0);
      const points  = empSubs.reduce((sum, s) => sum + s.totalPoints, 0);
      const mem     = members.find(m => m.name === name);
      const team    = mem?.teamGroup || '';
      // Individual target (employeeName set by Leader)
      const personalTarget = kpiTargets
        .filter(t => t.period === period && t.employeeName === name)
        .reduce((s, t) => s + t.targetLinks, 0);
      const progress = personalTarget > 0 ? (links / personalTarget) * 100 : 0;
      return { name, team, links, points, target: personalTarget, progress, kpiRole: mem?.kpiRole };
    });
  }, [filtered, members, kpiTargets, period]);

  const setRange = (preset: 'week' | 'month' | 'prevMonth' | '30d' | 'all') => {
    const now = new Date();
    if (preset === 'week') {
      const day = now.getDay() || 7;
      const start = new Date(now); start.setDate(now.getDate() - (day - 1));
      setDateFrom(fmtDate(start)); setDateTo(fmtDate(now));
    } else if (preset === 'month') {
      setDateFrom(fmtDate(startOfMonth(now))); setDateTo(fmtDate(endOfMonth(now)));
    } else if (preset === 'prevMonth') {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      setDateFrom(fmtDate(startOfMonth(prev))); setDateTo(fmtDate(endOfMonth(prev)));
    } else if (preset === '30d') {
      const ago = new Date(now); ago.setDate(now.getDate() - 29);
      setDateFrom(fmtDate(ago)); setDateTo(fmtDate(now));
    } else {
      setDateFrom(''); setDateTo('');
    }
  };

  const toggleExpand = (team: TeamGroup) => {
    const ns = new Set(expanded);
    if (ns.has(team)) ns.delete(team); else ns.add(team);
    setExpanded(ns);
  };

  // Cảnh báo
  const warnings = teamStats
    .filter(s => s.target > 0 && !s.onTrack && s.requiredPace > 0)
    .map(s => `${s.team}: cần ${s.requiredPace.toFixed(1)} link/ngày trong ${s.remainingDays} ngày còn lại`);

  const noTargets = teamStats.every(s => s.target === 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">
            <BarChart3 size={20} style={{ color: 'var(--primary-500)' }} />
            Công việc hằng ngày
          </h2>
          <p className="page-subtitle">
            {isManager ? 'Theo dõi tiến độ thực tế vs target — toàn bộ nhóm.'
              : isLeader ? `Tiến độ nhóm ${myTeamGroup || 'của bạn'} — phân loại theo đầu việc.`
              : `Tiến độ công việc cá nhân — ${currentUser?.name || ''}`}
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="card" style={{ padding: '12px 14px', marginBottom: '16px',
                                     display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
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
        <div style={{ display: 'flex', gap: '4px' }}>
          <button className="btn btn-secondary" onClick={() => setRange('week')}
            style={{ fontSize: '0.78rem', padding: '4px 10px' }}>Tuần này</button>
          <button className="btn btn-secondary" onClick={() => setRange('month')}
            style={{ fontSize: '0.78rem', padding: '4px 10px' }}>Tháng này</button>
          <button className="btn btn-secondary" onClick={() => setRange('prevMonth')}
            style={{ fontSize: '0.78rem', padding: '4px 10px' }}>Tháng trước</button>
          <button className="btn btn-secondary" onClick={() => setRange('30d')}
            style={{ fontSize: '0.78rem', padding: '4px 10px' }}>30 ngày</button>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Site:</span>
          <select className="form-select" value={siteFilter}
            onChange={e => setSiteFilter(e.target.value)}
            style={{ width: 'auto', fontSize: '0.85rem' }}>
            <option value="">Tất cả site</option>
            {sites.filter(s => s.active).map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* No targets warning */}
      {noTargets && (
        <div className="card" style={{ padding: '14px', marginBottom: '16px',
                                       background: 'var(--warning-bg)', border: '1px solid var(--warning)',
                                       display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#92400e' }}>
            <AlertTriangle size={16} />
            <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>
              Chưa setup KPI Target tháng này — không đo được tiến độ. Vào "KPI Target / Tháng" để setup.
            </span>
          </div>
          <button className="btn btn-secondary" onClick={() => navigate('/kpi-targets')}>
            <Settings size={13} /> Setup target
          </button>
        </div>
      )}

      {/* Top stats */}
      <div className="stats-grid" style={{ marginBottom: '20px' }}>
        <div className="stat-card">
          <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Tổng link</div>
          <div style={{ fontWeight: 800, fontSize: '1.6rem', color: 'var(--primary-600)' }}>
            {grandLinks.toLocaleString()}
            {grandTarget > 0 && (
              <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>
                {' / '}{grandTarget.toLocaleString()}
              </span>
            )}
          </div>
          {grandTarget > 0 && (
            <div style={{ fontSize: '0.74rem', marginTop: 2,
                          color: grandLinks >= grandTarget ? 'var(--success)' : 'var(--text-tertiary)' }}>
              {Math.round((grandLinks / grandTarget) * 100)}% target
            </div>
          )}
        </div>
        <div className="stat-card">
          <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Tổng điểm</div>
          <div style={{ fontWeight: 800, fontSize: '1.6rem', color: 'var(--success)' }}>
            {grandPoints.toLocaleString('vi-VN', { maximumFractionDigits: 0 })}
          </div>
        </div>
        {siteTotals.slice(0, 2).map(st => (
          <div key={st.name} className="stat-card" style={{ borderLeft: `4px solid ${st.color}` }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{st.name}</div>
            <div style={{ fontWeight: 800, fontSize: '1.6rem', color: st.color }}>
              {st.links.toLocaleString()}
              <span style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', fontWeight: 500, marginLeft: 4 }}>
                link
              </span>
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
              {grandLinks > 0 ? Math.round((st.links / grandLinks) * 100) : 0}% tỉ trọng · {st.points.toFixed(0)}đ
            </div>
          </div>
        ))}
      </div>

      {/* 3 nhóm cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '14px' }}>
        {teamStats.map(s => {
          const meta = TEAM_META[s.team];
          const Icon = meta.icon;
          const isExpanded = expanded.has(s.team);
          const status = s.target === 0
            ? { label: 'Chưa setup target', color: 'var(--text-tertiary)' }
            : s.progress >= 100
              ? { label: '✅ Đạt target', color: 'var(--success)' }
              : s.onTrack
                ? { label: '🟢 On-track', color: 'var(--primary-600)' }
                : { label: '🔴 Off-track', color: 'var(--danger)' };

          return (
            <div key={s.team} className="card" style={{
              padding: '18px', borderTop: `4px solid ${meta.color}`,
            }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                <div style={{
                  width: 38, height: 38, borderRadius: '12px',
                  background: meta.bg, color: meta.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}><Icon size={18} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '1rem' }}>{s.team}</div>
                  <div style={{ fontSize: '0.74rem', color: status.color, fontWeight: 600 }}>
                    {status.label}
                  </div>
                </div>
              </div>

              {/* Progress: Actual / Target */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between',
                              fontSize: '0.78rem', color: 'var(--text-tertiary)', marginBottom: 4 }}>
                  <span>Lũy kế</span>
                  <strong style={{ color: meta.color, fontSize: '0.9rem' }}>
                    {s.links.toLocaleString()}{s.target > 0 ? ` / ${s.target.toLocaleString()}` : ''} link
                  </strong>
                </div>
                <div style={{ height: 8, background: 'var(--bg-secondary)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 4,
                                background: s.progress >= 100 ? 'var(--success)' : s.progress >= s.expectedProgress * 0.9 ? meta.color : 'var(--warning)',
                                width: `${Math.min(100, s.progress)}%`, transition: 'width 0.3s ease' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between',
                              fontSize: '0.74rem', color: 'var(--text-tertiary)', marginTop: 4 }}>
                  <span>{s.target > 0 ? `${s.progress.toFixed(0)}% hoàn thành` : '—'}</span>
                  {s.target > 0 && <span>Kỳ vọng {s.expectedProgress.toFixed(0)}%</span>}
                </div>
              </div>

              {/* Pace */}
              {s.target > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '12px' }}>
                  <PaceBox label="Pace/ngày" value={s.pace.toFixed(1)} color={meta.color} />
                  <PaceBox label="Cần đạt/ngày" value={s.requiredPace.toFixed(1)}
                    color={s.requiredPace > s.pace * 1.5 ? 'var(--danger)' : 'var(--text-secondary)'} />
                </div>
              )}

              {/* Site breakdown */}
              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: 4 }}>
                  TỈ TRỌNG THEO SITE
                </div>
                {Object.entries(s.siteStats).length === 0 ? (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>—</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {Object.entries(s.siteStats).map(([siteId, st]) => {
                      const site = sites.find(x => x.id === siteId);
                      const pct = s.links > 0 ? (st.links / s.links) * 100 : 0;
                      return (
                        <div key={siteId} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem' }}>
                          <span style={{
                            width: 8, height: 8, borderRadius: 4, flexShrink: 0,
                            background: site?.color ?? '#94A3B8',
                          }} />
                          <span style={{ flex: 1, color: 'var(--text-secondary)' }}>
                            {site?.name ?? 'Khác'}
                          </span>
                          <strong>{st.links}</strong>
                          <span style={{ color: 'var(--text-tertiary)', minWidth: 38, textAlign: 'right' }}>
                            {pct.toFixed(0)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Expandable: chi tiết đầu việc */}
              <button onClick={() => toggleExpand(s.team)}
                style={{
                  width: '100%', padding: '6px 8px',
                  background: 'var(--bg-secondary)', border: 'none',
                  borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600,
                }}>
                <span>Chi tiết đầu việc ({s.details.length})</span>
                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {isExpanded && (
                <div style={{ marginTop: '8px', maxHeight: 280, overflowY: 'auto' }}>
                  {s.details.length === 0 ? (
                    <div style={{ padding: '8px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>
                      Không có submission nào
                    </div>
                  ) : (
                    <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-secondary)' }}>
                          <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600 }}>Đầu việc / Chi tiết</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>Link</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>Điểm</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.details.map((d, i) => (
                          <tr key={i} style={{ borderTop: '1px solid var(--border-light)' }}>
                            <td style={{ padding: '5px 8px' }}>
                              <div style={{ fontWeight: 600 }}>{d.detail || '—'}</div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>{d.type}</div>
                            </td>
                            <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 600, color: meta.color }}>
                              {d.links}
                            </td>
                            <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--success)' }}>
                              {d.points.toFixed(0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="card" style={{
          padding: '14px', marginTop: '20px',
          background: '#fee2e2', border: '1px solid #fecaca',
        }}>
          <div style={{ fontWeight: 700, fontSize: '0.92rem', marginBottom: '8px',
                        display: 'flex', alignItems: 'center', gap: '6px', color: '#991b1b' }}>
            <AlertTriangle size={14} /> Cảnh báo & Gợi ý
          </div>
          {warnings.map((w, i) => (
            <div key={i} style={{ fontSize: '0.82rem', color: '#991b1b', padding: '4px 0' }}>
              🔴 {w}
            </div>
          ))}
        </div>
      )}

      {/* ── Member KPI breakdown ── */}
      {(isManager || isLeader) && memberStats.length > 0 && (
        <div className="card" style={{ padding: '18px', marginTop: '20px' }}>
          <button onClick={() => setShowMemberBreakdown(!showMemberBreakdown)}
            style={{ width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
                     display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={16} color="var(--primary-500)" />
              <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>KPI cá nhân ({memberStats.length} nhân viên)</span>
            </div>
            {showMemberBreakdown ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showMemberBreakdown && (
            <div style={{ marginTop: '12px' }}>
              <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>Nhân viên</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>Nhóm</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>Link</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>Điểm</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>Target</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600, width: '160px' }}>Tiến độ</th>
                  </tr>
                </thead>
                <tbody>
                  {memberStats.map(m => {
                    const teamMeta = TEAM_META[m.team];
                    const barColor = m.progress >= 100 ? 'var(--success)' : m.progress >= 60 ? (teamMeta?.color || 'var(--primary-500)') : 'var(--warning)';
                    return (
                      <tr key={m.name} style={{ borderTop: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '8px 10px' }}>
                          <div style={{ fontWeight: 600 }}>{m.name}</div>
                          {m.kpiRole === 'leader' && <span style={{ fontSize: '0.68rem', background: 'var(--primary-100)', color: 'var(--primary-700)', padding: '1px 6px', borderRadius: 4 }}>LEADER</span>}
                        </td>
                        <td style={{ padding: '8px 10px', color: teamMeta?.color || 'var(--text-secondary)', fontWeight: 500 }}>{m.team || '—'}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: teamMeta?.color || 'var(--primary-600)' }}>{m.links}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--success)', fontWeight: 600 }}>{m.points.toFixed(0)}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>
                          {m.target > 0 ? m.target : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          {m.target > 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <div style={{ flex: 1, height: 6, background: 'var(--bg-secondary)', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{ height: '100%', borderRadius: 3, background: barColor, width: `${Math.min(100, m.progress)}%`, transition: 'width 0.3s ease' }} />
                              </div>
                              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: barColor, minWidth: 35 }}>
                                {m.progress.toFixed(0)}%
                              </span>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)' }}>Chưa phân KPI</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {isManager && (
                <div style={{ marginTop: '10px', fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                  💡 <strong>Manager</strong> set target tổng nhóm. <strong>Leader</strong> phân KPI cá nhân cho từng member tại
                  {' '}<a href="#" onClick={e => { e.preventDefault(); navigate('/kpi-targets'); }} style={{ color: 'var(--primary-500)' }}>KPI Target / Tháng</a>.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Define inside file: so daily-work was renamed (legacy "OFF_TRACK" labels removed) */}
      <div style={{ marginTop: 16, fontSize: '0.74rem', color: 'var(--text-tertiary)' }}>
        Hiển thị theo: <strong>{period}</strong> · {filtered.length} submissions ·
        {' '}
        {isManager && <a href="#" onClick={e => { e.preventDefault(); navigate('/kpi-targets'); }}
          style={{ color: 'var(--primary-500)' }}>
          <Target size={11} style={{ verticalAlign: 'middle' }} /> Sửa target tháng
        </a>}
      </div>
    </div>
  );
}

function PaceBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      padding: '8px', background: 'var(--bg-secondary)',
      borderRadius: 'var(--radius-sm)', textAlign: 'center',
    }}>
      <div style={{ fontWeight: 700, fontSize: '1rem', color }}>{value}</div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>{label}</div>
    </div>
  );
}
