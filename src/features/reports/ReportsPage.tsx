import { useState, useMemo } from 'react';
import { useAppStore } from '@/shared/store/appStore';
import { flattenDailyTasks } from '@/shared/selectors/dailyTasks';
import {
  BarChart3, Calendar, FileText, Plus, Edit3, Trash2, X, Save,
  Lock, Unlock, Sparkles, ChevronDown, ChevronUp, Download, Globe,
  TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2,
  ArrowRight, Zap, Target, Users, Share2, Star,
} from 'lucide-react';
import type { WeeklyReport, WeeklyReportProject } from '@/shared/types';
import { exportCsv, makeId } from '@/shared/utils/helpers';
import { exportHtmlFile, buildReportHtml } from '@/shared/utils/exportHtml';
import toast from 'react-hot-toast';
import WeeklyReportViewer from './WeeklyReportViewer';
import { generateWeeklyReport, type ReportContext } from '@/shared/services/aiService';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
        { label: 'Tổng điểm',   value: Math.round(report.totalPoints) },
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

  const handleShareLink = (report: WeeklyReport) => {
    const url = `${window.location.origin}/share/weekly-report?id=${report.id}`;
    navigator.clipboard.writeText(url);
    toast.success('Đã sao chép link báo cáo công khai! Ai có link đều xem được.');
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
                onShare={() => handleShareLink(report)}
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

function ReportCard({ report, isExpanded, linkDelta, canEdit, onToggle, onView, onEdit, onDelete, onCopy, onExportHtml, onShare }: {
  report: WeeklyReport; isExpanded: boolean; linkDelta: number | null;
  canEdit: boolean; onToggle: () => void; onView: () => void; onEdit: () => void; onDelete: () => void;
  onCopy: () => void; onExportHtml: () => void; onShare: () => void;
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
              ⭐ {Math.round(report.totalPoints)} điểm
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
          <button className="btn btn-icon btn-ghost" onClick={onShare} title="Copy link chia sẻ công khai"
            style={{ color: '#1d4ed8' }}><Share2 size={14} /></button>
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
                border: '1px solid #bfdbfe', fontSize: '0.85rem', color: '#1e40af' }}>
                💡 <strong>Nhận xét từ số liệu:</strong> 
                <div style={{ marginTop: '4px' }}><div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{report.insights}</ReactMarkdown></div></div>
              </div>
            )}
            {report.bottlenecks && (
              <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg,#fef2f2,#fee2e2)',
                border: '1px solid #fecaca', fontSize: '0.85rem', color: '#991b1b' }}>
                🚧 <strong>Điểm nghẽn:</strong>
                <div style={{ marginTop: '4px' }}><div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{report.bottlenecks}</ReactMarkdown></div></div>
              </div>
            )}
            {report.managerAssessment && (
              <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)',
                border: '1px solid #bbf7d0', fontSize: '0.85rem', color: '#14532d' }}>
                👤 <strong>Manager đánh giá:</strong>
                <div style={{ marginTop: '4px' }}><div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{report.managerAssessment}</ReactMarkdown></div></div>
              </div>
            )}
            {report.issues && (
              <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg,#fff7ed,#fed7aa)',
                border: '1px solid #fdba74', fontSize: '0.85rem', color: '#9a3412' }}>
                ⚠️ <strong>Vấn đề:</strong>
                <div style={{ marginTop: '4px' }}><div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{report.issues}</ReactMarkdown></div></div>
              </div>
            )}
            {report.nextWeekPlan && (
              <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg,#faf5ff,#ede9fe)',
                border: '1px solid #c4b5fd', fontSize: '0.85rem', color: '#5b21b6' }}>
                📋 <strong>Kế hoạch tuần tới:</strong>
                <div style={{ marginTop: '4px' }}><div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{report.nextWeekPlan}</ReactMarkdown></div></div>
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
const SECTIONS: { key: TabKey; label: string; icon: string; desc: string }[] = [
  { key: 'data',     label: 'Số liệu',  icon: '📊', desc: 'KPI, link, điểm, dự án' },
  { key: 'review',   label: 'Nhận xét', icon: '💬', desc: 'Tổng quan, điểm nghẽn' },
  { key: 'finalize', label: 'AI & Chốt', icon: '✅', desc: 'AI đánh giá, lưu báo cáo' },
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
  const [saving, setSaving] = useState(false);
  const [tempAdditionalContext, setTempAdditionalContext] = useState('');
  const [tempCustomerComments, setTempCustomerComments] = useState('');

  /* ── project selector state ── */
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(
    () => item
      ? new Set(item.projectProgress.map(p => p.projectId))
      : new Set(projects.filter(p => p.status === 'Đang chạy').map(p => p.id))
  );
  const [priorityProjectIds, setPriorityProjectIds] = useState<Set<string>>(
    () => item
      ? new Set(item.projectProgress.filter(p => p.isPriority).map(p => p.projectId))
      : new Set<string>()
  );

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

    const filteredProjects = activeProjects.filter(p => selectedProjectIds.size === 0 || selectedProjectIds.has(p.id));
    const pp: WeeklyReportProject[] = filteredProjects.map(p => {
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
        const mode = t.trackingMode || 'link';
        let completed = 0; let target = 1; let progress = 0;
        if (mode === 'quantity' && t.targetQuantity && t.targetQuantity > 0) {
          completed = matched.reduce((sum, s) => sum + (s.quantity ?? 0), 0);
          target = t.targetQuantity;
          progress = Math.min(100, Math.round((completed / target) * 100));
        } else {
          completed = matched.reduce((sum, s) => sum + s.links.length, 0);
          target = Math.max(t.targetLinks, 1);
          progress = Math.min(100, Math.round((completed / target) * 100));
        }
        return { taskName: t.name, targetLinks: target, completedLinks: completed, progress };
      });
      const tasksTotal     = breakdown.reduce((s, x) => s + x.targetLinks, 0);
      const tasksCompleted = breakdown.reduce((s, x) => s + x.completedLinks, 0);
      const progress       = breakdown.length > 0
        ? Math.round(breakdown.reduce((s, x) => s + x.progress, 0) / breakdown.length)
        : (p.manualProgress ?? 0);
      return {
        projectId: p.id, projectName: p.name, progress, tasksCompleted, tasksTotal, notes: '',
        taskBreakdown: breakdown, isPriority: priorityProjectIds.has(p.id),
      };
    });

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

    const employees = new Set(inRange.map(s => s.employeeName));
    const empPoints = new Map<string, number>();
    inRange.forEach(s => empPoints.set(s.employeeName, (empPoints.get(s.employeeName) || 0) + s.totalPoints));
    const topEmp   = Array.from(empPoints.entries()).sort((a, b) => b[1] - a[1]);
    const avgPts   = employees.size > 0 ? totalPoints / employees.size : 0;
    const insights = [
      `Tổng: ${totalLinks} link, ${Math.round(totalPoints)}đ từ ${employees.size} nhân viên.`,
      `Trung bình: ${avgPts.toFixed(1)}đ/người.`,
      topEmp.length > 0 ? `Top: ${topEmp.slice(0, 3).map(([n, p]) => `${n} (${Math.round(p)}đ)`).join(', ')}.` : '',
      taskBreakdownByTeam.map(t => `${t.team}: ${t.items.reduce((s, i) => s + i.links, 0)} link`).join(' | '),
    ].filter(Boolean).join('\n');

    const bottleneckItems: string[] = [];
    pp.forEach(p => {
      p.taskBreakdown?.forEach(t => {
        if (t.progress < 30 && t.targetLinks > 0) {
          bottleneckItems.push(
            `- Vấn đề: Tiến độ task "${t.taskName}" dự án ${p.projectName} quá chậm (${t.progress}%).\n` +
            `  Ảnh hưởng: Chậm tiến độ chung dự án.\n  Mức độ: Cao\n  Owner: [Tên người phụ trách]\n  Hướng xử lý: [Ghi đề xuất giải quyết tại đây]`
          );
        }
      });
    });
    if (totalLinks === 0) bottleneckItems.push('- Vấn đề: Không có link nào được submit trong tuần.');
    const lowEmps = topEmp.filter(([, p]) => p < avgPts * 0.5);
    if (lowEmps.length > 0) bottleneckItems.push(`- Vấn đề: Sản lượng thấp ở một số nhân sự: ${lowEmps.map(([n]) => n).join(', ')}`);
    const bottlenecks = bottleneckItems.join('\n\n');

    const summaryParts = [`Tuần ${formatWeek(weekStart)}: ${totalLinks} link, ${Math.round(totalPoints)} điểm.`];
    if (taskBreakdownByTeam.length > 0) {
      const top = [...taskBreakdownByTeam].sort((a, b) => b.items.reduce((s, i) => s + i.links, 0) - a.items.reduce((s, i) => s + i.links, 0))[0];
      summaryParts.push(`${top.team} dẫn đầu.`);
    }
    if (topEmp.length > 0) summaryParts.push(`Top: ${topEmp[0][0]} (${Math.round(topEmp[0][1])}đ).`);
    const autoSummary = summaryParts.join(' ');

    const slowTasks = pp.flatMap(p => (p.taskBreakdown || []).filter(t => t.progress < 30 && t.targetLinks > 0));
    const autoNextPlan = slowTasks.length > 0
      ? slowTasks.slice(0, 3).map(t => `[High] Đẩy tiến độ task "${t.taskName}" | Target: 100% | Owner: [Tên] | Deadline: Thứ 6`).join('\n')
      : '[Medium] Duy trì nhịp độ hiện tại | Target: Đạt KPI | Owner: Cả team | Deadline: Cuối tuần\n[High] Kiểm tra chất lượng nội dung | Target: Pass 100% | Owner: [Leader] | Deadline: Thứ 4';

    return {
      totalLinks, totalPoints, totalTasksCompleted: inRange.length, projectProgress: pp,
      taskBreakdownByTeam, insights, bottlenecks, autoSummary, autoNextPlan,
      kpiTargetLinks: totalLinks > 0 ? totalLinks : 0,
      kpiTargetPoints: totalPoints > 0 ? totalPoints : 0,
      kpiQuality: 100,
    };
  };

  /* ── initial form state ── */
  const [form, setForm] = useState<Partial<WeeklyReport>>(() => {
    if (item) return item;
    const ws = currentWeekStart;
    const auto = recalcFromWeek(ws);
    return {
      weekStart: ws, createdBy: currentUser?.name || '',
      projectProgress: auto.projectProgress,
      totalTasksCompleted: auto.totalTasksCompleted,
      totalLinks: auto.totalLinks, totalPoints: auto.totalPoints,
      kpiTargetLinks: auto.kpiTargetLinks, kpiTargetPoints: auto.kpiTargetPoints, kpiQuality: auto.kpiQuality,
      summary: auto.autoSummary, aiAssessment: '', managerAssessment: '',
      nextWeekPlan: auto.autoNextPlan, issues: '', insights: auto.insights,
      bottlenecks: auto.bottlenecks, taskBreakdownByTeam: auto.taskBreakdownByTeam, locked: false,
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

  const handleAIGenerate = async () => {
    setAiLoading(true);
    try {
      const ws = form.weekStart || currentWeekStart;
      const calc = recalcFromWeek(ws);
      const getQty = (s: typeof submissions[0]) => (s.quantity && s.quantity > 0) ? s.quantity : s.links.length;
      const cat = (s: typeof submissions[0]) => {
        const t = s.taskType || '';
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
      };
      const inRange = submissions.filter(s => {
        const t = new Date(s.submittedAt).getTime();
        const dStart = new Date(ws);
        const dEnd = new Date(dStart); dEnd.setDate(dStart.getDate() + 6); dEnd.setHours(23, 59, 59);
        return !isNaN(t) && t >= dStart.getTime() && t <= dEnd.getTime();
      });
      const baiMoi = inRange.filter(s => cat(s) === 'baiMoi').reduce((sum, s) => sum + getQty(s), 0);
      const sku = inRange.filter(s => cat(s) === 'sku').reduce((sum, s) => sum + getQty(s), 0);
      const multimedia = inRange.filter(s => cat(s) === 'multimedia').reduce((sum, s) => sum + getQty(s), 0);
      const toiUu = inRange.filter(s => cat(s) === 'toiUu').reduce((sum, s) => sum + getQty(s), 0);
      const employees = new Set(inRange.map(s => s.employeeName));
      const empPoints = new Map<string, { links: number; points: number }>();
      inRange.forEach(s => {
        const prev = empPoints.get(s.employeeName) || { links: 0, points: 0 };
        empPoints.set(s.employeeName, { links: prev.links + getQty(s), points: prev.points + s.totalPoints });
      });
      const topEmployees = Array.from(empPoints.entries())
        .map(([name, v]) => ({ name, links: v.links, points: v.points }))
        .sort((a, b) => b.points - a.points);
      const withQc = inRange.filter(s => !!s.qualityCheck);
      const qcScores = withQc.map(s => s.qualityCheck!.score);
      const totalReviews = withQc.length;
      const avgScore = totalReviews > 0 ? (qcScores.reduce((a, b) => a + b, 0) / totalReviews) * 2 : 0;
      const comments = withQc.filter(s => s.qualityCheck!.note && s.qualityCheck!.note.trim().length > 0);
      const totalComments = comments.length;
      let positiveCount = 0; let negativeCount = 0;
      comments.forEach(s => {
        const note = s.qualityCheck!.note!.toLowerCase();
        if (/(tốt|ok|duyệt|hay|xuất sắc|đạt)/i.test(note)) positiveCount++;
        else if (/(lỗi|sai|chậm|thiếu|chưa đạt|vi phạm|sửa|cảnh báo|chặn)/i.test(note)) negativeCount++;
      });
      const pctPositive = totalComments > 0 ? Math.round((positiveCount / totalComments) * 100) : 0;
      const pctNegative = totalComments > 0 ? Math.round((negativeCount / totalComments) * 100) : 0;
      const teamMap2 = new Map<string, { links: number; points: number }>();
      inRange.forEach(s => {
        const team = s.teamGroup || 'Khác';
        const prev = teamMap2.get(team) || { links: 0, points: 0 };
        teamMap2.set(team, { links: prev.links + getQty(s), points: prev.points + s.totalPoints });
      });
      const teamBreakdown = Array.from(teamMap2.entries()).sort((a, b) => b[1].points - a[1].points);
      const projProgress = (form.projectProgress || []).map(p => ({ name: p.projectName, progress: p.progress }));
      const projectsFocus = (form.projectProgress || [])
        .map(p => ({ name: p.projectName, type: 'Campaign', links: inRange.filter(s => s.projectId === p.projectId).reduce((sum, s) => sum + getQty(s), 0) }))
        .filter(p => p.links > 0).sort((a, b) => b.links - a.links);
      const tMap = new Map<string, Map<string, { links: number; points: number }>>();
      inRange.forEach(s => {
        const type = s.taskType || 'Khác'; const detail = s.taskDetail || s.taskType || 'Khác';
        if (!tMap.has(type)) tMap.set(type, new Map());
        const typeMap = tMap.get(type)!;
        const prev = typeMap.get(detail) || { links: 0, points: 0 };
        typeMap.set(detail, { links: prev.links + getQty(s), points: prev.points + s.totalPoints });
      });
      const tasksBreakdown = Array.from(tMap.entries()).map(([type, details]) => ({
        type, details: Array.from(details.entries()).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.points - a.points)
      })).sort((a, b) => a.type.localeCompare(b.type));
      const formatWeekLabel = (ws2: string) => {
        const d = new Date(ws2); const end = new Date(d); end.setDate(d.getDate() + 6);
        return `Tuần ${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} — ${end.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
      };
      const context: ReportContext = {
        periodLabel: formatWeekLabel(ws),
        stats: { totalLinks: form.totalLinks ?? calc.totalLinks, totalPoints: form.totalPoints ?? calc.totalPoints, totalSubmits: form.totalTasksCompleted ?? calc.totalTasksCompleted, baiMoi, sku, multimedia, toiUu, employeeCount: employees.size, avgPointsPerEmp: employees.size > 0 ? (form.totalPoints ?? calc.totalPoints) / employees.size : 0, deltaLinks: 0, deltaPoints: 0, deltaSubmits: 0 },
        teamBreakdown, topEmployees,
        qualityStats: { avgScore, totalReviews, totalComments, pctPositive, pctNegative },
        projectProgress: projProgress, projectsFocus, tasksBreakdown,
        customerCommentsRaw: tempCustomerComments, additionalContext: tempAdditionalContext,
      };
      const result = await generateWeeklyReport(context);
      setForm(f => ({
        ...f,
        aiAssessment: result.aiAssessment || f.aiAssessment || '',
        insights: result.insights || f.insights || '',
        bottlenecks: result.bottlenecks || f.bottlenecks || '',
        nextWeekPlan: result.nextWeekPlan || f.nextWeekPlan || '',
      }));
      toast.success('AI đã gợi ý đánh giá thực tế thành công!');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Lỗi gọi AI');
    } finally {
      setAiLoading(false);
    }
  };

  const updateProjectProgress = (idx: number, field: keyof WeeklyReportProject, value: string | number) => {
    const pp = [...(form.projectProgress || [])];
    pp[idx] = { ...pp[idx], [field]: value };
    setForm(f => ({ ...f, projectProgress: pp }));
  };

  /* ── SAVE — works from any tab ── */
  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      onSave(form);
      setSaving(false);
    }, 120);
  };

  /* ── shared textarea style ── */
  const ta = (bg: string, border: string): React.CSSProperties => ({
    width: '100%', border: `1.5px solid ${border}`, borderRadius: '10px',
    padding: '10px 12px', fontSize: '13px', fontFamily: 'inherit',
    resize: 'vertical', background: bg, outline: 'none', lineHeight: 1.65,
    color: '#334155', transition: 'border-color .2s',
  });

  /* ── section header ── */
  const secH = (title: string, sub?: string, action?: React.ReactNode) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '14px' }}>
      <div>
        <div style={{ fontWeight: 800, fontSize: '15px', color: '#0f172a' }}>{title}</div>
        {sub && <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{sub}</div>}
      </div>
      {action}
    </div>
  );

  /* ─────────────────────────────────────────────────────────── render ── */
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9100,
      background: '#f1f5f9', display: 'flex', flexDirection: 'column',
      fontFamily: 'Inter, sans-serif',
    }}>
      {/* ── STICKY TOP TOOLBAR ── */}
      <div style={{
        flexShrink: 0,
        background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 60%, #4f46e5 100%)',
        padding: '0 24px',
        display: 'flex', alignItems: 'center', gap: '12px',
        height: '60px',
        boxShadow: '0 4px 20px rgba(0,0,0,.18)',
      }}>
        {/* title */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: '15px', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {item ? <><Edit3 size={15} /> Chỉnh sửa báo cáo</> : <><Plus size={15} /> Tạo báo cáo tuần</>}
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,.65)', marginTop: '1px' }}>
            {formatWeek(form.weekStart || currentWeekStart)}
          </div>
        </div>

        {/* Làm mới số liệu */}
        <button type="button" onClick={handleAutoFill}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600,
            padding: '7px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
            background: 'rgba(255,255,255,.12)', color: '#fff', backdropFilter: 'blur(8px)',
            transition: 'background .15s' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.2)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,.12)')}>
          <Zap size={13} /> Làm mới số liệu
        </button>

        {/* Divider */}
        <div style={{ width: '1px', height: '28px', background: 'rgba(255,255,255,.2)' }} />

        {/* SAVE — always visible */}
        <button type="button" onClick={handleSave} disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 700,
            padding: '8px 20px', borderRadius: '10px', border: 'none', cursor: 'pointer',
            background: saving ? '#94a3b8' : 'linear-gradient(135deg, #16a34a, #15803d)',
            color: '#fff', boxShadow: '0 4px 12px rgba(22,163,74,.4)', transition: 'all .15s' }}>
          <Save size={15} /> {saving ? 'Đang lưu...' : item ? 'Cập nhật' : 'Lưu báo cáo'}
        </button>

        {/* close */}
        <button onClick={onClose}
          style={{ width: '36px', height: '36px', borderRadius: '8px', border: 'none', cursor: 'pointer',
            background: 'rgba(255,255,255,.12)', color: '#fff', display: 'grid', placeItems: 'center',
            transition: 'background .15s' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,.4)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,.12)')}>
          <X size={18} />
        </button>
      </div>

      {/* ── BODY: sidebar + content ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* LEFT SIDEBAR NAV */}
        <div style={{
          width: '200px', flexShrink: 0,
          background: '#fff', borderRight: '1px solid #e2e8f0',
          display: 'flex', flexDirection: 'column', padding: '20px 12px', gap: '4px',
        }}>
          {/* week picker in sidebar */}
          <div style={{ marginBottom: '20px', padding: '10px 12px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '6px', letterSpacing: '.3px' }}>📅 TUẦN BÁO CÁO</div>
            <input type="date" value={form.weekStart || ''}
              onChange={e => handleWeekChange(e.target.value)}
              style={{ width: '100%', border: '1.5px solid #e2e8f0', borderRadius: '7px', padding: '5px 8px', fontSize: '12px', fontFamily: 'inherit', outline: 'none', color: '#0f172a', fontWeight: 600 }} />
          </div>

          {SECTIONS.map((s) => {
            const isActive = s.key === tab;
            return (
              <button key={s.key} onClick={() => setTab(s.key)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '10px',
                  padding: '10px 12px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                  background: isActive ? 'linear-gradient(135deg,#eff6ff,#dbeafe)' : 'transparent',
                  color: isActive ? '#1e40af' : '#475569', textAlign: 'left', width: '100%',
                  transition: 'all .15s',
                  boxShadow: isActive ? '0 0 0 1.5px #bfdbfe' : 'none',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#f8fafc'; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
                  display: 'grid', placeItems: 'center', fontSize: '16px',
                  background: isActive ? '#dbeafe' : '#f1f5f9', }}>
                  {s.icon}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '13px', lineHeight: 1.2 }}>{s.label}</div>
                  <div style={{ fontSize: '11px', opacity: .7, marginTop: '2px', lineHeight: 1.3 }}>{s.desc}</div>
                </div>
              </button>
            );
          })}

          {/* stats preview */}
          <div style={{ marginTop: 'auto', padding: '12px', background: 'linear-gradient(135deg,#f8fafc,#f1f5f9)', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '8px' }}>📌 NHANH</div>
            {[
              { label: 'Links', val: form.totalLinks ?? 0, color: '#6366f1' },
              { label: 'Điểm', val: Math.round(form.totalPoints ?? 0), color: '#f59e0b' },
              { label: 'Dự án', val: (form.projectProgress || []).length, color: '#16a34a' },
            ].map(r => (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                <span style={{ color: '#64748b' }}>{r.label}</span>
                <b style={{ color: r.color }}>{r.val}</b>
              </div>
            ))}
          </div>
        </div>

        {/* MAIN CONTENT AREA */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>

          {/* ═══════════ TAB 1: SỐ LIỆU ═══════════ */}
          {tab === 'data' && (
            <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>

              {/* KPI row */}
              {secH('📊 KPI & Sản lượng tuần', 'Nhập thực tế / target hoặc nhấn "Làm mới số liệu" để tự động fill')}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
                {([
                  { icon: '🔗', label: 'Link thực tế', field: 'totalLinks', target: 'kpiTargetLinks', color: '#6366f1', bg: '#eff6ff', border: '#c7d2fe' },
                  { icon: '⭐', label: 'Điểm thực tế', field: 'totalPoints', target: 'kpiTargetPoints', color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
                ] as const).map(k => (
                  <div key={k.field} style={{ background: '#fff', border: `1.5px solid ${k.border}`, borderRadius: '14px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,.04)' }}>
                    <div style={{ fontSize: '20px', marginBottom: '8px' }}>{k.icon}</div>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, marginBottom: '6px' }}>{k.label} / Target</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input type="number" min="0" value={form[k.field] ?? 0}
                        onChange={e => setForm(f => ({ ...f, [k.field]: parseFloat(e.target.value) || 0 }))}
                        style={{ width: '70px', textAlign: 'center', fontWeight: 800, fontSize: '20px', color: k.color,
                          border: 'none', background: k.bg, padding: '4px 6px', borderRadius: '6px', outline: 'none' }} />
                      <span style={{ color: '#94a3b8', fontSize: '16px' }}>/</span>
                      <input type="number" min="0" value={form[k.target] ?? 0}
                        onChange={e => setForm(f => ({ ...f, [k.target]: parseFloat(e.target.value) || 0 }))}
                        style={{ width: '70px', textAlign: 'center', fontWeight: 700, fontSize: '16px', color: '#64748b',
                          border: 'none', background: '#f8fafc', padding: '4px 6px', borderRadius: '6px', outline: 'none' }} />
                    </div>
                    {/* mini bar */}
                    <div style={{ marginTop: '8px', height: '4px', background: '#f1f5f9', borderRadius: '999px' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, ((form[k.field] ?? 0) / Math.max(1, form[k.target] ?? 1)) * 100)}%`,
                        background: k.color, borderRadius: '999px', transition: 'width .3s' }} />
                    </div>
                  </div>
                ))}
                <div style={{ background: '#fff', border: '1.5px solid #bbf7d0', borderRadius: '14px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,.04)' }}>
                  <div style={{ fontSize: '20px', marginBottom: '8px' }}>📥</div>
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, marginBottom: '6px' }}>Lượt Submit</div>
                  <input type="number" min="0" value={form.totalTasksCompleted ?? 0}
                    onChange={e => setForm(f => ({ ...f, totalTasksCompleted: parseFloat(e.target.value) || 0 }))}
                    style={{ width: '90px', textAlign: 'center', fontWeight: 800, fontSize: '22px', color: '#16a34a',
                      border: 'none', background: '#f0fdf4', padding: '4px 8px', borderRadius: '6px', outline: 'none' }} />
                </div>
                <div style={{ background: '#fff', border: '1.5px solid #ddd6fe', borderRadius: '14px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,.04)' }}>
                  <div style={{ fontSize: '20px', marginBottom: '8px' }}>✨</div>
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, marginBottom: '6px' }}>Chất lượng Pass</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input type="number" min="0" max="100" value={form.kpiQuality ?? 100}
                      onChange={e => setForm(f => ({ ...f, kpiQuality: parseFloat(e.target.value) || 0 }))}
                      style={{ width: '60px', textAlign: 'center', fontWeight: 800, fontSize: '22px', color: '#7c3aed',
                        border: 'none', background: '#f5f3ff', padding: '4px 6px', borderRadius: '6px', outline: 'none' }} />
                    <span style={{ fontWeight: 800, fontSize: '18px', color: '#7c3aed' }}>%</span>
                  </div>
                </div>
              </div>

              {/* project selector */}
              <div>
                {secH('📦 Chọn dự án đưa vào báo cáo',
                  `${selectedProjectIds.size}/${activeProjects.length} dự án được chọn`,
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button type="button" onClick={() => setSelectedProjectIds(new Set(activeProjects.map(p => p.id)))}
                      style={{ fontSize: '12px', padding: '4px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', borderRadius: '999px', cursor: 'pointer', fontWeight: 600 }}>
                      Chọn tất cả
                    </button>
                    <button type="button" onClick={() => setSelectedProjectIds(new Set())}
                      style={{ fontSize: '12px', padding: '4px 12px', background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', borderRadius: '999px', cursor: 'pointer', fontWeight: 600 }}>
                      Bỏ tất cả
                    </button>
                  </div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {activeProjects.map(p => {
                    const isSelected = selectedProjectIds.has(p.id);
                    const isPriority = priorityProjectIds.has(p.id);
                    return (
                      <div key={p.id} style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '6px 12px', borderRadius: '10px', cursor: 'pointer',
                        background: isSelected ? (isPriority ? '#fef9c3' : '#eff6ff') : '#f8fafc',
                        border: `1.5px solid ${isSelected ? (isPriority ? '#fde047' : '#bfdbfe') : '#e2e8f0'}`,
                        transition: 'all .15s', userSelect: 'none',
                      }}>
                        <input type="checkbox" checked={isSelected}
                          onChange={e => {
                            const next = new Set(selectedProjectIds);
                            if (e.target.checked) next.add(p.id);
                            else { next.delete(p.id); setPriorityProjectIds(prev => { const n = new Set(prev); n.delete(p.id); return n; }); }
                            setSelectedProjectIds(next);
                          }}
                          style={{ accentColor: '#1d4ed8', cursor: 'pointer', width: '14px', height: '14px' }} />
                        <span style={{ fontSize: '13px', fontWeight: isSelected ? 600 : 400, color: isSelected ? '#1e40af' : '#64748b' }}>
                          {p.name}
                        </span>
                        {isSelected && (
                          <button type="button"
                            onClick={e => { e.stopPropagation(); setPriorityProjectIds(prev => { const n = new Set(prev); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; }); }}
                            title={isPriority ? 'Bỏ trọng điểm' : 'Đánh dấu trọng điểm'}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0', color: isPriority ? '#ca8a04' : '#cbd5e1', lineHeight: 1, display: 'flex' }}>
                            <Star size={13} fill={isPriority ? '#ca8a04' : 'none'} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '8px' }}>
                  💡 Nhấn <Star size={10} style={{ display: 'inline', verticalAlign: 'middle' }} /> để đánh dấu dự án trọng điểm — hiển thị nổi bật trong báo cáo.
                </div>
              </div>

              {/* project progress list */}
              {(form.projectProgress || []).length > 0 && (
                <div>
                  {secH('📋 Tiến độ dự án đã chọn', 'Chỉnh sửa trực tiếp — progress tự tính từ task con')}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {(form.projectProgress || []).map((p, idx) => {
                      const pColor = p.progress >= 80 ? '#16a34a' : p.progress >= 40 ? '#6366f1' : '#ea580c';
                      const pBg = p.progress >= 80 ? '#f0fdf4' : p.progress >= 40 ? '#eff6ff' : '#fef2f2';
                      return (
                        <div key={idx} style={{
                          background: '#fff', border: '1.5px solid #e2e8f0',
                          borderLeft: `4px solid ${pColor}`, borderRadius: '12px', overflow: 'hidden',
                        }}>
                          {/* project header row */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto auto', gap: '10px', alignItems: 'center', padding: '14px 16px', background: pBg }}>
                            <div style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {p.isPriority && <Star size={12} fill="#ca8a04" color="#ca8a04" />}
                              {p.projectName}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '12px', color: '#64748b' }}>Tiến độ:</span>
                              <input type="number" min="0" max="100"
                                value={p.progress}
                                onChange={e => updateProjectProgress(idx, 'progress', parseInt(e.target.value) || 0)}
                                style={{ width: '60px', textAlign: 'center', fontWeight: 800, fontSize: '14px', color: pColor,
                                  border: `1.5px solid ${pColor}33`, borderRadius: '6px', padding: '3px 6px', outline: 'none', background: '#fff' }} />
                              <span style={{ fontWeight: 700, color: pColor }}>%</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ fontSize: '12px', color: '#64748b' }}>Done:</span>
                              <input type="number" min="0" value={p.tasksCompleted}
                                onChange={e => updateProjectProgress(idx, 'tasksCompleted', parseInt(e.target.value) || 0)}
                                style={{ width: '60px', textAlign: 'center', fontSize: '13px', border: '1.5px solid #e2e8f0', borderRadius: '6px', padding: '3px 6px', outline: 'none', fontWeight: 600 }} />
                              <span style={{ color: '#94a3b8' }}>/</span>
                              <input type="number" min="0" value={p.tasksTotal}
                                onChange={e => updateProjectProgress(idx, 'tasksTotal', parseInt(e.target.value) || 0)}
                                style={{ width: '60px', textAlign: 'center', fontSize: '13px', border: '1.5px solid #e2e8f0', borderRadius: '6px', padding: '3px 6px', outline: 'none', fontWeight: 600 }} />
                            </div>
                            <input value={p.notes || ''}
                              onChange={e => updateProjectProgress(idx, 'notes', e.target.value)}
                              placeholder="Ghi chú tiến độ..."
                              style={{ fontSize: '12px', border: '1.5px solid #e2e8f0', borderRadius: '6px', padding: '4px 8px', outline: 'none', width: '220px', fontFamily: 'inherit' }} />
                          </div>
                          {/* progress bar */}
                          <div style={{ height: '5px', background: '#f1f5f9' }}>
                            <div style={{ height: '100%', width: `${p.progress}%`, background: `linear-gradient(90deg,${pColor},${pColor}99)`, transition: 'width .3s' }} />
                          </div>
                          {/* task breakdown */}
                          {p.taskBreakdown && p.taskBreakdown.length > 0 && (
                            <div style={{ padding: '10px 16px', background: '#fafafa', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', letterSpacing: '.3px', marginBottom: '4px' }}>📌 HẠNG MỤC TASK</div>
                              {p.taskBreakdown.map((t, ti) => {
                                const tProg = t.targetLinks > 0 ? Math.min(100, Math.round((t.completedLinks / t.targetLinks) * 100)) : 0;
                                const tColor = tProg >= 80 ? '#16a34a' : tProg >= 40 ? '#6366f1' : '#ea580c';
                                return (
                                  <div key={ti} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto auto', gap: '8px', alignItems: 'center', padding: '6px 8px', background: '#fff', borderRadius: '7px', border: '1px solid #f1f5f9' }}>
                                    <span style={{ fontSize: '12px', color: '#334155', fontWeight: 500 }}>↳ {t.taskName}</span>
                                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>Đạt:</span>
                                    <input type="number" min="0" value={t.completedLinks}
                                      onChange={e => {
                                        const pp2 = [...(form.projectProgress || [])];
                                        const bd = [...(pp2[idx].taskBreakdown || [])];
                                        const newC = parseInt(e.target.value) || 0;
                                        bd[ti] = { ...bd[ti], completedLinks: newC, progress: bd[ti].targetLinks > 0 ? Math.min(100, Math.round((newC / bd[ti].targetLinks) * 100)) : 0 };
                                        pp2[idx] = { ...pp2[idx], taskBreakdown: bd, progress: Math.round(bd.reduce((s, x) => s + x.progress, 0) / bd.length), tasksCompleted: bd.reduce((s, x) => s + x.completedLinks, 0), tasksTotal: bd.reduce((s, x) => s + x.targetLinks, 0) };
                                        setForm(f => ({ ...f, projectProgress: pp2 }));
                                      }}
                                      style={{ width: '52px', textAlign: 'center', fontSize: '12px', border: '1.5px solid #e2e8f0', borderRadius: '5px', padding: '2px 4px', outline: 'none', fontWeight: 600 }} />
                                    <span style={{ color: '#94a3b8', fontSize: '11px' }}>/ {t.targetLinks}</span>
                                    <span style={{ fontWeight: 700, fontSize: '12px', minWidth: '38px', textAlign: 'right', color: tColor }}>{tProg}%</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══════════ TAB 2: NHẬN XÉT ═══════════ */}
          {tab === 'review' && (
            <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {secH('💬 Nhận xét & Đánh giá', 'Viết thủ công hoặc để AI hỗ trợ ở tab tiếp theo')}

              {[
                { label: '📝 Tổng quan tuần', field: 'summary' as const, rows: 4, note: '(tự động gợi ý — sửa lại nếu cần)', bg: 'linear-gradient(135deg,#f8faff,#f0f4ff)', border: '#c7d2fe' },
                { label: '💡 Nhận xét từ số liệu', field: 'insights' as const, rows: 4, note: '(tự động tạo)', bg: 'linear-gradient(135deg,#eff6ff,#dbeafe)', border: '#bfdbfe' },
                { label: '🚧 Điểm nghẽn', field: 'bottlenecks' as const, rows: 5, note: '(tự động phát hiện)', bg: 'linear-gradient(135deg,#fff1f2,#ffe4e6)', border: '#fda4af' },
                { label: '⚠️ Việc cần chốt / Cần hỗ trợ', field: 'issues' as const, rows: 3, note: '', bg: 'linear-gradient(135deg,#fff7ed,#fed7aa)', border: '#fdba74' },
              ].map(f => (
                <div key={f.field}>
                  <label style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a', display: 'block', marginBottom: '8px' }}>
                    {f.label}
                    {f.note && <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 400, marginLeft: '6px' }}>{f.note}</span>}
                  </label>
                  <textarea
                    value={(form[f.field] as string) || ''}
                    onChange={e => setForm(prev => ({ ...prev, [f.field]: e.target.value }))}
                    rows={f.rows}
                    style={ta(f.bg, f.border)}
                    onFocus={e => { e.currentTarget.style.borderColor = '#6366f1'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = f.border; }}
                  />
                </div>
              ))}
            </div>
          )}

          {/* ═══════════ TAB 3: AI & CHỐT ═══════════ */}
          {tab === 'finalize' && (
            <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {secH('✅ AI đánh giá & Chốt báo cáo', 'Cấu hình ngữ cảnh AI rồi nhấn "AI gợi ý" để tự động điền')}

              {/* AI config */}
              <div style={{ padding: '16px 18px', background: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 700, fontSize: '13px', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                  <Sparkles size={14} color="#7c3aed" /> Cấu hình ngữ cảnh AI (tùy chọn)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '5px' }}>📝 Thông tin bổ sung cho AI</label>
                    <textarea value={tempAdditionalContext} onChange={e => setTempAdditionalContext(e.target.value)}
                      rows={3} placeholder="Ví dụ: Campaign tiêm chủng đột biến, sự cố kĩ thuật duyệt bài chậm..."
                      style={ta('#fff', '#e2e8f0')} />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '5px' }}>💬 Dán comment khách hàng thô</label>
                    <textarea value={tempCustomerComments} onChange={e => setTempCustomerComments(e.target.value)}
                      rows={3} placeholder={'Bài duyệt hơi chậm so với deadline\nNội dung sản phẩm rất chuẩn...'}
                      style={ta('#fff', '#e2e8f0')} />
                  </div>
                </div>
                <button type="button" onClick={handleAIGenerate} disabled={aiLoading}
                  style={{ marginTop: '10px', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 18px',
                    borderRadius: '8px', cursor: aiLoading ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '13px',
                    background: aiLoading ? '#e2e8f0' : 'linear-gradient(135deg,#faf5ff,#ede9fe)',
                    border: '1px solid #c4b5fd', color: '#7c3aed', transition: 'all .15s' }}>
                  <Sparkles size={14} /> {aiLoading ? 'Đang tạo đánh giá AI...' : '✨ AI gợi ý nhận xét'}
                </button>
              </div>

              {/* AI assessment */}
              <div>
                <label style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a', display: 'block', marginBottom: '8px' }}>
                  🤖 AI đánh giá
                </label>
                <textarea value={form.aiAssessment || ''} onChange={e => setForm(f => ({ ...f, aiAssessment: e.target.value }))}
                  rows={5} placeholder="Bấm 'AI gợi ý' hoặc nhập thủ công..."
                  style={ta('linear-gradient(135deg,#faf5ff,#ede9fe)', '#c4b5fd')} />
              </div>

              {/* manager assessment */}
              <div>
                <label style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a', display: 'block', marginBottom: '8px' }}>
                  👤 Manager đánh giá <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 400 }}>(chỉnh sửa tự do)</span>
                </label>
                <textarea value={form.managerAssessment || ''} onChange={e => setForm(f => ({ ...f, managerAssessment: e.target.value }))}
                  rows={4} placeholder="Nhận xét, đánh giá của bạn..."
                  style={ta('linear-gradient(135deg,#f0fdf4,#dcfce7)', '#bbf7d0')} />
              </div>

              {/* next week plan */}
              <div>
                <label style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a', display: 'block', marginBottom: '8px' }}>
                  📋 Kế hoạch tuần tới <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 400 }}>(tự động gợi ý)</span>
                </label>
                <textarea value={form.nextWeekPlan || ''} onChange={e => setForm(f => ({ ...f, nextWeekPlan: e.target.value }))}
                  rows={5}
                  style={ta('linear-gradient(135deg,#f8faff,#f0f4ff)', '#c7d2fe')} />
              </div>

              {/* lock */}
              <label style={{
                display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', cursor: 'pointer',
                padding: '14px 16px', borderRadius: '12px', border: '1.5px solid',
                borderColor: form.locked ? '#fecaca' : '#e2e8f0',
                background: form.locked ? 'linear-gradient(135deg,#fef2f2,#fee2e2)' : '#f8fafc',
                transition: 'all .2s',
              }}>
                <input type="checkbox" checked={form.locked || false} onChange={e => setForm(f => ({ ...f, locked: e.target.checked }))}
                  style={{ accentColor: form.locked ? '#dc2626' : '#6366f1', width: 18, height: 18 }} />
                {form.locked ? <Lock size={16} color="#dc2626" /> : <Unlock size={16} color="#94a3b8" />}
                <div>
                  <div style={{ fontWeight: 700, color: form.locked ? '#dc2626' : '#334155' }}>
                    {form.locked ? 'Đã chốt — không thể sửa sau khi lưu' : 'Chốt báo cáo'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                    Sau khi chốt, báo cáo sẽ được khóa và không thể chỉnh sửa.
                  </div>
                </div>
              </label>

              {/* bottom save CTA */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '4px' }}>
                <button type="button" onClick={handleSave} disabled={saving}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 32px',
                    borderRadius: '12px', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '15px',
                    background: saving ? '#94a3b8' : 'linear-gradient(135deg,#16a34a,#15803d)',
                    color: '#fff', boxShadow: '0 6px 20px rgba(22,163,74,.35)', transition: 'all .15s' }}>
                  <Save size={17} /> {saving ? 'Đang lưu...' : item ? '✅ Cập nhật báo cáo' : '✅ Lưu báo cáo'}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
