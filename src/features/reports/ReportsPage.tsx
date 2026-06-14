import { useState, useMemo } from 'react';
import { useAppStore } from '@/shared/store/appStore';
import { flattenDailyTasks } from '@/shared/selectors/dailyTasks';
import {
  BarChart3, Calendar, FileText, Plus, Edit3, Trash2, X, Save,
  Lock, Unlock, Sparkles, ChevronDown, ChevronUp, Download, Globe,
  TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2,
  ArrowRight, Zap, Target, Users,
} from 'lucide-react';
import type { WeeklyReport, WeeklyReportProject } from '@/shared/types';
import { exportCsv, makeId } from '@/shared/utils/helpers';
import { exportHtmlFile, buildReportHtml } from '@/shared/utils/exportHtml';
import toast from 'react-hot-toast';
import WeeklyReportViewer from './WeeklyReportViewer';

/* ─────────────────────────────────────────────────────────── helpers ── */

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

function formatWeekShort(ws: string): string {
  const d = new Date(ws);
  return `${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}`;
}

function pct(a: number, b: number): number {
  if (b === 0) return 0;
  return Math.round(((a - b) / b) * 100);
}

/* ─────────────────────────────────────────────────────── main page ── */

export default function ReportsPage() {
  const {
    weeklyReports, addWeeklyReport, updateWeeklyReport, deleteWeeklyReport,
    projects, kpiEntries, submissions, taskPointRules, currentUser,
  } = useAppStore();

  const [showForm, setShowForm]         = useState(false);
  const [editItem, setEditItem]         = useState<WeeklyReport | null>(null);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [viewingReport, setViewingReport]   = useState<WeeklyReport | null>(null);
  const [dateFrom, setDateFrom]         = useState('');
  const [dateTo,   setDateTo]           = useState('');
  const [hoveredBar, setHoveredBar]     = useState<string | null>(null);

  const isManager = currentUser?.role === 'Manager';
  const canEdit   = isManager;

  if (!isManager) {
    return (
      <div className="card" style={{ padding: '60px', textAlign: 'center', marginTop: '20px' }}>
        <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🔒</div>
        <h3 style={{ fontWeight: 700, marginBottom: '8px' }}>Không có quyền truy cập</h3>
        <p style={{ color: 'var(--text-tertiary)' }}>Chỉ Manager mới xem được báo cáo tuần.</p>
      </div>
    );
  }

  const dailyTasks = useMemo(
    () => flattenDailyTasks(kpiEntries, projects, taskPointRules),
    [kpiEntries, projects, taskPointRules],
  );

  /* last 8 weeks sorted ascending for chart */
  const last8Weeks = useMemo(() => {
    const ws = getWeekStart(new Date());
    const weeks: string[] = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(ws);
      d.setDate(d.getDate() - i * 7);
      weeks.push(d.toISOString().slice(0, 10));
    }
    return weeks;
  }, []);

  const weekDataMap = useMemo(() => {
    const map = new Map<string, { links: number; points: number }>();
    last8Weeks.forEach(ws => {
      const r = weeklyReports.find(x => x.weekStart === ws);
      map.set(ws, { links: r?.totalLinks ?? 0, points: r?.totalPoints ?? 0 });
    });
    return map;
  }, [weeklyReports, last8Weeks]);

  const maxLinks = useMemo(
    () => Math.max(...Array.from(weekDataMap.values()).map(v => v.links), 1),
    [weekDataMap],
  );

  const sortedReports = useMemo(() => {
    let r = [...weeklyReports];
    if (dateFrom) r = r.filter(x => x.weekStart >= dateFrom);
    if (dateTo)   r = r.filter(x => x.weekStart <= dateTo);
    return r.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  }, [weeklyReports, dateFrom, dateTo]);

  const currentWeekStart = getWeekStart(new Date());
  const prevWeekStart    = (() => {
    const d = new Date(currentWeekStart); d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  })();

  const currentWeekData = useMemo(() => {
    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const tasks = [...dailyTasks, ...submissions.flatMap((s, si) =>
      s.links.map((l, i) => ({
        id: `${s.id}_${si}_${i}`, entryId: s.id, linkIndex: i, link: l,
        employeeName: s.employeeName, taskType: s.taskType, taskDetail: s.taskDetail,
        point: s.pointPerLink, timestamp: s.submittedAt, projectName: '', projectId: s.projectId,
      }))
    )].filter(t => {
      const d = parseDate(t.timestamp);
      return d && d >= new Date(currentWeekStart) && d <= weekEnd;
    });
    return {
      totalLinks:  tasks.length,
      totalPoints: tasks.reduce((s, t) => s + t.point, 0),
      totalTasks:  tasks.length,
    };
  }, [dailyTasks, submissions, currentWeekStart]);

  const prevWeekReport = weeklyReports.find(r => r.weekStart === prevWeekStart);
  const deltaLinks  = pct(currentWeekData.totalLinks,  prevWeekReport?.totalLinks  ?? 0);
  const deltaPoints = pct(currentWeekData.totalPoints, prevWeekReport?.totalPoints ?? 0);
  const currentReport = weeklyReports.find(r => r.weekStart === currentWeekStart);
  const projectsOnTrack = currentReport
    ? currentReport.projectProgress.filter(p => p.progress >= 50).length
    : 0;
  const totalProjects = currentReport ? currentReport.projectProgress.length : 0;

  const generateId = () => makeId('wr');

  const handleCreateNew = () => {
    const existing = weeklyReports.find(r => r.weekStart === currentWeekStart);
    setEditItem(existing ?? null);
    setShowForm(true);
  };

  const handleExportCSV = () => {
    if (sortedReports.length === 0) { toast.error('Không có báo cáo nào'); return; }
    const rows = sortedReports.map(r => ({
      weekStart: r.weekStart, createdBy: r.createdBy,
      totalLinks: r.totalLinks, totalPoints: r.totalPoints,
      totalTasksCompleted: r.totalTasksCompleted, summary: r.summary,
      managerAssessment: r.managerAssessment || r.aiAssessment,
      issues: r.issues, nextWeekPlan: r.nextWeekPlan,
      projectsSummary: r.projectProgress.map(p => `${p.projectName}:${p.progress}%`).join(' | '),
      locked: r.locked ? 'yes' : 'no',
    }));
    exportCsv(rows, `bao-cao-tuan_${dateFrom || 'all'}_${dateTo || 'all'}`);
    toast.success(`Đã export ${rows.length} báo cáo`);
  };

  const handleExportText = (report: WeeklyReport) => {
    const lines = [
      `📊 BÁO CÁO TUẦN — ${formatWeek(report.weekStart)}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `📝 Tổng quan: ${report.summary}`,
      '', '📦 TIẾN ĐỘ DỰ ÁN:',
      ...report.projectProgress.map(p =>
        `  • ${p.projectName}: ${p.progress}% (${p.tasksCompleted}/${p.tasksTotal} việc)${p.notes ? ' — ' + p.notes : ''}`
      ),
      '', `📊 SỐ LIỆU: ${report.totalLinks} link | ${report.totalPoints.toFixed(0)} điểm | ${report.totalTasksCompleted} việc`,
      report.insights     ? `\n💡 NHẬN XÉT: ${report.insights}`                    : '',
      report.bottlenecks  ? `\n🚧 ĐIỂM NGHẼN: ${report.bottlenecks}`               : '',
      '', `👤 ĐÁNH GIÁ: ${report.managerAssessment || report.aiAssessment}`,
      report.issues       ? `\n⚠️ VẤN ĐỀ: ${report.issues}`                       : '',
      report.nextWeekPlan ? `\n📋 KẾ HOẠCH TUẦN TỚI: ${report.nextWeekPlan}`       : '',
    ].filter(Boolean).join('\n');
    navigator.clipboard.writeText(lines)
      .then(() => toast.success('Đã copy báo cáo!'))
      .catch(() => toast.error('Lỗi copy'));
  };

  const handleExportHTML = (report: WeeklyReport) => {
    const html = buildReportHtml({
      title: `Báo cáo tuần — ${formatWeek(report.weekStart)}`,
      period: formatWeek(report.weekStart),
      overview: [
        { label: 'Tổng link',    value: report.totalLinks },
        { label: 'Tổng điểm',   value: report.totalPoints.toFixed(0) },
        { label: 'Lượt submit',  value: report.totalTasksCompleted },
        { label: 'Dự án',        value: report.projectProgress.length },
      ],
      taskBreakdown: report.taskBreakdownByTeam || [],
      projectProgress: report.projectProgress.map(p => ({
        name: p.projectName, progress: p.progress,
        done: p.tasksCompleted, total: p.tasksTotal, notes: p.notes,
      })),
      insights:    report.insights    || '',
      bottlenecks: report.bottlenecks || '',
      managerNotes: report.managerAssessment || report.aiAssessment || '',
      nextPlan:    report.nextWeekPlan || '',
    });
    exportHtmlFile(html, `bao-cao-${report.weekStart}`);
    toast.success('Đã export HTML!');
  };

  /* ── render ── */
  return (
    <div>
      {/* ── header ── */}
      <div className="page-header">
        <div>
          <h2 className="page-title">
            <span className="icon"><BarChart3 size={20} /></span>Báo cáo tuần
          </h2>
          <p className="page-subtitle">Tổng hợp tiến độ · So sánh trend · Xuất báo cáo nhanh</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={handleExportCSV} disabled={sortedReports.length === 0}>
            <Download size={14} /> Export CSV
          </button>
          {canEdit && (
            <button className="btn btn-primary" onClick={handleCreateNew}
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', boxShadow: '0 4px 14px rgba(99,102,241,.35)' }}>
              <Plus size={16} /> Tạo báo cáo
            </button>
          )}
        </div>
      </div>

      {/* ── quick-status banner ── */}
      <QuickStatusBanner
        currentWeekStart={currentWeekStart}
        currentWeekData={currentWeekData}
        deltaLinks={deltaLinks}
        deltaPoints={deltaPoints}
        prevWeekReport={prevWeekReport}
        projectsOnTrack={projectsOnTrack}
        totalProjects={totalProjects}
        canEdit={canEdit}
        hasCurrentReport={!!currentReport}
        onCreateNew={handleCreateNew}
      />

      {/* ── trend chart ── */}
      {weeklyReports.length > 0 && (
        <TrendChart
          last8Weeks={last8Weeks}
          weekDataMap={weekDataMap}
          maxLinks={maxLinks}
          currentWeekStart={currentWeekStart}
          hoveredBar={hoveredBar}
          setHoveredBar={setHoveredBar}
        />
      )}

      {/* ── date filter ── */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <Calendar size={14} color="var(--primary-500)" />
        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Lọc:</span>
        <input className="form-input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          style={{ width: 'auto', fontSize: '0.85rem' }} />
        <span style={{ color: 'var(--text-tertiary)' }}>→</span>
        <input className="form-input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          style={{ width: 'auto', fontSize: '0.85rem' }} />
        {(dateFrom || dateTo) && (
          <button className="btn btn-ghost" onClick={() => { setDateFrom(''); setDateTo(''); }}
            style={{ padding: '4px 8px', fontSize: '0.78rem' }}>
            <X size={12} /> Bỏ lọc
          </button>
        )}
        <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
          {sortedReports.length} / {weeklyReports.length} báo cáo
        </span>
      </div>

      {/* ── reports list ── */}
      {sortedReports.length === 0 ? (
        <div className="card" style={{ padding: '60px', textAlign: 'center' }}>
          <FileText size={48} style={{ color: 'var(--text-tertiary)', marginBottom: '16px', opacity: 0.3 }} />
          <h3 style={{ fontWeight: 700, marginBottom: '8px' }}>Chưa có báo cáo tuần</h3>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.88rem', marginBottom: '20px' }}>
            Bấm "Tạo báo cáo" để bắt đầu — hệ thống sẽ tự fill số liệu từ submissions.
          </p>
          {canEdit && (
            <button className="btn btn-primary" onClick={handleCreateNew}
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none' }}>
              <Sparkles size={14} /> Tạo báo cáo đầu tiên
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {sortedReports.map((report, idx) => {
            const isExpanded = expandedReport === report.id;
            const prevReport = sortedReports[idx + 1];
            const linkDelta = prevReport ? pct(report.totalLinks, prevReport.totalLinks) : null;
            return (
              <ReportCard
                key={report.id}
                report={report}
                isExpanded={isExpanded}
                linkDelta={linkDelta}
                canEdit={canEdit}
                onToggle={() => setExpandedReport(isExpanded ? null : report.id)}
                onView={() => setViewingReport(report)}
                onEdit={() => { setEditItem(report); setShowForm(true); }}
                onDelete={() => { if (window.confirm('Xóa báo cáo này?')) { deleteWeeklyReport(report.id); toast.success('Đã xóa'); } }}
                onCopy={() => handleExportText(report)}
                onExportHtml={() => handleExportHTML(report)}
              />
            );
          })}
        </div>
      )}

      {showForm && (
        <ReportFormModal
          item={editItem}
          currentWeekStart={currentWeekStart}
          onClose={() => { setShowForm(false); setEditItem(null); }}
          onSave={data => {
            if (editItem) {
              updateWeeklyReport(editItem.id, { ...data, updatedAt: new Date().toISOString() });
              toast.success('Đã cập nhật báo cáo');
            } else {
              addWeeklyReport({ ...data, id: generateId(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as WeeklyReport);
              toast.success('Đã tạo báo cáo');
            }
            setShowForm(false); setEditItem(null);
          }}
        />
      )}

      {/* ── full-screen report viewer ── */}
      {viewingReport && (
        <WeeklyReportViewer
          report={viewingReport}
          canEdit={canEdit}
          onClose={() => setViewingReport(null)}
          onSave={updates => {
            updateWeeklyReport(viewingReport.id, { ...updates, updatedAt: new Date().toISOString() });
            setViewingReport(prev => prev ? { ...prev, ...updates } : prev);
            toast.success('Đã lưu báo cáo');
          }}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────── QuickStatusBanner ── */

function DeltaBadge({ value }: { value: number }) {
  if (value === 0) return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', background: '#f1f5f9', borderRadius: '999px', padding: '2px 8px' }}>
      <Minus size={10} /> 0%
    </span>
  );
  const up = value > 0;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.75rem', fontWeight: 700,
      color: up ? '#16a34a' : '#dc2626',
      background: up ? '#dcfce7' : '#fee2e2',
      borderRadius: '999px', padding: '2px 8px' }}>
      {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {up ? '+' : ''}{value}%
    </span>
  );
}

function QuickStatusBanner({
  currentWeekStart, currentWeekData, deltaLinks, deltaPoints,
  prevWeekReport, projectsOnTrack, totalProjects,
  canEdit, hasCurrentReport, onCreateNew,
}: {
  currentWeekStart: string; currentWeekData: { totalLinks: number; totalPoints: number };
  deltaLinks: number; deltaPoints: number; prevWeekReport: WeeklyReport | undefined;
  projectsOnTrack: number; totalProjects: number;
  canEdit: boolean; hasCurrentReport: boolean; onCreateNew: () => void;
}) {
  const allGood = deltaLinks >= 0 && deltaPoints >= 0;
  const gradientColor = allGood
    ? 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)'
    : 'linear-gradient(135deg, #fff7ed 0%, #fed7aa 100%)';
  const accentColor = allGood ? '#16a34a' : '#ea580c';

  return (
    <div style={{
      borderRadius: 'var(--radius-lg)',
      background: gradientColor,
      border: `2px solid ${allGood ? '#86efac' : '#fdba74'}`,
      padding: '20px 24px',
      marginBottom: '16px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* decorative blobs */}
      <div style={{ position: 'absolute', right: -20, top: -20, width: 140, height: 140, borderRadius: '50%',
        background: allGood ? 'rgba(134,239,172,.25)' : 'rgba(253,186,116,.25)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', right: 60, bottom: -30, width: 80, height: 80, borderRadius: '50%',
        background: allGood ? 'rgba(134,239,172,.15)' : 'rgba(253,186,116,.15)', pointerEvents: 'none' }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', position: 'relative' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Calendar size={16} color={accentColor} />
            <span style={{ fontWeight: 700, fontSize: '0.95rem', color: accentColor }}>
              Tuần này: {formatWeek(currentWeekStart)}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'center' }}>
            {/* links */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 800, fontSize: '1.6rem', color: 'var(--text-primary)', lineHeight: 1 }}>
                {currentWeekData.totalLinks}
              </span>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', lineHeight: 1.2 }}>link</div>
                <DeltaBadge value={deltaLinks} />
              </div>
            </div>
            <div style={{ width: 1, height: 36, background: 'rgba(0,0,0,.1)' }} />
            {/* points */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 800, fontSize: '1.6rem', color: 'var(--text-primary)', lineHeight: 1 }}>
                {currentWeekData.totalPoints.toFixed(0)}
              </span>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', lineHeight: 1.2 }}>điểm</div>
                <DeltaBadge value={deltaPoints} />
              </div>
            </div>
            {totalProjects > 0 && (
              <>
                <div style={{ width: 1, height: 36, background: 'rgba(0,0,0,.1)' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {projectsOnTrack === totalProjects
                    ? <CheckCircle2 size={16} color="#16a34a" />
                    : <AlertTriangle size={16} color="#ea580c" />}
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                    {projectsOnTrack}/{totalProjects} dự án đúng tiến độ
                  </span>
                </div>
              </>
            )}
            {!prevWeekReport && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                (chưa có báo cáo tuần trước để so sánh)
              </span>
            )}
          </div>
        </div>
        {canEdit && !hasCurrentReport && (
          <button onClick={onCreateNew}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: 'var(--radius-md)',
              background: `linear-gradient(135deg,${accentColor},${accentColor}cc)`, color: '#fff', border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: '0.88rem', boxShadow: `0 4px 14px ${accentColor}44`, whiteSpace: 'nowrap',
              transition: 'transform .15s,box-shadow .15s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 8px 20px ${accentColor}55`; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = ''; (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 4px 14px ${accentColor}44`; }}>
            <Sparkles size={15} /> Tạo báo cáo tuần này <ArrowRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────── TrendChart ── */

function TrendChart({ last8Weeks, weekDataMap, maxLinks, currentWeekStart, hoveredBar, setHoveredBar }: {
  last8Weeks: string[];
  weekDataMap: Map<string, { links: number; points: number }>;
  maxLinks: number;
  currentWeekStart: string;
  hoveredBar: string | null;
  setHoveredBar: (v: string | null) => void;
}) {
  const maxBarHeight = 80;

  return (
    <div className="card" style={{ padding: '20px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <div style={{ padding: '6px', borderRadius: 'var(--radius-sm)', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
          <TrendingUp size={14} color="#fff" />
        </div>
        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Trend 8 tuần gần nhất</span>
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
          Hover để xem chi tiết
        </span>
      </div>

      <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        {last8Weeks.map(ws => {
          const data  = weekDataMap.get(ws) ?? { links: 0, points: 0 };
          const isCur = ws === currentWeekStart;
          const isHov = hoveredBar === ws;
          const barH  = maxLinks > 0 ? Math.max(4, Math.round((data.links / maxLinks) * maxBarHeight)) : 4;
          const hasData = data.links > 0;

          return (
            <div key={ws} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', position: 'relative' }}
              onMouseEnter={() => setHoveredBar(ws)} onMouseLeave={() => setHoveredBar(null)}>

              {/* tooltip */}
              {isHov && (
                <div style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                  background: 'rgba(15,23,42,.92)', color: '#fff', borderRadius: 'var(--radius-md)',
                  padding: '8px 12px', fontSize: '0.75rem', whiteSpace: 'nowrap', zIndex: 20,
                  boxShadow: '0 8px 24px rgba(0,0,0,.3)', marginBottom: '6px', lineHeight: 1.6 }}>
                  <div style={{ fontWeight: 700, marginBottom: '2px' }}>{formatWeek(ws)}</div>
                  <div>🔗 {data.links} link</div>
                  <div>⭐ {data.points.toFixed(0)} điểm</div>
                  {isCur && <div style={{ color: '#a5b4fc', fontSize: '0.7rem', marginTop: '2px' }}>← Tuần này</div>}
                </div>
              )}

              {/* bar */}
              <div style={{
                width: '100%', height: `${maxBarHeight}px`,
                display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
              }}>
                <div style={{
                  width: '100%', height: `${barH}px`,
                  borderRadius: '6px 6px 2px 2px',
                  background: isCur
                    ? 'linear-gradient(180deg,#6366f1,#8b5cf6)'
                    : hasData
                      ? (isHov ? 'linear-gradient(180deg,#60a5fa,#3b82f6)' : 'linear-gradient(180deg,#93c5fd,#bfdbfe)')
                      : 'var(--border-light)',
                  transition: 'height .3s cubic-bezier(.34,1.56,.64,1), background .2s',
                  boxShadow: isCur ? '0 4px 12px rgba(99,102,241,.4)' : isHov ? '0 2px 8px rgba(59,130,246,.3)' : 'none',
                  cursor: 'pointer',
                }} />
              </div>

              {/* week label */}
              <div style={{ fontSize: '0.65rem', color: isCur ? 'var(--primary-600)' : 'var(--text-tertiary)',
                fontWeight: isCur ? 700 : 400, textAlign: 'center', lineHeight: 1.2 }}>
                {formatWeekShort(ws)}
                {isCur && <div style={{ color: 'var(--primary-500)', fontSize: '0.6rem' }}>●</div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* legend */}
      <div style={{ display: 'flex', gap: '16px', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border-light)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
          <div style={{ width: 12, height: 12, borderRadius: 3, background: 'linear-gradient(180deg,#6366f1,#8b5cf6)' }} />
          Tuần hiện tại
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
          <div style={{ width: 12, height: 12, borderRadius: 3, background: 'linear-gradient(180deg,#93c5fd,#bfdbfe)' }} />
          Tuần khác
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
          <div style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--border-light)' }} />
          Chưa có báo cáo
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────── ReportCard ── */

function ReportCard({ report, isExpanded, linkDelta, canEdit, onToggle, onView, onEdit, onDelete, onCopy, onExportHtml }: {
  report: WeeklyReport; isExpanded: boolean; linkDelta: number | null;
  canEdit: boolean; onToggle: () => void; onView: () => void; onEdit: () => void; onDelete: () => void;
  onCopy: () => void; onExportHtml: () => void;
}) {
  const overallProgress = report.projectProgress.length > 0
    ? Math.round(report.projectProgress.reduce((s, p) => s + p.progress, 0) / report.projectProgress.length)
    : null;

  const progressColor = overallProgress == null ? '#94a3b8'
    : overallProgress >= 80 ? '#16a34a'
    : overallProgress >= 50 ? '#2563eb'
    : '#ea580c';

  return (
    <div className="card" style={{ overflow: 'hidden', transition: 'box-shadow .2s',
      boxShadow: isExpanded ? '0 8px 32px rgba(99,102,241,.12)' : undefined }}>
      <button onClick={onToggle}
        style={{ width: '100%', padding: '16px 20px', background: 'transparent', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left' }}>

        {/* calendar icon */}
        <div style={{ width: 42, height: 42, borderRadius: 'var(--radius-md)', flexShrink: 0,
          background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(99,102,241,.3)' }}>
          <Calendar size={18} color="#fff" />
        </div>

        {/* title + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {formatWeek(report.weekStart)}
            {report.locked && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.68rem', fontWeight: 600,
                color: '#64748b', background: '#f1f5f9', borderRadius: '999px', padding: '2px 6px' }}>
                <Lock size={9} /> Đã chốt
              </span>
            )}
            {linkDelta !== null && <DeltaBadge value={linkDelta} />}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '4px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
              🔗 {report.totalLinks} link
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
              ⭐ {report.totalPoints.toFixed(0)} điểm
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
              📦 {report.projectProgress.length} dự án
            </span>
            {overallProgress !== null && (
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: progressColor }}>
                {overallProgress}% tiến độ TB
              </span>
            )}
          </div>
        </div>

        {/* actions */}
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          {canEdit && !report.locked && (
            <>
              <button className="btn btn-icon btn-ghost" onClick={onEdit} title="Chỉnh sửa"><Edit3 size={14} /></button>
              <button className="btn btn-icon btn-ghost" onClick={onDelete} style={{ color: 'var(--danger)' }} title="Xóa"><Trash2 size={14} /></button>
            </>
          )}
          <button className="btn btn-ghost" onClick={onView}
            style={{ fontSize: '12px', padding: '4px 10px', color: 'var(--primary-600)', fontWeight: 600 }}
            title="Xem báo cáo đẹp">
            👁 Xem
          </button>
          <button className="btn btn-icon btn-ghost" onClick={onCopy} title="Copy text"><Download size={14} /></button>
          <button className="btn btn-icon btn-ghost" onClick={onExportHtml} style={{ color: 'var(--primary-600)' }} title="Export HTML"><Globe size={14} /></button>
        </div>
        {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>

      {isExpanded && (
        <div style={{ padding: '0 20px 20px', borderTop: '1px solid var(--border-light)', animationName: 'fadeInDown', animationDuration: '.2s', animationFillMode: 'both' }}>
          {report.summary && (
            <div style={{ padding: '12px 14px', margin: '12px 0', background: 'linear-gradient(135deg,#f8fafc,#f1f5f9)',
              borderRadius: 'var(--radius-md)', fontSize: '0.88rem', borderLeft: '3px solid var(--primary-400)' }}>
              <strong>📝 Tổng quan:</strong> {report.summary}
            </div>
          )}

          {/* project progress */}
          {report.projectProgress.length > 0 && (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Target size={14} color="var(--primary-500)" /> Tiến độ dự án
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {report.projectProgress.map(p => {
                  const c = p.progress >= 80 ? '#16a34a' : p.progress >= 40 ? '#2563eb' : '#ea580c';
                  return (
                    <div key={p.projectId} style={{ display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)',
                      borderLeft: `3px solid ${c}` }}>
                      <span style={{ fontWeight: 600, fontSize: '0.85rem', flex: 1 }}>{p.projectName}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '150px' }}>
                        <div style={{ flex: 1, height: '6px', borderRadius: '999px', background: 'var(--border-light)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${p.progress}%`, borderRadius: '999px',
                            background: `linear-gradient(90deg,${c}99,${c})`, transition: 'width .5s ease' }} />
                        </div>
                        <span style={{ fontSize: '0.78rem', fontWeight: 800, color: c, minWidth: 32 }}>{p.progress}%</span>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', minWidth: 50 }}>
                        {p.tasksCompleted}/{p.tasksTotal}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* task breakdown by team */}
          {report.taskBreakdownByTeam && report.taskBreakdownByTeam.length > 0 && (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Users size={14} color="var(--primary-500)" /> Chi tiết đầu việc theo nhóm
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
                {report.taskBreakdownByTeam.map(t => (
                  <div key={t.team} style={{ padding: '10px 12px', background: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-md)', borderLeft: `3px solid ${t.color}` }}>
                    <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: '6px', color: t.color }}>
                      {t.team}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '6px' }}>
                      {t.items.reduce((s, i) => s + i.links, 0)} link · {t.items.reduce((s, i) => s + i.points, 0).toFixed(0)}đ
                    </div>
                    {t.items.map((item, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', padding: '2px 0',
                        color: 'var(--text-secondary)', borderBottom: i < t.items.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                        <span>{item.label}</span>
                        <span style={{ fontWeight: 600 }}>{item.links}L · {item.points.toFixed(0)}đ</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* insights + bottlenecks + assessment */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {report.insights && (
              <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg,#eff6ff,#dbeafe)',
                border: '1px solid #bfdbfe', fontSize: '0.85rem', color: '#1e40af', whiteSpace: 'pre-wrap' }}>
                💡 <strong>Nhận xét từ số liệu:</strong> {report.insights}
              </div>
            )}
            {report.bottlenecks && (
              <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg,#fef2f2,#fee2e2)',
                border: '1px solid #fecaca', fontSize: '0.85rem', color: '#991b1b', whiteSpace: 'pre-wrap' }}>
                🚧 <strong>Điểm nghẽn:</strong> {report.bottlenecks}
              </div>
            )}
            {report.managerAssessment && (
              <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)',
                border: '1px solid #bbf7d0', fontSize: '0.85rem', color: '#14532d', whiteSpace: 'pre-wrap' }}>
                👤 <strong>Manager đánh giá:</strong> {report.managerAssessment}
              </div>
            )}
            {report.issues && (
              <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg,#fff7ed,#fed7aa)',
                border: '1px solid #fdba74', fontSize: '0.85rem', color: '#9a3412' }}>
                ⚠️ <strong>Vấn đề:</strong> {report.issues}
              </div>
            )}
            {report.nextWeekPlan && (
              <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg,#faf5ff,#ede9fe)',
                border: '1px solid #c4b5fd', fontSize: '0.85rem', color: '#5b21b6' }}>
                📋 <strong>Kế hoạch tuần tới:</strong> {report.nextWeekPlan}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────── ReportFormModal ── */

type TabKey = 'data' | 'review' | 'finalize';
const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'data',     label: 'Số liệu',  icon: '📊' },
  { key: 'review',   label: 'Nhận xét', icon: '💬' },
  { key: 'finalize', label: 'Chốt',     icon: '✅' },
];

function ReportFormModal({ item, currentWeekStart, onClose, onSave }: {
  item: WeeklyReport | null;
  currentWeekStart: string;
  onClose: () => void;
  onSave: (data: Partial<WeeklyReport>) => void;
}) {
  const { projects, currentUser, projectTasks, submissions } = useAppStore();
  const activeProjects = projects.filter(p => p.status === 'Đang chạy');

  const [tab, setTab] = useState<TabKey>('data');
  const [aiLoading, setAiLoading] = useState(false);

  /* ── recalc helper ── */
  const recalcFromWeek = (weekStart: string) => {
    const ws = new Date(weekStart);
    const we = new Date(ws); we.setDate(ws.getDate() + 6); we.setHours(23, 59, 59);
    const inRange = submissions.filter(s => {
      const t = new Date(s.submittedAt).getTime();
      return !isNaN(t) && t >= ws.getTime() && t <= we.getTime();
    });
    const totalLinks  = inRange.reduce((sum, s) => sum + s.links.length, 0);
    const totalPoints = inRange.reduce((sum, s) => sum + s.totalPoints, 0);

    const pp: WeeklyReportProject[] = activeProjects.map(p => {
      const tasks   = projectTasks.filter(t => t.projectId === p.id);
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
          taskName: t.name, targetLinks: t.targetLinks, completedLinks: completed,
          progress: Math.min(100, Math.round((completed / Math.max(t.targetLinks, 1)) * 100)),
        };
      });
      const tasksTotal     = breakdown.reduce((s, x) => s + x.targetLinks, 0);
      const tasksCompleted = breakdown.reduce((s, x) => s + x.completedLinks, 0);
      const progress       = breakdown.length > 0
        ? Math.round(breakdown.reduce((s, x) => s + x.progress, 0) / breakdown.length) : 0;
      return { projectId: p.id, projectName: p.name, progress, tasksCompleted, tasksTotal, notes: '', taskBreakdown: breakdown };
    });

    /* team breakdown */
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

    /* auto insights */
    const employees = new Set(inRange.map(s => s.employeeName));
    const empPoints = new Map<string, number>();
    inRange.forEach(s => empPoints.set(s.employeeName, (empPoints.get(s.employeeName) || 0) + s.totalPoints));
    const topEmp   = Array.from(empPoints.entries()).sort((a, b) => b[1] - a[1]);
    const avgPts   = employees.size > 0 ? totalPoints / employees.size : 0;
    const insights = [
      `Tổng: ${totalLinks} link, ${totalPoints.toFixed(0)}đ từ ${employees.size} nhân viên.`,
      `Trung bình: ${avgPts.toFixed(1)}đ/người.`,
      topEmp.length > 0 ? `Top: ${topEmp.slice(0, 3).map(([n, p]) => `${n} (${p.toFixed(0)}đ)`).join(', ')}.` : '',
      taskBreakdownByTeam.map(t => `${t.team}: ${t.items.reduce((s, i) => s + i.links, 0)} link`).join(' | '),
    ].filter(Boolean).join('\n');

    /* auto bottlenecks */
    const bottleneckItems: string[] = [];
    pp.forEach(p => {
      p.taskBreakdown?.forEach(t => {
        if (t.progress < 30 && t.targetLinks > 0) bottleneckItems.push(`${p.projectName} › ${t.taskName}: chỉ ${t.progress}%`);
      });
    });
    if (totalLinks === 0) bottleneckItems.push('Không có link nào được submit trong tuần.');
    const lowEmps = topEmp.filter(([, p]) => p < avgPts * 0.5);
    if (lowEmps.length > 0) bottleneckItems.push(`Sản lượng thấp: ${lowEmps.map(([n]) => n).join(', ')}`);
    const bottlenecks = bottleneckItems.join('\n');

    /* auto summary */
    const summaryParts = [`Tuần ${formatWeek(weekStart)}: ${totalLinks} link, ${totalPoints.toFixed(0)} điểm.`];
    if (taskBreakdownByTeam.length > 0) {
      const top = taskBreakdownByTeam.sort((a, b) => b.items.reduce((s, i) => s + i.links, 0) - a.items.reduce((s, i) => s + i.links, 0))[0];
      summaryParts.push(`${top.team} dẫn đầu.`);
    }
    if (topEmp.length > 0) summaryParts.push(`Top: ${topEmp[0][0]} (${topEmp[0][1].toFixed(0)}đ).`);
    const autoSummary = summaryParts.join(' ');

    /* auto next week plan */
    const slowTasks = bottleneckItems.filter(b => b.includes('›'));
    const autoNextPlan = slowTasks.length > 0
      ? `Ưu tiên đẩy tiến độ: ${slowTasks.slice(0, 2).map(b => b.split('›')[1]?.trim().split(':')[0] || b).join(', ')}. Duy trì nhịp độ các task đang tốt.`
      : 'Duy trì nhịp độ hiện tại. Kiểm tra chất lượng nội dung đầu tuần.';

    return { totalLinks, totalPoints, totalTasksCompleted: inRange.length, projectProgress: pp, taskBreakdownByTeam, insights, bottlenecks, autoSummary, autoNextPlan };
  };

  /* ── initial state: auto-fill when opening ── */
  const [form, setForm] = useState<Partial<WeeklyReport>>(() => {
    if (item) return item;
    const ws = currentWeekStart;
    const auto = recalcFromWeek(ws);
    return {
      weekStart: ws,
      createdBy: currentUser?.name || '',
      projectProgress: auto.projectProgress,
      totalTasksCompleted: auto.totalTasksCompleted,
      totalLinks: auto.totalLinks,
      totalPoints: auto.totalPoints,
      summary: auto.autoSummary,
      aiAssessment: '',
      managerAssessment: '',
      nextWeekPlan: auto.autoNextPlan,
      issues: '',
      insights: auto.insights,
      bottlenecks: auto.bottlenecks,
      taskBreakdownByTeam: auto.taskBreakdownByTeam,
      locked: false,
    };
  });

  const handleWeekChange = (weekStart: string) => {
    const auto = recalcFromWeek(weekStart);
    setForm(f => ({ ...f, weekStart, ...auto, summary: auto.autoSummary, nextWeekPlan: auto.autoNextPlan }));
  };

  const handleAutoFill = () => {
    if (!form.weekStart) return;
    const auto = recalcFromWeek(form.weekStart);
    setForm(f => ({ ...f, ...auto, summary: auto.autoSummary, nextWeekPlan: auto.autoNextPlan }));
    toast.success('Đã làm mới toàn bộ số liệu!');
  };

  const handleAIGenerate = () => {
    setAiLoading(true);
    setTimeout(() => {
      const progresses = (form.projectProgress || []).map(p => `${p.projectName}: ${p.progress}%`).join(', ');
      const assessment =
        `Tuần này đạt ${form.totalLinks || 0} link (${form.totalPoints?.toFixed(0) || 0} điểm). ` +
        `Tiến độ dự án: ${progresses || 'chưa cập nhật'}. ` +
        (form.totalLinks && form.totalLinks > 500 ? 'Sản lượng tốt, duy trì nhịp độ. ' : 'Cần tăng tốc sản lượng. ') +
        'Đề xuất: Ưu tiên các task trễ hạn, phân bổ lại nhân sự nếu cần.';
      setForm(f => ({ ...f, aiAssessment: assessment }));
      setAiLoading(false);
      toast.success('AI đã gợi ý đánh giá!');
    }, 900);
  };

  const updateProjectProgress = (idx: number, field: keyof WeeklyReportProject, value: string | number) => {
    const pp = [...(form.projectProgress || [])];
    pp[idx] = { ...pp[idx], [field]: value };
    setForm(f => ({ ...f, projectProgress: pp }));
  };

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSave(form); };

  /* progress indicator */
  const tabIdx = TABS.findIndex(t => t.key === tab);
  const pctDone = Math.round(((tabIdx + 1) / TABS.length) * 100);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}
        style={{ maxWidth: '720px', maxHeight: '92vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', borderRadius: 'var(--radius-xl)' }}>

        {/* header */}
        <div style={{ padding: '20px 24px 0', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <h3 style={{ fontWeight: 800, fontSize: '1.05rem', color: '#fff', margin: 0 }}>
                {item ? '✏️ Chỉnh sửa báo cáo' : '✨ Tạo báo cáo tuần'}
              </h3>
              <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,.75)', marginTop: '2px' }}>
                {formatWeek(form.weekStart || currentWeekStart)}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 'var(--radius-md)',
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
              <X size={16} />
            </button>
          </div>

          {/* tab bar */}
          <div style={{ display: 'flex', gap: '0' }}>
            {TABS.map((t, i) => {
              const isActive = t.key === tab;
              const isDone   = i < tabIdx;
              return (
                <button key={t.key} onClick={() => setTab(t.key)}
                  style={{ flex: 1, padding: '10px 8px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: isActive ? 700 : 500,
                    background: isActive ? '#fff' : 'transparent',
                    color: isActive ? '#6366f1' : isDone ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.6)',
                    borderBottom: 'none', transition: 'background .2s, color .2s',
                    borderRadius: i === 0 ? '8px 0 0 0' : i === TABS.length - 1 ? '0 8px 0 0' : '0',
                  }}>
                  <span>{t.icon}</span>
                  <span>{t.label}</span>
                  {isDone && <span style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,.2)', borderRadius: '999px', padding: '0 5px' }}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* progress bar */}
        <div style={{ height: 3, background: '#e2e8f0' }}>
          <div style={{ height: '100%', width: `${pctDone}%`, background: 'linear-gradient(90deg,#6366f1,#8b5cf6)', transition: 'width .3s' }} />
        </div>

        <form onSubmit={handleSubmit} style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px 24px', flex: 1 }}>

            {/* ── TAB 1: Số liệu ── */}
            {tab === 'data' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* week + refresh */}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ flex: 1, margin: 0 }}>
                    <label className="form-label">📅 Tuần bắt đầu (Thứ 2)</label>
                    <input className="form-input" type="date" value={form.weekStart || ''}
                      onChange={e => handleWeekChange(e.target.value)} />
                  </div>
                  <button type="button" className="btn btn-secondary" onClick={handleAutoFill}
                    style={{ height: '38px', background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: '1px solid #86efac', color: '#16a34a', fontWeight: 600 }}>
                    <Zap size={13} /> Làm mới số liệu
                  </button>
                </div>

                {/* stats cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  {[
                    { label: 'Link', icon: '🔗', field: 'totalLinks' as const,  color: '#6366f1', value: form.totalLinks ?? 0 },
                    { label: 'Điểm', icon: '⭐', field: 'totalPoints' as const, color: '#f59e0b', value: Math.round((form.totalPoints ?? 0) * 10) / 10 },
                    { label: 'Submit', icon: '📥', field: 'totalTasksCompleted' as const, color: '#10b981', value: form.totalTasksCompleted ?? 0 },
                  ].map(({ label, icon, field, color, value }) => (
                    <div key={field} style={{ padding: '14px', borderRadius: 'var(--radius-lg)',
                      background: `linear-gradient(135deg,${color}12,${color}06)`,
                      border: `1px solid ${color}22`, textAlign: 'center' }}>
                      <div style={{ fontSize: '1.2rem', marginBottom: '4px' }}>{icon}</div>
                      <input type="number" min="0" step={field === 'totalPoints' ? '0.1' : '1'} value={value}
                        onChange={e => setForm(f => ({ ...f, [field]: parseFloat(e.target.value) || 0 }))}
                        style={{ width: '80px', textAlign: 'center', fontWeight: 800, fontSize: '1.4rem',
                          color: color, border: 'none', background: 'transparent', padding: '0',
                          margin: '0 auto', display: 'block', outline: 'none' }} />
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>{label}</div>
                    </div>
                  ))}
                </div>

                {/* project progress */}
                <div>
                  <label className="form-label" style={{ fontWeight: 700 }}>📦 Tiến độ dự án</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {(form.projectProgress || []).map((p, idx) => (
                      <div key={idx} style={{ padding: '10px 12px', background: 'var(--bg-secondary)',
                        borderRadius: 'var(--radius-md)', borderLeft: `3px solid ${p.progress >= 80 ? '#16a34a' : p.progress >= 40 ? '#6366f1' : '#ea580c'}` }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600, minWidth: '120px' }}>{p.projectName}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <input className="form-input" type="number" min="0" max="100" value={p.progress}
                              onChange={e => updateProjectProgress(idx, 'progress', parseInt(e.target.value) || 0)}
                              style={{ width: '56px', fontSize: '0.82rem', padding: '4px 6px' }} />
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>%</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <input className="form-input" type="number" min="0" value={p.tasksCompleted}
                              onChange={e => updateProjectProgress(idx, 'tasksCompleted', parseInt(e.target.value) || 0)}
                              style={{ width: '56px', fontSize: '0.82rem', padding: '4px 6px' }} />
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>/</span>
                            <input className="form-input" type="number" min="0" value={p.tasksTotal}
                              onChange={e => updateProjectProgress(idx, 'tasksTotal', parseInt(e.target.value) || 0)}
                              style={{ width: '56px', fontSize: '0.82rem', padding: '4px 6px' }} />
                          </div>
                          <input className="form-input" value={p.notes || ''}
                            onChange={e => updateProjectProgress(idx, 'notes', e.target.value)}
                            style={{ flex: 1, minWidth: '100px', fontSize: '0.82rem', padding: '4px 6px' }} placeholder="Ghi chú..." />
                        </div>
                        {/* mini progress bar in form */}
                        <div style={{ marginTop: '6px', height: '4px', borderRadius: '999px', background: 'var(--border-light)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${p.progress}%`, borderRadius: '999px',
                            background: p.progress >= 80 ? '#16a34a' : p.progress >= 40 ? '#6366f1' : '#ea580c',
                            transition: 'width .3s' }} />
                        </div>
                        {/* task breakdown */}
                        {p.taskBreakdown && p.taskBreakdown.length > 0 && (
                          <div style={{ marginTop: '8px', paddingLeft: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {p.taskBreakdown.map((t, ti) => {
                              const updProg = t.targetLinks > 0 ? Math.min(100, Math.round((t.completedLinks / t.targetLinks) * 100)) : 0;
                              return (
                                <div key={ti} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem' }}>
                                  <span style={{ flex: 1, color: 'var(--text-secondary)' }}>↳ {t.taskName}</span>
                                  <input type="number" min="0" className="form-input" value={t.completedLinks}
                                    onChange={e => {
                                      const pp = [...(form.projectProgress || [])];
                                      const bd = [...(pp[idx].taskBreakdown || [])];
                                      const newC = parseInt(e.target.value) || 0;
                                      bd[ti] = { ...bd[ti], completedLinks: newC, progress: bd[ti].targetLinks > 0 ? Math.min(100, Math.round((newC / bd[ti].targetLinks) * 100)) : 0 };
                                      pp[idx] = { ...pp[idx], taskBreakdown: bd, progress: Math.round(bd.reduce((s, x) => s + x.progress, 0) / bd.length), tasksCompleted: bd.reduce((s, x) => s + x.completedLinks, 0), tasksTotal: bd.reduce((s, x) => s + x.targetLinks, 0) };
                                      setForm(f => ({ ...f, projectProgress: pp }));
                                    }}
                                    style={{ width: '46px', fontSize: '0.74rem', padding: '2px 4px', textAlign: 'center' }} />
                                  <span style={{ color: 'var(--text-tertiary)' }}>/</span>
                                  <input type="number" min="0" className="form-input" value={t.targetLinks}
                                    onChange={e => {
                                      const pp = [...(form.projectProgress || [])];
                                      const bd = [...(pp[idx].taskBreakdown || [])];
                                      const newT = parseInt(e.target.value) || 0;
                                      bd[ti] = { ...bd[ti], targetLinks: newT, progress: newT > 0 ? Math.min(100, Math.round((bd[ti].completedLinks / newT) * 100)) : 0 };
                                      pp[idx] = { ...pp[idx], taskBreakdown: bd, progress: Math.round(bd.reduce((s, x) => s + x.progress, 0) / bd.length), tasksCompleted: bd.reduce((s, x) => s + x.completedLinks, 0), tasksTotal: bd.reduce((s, x) => s + x.targetLinks, 0) };
                                      setForm(f => ({ ...f, projectProgress: pp }));
                                    }}
                                    style={{ width: '46px', fontSize: '0.74rem', padding: '2px 4px', textAlign: 'center' }} />
                                  <span style={{ fontWeight: 700, minWidth: 36, textAlign: 'right',
                                    color: updProg >= 100 ? '#16a34a' : updProg >= 50 ? '#6366f1' : '#ea580c' }}>
                                    {updProg}%
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB 2: Nhận xét ── */}
            {tab === 'review' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">📝 Tổng quan tuần
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 400, marginLeft: '6px' }}>
                      (tự động gợi ý — sửa lại nếu cần)
                    </span>
                  </label>
                  <textarea className="form-textarea" value={form.summary || ''} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
                    rows={3} placeholder="Tóm tắt tình hình chung..."
                    style={{ background: 'linear-gradient(135deg,#f8faff,#f0f4ff)', borderColor: '#c7d2fe' }} />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>💡 Nhận xét từ số liệu
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 400, marginLeft: '6px' }}>(tự động tạo)</span>
                    </span>
                  </label>
                  <textarea className="form-textarea" value={form.insights || ''} onChange={e => setForm(f => ({ ...f, insights: e.target.value }))}
                    rows={3} style={{ background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', borderColor: '#bfdbfe' }} />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">🚧 Điểm nghẽn
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 400, marginLeft: '6px' }}>(tự động phát hiện)</span>
                  </label>
                  <textarea className="form-textarea" value={form.bottlenecks || ''} onChange={e => setForm(f => ({ ...f, bottlenecks: e.target.value }))}
                    rows={2} style={{ background: 'linear-gradient(135deg,#fef2f2,#fee2e2)', borderColor: '#fecaca' }} />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">⚠️ Vấn đề cần lưu ý</label>
                  <textarea className="form-textarea" value={form.issues || ''} onChange={e => setForm(f => ({ ...f, issues: e.target.value }))}
                    rows={2} style={{ background: 'linear-gradient(135deg,#fff7ed,#fed7aa)', borderColor: '#fdba74' }} />
                </div>
              </div>
            )}

            {/* ── TAB 3: Chốt ── */}
            {tab === 'finalize' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="form-label" style={{ margin: 0 }}>🤖 AI đánh giá</label>
                    <button type="button" className="btn btn-secondary" onClick={handleAIGenerate} disabled={aiLoading}
                      style={{ fontSize: '0.78rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px',
                        background: 'linear-gradient(135deg,#faf5ff,#ede9fe)', border: '1px solid #c4b5fd', color: '#7c3aed' }}>
                      <Sparkles size={12} /> {aiLoading ? 'Đang tạo...' : 'AI gợi ý'}
                    </button>
                  </div>
                  <textarea className="form-textarea" value={form.aiAssessment || ''} onChange={e => setForm(f => ({ ...f, aiAssessment: e.target.value }))}
                    rows={3} placeholder="Bấm 'AI gợi ý' hoặc nhập thủ công..."
                    style={{ background: 'linear-gradient(135deg,#faf5ff,#ede9fe)', borderColor: '#c4b5fd' }} />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">👤 Manager đánh giá (chỉnh sửa tự do)</label>
                  <textarea className="form-textarea" value={form.managerAssessment || ''} onChange={e => setForm(f => ({ ...f, managerAssessment: e.target.value }))}
                    rows={3} placeholder="Nhận xét, đánh giá của bạn..."
                    style={{ background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', borderColor: '#bbf7d0' }} />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">📋 Kế hoạch tuần tới
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 400, marginLeft: '6px' }}>(tự động gợi ý)</span>
                  </label>
                  <textarea className="form-textarea" value={form.nextWeekPlan || ''} onChange={e => setForm(f => ({ ...f, nextWeekPlan: e.target.value }))}
                    rows={3} style={{ background: 'linear-gradient(135deg,#f8faff,#f0f4ff)', borderColor: '#c7d2fe' }} />
                </div>

                {/* lock toggle */}
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.88rem', cursor: 'pointer',
                  padding: '12px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)',
                  background: form.locked ? 'linear-gradient(135deg,#fef2f2,#fee2e2)' : 'var(--bg-secondary)' }}>
                  <input type="checkbox" checked={form.locked || false} onChange={e => setForm(f => ({ ...f, locked: e.target.checked }))}
                    style={{ accentColor: form.locked ? '#dc2626' : 'var(--primary-500)', width: 16, height: 16 }} />
                  {form.locked ? <Lock size={15} color="#dc2626" /> : <Unlock size={15} color="var(--text-tertiary)" />}
                  <span style={{ fontWeight: 600, color: form.locked ? '#dc2626' : 'var(--text-primary)' }}>
                    {form.locked ? 'Đã chốt — không thể sửa sau khi lưu' : 'Chốt báo cáo (không sửa được sau khi chốt)'}
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* footer */}
          <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              {tabIdx > 0 && (
                <button type="button" className="btn btn-secondary" onClick={() => setTab(TABS[tabIdx - 1].key)}>
                  ← {TABS[tabIdx - 1].label}
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
              {tabIdx < TABS.length - 1 ? (
                <button type="button" className="btn btn-primary" onClick={() => setTab(TABS[tabIdx + 1].key)}
                  style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none' }}>
                  {TABS[tabIdx + 1].label} →
                </button>
              ) : (
                <button type="submit" className="btn btn-primary"
                  style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)', border: 'none', boxShadow: '0 4px 12px rgba(22,163,74,.3)' }}>
                  <Save size={14} /> {item ? 'Cập nhật' : 'Lưu báo cáo'}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
