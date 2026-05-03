import { useState, useMemo } from 'react';
import { useAppStore } from '@/shared/store/appStore';
import { flattenDailyTasks } from '@/shared/selectors/dailyTasks';
import { BarChart3, Calendar, FileText, Plus, Edit3, Trash2, X, Save, Lock, Unlock, Sparkles, ChevronDown, ChevronUp, Download, Globe } from 'lucide-react';
import type { WeeklyReport, WeeklyReportProject } from '@/shared/types';
import { exportCsv } from '@/shared/utils/helpers';
import { exportHtmlFile, buildReportHtml } from '@/shared/utils/exportHtml';
import toast from 'react-hot-toast';

function getWeekStart(d: Date): string {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff).toISOString().slice(0, 10);
}

function parseDate(ts: string): Date | null {
  if (!ts) return null;
  const parts = ts.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (parts) return new Date(`${parts[3]}-${parts[2]}-${parts[1]}`);
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
}

function formatWeek(ws: string): string {
  const d = new Date(ws);
  const end = new Date(d); end.setDate(d.getDate() + 6);
  return `${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} — ${end.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
}

export default function ReportsPage() {
  const { weeklyReports, addWeeklyReport, updateWeeklyReport, deleteWeeklyReport, projects, kpiEntries, submissions, taskPointRules, currentUser } = useAppStore();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<WeeklyReport | null>(null);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);

  // Date range filter cho list
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');

  const isManager = currentUser?.role === 'Manager';
  const canEdit = isManager;

  // Page-level guard: chỉ Manager mới xem được
  if (!isManager) {
    return <div className="card" style={{ padding: '40px', textAlign: 'center', marginTop: '20px' }}>
      <h3 style={{ fontWeight: 700, marginBottom: '8px' }}>🔒 Không có quyền truy cập</h3>
      <p style={{ color: 'var(--text-tertiary)' }}>Chỉ Manager mới xem được báo cáo tuần.</p>
    </div>;
  }

  const dailyTasks = useMemo(() => flattenDailyTasks(kpiEntries, projects, taskPointRules), [kpiEntries, projects, taskPointRules]);

  const sortedReports = useMemo(() => {
    let r = [...weeklyReports];
    if (dateFrom) r = r.filter(x => x.weekStart >= dateFrom);
    if (dateTo)   r = r.filter(x => x.weekStart <= dateTo);
    return r.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  }, [weeklyReports, dateFrom, dateTo]);

  const handleExportCSV = () => {
    if (sortedReports.length === 0) { toast.error('Không có báo cáo nào'); return; }
    const rows = sortedReports.map(r => ({
      weekStart: r.weekStart,
      createdBy: r.createdBy,
      totalLinks: r.totalLinks,
      totalPoints: r.totalPoints,
      totalTasksCompleted: r.totalTasksCompleted,
      summary: r.summary,
      managerAssessment: r.managerAssessment || r.aiAssessment,
      issues: r.issues,
      nextWeekPlan: r.nextWeekPlan,
      projectsSummary: r.projectProgress.map(p => `${p.projectName}:${p.progress}%`).join(' | '),
      locked: r.locked ? 'yes' : 'no',
    }));
    exportCsv(rows, `bao-cao-tuan_${dateFrom || 'all'}_${dateTo || 'all'}`);
    toast.success(`Đã export ${rows.length} báo cáo`);
  };

  // Tự động tính data cho tuần hiện tại
  const currentWeekStart = getWeekStart(new Date());
  const currentWeekData = useMemo(() => {
    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const tasks = [...dailyTasks, ...submissions.flatMap(s => s.links.map((l, i) => ({
      id: `${s.id}_${i}`, entryId: s.id, linkIndex: i, link: l, employeeName: s.employeeName,
      taskType: s.taskType, taskDetail: s.taskDetail, point: s.pointPerLink, timestamp: s.submittedAt,
      projectName: '', projectId: s.projectId,
    })))].filter(t => {
      const d = parseDate(t.timestamp);
      return d && d >= new Date(currentWeekStart) && d <= weekEnd;
    });
    return { totalLinks: tasks.length, totalPoints: tasks.reduce((s, t) => s + t.point, 0), totalTasks: tasks.length };
  }, [dailyTasks, submissions, currentWeekStart]);

  const generateId = () => `wr_${Date.now().toString(36)}`;

  const handleCreateNew = () => {
    const existing = weeklyReports.find(r => r.weekStart === currentWeekStart);
    if (existing) { setEditItem(existing); }
    else { setEditItem(null); }
    setShowForm(true);
  };

  const handleExportText = (report: WeeklyReport) => {
    const lines = [
      `📊 BÁO CÁO TUẦN — ${formatWeek(report.weekStart)}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `📝 Tổng quan: ${report.summary}`,
      '', '📦 TIẾN ĐỘ DỰ ÁN:',
      ...report.projectProgress.map(p => `  • ${p.projectName}: ${p.progress}% (${p.tasksCompleted}/${p.tasksTotal} việc) ${p.notes ? '— ' + p.notes : ''}`),
      '', `📊 SỐ LIỆU: ${report.totalLinks} link | ${report.totalPoints.toFixed(0)} điểm | ${report.totalTasksCompleted} việc`,
      report.insights ? `\n💡 NHẬN XÉT: ${report.insights}` : '',
      report.bottlenecks ? `\n🚧 ĐIỂM NGHẼN: ${report.bottlenecks}` : '',
      '', `👤 ĐÁNH GIÁ: ${report.managerAssessment || report.aiAssessment}`,
      report.issues ? `\n⚠️ VẤN ĐỀ: ${report.issues}` : '',
      report.nextWeekPlan ? `\n📋 KẾ HOẠCH TUẦN TỚI: ${report.nextWeekPlan}` : '',
    ].filter(Boolean).join('\n');
    navigator.clipboard.writeText(lines).then(() => toast.success('Đã copy báo cáo!')).catch(() => toast.error('Lỗi copy'));
  };

  const handleExportHTML = (report: WeeklyReport) => {
    const html = buildReportHtml({
      title: `Báo cáo tuần — ${formatWeek(report.weekStart)}`,
      period: formatWeek(report.weekStart),
      overview: [
        { label: 'Tổng link', value: report.totalLinks },
        { label: 'Tổng điểm', value: report.totalPoints.toFixed(0) },
        { label: 'Lượt submit', value: report.totalTasksCompleted },
        { label: 'Dự án', value: report.projectProgress.length },
      ],
      taskBreakdown: report.taskBreakdownByTeam || [],
      projectProgress: report.projectProgress.map(p => ({
        name: p.projectName, progress: p.progress,
        done: p.tasksCompleted, total: p.tasksTotal, notes: p.notes,
      })),
      insights: report.insights || '',
      bottlenecks: report.bottlenecks || '',
      managerNotes: report.managerAssessment || report.aiAssessment || '',
      nextPlan: report.nextWeekPlan || '',
    });
    exportHtmlFile(html, `bao-cao-${report.weekStart}`);
    toast.success('Đã export HTML!');
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title"><span className="icon"><BarChart3 size={20} /></span>Báo cáo tuần</h2>
          <p className="page-subtitle">Manager báo cáo tiến độ mỗi tuần — chọn thời gian để xem/xuất báo cáo cũ.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={handleExportCSV}
            disabled={sortedReports.length === 0}>
            <Download size={14} /> Export CSV
          </button>
          {canEdit && <button className="btn btn-primary" onClick={handleCreateNew}><Plus size={16} /> Tạo báo cáo</button>}
        </div>
      </div>

      {/* Date range filter */}
      <div className="card" style={{ padding: '12px 14px', marginBottom: '16px',
                                     display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <Calendar size={14} color="var(--primary-500)" />
          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Từ tuần:</span>
          <input className="form-input" type="date" value={dateFrom}
            onChange={e => setDateFrom(e.target.value)} style={{ width: 'auto', fontSize: '0.85rem' }} />
          <span style={{ color: 'var(--text-tertiary)' }}>→</span>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Đến:</span>
          <input className="form-input" type="date" value={dateTo}
            onChange={e => setDateTo(e.target.value)} style={{ width: 'auto', fontSize: '0.85rem' }} />
          {(dateFrom || dateTo) && (
            <button className="btn btn-ghost" onClick={() => { setDateFrom(''); setDateTo(''); }}
              style={{ padding: '4px 8px', fontSize: '0.78rem' }}>
              <X size={12} /> Bỏ lọc
            </button>
          )}
        </div>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
          {sortedReports.length} / {weeklyReports.length} báo cáo
        </span>
      </div>

      {/* Current week summary */}
      <div className="card" style={{ padding: '16px', marginBottom: '16px', borderLeft: '4px solid var(--primary-500)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>📅 Tuần hiện tại: {formatWeek(currentWeekStart)}</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
              {currentWeekData.totalLinks} link · {currentWeekData.totalPoints.toFixed(0)} điểm trong tuần
            </div>
          </div>
          {canEdit && !weeklyReports.find(r => r.weekStart === currentWeekStart) && (
            <button className="btn btn-secondary" onClick={handleCreateNew} style={{ fontSize: '0.82rem' }}>
              <Sparkles size={14} /> Tạo báo cáo nhanh
            </button>
          )}
        </div>
      </div>

      {/* Reports list */}
      {sortedReports.length === 0 ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
          <FileText size={40} style={{ color: 'var(--text-tertiary)', marginBottom: '12px', opacity: 0.4 }} />
          <h3 style={{ fontWeight: 700, marginBottom: '8px' }}>Chưa có báo cáo tuần</h3>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', marginBottom: '16px' }}>
            Bấm "Tạo báo cáo tuần này" để bắt đầu viết báo cáo đầu tiên.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {sortedReports.map(report => {
            const isExpanded = expandedReport === report.id;
            return (
              <div key={report.id} className="card" style={{ overflow: 'hidden' }}>
                <button onClick={() => setExpandedReport(isExpanded ? null : report.id)}
                  style={{ width: '100%', padding: '16px 20px', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--primary-50)', color: 'var(--primary-600)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Calendar size={18} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {formatWeek(report.weekStart)}
                      {report.locked && <Lock size={12} color="var(--text-tertiary)" />}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                      {report.totalLinks} link · {report.totalPoints.toFixed(0)} điểm · {report.projectProgress.length} dự án
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    {canEdit && !report.locked && (
                      <>
                        <button className="btn btn-icon btn-ghost" onClick={e => { e.stopPropagation(); setEditItem(report); setShowForm(true); }}><Edit3 size={14} /></button>
                        <button className="btn btn-icon btn-ghost" onClick={e => { e.stopPropagation(); if (window.confirm('Xóa báo cáo này?')) { deleteWeeklyReport(report.id); toast.success('Đã xóa'); } }} style={{ color: 'var(--danger)' }}><Trash2 size={14} /></button>
                      </>
                    )}
                    <button className="btn btn-icon btn-ghost" onClick={e => { e.stopPropagation(); handleExportText(report); }} title="Copy báo cáo"><Download size={14} /></button>
                    <button className="btn btn-icon btn-ghost" onClick={e => { e.stopPropagation(); handleExportHTML(report); }} title="Export HTML" style={{ color: 'var(--primary-600)' }}><Globe size={14} /></button>
                  </div>
                  {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>

                {isExpanded && (
                  <div style={{ padding: '0 20px 20px', borderTop: '1px solid var(--border-light)' }}>
                    {/* Summary */}
                    {report.summary && (
                      <div style={{ padding: '12px', margin: '12px 0', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', fontSize: '0.88rem' }}>
                        <strong>📝 Tổng quan:</strong> {report.summary}
                      </div>
                    )}
                    {/* Project progress */}
                    {report.projectProgress.length > 0 && (
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '8px' }}>📦 Tiến độ dự án</div>
                        {report.projectProgress.map(p => (
                          <div key={p.projectId} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--border-light)' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.85rem', flex: 1 }}>{p.projectName}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '120px' }}>
                              <div className="progress-bar-bg" style={{ flex: 1, height: '6px' }}>
                                <div className={`progress-bar-fill ${p.progress >= 80 ? 'high' : p.progress >= 40 ? 'medium' : 'low'}`} style={{ width: `${p.progress}%` }} />
                              </div>
                              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--primary-600)' }}>{p.progress}%</span>
                            </div>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{p.tasksCompleted}/{p.tasksTotal}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Task breakdown by team */}
                    {report.taskBreakdownByTeam && report.taskBreakdownByTeam.length > 0 && (
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '8px' }}>📝 Chi tiết đầu việc</div>
                        {report.taskBreakdownByTeam.map(t => (
                          <div key={t.team} style={{ marginBottom: '8px', padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', borderLeft: `3px solid ${t.color}` }}>
                            <div style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: '4px' }}>{t.team} <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>({t.items.reduce((s,i) => s+i.links, 0)} link · {t.items.reduce((s,i) => s+i.points, 0).toFixed(0)}đ)</span></div>
                            {t.items.map((item, i) => (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', padding: '2px 0', color: 'var(--text-secondary)' }}>
                                <span>{item.label}</span>
                                <span style={{ fontWeight: 600 }}>{item.links} link · {item.points.toFixed(1)}đ</span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Insights + Bottlenecks */}
                    {report.insights && (
                      <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: '#EFF6FF', border: '1px solid #BFDBFE', fontSize: '0.85rem', color: '#1E3A5F', marginBottom: '8px', whiteSpace: 'pre-wrap' }}>
                        💡 <strong>Nhận xét từ số liệu:</strong> {report.insights}
                      </div>
                    )}
                    {report.bottlenecks && (
                      <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: '#FEF2F2', border: '1px solid #FECACA', fontSize: '0.85rem', color: '#991B1B', marginBottom: '8px', whiteSpace: 'pre-wrap' }}>
                        🚧 <strong>Điểm nghẽn:</strong> {report.bottlenecks}
                      </div>
                    )}
                    {/* Manager assessment */}
                    {report.managerAssessment && (
                      <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: '#F0FDF4', border: '1px solid #BBF7D0', fontSize: '0.85rem', color: '#14532D', marginBottom: '8px', whiteSpace: 'pre-wrap' }}>
                        👤 <strong>Nhận xét Manager:</strong> {report.managerAssessment}
                      </div>
                    )}
                    {report.issues && (
                      <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--danger-bg)', fontSize: '0.85rem', color: 'var(--danger)', marginBottom: '8px' }}>
                        ⚠️ <strong>Vấn đề:</strong> {report.issues}
                      </div>
                    )}
                    {report.nextWeekPlan && (
                      <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--primary-50)', fontSize: '0.85rem', color: 'var(--primary-700)' }}>
                        📋 <strong>Kế hoạch tuần tới:</strong> {report.nextWeekPlan}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && <ReportFormModal item={editItem} currentWeekStart={currentWeekStart} currentWeekData={currentWeekData}
        onClose={() => { setShowForm(false); setEditItem(null); }}
        onSave={data => {
          if (editItem) { updateWeeklyReport(editItem.id, { ...data, updatedAt: new Date().toISOString() }); toast.success('Đã cập nhật báo cáo'); }
          else { addWeeklyReport({ ...data, id: generateId(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as WeeklyReport); toast.success('Đã tạo báo cáo'); }
          setShowForm(false); setEditItem(null);
        }} />}
    </div>
  );
}

function ReportFormModal({ item, currentWeekStart, currentWeekData, onClose, onSave }: {
  item: WeeklyReport | null; currentWeekStart: string; currentWeekData: { totalLinks: number; totalPoints: number; totalTasks: number };
  onClose: () => void; onSave: (data: Partial<WeeklyReport>) => void;
}) {
  const { projects, currentUser, projectTasks, submissions } = useAppStore();
  const activeProjects = projects.filter(p => p.status === 'Đang chạy');

  const [form, setForm] = useState<Partial<WeeklyReport>>(item || {
    weekStart: currentWeekStart,
    createdBy: currentUser?.name || '',
    projectProgress: activeProjects.map(p => ({ projectId: p.id, projectName: p.name, progress: 0, tasksCompleted: 0, tasksTotal: 0, notes: '' })),
    totalTasksCompleted: currentWeekData.totalTasks,
    totalLinks: currentWeekData.totalLinks,
    totalPoints: currentWeekData.totalPoints,
    summary: '', aiAssessment: '', managerAssessment: '', nextWeekPlan: '', issues: '',
    insights: '', bottlenecks: '', taskBreakdownByTeam: [], locked: false,
  });

  // ── Tính toán tự động cho weekStart đã chọn ───────────────────────────────
  const recalcFromWeek = (weekStart: string) => {
    const ws = new Date(weekStart);
    const we = new Date(ws); we.setDate(ws.getDate() + 6); we.setHours(23, 59, 59);
    const inRange = submissions.filter(s => {
      const t = new Date(s.submittedAt).getTime();
      return !isNaN(t) && t >= ws.getTime() && t <= we.getTime();
    });
    const totalLinks  = inRange.reduce((sum, s) => sum + s.links.length, 0);
    const totalPoints = inRange.reduce((sum, s) => sum + s.totalPoints, 0);
    // Project progress + breakdown task cứng
    const pp: WeeklyReportProject[] = activeProjects.map(p => {
      const tasks = projectTasks.filter(t => t.projectId === p.id);
      const allSubs = submissions.filter(s => s.projectId === p.id);
      const breakdown = tasks.map(t => {
        const matched = allSubs.filter(s => {
          if (s.projectTaskId === t.id) return true;
          if (s.projectTaskId) return false;
          if (t.taskType && s.taskType !== t.taskType) return false;
          if (t.taskDetail && s.taskDetail !== t.taskDetail) return false;
          return !!t.taskType || !!t.taskDetail;
        });
        const completed = matched.reduce((sum, s) => sum + s.links.length, 0);
        return {
          taskName: t.name,
          targetLinks: t.targetLinks,
          completedLinks: completed,
          progress: Math.min(100, Math.round((completed / Math.max(t.targetLinks, 1)) * 100)),
        };
      });
      const tasksTotal     = breakdown.reduce((s, x) => s + x.targetLinks, 0);
      const tasksCompleted = breakdown.reduce((s, x) => s + x.completedLinks, 0);
      const progress = breakdown.length > 0
        ? Math.round(breakdown.reduce((s, x) => s + x.progress, 0) / breakdown.length)
        : 0;
      return {
      projectId: p.id, projectName: p.name,
        progress, tasksCompleted, tasksTotal, notes: '',
        taskBreakdown: breakdown,
      };
    });

    // ── Task breakdown by team ──
    const teamMap = new Map<string, { color: string; items: Map<string, { links: number; points: number }> }>();
    const teamColors: Record<string, string> = { 'Bài viết': '#1D9E75', 'Sản phẩm': '#8B5CF6', 'Multimedia - Tin nhanh': '#F59E0B' };
    inRange.forEach(s => {
      const team = s.teamGroup || 'Khác';
      if (!teamMap.has(team)) teamMap.set(team, { color: teamColors[team] || '#64748b', items: new Map() });
      const label = s.taskDetail || s.taskType;
      const prev = teamMap.get(team)!.items.get(label) || { links: 0, points: 0 };
      teamMap.get(team)!.items.set(label, { links: prev.links + s.links.length, points: prev.points + s.totalPoints });
    });
    const taskBreakdownByTeam = Array.from(teamMap.entries()).map(([team, { color, items }]) => ({
      team, color,
      items: Array.from(items.entries()).map(([label, v]) => ({ label, ...v })).sort((a, b) => b.points - a.points),
    }));

    // ── Auto insights ──
    const employees = new Set(inRange.map(s => s.employeeName));
    const empPoints = new Map<string, number>();
    inRange.forEach(s => empPoints.set(s.employeeName, (empPoints.get(s.employeeName) || 0) + s.totalPoints));
    const topEmp = Array.from(empPoints.entries()).sort((a, b) => b[1] - a[1]);
    const avgPoints = employees.size > 0 ? totalPoints / employees.size : 0;
    const insights = [
      `Tổng: ${totalLinks} link, ${totalPoints.toFixed(0)}đ từ ${employees.size} nhân viên.`,
      `Trung bình: ${avgPoints.toFixed(1)}đ/người.`,
      topEmp.length > 0 ? `Top: ${topEmp.slice(0,3).map(([n,p]) => `${n} (${p.toFixed(0)}đ)`).join(', ')}.` : '',
      taskBreakdownByTeam.map(t => {
        const tLinks = t.items.reduce((s,i) => s+i.links, 0);
        return `${t.team}: ${tLinks} link`;
      }).join(' | '),
    ].filter(Boolean).join('\n');

    // ── Auto bottlenecks ──
    const bottleneckItems: string[] = [];
    pp.forEach(p => {
      if (p.taskBreakdown) {
        p.taskBreakdown.forEach(t => {
          if (t.progress < 30 && t.targetLinks > 0) bottleneckItems.push(`${p.projectName} > ${t.taskName}: chỉ ${t.progress}%`);
        });
      }
    });
    if (totalLinks === 0) bottleneckItems.push('Không có link nào được submit trong tuần.');
    const lowEmps = topEmp.filter(([,p]) => p < avgPoints * 0.5);
    if (lowEmps.length > 0) bottleneckItems.push(`Sản lượng thấp: ${lowEmps.map(([n]) => n).join(', ')}`);
    const bottlenecks = bottleneckItems.join('\n');

    return { totalLinks, totalPoints, totalTasksCompleted: inRange.length, projectProgress: pp, taskBreakdownByTeam, insights, bottlenecks };
  };

  const handleWeekChange = (weekStart: string) => {
    const auto = recalcFromWeek(weekStart);
    setForm(f => ({ ...f, weekStart, ...auto }));
  };

  const handleAutoFill = () => {
    if (!form.weekStart) return;
    const auto = recalcFromWeek(form.weekStart);
    setForm(f => ({ ...f, ...auto }));
    toast.success('Đã tự fill từ submissions + tasks cứng');
  };

  const [aiLoading, setAiLoading] = useState(false);

  const handleAIGenerate = () => {
    setAiLoading(true);
    setTimeout(() => {
      const progresses = (form.projectProgress || []).map(p => `${p.projectName}: ${p.progress}%`).join(', ');
      const assessment = `Tuần này đạt ${form.totalLinks || 0} link (${form.totalPoints?.toFixed(0) || 0} điểm). ` +
        `Tiến độ dự án: ${progresses || 'chưa cập nhật'}. ` +
        (form.totalLinks && form.totalLinks > 500 ? 'Sản lượng tốt, duy trì nhịp độ. ' : 'Cần tăng tốc sản lượng. ') +
        'Đề xuất: Ưu tiên các task trễ hạn, phân bổ lại nhân sự nếu cần.';
      setForm({ ...form, aiAssessment: assessment });
      setAiLoading(false);
      toast.success('AI đã gợi ý đánh giá!');
    }, 1000);
  };

  const updateProjectProgress = (idx: number, field: keyof WeeklyReportProject, value: string | number) => {
    const pp = [...(form.projectProgress || [])];
    pp[idx] = { ...pp[idx], [field]: value };
    setForm({ ...form, projectProgress: pp });
  };

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSave(form); };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '680px', maxHeight: '90vh', overflow: 'auto' }}>
        <div className="modal-header">
          <h3 className="modal-title">{item ? 'Chỉnh sửa báo cáo' : 'Báo cáo tuần'} — {formatWeek(form.weekStart || currentWeekStart)}</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Week selector + Auto-fill */}
            <div className="form-row" style={{ alignItems: 'flex-end' }}>
              <div className="form-group">
                <label className="form-label">📅 Tuần bắt đầu (Thứ 2)</label>
                <input className="form-input" type="date" value={form.weekStart || ''}
                  onChange={e => handleWeekChange(e.target.value)} />
              </div>
              <div className="form-group">
                <button type="button" className="btn btn-secondary" onClick={handleAutoFill}
                  style={{ height: '38px' }}>
                  <Sparkles size={13} /> Tự fill từ submissions + task
                </button>
              </div>
            </div>

            {/* Auto stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
              {[['Link', form.totalLinks], ['Điểm', form.totalPoints?.toFixed(0)], ['Việc', form.totalTasksCompleted]].map(([l, v]) => (
                <div key={l as string} style={{ padding: '10px', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', textAlign: 'center' }}>
                  <div style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--primary-600)' }}>{v}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{l}</div>
                </div>
              ))}
            </div>

            {/* Project progress */}
            <div style={{ marginBottom: '16px' }}>
              <label className="form-label" style={{ fontWeight: 700 }}>📦 Tiến độ dự án</label>
              {(form.projectProgress || []).map((p, idx) => (
                <div key={idx} style={{ marginBottom: '8px', padding: '8px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, minWidth: '120px' }}>{p.projectName}</span>
                    <input className="form-input" type="number" min="0" max="100" value={p.progress} onChange={e => updateProjectProgress(idx, 'progress', parseInt(e.target.value) || 0)}
                      style={{ width: '60px', fontSize: '0.82rem', padding: '4px 6px' }} placeholder="%" />
                    <input className="form-input" type="number" min="0" value={p.tasksCompleted} onChange={e => updateProjectProgress(idx, 'tasksCompleted', parseInt(e.target.value) || 0)}
                      style={{ width: '60px', fontSize: '0.82rem', padding: '4px 6px' }} placeholder="Done" />
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>/</span>
                    <input className="form-input" type="number" min="0" value={p.tasksTotal} onChange={e => updateProjectProgress(idx, 'tasksTotal', parseInt(e.target.value) || 0)}
                      style={{ width: '60px', fontSize: '0.82rem', padding: '4px 6px' }} placeholder="Total" />
                    <input className="form-input" value={p.notes} onChange={e => updateProjectProgress(idx, 'notes', e.target.value)}
                      style={{ flex: 1, fontSize: '0.82rem', padding: '4px 6px' }} placeholder="Ghi chú..." />
                  </div>
                  {/* Task breakdown */}
                  {p.taskBreakdown && p.taskBreakdown.length > 0 && (
                    <div style={{ marginTop: '6px', paddingLeft: '12px', fontSize: '0.76rem' }}>
                      {p.taskBreakdown.map((t, ti) => (
                        <div key={ti} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 0' }}>
                          <span style={{ flex: 1, color: 'var(--text-secondary)' }}>🎯 {t.taskName}</span>
                          <span style={{ fontWeight: 600, color: 'var(--primary-600)' }}>
                            {t.completedLinks}/{t.targetLinks} link
                          </span>
                          <span style={{ fontWeight: 700,
                                         color: t.progress >= 100 ? 'var(--success)' : t.progress >= 50 ? 'var(--primary-600)' : 'var(--warning)',
                                         minWidth: 40, textAlign: 'right' }}>
                            {t.progress}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="form-group">
              <label className="form-label">📝 Tổng quan tuần</label>
              <textarea className="form-textarea" value={form.summary || ''} onChange={e => setForm({ ...form, summary: e.target.value })} rows={2} placeholder="Tóm tắt tình hình chung..." />
            </div>

            {/* AI Assessment */}
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label">🤖 AI đánh giá</label>
                <button type="button" className="btn btn-secondary" onClick={handleAIGenerate} disabled={aiLoading}
                  style={{ fontSize: '0.78rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Sparkles size={12} /> {aiLoading ? 'Đang tạo...' : 'AI gợi ý'}
                </button>
              </div>
              <textarea className="form-textarea" value={form.aiAssessment || ''} onChange={e => setForm({ ...form, aiAssessment: e.target.value })} rows={3}
                placeholder="Bấm 'AI gợi ý' hoặc nhập thủ công..." style={{ background: '#F0F9FF' }} />
            </div>

            <div className="form-group">
              <label className="form-label">👤 Manager đánh giá (chỉnh sửa tự do)</label>
              <textarea className="form-textarea" value={form.managerAssessment || ''} onChange={e => setForm({ ...form, managerAssessment: e.target.value })} rows={3}
                placeholder="Nhận xét, đánh giá của bạn..." />
            </div>

            <div className="form-group">
              <label className="form-label">💡 Nhận xét từ số liệu <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontWeight: 400 }}>(tự động tạo khi Auto-fill, có thể chỉnh sửa)</span></label>
              <textarea className="form-textarea" value={form.insights || ''} onChange={e => setForm({ ...form, insights: e.target.value })} rows={3}
                placeholder="Bấm 'Tự fill' để tự động phân tích số liệu..." style={{ background: '#EFF6FF' }} />
            </div>

            <div className="form-group">
              <label className="form-label">🚧 Điểm nghẽn hiện tại <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontWeight: 400 }}>(tự động phát hiện, có thể chỉnh sửa)</span></label>
              <textarea className="form-textarea" value={form.bottlenecks || ''} onChange={e => setForm({ ...form, bottlenecks: e.target.value })} rows={2}
                placeholder="Tự động phát hiện khi Auto-fill..." style={{ background: '#FEF2F2' }} />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">⚠️ Vấn đề cần lưu ý</label>
                <textarea className="form-textarea" value={form.issues || ''} onChange={e => setForm({ ...form, issues: e.target.value })} rows={2} />
              </div>
              <div className="form-group">
                <label className="form-label">📋 Kế hoạch tuần tới</label>
                <textarea className="form-textarea" value={form.nextWeekPlan || ''} onChange={e => setForm({ ...form, nextWeekPlan: e.target.value })} rows={2} />
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem', cursor: 'pointer', marginTop: '8px' }}>
              <input type="checkbox" checked={form.locked || false} onChange={e => setForm({ ...form, locked: e.target.checked })}
                style={{ accentColor: 'var(--primary-500)', width: 16, height: 16 }} />
              {form.locked ? <Lock size={14} /> : <Unlock size={14} />} Chốt báo cáo (không sửa được sau khi chốt)
            </label>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
            <button type="submit" className="btn btn-primary"><Save size={14} /> {item ? 'Cập nhật' : 'Lưu báo cáo'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
