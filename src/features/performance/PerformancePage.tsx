import { useState, useMemo } from 'react';
import { useAppStore } from '@/shared/store/appStore';
import { flattenDailyTasks } from '@/shared/selectors/dailyTasks';
import { computeLeadershipMetrics, LEADERSHIP_WEIGHTS } from '@/shared/selectors/leadershipMetrics';
import { usePersistedState } from '@/shared/hooks/usePersistedState';
import { useNavigate } from 'react-router-dom';
import { Award, Plus, Edit3, Trash2, X, Save, Star, TrendingUp, Users, Calendar, ChevronDown, ChevronUp, Search, ArrowUpDown, ShieldCheck, Lightbulb, Trophy, Gift, Eye, MessageSquare } from 'lucide-react';
import { Chart as ChartJS, RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend } from 'chart.js';
import { Radar } from 'react-chartjs-2';
import type { PerformanceReview } from '@/shared/types';
import { makeId } from '@/shared/utils/helpers';
import toast from 'react-hot-toast';

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

function parseDate(ts: string): Date | null {
  if (!ts) return null;
  const parts = ts.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (parts) return new Date(`${parts[3]}-${parts[2]}-${parts[1]}`);
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
}
// @ts-expect-error reserved for future filter
function getMonthKey(ts: string): string {
  const d = parseDate(ts);
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function isInRange(ts: string, from: string, to: string): boolean {
  const d = parseDate(ts);
  if (!d) return false;
  if (from && d < new Date(from)) return false;
  if (to) { const t = new Date(to); t.setHours(23,59,59); if (d > t) return false; }
  return true;
}

type SortKey = 'totalScore' | 'totalPoints' | 'totalLinks' | 'kpiAchievement' | 'name';

export default function PerformancePage() {
  const navigate = useNavigate();
  const { members, kpiEntries, projects, taskPointRules, performanceReviews, addPerformanceReview, updatePerformanceReview, deletePerformanceReview, currentUser, submissions, scaleConfig, bonusPoints, projectTasks, rndLogs } = useAppStore();
  // Drill-down expanded leader
  const [expandedLeader, setExpandedLeader] = useState<string | null>(null);
  // Pre-fill leader name when opening review modal
  const [reviewPrefillEmployee, setReviewPrefillEmployee] = useState<string>('');
  void reviewPrefillEmployee; void setReviewPrefillEmployee;
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<PerformanceReview | null>(null);
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = usePersistedState('perf_search', '');
  const [sortBy, setSortBy] = usePersistedState<SortKey>('perf_sortBy', 'totalPoints');

  // Date range filter — persisted across navigation
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10);
  const lastDay = new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().slice(0,10);
  const [dateFrom, setDateFrom] = usePersistedState('perf_dateFrom', firstDay);
  const [dateTo, setDateTo] = usePersistedState('perf_dateTo', lastDay);
  const selectedPeriod = `${new Date(dateFrom).getFullYear()}-${String(new Date(dateFrom).getMonth()+1).padStart(2,'0')}`;

  const isManager = currentUser?.role === 'Manager';
  const isLeader = currentUser?.role === 'Leader';

  const dailyTasks = useMemo(() => flattenDailyTasks(kpiEntries, projects, taskPointRules), [kpiEntries, projects, taskPointRules]);

  const leaderTeam = useMemo(() => {
    if (!isLeader || !currentUser) return null;
    const me = members.find(m => m.name === currentUser.name || m.id === currentUser.id);
    return me?.teamGroup ?? null;
  }, [isLeader, currentUser, members]);

  const allEmployees = useMemo(() => {
    const all = Array.from(new Set([...kpiEntries.map(e => e.employeeName), ...submissions.map(s => s.employeeName)])).filter(n => n !== 'manntm3').sort();
    if (isManager) return all;
    if (isLeader && leaderTeam) return all.filter(n => { const m = members.find(mm => mm.name === n); return m?.teamGroup === leaderTeam; });
    return currentUser ? all.filter(n => n === currentUser.name) : [];
  }, [kpiEntries, submissions, isManager, isLeader, leaderTeam, members, currentUser]);

  const monthTasks = useMemo(() => {
    const fromKpi = dailyTasks.filter(t => isInRange(t.timestamp, dateFrom, dateTo));
    const fromSubs = submissions.filter(s => isInRange(s.submittedAt, dateFrom, dateTo))
      .flatMap(s => s.links.map((link, i) => ({
        id: `${s.id}_${i}`, entryId: s.id, linkIndex: i, link,
        employeeName: s.employeeName, taskType: s.taskType, taskDetail: s.taskDetail,
        category: s.taskType, teamName: s.teamGroup || 'Khác', point: s.pointPerLink,
        timestamp: s.submittedAt, projectName: s.projectId ? (projects.find(p => p.id === s.projectId)?.name ?? '') : '',
        projectId: s.projectId,
      })));
    return [...fromKpi, ...fromSubs];
  }, [dailyTasks, submissions, dateFrom, dateTo, projects]);

  const performanceSummary = useMemo(() => {
    return allEmployees.map(name => {
      const memConfig = members.find(m => m.name === name);
      const kpiRole = memConfig?.kpiRole || 'member';
      // Lấy danh sách submissions thực tế trong kỳ của nhân sự này để tính toán chính xác số điểm và số link
      const empSubs = submissions.filter(s => s.employeeName === name && isInRange(s.submittedAt, dateFrom, dateTo));
      const totalLinks = empSubs.reduce((sum, s) => sum + (s.links?.length || 0), 0);
      const basePoints = empSubs.reduce((sum, s) => sum + s.totalPoints, 0);
      // Bonus của tháng (selectedPeriod): chỉ cộng bonus đã APPROVED
      const empBonus = bonusPoints
        .filter(b => b.employeeName === name && b.period === selectedPeriod && b.status === 'approved')
        .reduce((s, b) => s + b.amount, 0);
      const totalPoints = basePoints + empBonus;
      const memberTarget = scaleConfig.memberTargetPoints;
      // Ưu tiên hệ số sản xuất riêng của từng người (productivityFactor)
      // Nếu không có → fallback theo kpiRole: leader dùng scaleConfig, member = 1.0
      const pFactor = memConfig?.productivityFactor
        ?? (kpiRole === 'leader' ? scaleConfig.leaderProductionWeight : 1.0);
      const targetPoints = Math.round(memberTarget * pFactor * 100) / 100;
      const kpiAchievement = targetPoints > 0 ? (totalPoints / targetPoints) * 100 : 0;
      const review = performanceReviews.find(r => r.employeeName === name && r.period === selectedPeriod);
      const productivityScore = Math.min((totalPoints / targetPoints) * 5, 5);
      const daysOff = review?.daysOff ?? 0;
      const allowedDaysOff = review?.allowedDaysOff ?? scaleConfig.allowedDaysOff;
      const attendanceScore = Math.max(5 - Math.max(daysOff - allowedDaysOff, 0) * 1.5, 0);
      const quality = review?.qualityScore ?? 0;
      const attitude = review?.attitudeScore ?? 0;
      const timeliness = review?.timelinessScore ?? 0;
      const W = scaleConfig.weights;
      const totalScore = review ? (productivityScore*W.productivity + quality*W.quality + attitude*W.attitude + timeliness*W.timeliness + attendanceScore*W.attendance) : 0;
      return { name, kpiRole, totalLinks, basePoints, bonus: empBonus, totalPoints, targetPoints, kpiAchievement: Math.round(kpiAchievement),
        productivityScore: Math.round(productivityScore*10)/10, qualityScore: quality, attitudeScore: attitude, timelinessScore: timeliness,
        daysOff, attendanceScore: Math.round(attendanceScore*10)/10, totalScore: Math.round(totalScore*10)/10, hasReview: !!review, review, teamGroup: memConfig?.teamGroup || '' };
    })
    .filter(e => !searchQuery || e.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return (b[sortBy] as number) - (a[sortBy] as number);
    });
  }, [allEmployees, monthTasks, performanceReviews, selectedPeriod, members, scaleConfig, searchQuery, sortBy, bonusPoints, submissions]);

  // ── Leadership metrics cho tất cả Leader ──────────────────────────────────
  const leadershipMetrics = useMemo(() => {
    const leaders = members.filter(m => m.kpiRole === 'leader');
    return leaders.map(leader =>
      computeLeadershipMetrics(leader, selectedPeriod, members, submissions, projectTasks, rndLogs, scaleConfig, bonusPoints)
    );
  }, [members, selectedPeriod, submissions, projectTasks, rndLogs, scaleConfig, bonusPoints]);

  const visibleLeadership = useMemo(() => {
    if (currentUser?.role === 'Manager') return leadershipMetrics;
    if (currentUser?.role === 'Leader') return leadershipMetrics.filter(m => m.leaderName === currentUser.name);
    return [];
  }, [leadershipMetrics, currentUser]);

  const radarData = useMemo(() => {
    const top5 = performanceSummary.filter(p => p.hasReview).slice(0, 5);
    const colors = ['#1D9E75','#3B82F6','#8B5CF6','#F59E0B','#EF4444'];
    return {
      labels: ['Sản lượng', 'Chất lượng', 'Thái độ', 'Tiến độ', 'Chuyên cần'],
      datasets: top5.map((emp, idx) => ({
        label: emp.name + (emp.kpiRole === 'leader' ? ' (Lead)' : ''),
        data: [emp.productivityScore, emp.qualityScore, emp.attitudeScore, emp.timelinessScore, emp.attendanceScore],
        backgroundColor: colors[idx] + '20', borderColor: colors[idx], borderWidth: 2, pointRadius: 4, pointBackgroundColor: colors[idx],
      })),
    };
  }, [performanceSummary]);

  const generateId = () => makeId('rev');
  const getRankBadge = (rank: number) => {
    if (rank === 1) return { emoji: '🥇', bg: '#FEF3C7', color: '#D97706' };
    if (rank === 2) return { emoji: '🥈', bg: '#F1F5F9', color: '#64748B' };
    if (rank === 3) return { emoji: '🥉', bg: '#FED7AA', color: '#EA580C' };
    return { emoji: `${rank}`, bg: 'var(--bg-secondary)', color: 'var(--text-tertiary)' };
  };
  const getScoreColor = (v: number) => v >= 4 ? 'var(--success)' : v >= 3 ? 'var(--primary-600)' : v >= 2 ? 'var(--warning)' : 'var(--danger)';

  const toggleSort = (key: SortKey) => {
    setSortBy(key);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title"><span className="icon"><Award size={20} /></span> Đánh giá nhân sự</h2>
          <p className="page-subtitle">Xếp hạng và đánh giá hiệu suất nhân sự</p>
        </div>
        {(isManager || isLeader) && (
          <button className="btn btn-primary" onClick={() => { setEditItem(null); setShowForm(true); }}>
            <Plus size={16} /> Đánh giá mới
          </button>
        )}
      </div>

      {/* Date Range + Search */}
      <div className="card" style={{ padding: '16px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={16} color="var(--primary-500)" />
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Từ</span>
            <input type="date" className="form-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ width: 'auto', fontSize: '0.85rem', padding: '6px 10px' }} />
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>đến</span>
            <input type="date" className="form-input" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ width: 'auto', fontSize: '0.85rem', padding: '6px 10px' }} />
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', flex: '0 0 220px' }}>
            <Search size={14} color="var(--text-tertiary)" />
            <input className="form-input" placeholder="Tìm nhân viên..." value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)} style={{ fontSize: '0.85rem', padding: '6px 10px' }} />
          </div>
        </div>
        {/* Sort buttons */}
        <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
          {([['totalPoints','Tổng điểm'],['totalLinks','Sản lượng'],['kpiAchievement','% KPI'],['totalScore','Điểm đánh giá'],['name','Tên']] as [SortKey,string][]).map(([k,l]) => (
            <button key={k} onClick={() => toggleSort(k)}
              style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                border: sortBy === k ? '1.5px solid var(--primary-500)' : '1px solid var(--border-light)',
                background: sortBy === k ? 'var(--primary-50)' : 'transparent', color: sortBy === k ? 'var(--primary-700)' : 'var(--text-secondary)',
                display: 'flex', alignItems: 'center', gap: '4px' }}>
              {l} {sortBy === k && <ArrowUpDown size={10} />}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: '16px' }}>
        <div className="stat-card"><div style={{ display:'flex',alignItems:'center',gap:'10px' }}><div style={{ width:36,height:36,borderRadius:'var(--radius-md)',background:'var(--primary-50)',color:'var(--primary-600)',display:'flex',alignItems:'center',justifyContent:'center' }}><Users size={20}/></div><div><div style={{ fontSize:'0.78rem',color:'var(--text-tertiary)' }}>Nhân viên</div><div style={{ fontWeight:800,fontSize:'1.3rem' }}>{performanceSummary.length}</div></div></div></div>
        <div className="stat-card"><div style={{ display:'flex',alignItems:'center',gap:'10px' }}><div style={{ width:36,height:36,borderRadius:'var(--radius-md)',background:'var(--success-bg)',color:'var(--success)',display:'flex',alignItems:'center',justifyContent:'center' }}><Star size={20}/></div><div><div style={{ fontSize:'0.78rem',color:'var(--text-tertiary)' }}>Đã đánh giá</div><div style={{ fontWeight:800,fontSize:'1.3rem' }}>{performanceSummary.filter(p=>p.hasReview).length}/{performanceSummary.length}</div></div></div></div>
        <div className="stat-card"><div style={{ display:'flex',alignItems:'center',gap:'10px' }}><div style={{ width:36,height:36,borderRadius:'var(--radius-md)',background:'var(--blue-100)',color:'var(--blue-600)',display:'flex',alignItems:'center',justifyContent:'center' }}><TrendingUp size={20}/></div><div><div style={{ fontSize:'0.78rem',color:'var(--text-tertiary)' }}>Tổng link</div><div style={{ fontWeight:800,fontSize:'1.3rem' }}>{monthTasks.length.toLocaleString()}</div></div></div></div>
        <div className="stat-card"><div style={{ display:'flex',alignItems:'center',gap:'10px' }}><div style={{ width:36,height:36,borderRadius:'var(--radius-md)',background:'var(--purple-100)',color:'var(--purple-600)',display:'flex',alignItems:'center',justifyContent:'center' }}><Award size={20}/></div><div><div style={{ fontSize:'0.78rem',color:'var(--text-tertiary)' }}>Top scorer</div><div style={{ fontWeight:800,fontSize:'1rem' }}>{performanceSummary[0]?.name || '—'}</div></div></div></div>
      </div>

      {/* Radar */}
      {radarData.datasets.length > 0 && (
        <div className="card" style={{ padding:'20px',marginBottom:'16px' }}>
          <div style={{ fontWeight:700,marginBottom:'14px',display:'flex',alignItems:'center',gap:'8px' }}><Award size={16} color="var(--primary-500)"/>So sánh 5 chiều</div>
          <div style={{ height:'300px',display:'flex',justifyContent:'center' }}>
            <Radar data={radarData} options={{ responsive:true,maintainAspectRatio:false,scales:{r:{min:0,max:5,ticks:{stepSize:1}}},plugins:{legend:{position:'bottom',labels:{usePointStyle:true,boxWidth:8}}} }}/>
          </div>
        </div>
      )}

      {/* Rankings */}
      <div className="card" style={{ padding:'20px' }}>
        <div style={{ fontWeight:700,marginBottom:'14px',display:'flex',alignItems:'center',gap:'8px' }}>
          <Users size={16} color="var(--primary-500)"/>Bảng xếp hạng nhân sự
        </div>
        <div style={{ display:'flex',flexDirection:'column',gap:'8px' }}>
          {performanceSummary.map((emp, rank) => {
            const badge = getRankBadge(rank+1);
            return (
              <div key={emp.name} style={{ border:'1px solid var(--border-light)',borderRadius:'var(--radius-md)',overflow:'hidden',
                background: rank < 3 ? `linear-gradient(135deg, ${badge.bg}44, transparent)` : undefined }}>
                <button onClick={() => setExpandedEmployee(expandedEmployee===emp.name?null:emp.name)}
                  style={{ width:'100%',padding:'14px 16px',background:'transparent',border:'none',cursor:'pointer',display:'flex',alignItems:'center',gap:'12px',textAlign:'left' }}>
                  <span style={{ width:32,height:32,borderRadius:'50%',flexShrink:0,background:badge.bg,color:badge.color,fontWeight:800,
                    display:'flex',alignItems:'center',justifyContent:'center',fontSize: rank<3?'1rem':'0.85rem' }}>{badge.emoji}</span>
                  <div style={{ width:38,height:38,borderRadius:'50%',flexShrink:0,background:'var(--primary-100)',color:'var(--primary-700)',
                    display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700 }}>{emp.name.charAt(0).toUpperCase()}</div>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontWeight:600,fontSize:'0.9rem',display:'flex',alignItems:'center',gap:'8px' }}>
                      {emp.name}
                      {emp.kpiRole==='leader'&&<span style={{ padding:'2px 6px',background:'var(--primary-100)',color:'var(--primary-700)',borderRadius:'4px',fontSize:'0.65rem' }}>LEADER</span>}
                      {emp.teamGroup&&<span style={{ fontSize:'0.7rem',color:'var(--text-tertiary)' }}>• {emp.teamGroup}</span>}
                    </div>
                    <div style={{ fontSize:'0.75rem',color:'var(--text-tertiary)' }}>
                      {emp.totalLinks} link · {emp.basePoints.toLocaleString('vi-VN',{maximumFractionDigits:1})}đ
                      {emp.bonus !== 0 && (
                        <span style={{
                          marginLeft: 6,
                          color: emp.bonus > 0 ? 'var(--success)' : 'var(--danger)',
                          fontWeight: 600,
                        }}>
                          {emp.bonus > 0 ? '+' : ''}{emp.bonus}đ bonus
                        </span>
                      )}
                      {' '}= <strong style={{ color: 'var(--text-primary)' }}>{emp.totalPoints.toLocaleString('vi-VN',{maximumFractionDigits:1})}đ</strong>
                    </div>
                  </div>
                  <div style={{ display:'flex',gap:'16px',flexShrink:0,alignItems:'center' }}>
                    <div style={{ display:'flex',flexDirection:'column',alignItems:'center',minWidth:'60px' }}>
                      <div style={{ fontWeight:800,fontSize:'1.1rem',color:emp.kpiAchievement>=100?'var(--success)':emp.kpiAchievement>=80?'var(--warning)':'var(--danger)' }}>{emp.kpiAchievement}%</div>
                      <div style={{ fontSize:'0.68rem',color:'var(--text-tertiary)' }}>KPI</div>
                    </div>
                    {emp.hasReview ? (
                      <div style={{ display:'flex',flexDirection:'column',alignItems:'center',minWidth:'50px',padding:'4px 10px',borderRadius:'var(--radius-sm)',background:getScoreColor(emp.totalScore)+'15' }}>
                        <div style={{ fontWeight:800,fontSize:'1.2rem',color:getScoreColor(emp.totalScore) }}>{emp.totalScore.toFixed(1)}</div>
                        <div style={{ fontSize:'0.68rem',color:'var(--text-tertiary)' }}>Tổng</div>
                      </div>
                    ) : <span style={{ fontSize:'0.8rem',color:'var(--warning)',fontWeight:600 }}>Chưa đánh giá</span>}
                  </div>
                  <div style={{ display:'flex',gap:'6px',flexShrink:0 }}>
                    {(isManager||isLeader)&&<button className="btn btn-icon btn-ghost" onClick={e=>{e.stopPropagation();setEditItem(emp.review||null);setShowForm(true);}}>{emp.hasReview?<Edit3 size={14}/>:<Plus size={14}/>}</button>}
                    {emp.review&&isManager&&<button className="btn btn-icon btn-ghost" onClick={e=>{e.stopPropagation();if(window.confirm(`Xóa đánh giá ${emp.name}?`)){deletePerformanceReview(emp.review!.id);toast.success('Đã xóa');}}} style={{color:'var(--danger)'}}><Trash2 size={14}/></button>}
                  </div>
                  {expandedEmployee===emp.name?<ChevronUp size={15}/>:<ChevronDown size={15}/>}
                </button>
                {expandedEmployee===emp.name&&(
                  <div style={{ padding:'14px 16px',borderTop:'1px solid var(--border-light)',background:'var(--bg-secondary)' }}>
                    <div style={{ display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:'10px' }}>
                      {[['Sản lượng',emp.productivityScore,30],['Chất lượng',emp.qualityScore,30],['Thái độ',emp.attitudeScore,15],['Tiến độ',emp.timelinessScore,15],['Chuyên cần',emp.attendanceScore,10]].map(([l,v,w])=>(
                        <div key={l as string} style={{ textAlign:'center',padding:'10px',background:'var(--bg-primary)',borderRadius:'var(--radius-md)' }}>
                          <div style={{ fontSize:'1.3rem',fontWeight:800,color:getScoreColor(v as number) }}>{(v as number).toFixed(1)}</div>
                          <div style={{ fontSize:'0.78rem',fontWeight:600,color:'var(--text-secondary)',marginTop:'2px' }}>{l as string}</div>
                          <div style={{ fontSize:'0.68rem',color:'var(--text-tertiary)' }}>Trọng số: {w}%</div>
                        </div>
                      ))}
                    </div>
                    {emp.review?.notes&&<div style={{ marginTop:'12px',padding:'10px',background:'var(--bg-primary)',borderRadius:'var(--radius-sm)',fontSize:'0.85rem',color:'var(--text-secondary)' }}><strong>Ghi chú:</strong> {emp.review.notes}</div>}
                  </div>
                )}
              </div>
            );
          })}
          {performanceSummary.length===0&&<div style={{ textAlign:'center',padding:'40px',color:'var(--text-tertiary)' }}>Chưa có dữ liệu.</div>}
        </div>
      </div>

      {/* ── Leadership Score Panel ── */}
      {visibleLeadership.length > 0 && (
        <div className="card" style={{ padding: '24px', marginTop: '20px' }}>
          <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '6px',
                        display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={18} color="var(--primary-500)" />
            Đánh giá Leader — Đảm bảo KPI Team
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', marginBottom: '18px' }}>
            Nhiệm vụ cốt lõi của Lead: dẫn dắt team đạt 100% KPI mục tiêu.
            <br />
            <em>Chất lượng & R&D tự chọn — Manager đánh giá qua thưởng/phạt (Bonus).</em>
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {visibleLeadership.map(m => {
              const totalColor = m.totalScore >= 75 ? 'var(--success)' : m.totalScore >= 50 ? 'var(--primary-600)' : 'var(--warning)';
              const totalBg    = m.totalScore >= 75 ? 'var(--success-bg)' : m.totalScore >= 50 ? 'var(--accent-100)' : 'var(--warning-bg)';
              return (
                <div key={m.leaderName} style={{
                  border: '1px solid var(--border-light)', borderRadius: 'var(--radius-lg)',
                  padding: '20px', background: 'var(--bg-card)',
                }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: '14px', flexShrink: 0,
                      background: 'linear-gradient(135deg, var(--primary-500), var(--accent-500))',
                      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, fontSize: '1.3rem',
                    }}>{m.leaderName.charAt(0).toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{m.leaderName}</div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
                        Lead team <strong style={{ color: 'var(--primary-600)' }}>{m.teamGroup || '—'}</strong>
                        {' · '}{m.teamMembers} member · {m.teamSubmissions} submissions
                      </div>
                    </div>
                    <div style={{
                      padding: '12px 22px', background: totalBg, color: totalColor,
                      borderRadius: 'var(--radius-md)', fontWeight: 800, textAlign: 'center',
                    }}>
                      <div style={{ fontSize: '2rem', lineHeight: 1 }}>{m.totalScore}</div>
                      <div style={{ fontSize: '0.7rem', fontWeight: 600, marginTop: 2, opacity: 0.7 }}>/100 SCORE</div>
                    </div>
                  </div>

                  {/* KPI Team card */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '14px' }}>
                    <BigMetricCard
                      icon={<Trophy size={20} />}
                      label="KPI Team"
                      weight={`${Math.round(LEADERSHIP_WEIGHTS.kpi * 100)}% trọng số`}
                      score={Math.min(100, m.kpiTeamScore)}
                      headline={`${m.teamPointsActual.toLocaleString('vi-VN', { maximumFractionDigits: 0 })}đ / ${m.teamPointsTarget.toLocaleString('vi-VN')}đ`}
                      sub={`Team đạt ${m.kpiTeamScore}% target tổng (${m.teamMembers} member × ${(m.teamPointsTarget / Math.max(m.teamMembers, 1)).toLocaleString('vi-VN')}đ)`}
                      color="var(--primary-500)"
                    />
                  </div>

                  {/* Tham khảo: spot-check + R&D + bonus tháng — không vào tổng */}
                  {(() => {
                    const leadReview = performanceReviews.find(r => r.employeeName === m.leaderName && r.period === selectedPeriod);
                    const leadBonusTotal = bonusPoints
                      .filter(b => b.employeeName === m.leaderName && b.period === selectedPeriod && b.status === 'approved')
                      .reduce((s, b) => s + b.amount, 0);
                    const leadBonusPending = bonusPoints
                      .filter(b => b.employeeName === m.leaderName && b.period === selectedPeriod && b.status === 'pending')
                      .length;
                    return (
                      <>
                        <div style={{
                          marginTop: '14px', padding: '10px 14px',
                          background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)',
                          display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center',
                        }}>
                          <span style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>
                            THAM KHẢO:
                          </span>
                          <span style={{ fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <ShieldCheck size={12} color="var(--primary-500)" />
                            Spot-check: <strong>{m.spotCheckedCount}/{m.teamSubmissions}</strong>
                            {m.avgQualityScore > 0 && <span> ({m.avgQualityScore}/5★)</span>}
                          </span>
                          <span style={{ fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Lightbulb size={12} color="#F59E0B" />
                            R&D: <strong>{m.rndCompletedCount}/{m.rndLogsCount}</strong> (impact {m.rndImpactSum})
                          </span>
                          <span style={{ fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Gift size={12} color={leadBonusTotal >= 0 ? 'var(--success)' : 'var(--danger)'} />
                            Bonus tháng: <strong style={{ color: leadBonusTotal >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                              {leadBonusTotal >= 0 ? '+' : ''}{leadBonusTotal.toFixed(0)}đ
                            </strong>
                            {leadBonusPending > 0 && (
                              <span style={{ marginLeft: 4, fontSize: '0.7rem', padding: '1px 6px',
                                             background: 'var(--warning-bg)', color: '#92400e',
                                             borderRadius: 'var(--radius-full)', fontWeight: 600 }}>
                                {leadBonusPending} chờ duyệt
                              </span>
                            )}
                          </span>
                          {leadReview && (
                            <span style={{ fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Star size={12} color="var(--warning)" />
                              Đánh giá: <strong>CL {leadReview.qualityScore}/5 · TĐ {leadReview.attitudeScore}/5</strong>
                            </span>
                          )}
                        </div>

                        {/* Action buttons — Manager only */}
                        {currentUser?.role === 'Manager' && (
                          <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button className="btn btn-primary" style={{ fontSize: '0.82rem' }}
                              onClick={() => {
                                setReviewPrefillEmployee(m.leaderName);
                                setEditItem(leadReview ?? null);
                                setShowForm(true);
                              }}>
                              <MessageSquare size={13} /> {leadReview ? 'Sửa đánh giá' : 'Đánh giá Lead'}
                            </button>
                            <button className="btn btn-secondary" style={{ fontSize: '0.82rem' }}
                              onClick={() => navigate(`/bonus-points?employee=${encodeURIComponent(m.leaderName)}&period=${selectedPeriod}`)}>
                              <Gift size={13} /> Cấp bonus / phạt
                            </button>
                            <button className="btn btn-ghost" style={{ fontSize: '0.82rem' }}
                              onClick={() => setExpandedLeader(expandedLeader === m.leaderName ? null : m.leaderName)}>
                              <Eye size={13} /> {expandedLeader === m.leaderName ? 'Ẩn chi tiết' : 'Xem chi tiết'}
                            </button>
                            {leadReview?.notes && (
                              <span style={{ alignSelf: 'center', fontSize: '0.78rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                                💬 "{leadReview.notes}"
                              </span>
                            )}
                          </div>
                        )}

                        {/* Drill-down: task trễ + member yếu */}
                        {expandedLeader === m.leaderName && (() => {
                          const monthEnd = (() => {
                            const [y, mm] = selectedPeriod.split('-').map(Number);
                            return new Date(y, mm, 0, 23, 59, 59).getTime();
                          })();
                          const monthStart = (() => {
                            const [y, mm] = selectedPeriod.split('-').map(Number);
                            return new Date(y, mm - 1, 1).getTime();
                          })();

                          // Tasks trễ
                          const teamMemberNames = members
                            .filter(mb => mb.teamGroup === m.teamGroup && mb.kpiRole === 'member')
                            .map(mb => mb.name);
                          const lateTasks = projectTasks.filter(t => {
                            if (!t.deadline) return false;
                            const dl = new Date(t.deadline).getTime();
                            if (isNaN(dl) || dl < monthStart || dl > monthEnd) return false;
                            if (t.assignees && t.assignees.length > 0 && !t.assignees.some(a => teamMemberNames.includes(a))) return false;
                            const matched = submissions.filter(s => {
                              if (s.projectTaskId === t.id) return true;
                              if (s.projectTaskId) return false;
                              if (t.taskType && s.taskType !== t.taskType) return false;
                              if (t.taskDetail && s.taskDetail !== t.taskDetail) return false;
                              if (t.assignees && t.assignees.length > 0 && !t.assignees.includes(s.employeeName)) return false;
                              return !!t.taskType || !!t.taskDetail;
                            });
                            const totalLinks = matched.reduce((sum, s) => sum + s.links.length, 0);
                            const lastSubmitTime = Math.max(0, ...matched.map(s => new Date(s.submittedAt).getTime()));
                            return totalLinks < t.targetLinks || lastSubmitTime > dl;
                          });

                          // Member yếu (đạt < 80% target)
                          const weakMembers = teamMemberNames.map(name => {
                            const subs = submissions.filter(s =>
                              s.employeeName === name && s.submittedAt.startsWith(selectedPeriod)
                            );
                            const points = subs.reduce((sum, s) => sum + s.totalPoints, 0);
                            const pct = (points / scaleConfig.memberTargetPoints) * 100;
                            return { name, points, pct };
                          }).filter(x => x.pct < 80).sort((a, b) => a.pct - b.pct);

                          return (
                            <div style={{ marginTop: '12px', padding: '14px',
                                          background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                              <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '8px',
                                            display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Eye size={13} color="var(--primary-500)" /> Chi tiết drill-down
                              </div>

                              {/* Task trễ */}
                              <div style={{ marginBottom: '12px' }}>
                                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)',
                                              marginBottom: '6px' }}>
                                  🔴 Task chưa hoàn thành / trễ deadline ({lateTasks.length})
                                </div>
                                {lateTasks.length === 0 ? (
                                  <div style={{ fontSize: '0.78rem', color: 'var(--success)', padding: '4px 8px' }}>
                                    ✓ Tất cả task đúng hạn
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {lateTasks.slice(0, 8).map(t => (
                                      <div key={t.id} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '6px 10px', background: 'var(--bg-card)',
                                        borderRadius: 'var(--radius-sm)', fontSize: '0.8rem',
                                      }}>
                                        <div>
                                          <strong>{t.name}</strong>
                                          <span style={{ marginLeft: 6, color: 'var(--text-tertiary)', fontSize: '0.74rem' }}>
                                            {t.assignees?.join(', ') ?? 'Bất kỳ'} · DL {t.deadline}
                                          </span>
                                        </div>
                                        <span style={{ color: 'var(--danger)', fontSize: '0.74rem' }}>
                                          target {t.targetLinks} link
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Member yếu */}
                              <div>
                                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)',
                                              marginBottom: '6px' }}>
                                  ⚠️ Member dưới 80% target ({weakMembers.length})
                                </div>
                                {weakMembers.length === 0 ? (
                                  <div style={{ fontSize: '0.78rem', color: 'var(--success)', padding: '4px 8px' }}>
                                    ✓ Tất cả member đạt ≥ 80% target
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {weakMembers.map(mb => (
                                      <div key={mb.name} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '6px 10px', background: 'var(--bg-card)',
                                        borderRadius: 'var(--radius-sm)', fontSize: '0.8rem',
                                      }}>
                                        <strong>{mb.name}</strong>
                                        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                          <span style={{ color: 'var(--text-tertiary)' }}>
                                            {mb.points.toFixed(0)}đ / {scaleConfig.memberTargetPoints}đ
                                          </span>
                                          <span style={{
                                            color: mb.pct >= 60 ? 'var(--warning)' : 'var(--danger)',
                                            fontWeight: 700,
                                          }}>{mb.pct.toFixed(0)}%</span>
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showForm&&<ReviewFormModal item={editItem} employees={allEmployees} period={selectedPeriod}
        onClose={()=>{setShowForm(false);setEditItem(null);}}
        onSave={data=>{if(editItem){updatePerformanceReview(editItem.id,data);toast.success('Đã cập nhật');}else{addPerformanceReview({...data,id:generateId()} as PerformanceReview);toast.success('Đã thêm');}setShowForm(false);setEditItem(null);}}/>}
    </div>
  );
}

function BigMetricCard({ icon, label, weight, score, headline, sub, color }: {
  icon: React.ReactNode; label: string; weight: string; score: number;
  headline: string; sub: string; color: string;
}) {
  const tone = score >= 75 ? 'var(--success)' : score >= 50 ? 'var(--primary-600)' : score >= 25 ? 'var(--warning)' : 'var(--danger)';
  return (
    <div style={{
      padding: '18px', background: 'var(--bg-secondary)',
      borderRadius: 'var(--radius-md)',
      borderLeft: `4px solid ${color}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <div style={{
          width: 36, height: 36, borderRadius: '10px', flexShrink: 0,
          background: `${color}20`, color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{label}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>{weight}</div>
        </div>
        <div style={{
          fontWeight: 800, fontSize: '1.8rem', color: tone, lineHeight: 1,
        }}>
          {score}
          <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', fontWeight: 500, marginLeft: 2 }}>/100</span>
        </div>
      </div>
      <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>{headline}</div>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: 4 }}>{sub}</div>

      {/* Progress bar */}
      <div style={{ height: 5, background: 'var(--bg-card)', borderRadius: 3, marginTop: 10 }}>
        <div style={{
          height: '100%', borderRadius: 3, background: tone,
          width: `${Math.min(100, score)}%`, transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  );
}

function ReviewFormModal({item,employees,period,onClose,onSave}:{item:PerformanceReview|null;employees:string[];period:string;onClose:()=>void;onSave:(data:Partial<PerformanceReview>)=>void;}) {
  const [form,setForm]=useState<Partial<PerformanceReview>>(item||{employeeName:employees[0]||'',period,qualityScore:3,attitudeScore:3,timelinessScore:3,daysOff:0,allowedDaysOff:2,notes:'',reviewedAt:new Date().toISOString().slice(0,10),reviewerId:'Manager'});
  const handleSubmit=(e:React.FormEvent)=>{e.preventDefault();if(!form.employeeName){toast.error('Chọn nhân viên');return;}onSave(form);};
  const renderStars=(label:string,field:'qualityScore'|'attitudeScore'|'timelinessScore',value:number)=>(
    <div className="form-group"><label className="form-label">{label} ({value}/5)</label>
      <div style={{display:'flex',gap:'4px'}}>{[1,2,3,4,5].map(s=><button key={s} type="button" onClick={()=>setForm({...form,[field]:s})}
        style={{background:'none',border:'none',cursor:'pointer',padding:'2px',color:s<=value?'#F59E0B':'#E2E8F0',fontSize:'1.5rem',lineHeight:1}}>★</button>)}</div></div>
  );
  return (
    <div className="modal-overlay" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:'540px'}}>
      <div className="modal-header"><h3 className="modal-title">{item?'Chỉnh sửa':'Đánh giá Performance'}</h3><button className="modal-close" onClick={onClose}><X size={16}/></button></div>
      <form onSubmit={handleSubmit}><div className="modal-body">
        <div className="form-row">
          <div className="form-group"><label className="form-label">Nhân viên *</label><select className="form-select" value={form.employeeName||''} onChange={e=>setForm({...form,employeeName:e.target.value})} disabled={!!item}>{employees.map(emp=><option key={emp} value={emp}>{emp}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Kỳ đánh giá</label><input className="form-input" type="month" value={form.period||period} onChange={e=>setForm({...form,period:e.target.value})}/></div>
        </div>
        {renderStars('Chất lượng',  'qualityScore',   form.qualityScore??3)}
        {renderStars('Thái độ',     'attitudeScore',   form.attitudeScore??3)}
        {renderStars('Đúng tiến độ','timelinessScore', form.timelinessScore??3)}
        <div className="form-row">
          <div className="form-group"><label className="form-label">Ngày nghỉ</label><input className="form-input" type="number" min="0" max="31" value={form.daysOff??0} onChange={e=>setForm({...form,daysOff:parseInt(e.target.value)||0})}/></div>
          <div className="form-group"><label className="form-label">Cho phép</label><input className="form-input" type="number" min="0" max="31" value={form.allowedDaysOff??2} onChange={e=>setForm({...form,allowedDaysOff:parseInt(e.target.value)||0})}/></div>
        </div>
        <div className="form-group"><label className="form-label">Ghi chú</label><textarea className="form-textarea" value={form.notes||''} onChange={e=>setForm({...form,notes:e.target.value})} rows={3}/></div>
      </div>
      <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button><button type="submit" className="btn btn-primary"><Save size={14}/> {item?'Cập nhật':'Lưu'}</button></div>
      </form></div></div>
  );
}
