import { useState, useMemo } from 'react';
import { useAppStore } from '@/shared/store/appStore';
import {
  BarChart3, FileText, Plus, Edit3, Trash2, X, Save,
  Lock, Unlock, Sparkles, Download,
  AlertTriangle, Zap, Star, MoreHorizontal, Copy, Eye,
} from 'lucide-react';
import type { WeeklyReport, WeeklyReportProject } from '@/shared/types';
import { exportCsv, makeId } from '@/shared/utils/helpers';
import toast from 'react-hot-toast';
import WeeklyReportViewer from './WeeklyReportViewer';
import { generateWeeklyReport, type ReportContext } from '@/shared/services/aiService';
import ErrorBoundary from '@/shared/components/ErrorBoundary';

/* ─────────────────────────────────────────────────────────── helpers ── */

/**
 * Khoá tuần đang lưu trong DB. Giữ nguyên cách tính cũ để khớp với các báo cáo
 * đã lưu (do toISOString lệch múi giờ nên khoá thường rơi vào Chủ nhật).
 */
function getWeekStart(d: Date): string {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff).toISOString().slice(0, 10);
}

/** Cộng/trừ ngày trên khoá tuần (tính theo UTC để không lệch múi giờ). */
function shiftKey(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Thứ Hai thực của tuần (giờ địa phương) ứng với một khoá tuần. */
function weekMonday(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const day = date.getDay();
  if (day !== 1) date.setDate(date.getDate() + (day === 0 ? 1 : 1 - day));
  return date;
}

const dm  = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
const dmy = (d: Date) => `${dm(d)}/${d.getFullYear()}`;

function formatWeek(key: string): string {
  const mon = weekMonday(key);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return `${dm(mon)} – ${dmy(sun)}`;
}

function formatWeekShort(key: string): string {
  return dm(weekMonday(key));
}

/** % thay đổi; null khi không có mốc so sánh. */
function pct(a: number, b: number): number | null {
  if (!b) return null;
  return Math.round(((a - b) / b) * 100);
}

const avgProgress = (r: WeeklyReport): number | null =>
  r.projectProgress.length > 0
    ? Math.round(r.projectProgress.reduce((s, p) => s + p.progress, 0) / r.projectProgress.length)
    : null;

const progressColor = (v: number) => (v >= 80 ? 'var(--success)' : v >= 50 ? 'var(--primary-500)' : 'var(--warning)');

type Period = 'all' | '3m' | 'year';
const PERIODS: { key: Period; label: string }[] = [
  { key: 'all',  label: 'Tất cả' },
  { key: '3m',   label: '3 tháng gần nhất' },
  { key: 'year', label: 'Năm nay' },
];

/* ─────────────────────────────────────────────────────── main page ── */

export default function ReportsPage() {
  const {
    weeklyReports, addWeeklyReport, updateWeeklyReport, deleteWeeklyReport,
    submissions, currentUser,
  } = useAppStore();

  const [showForm, setShowForm]           = useState(false);
  const [editItem, setEditItem]           = useState<WeeklyReport | null>(null);
  const [viewingReport, setViewingReport] = useState<WeeklyReport | null>(null);
  const [period, setPeriod]               = useState<Period>('all');
  const [now] = useState(() => Date.now());

  const isManager = currentUser?.role === 'Manager';

  const currentWeekStart = getWeekStart(new Date());
  const currentReport    = weeklyReports.find(r => r.weekStart === currentWeekStart);
  const reportByWeek     = useMemo(() => new Map(weeklyReports.map(r => [r.weekStart, r])), [weeklyReports]);

  /* Sản lượng thực tế theo tuần — cùng công thức với lúc tạo báo cáo (submissions). */
  const sumRange = useMemo(() => {
    const items = submissions
      .map(s => ({ t: new Date(s.submittedAt).getTime(), links: s.links?.length ?? 0, points: s.totalPoints || 0 }))
      .filter(x => !isNaN(x.t));
    return (from: number, to: number) => items.reduce(
      (acc, x) => (x.t >= from && x.t < to ? { links: acc.links + x.links, points: acc.points + x.points } : acc),
      { links: 0, points: 0 },
    );
  }, [submissions]);

  const trend = useMemo(() => {
    return Array.from({ length: 8 }, (_, i) => {
      const key  = shiftKey(currentWeekStart, (i - 7) * 7);
      const from = weekMonday(key).getTime();
      const to   = from + 7 * 86400000;
      return { key, ...sumRange(from, Math.min(to, now + 1)), report: reportByWeek.get(key), isCurrent: i === 7 };
    });
  }, [currentWeekStart, sumRange, reportByWeek, now]);

  /* Tuần này so với CÙNG KỲ tuần trước (cùng số ngày) để so sánh công bằng. */
  const thisWeek = useMemo(() => {
    const mon     = weekMonday(currentWeekStart).getTime();
    const elapsed = now - mon;
    const cur     = sumRange(mon, now + 1);
    const prev    = sumRange(mon - 7 * 86400000, mon - 7 * 86400000 + elapsed);
    const dayNo   = Math.min(7, Math.floor(elapsed / 86400000) + 1);
    return { cur, prev, dayNo };
  }, [currentWeekStart, sumRange, now]);

  const visibleReports = useMemo(() => {
    let cutoff = '';
    if (period === '3m')   cutoff = shiftKey(currentWeekStart, -13 * 7);
    if (period === 'year') cutoff = `${new Date().getFullYear()}-01-01`;
    return [...weeklyReports]
      .filter(r => !cutoff || r.weekStart >= cutoff)
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  }, [weeklyReports, period, currentWeekStart]);

  if (!isManager) {
    return (
      <div className="card" style={{ padding: '60px', textAlign: 'center', marginTop: '20px' }}>
        <Lock size={36} style={{ color: 'var(--text-tertiary)', marginBottom: '12px' }} />
        <h3 style={{ fontWeight: 700, marginBottom: '8px' }}>Không có quyền truy cập</h3>
        <p style={{ color: 'var(--text-tertiary)' }}>Chỉ Manager mới xem được báo cáo tuần.</p>
      </div>
    );
  }

  const handleCreateNew = () => {
    setEditItem(currentReport ?? null);
    setShowForm(true);
  };

  const handleExportCSV = () => {
    if (visibleReports.length === 0) { toast.error('Không có báo cáo nào'); return; }
    const rows = visibleReports.map(r => ({
      week: formatWeek(r.weekStart), createdBy: r.createdBy,
      totalLinks: r.totalLinks, totalPoints: Math.round(r.totalPoints),
      totalTasksCompleted: r.totalTasksCompleted, summary: r.summary,
      managerAssessment: r.managerAssessment || r.aiAssessment,
      issues: r.issues, nextWeekPlan: r.nextWeekPlan,
      projectsSummary: r.projectProgress.map(p => `${p.projectName}:${p.progress}%`).join(' | '),
      locked: r.locked ? 'yes' : 'no',
    }));
    exportCsv(rows, `bao-cao-tuan_${period}`);
    toast.success(`Đã export ${rows.length} báo cáo`);
  };

  const handleCopyText = (report: WeeklyReport) => {
    const lines = [
      `📊 BÁO CÁO TUẦN — ${formatWeek(report.weekStart)}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `📝 Tổng quan: ${report.summary}`,
      '', '📦 TIẾN ĐỘ DỰ ÁN:',
      ...report.projectProgress.flatMap(p => {
        const arr = [`  • ${p.projectName}: ${p.progress}% (${p.tasksCompleted}/${p.tasksTotal} việc)`];
        if (p.remarks) arr.push(`    💬 Đánh giá: ${p.remarks}`);
        if (p.attentionNotes) arr.push(`    ⚠️ Lưu ý: ${p.attentionNotes}`);
        if (!p.remarks && !p.attentionNotes && p.notes) arr.push(`    ↳ ${p.notes}`);
        return arr;
      }),
      '', `📊 SỐ LIỆU: ${report.totalLinks} link | ${report.totalPoints.toFixed(0)} điểm | ${report.totalTasksCompleted} việc`,
      report.insights     ? `\n💡 NHẬN XÉT: ${report.insights}`              : '',
      report.bottlenecks  ? `\n🚧 ĐIỂM NGHẼN: ${report.bottlenecks}`         : '',
      '', `👤 ĐÁNH GIÁ: ${report.managerAssessment || report.aiAssessment}`,
      report.issues       ? `\n⚠️ VẤN ĐỀ: ${report.issues}`                 : '',
      report.nextWeekPlan ? `\n📋 KẾ HOẠCH TUẦN TỚI: ${report.nextWeekPlan}` : '',
    ].filter(Boolean).join('\n');
    navigator.clipboard.writeText(lines)
      .then(() => toast.success('Đã copy nội dung báo cáo'))
      .catch(() => toast.error('Lỗi copy'));
  };

  /* ── render ── */
  return (
    <div>
      {/* ── header: 1 hành động chính duy nhất ── */}
      <div className="page-header">
        <div>
          <h2 className="page-title">
            <span className="icon"><BarChart3 size={20} /></span>Báo cáo tuần
          </h2>
          <p className="page-subtitle">Sản lượng thực tế theo tuần và lưu trữ các báo cáo đã lập</p>
        </div>
        {currentReport ? (
          <button className="btn btn-primary" onClick={() => setViewingReport(currentReport)}>
            <Eye size={16} /> Mở báo cáo tuần này
          </button>
        ) : (
          <button className="btn btn-primary" onClick={handleCreateNew}>
            <Plus size={16} /> Tạo báo cáo tuần này
          </button>
        )}
      </div>

      {/* ── tổng quan tuần này + trend ── */}
      <WeekOverview
        currentWeekStart={currentWeekStart}
        currentReport={currentReport}
        thisWeek={thisWeek}
        trend={trend}
        onOpenReport={setViewingReport}
      />

      {/* ── lịch sử báo cáo ── */}
      <div className="card wr-history">
        <div className="wr-history-head">
          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
            Lịch sử báo cáo <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>({visibleReports.length})</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: 'auto' }}>
            <select className="form-input" value={period} onChange={e => setPeriod(e.target.value as Period)}
              style={{ width: 'auto', fontSize: '0.82rem', padding: '6px 10px' }} aria-label="Khoảng thời gian">
              {PERIODS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={handleExportCSV} disabled={visibleReports.length === 0}
              title="Xuất danh sách đang hiển thị ra CSV">
              <Download size={14} /> CSV
            </button>
          </div>
        </div>

        {visibleReports.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <FileText size={40} style={{ color: 'var(--text-tertiary)', opacity: 0.4, marginBottom: '12px' }} />
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>
              {weeklyReports.length === 0 ? 'Chưa có báo cáo tuần nào' : 'Không có báo cáo trong khoảng này'}
            </div>
            <div style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
              {weeklyReports.length === 0 && 'Bấm "Tạo báo cáo tuần này" — số liệu sẽ được tự điền từ submissions.'}
            </div>
          </div>
        ) : (
          <ReportTable
            reports={visibleReports}
            reportByWeek={reportByWeek}
            currentWeekStart={currentWeekStart}
            onView={setViewingReport}
            onEdit={r => { setEditItem(r); setShowForm(true); }}
            onCopy={handleCopyText}
            onDelete={r => {
              if (window.confirm(`Xóa báo cáo tuần ${formatWeek(r.weekStart)}?`)) {
                deleteWeeklyReport(r.id); toast.success('Đã xóa');
              }
            }}
          />
        )}
      </div>

      {showForm && (
        <ErrorBoundary fallbackTitle="Lỗi hiển thị Form Báo cáo">
          <ReportFormModal
            item={editItem}
            currentWeekStart={currentWeekStart}
            onClose={() => { setShowForm(false); setEditItem(null); }}
            onSave={data => {
              if (editItem) {
                updateWeeklyReport(editItem.id, { ...data, updatedAt: new Date().toISOString() });
                toast.success('Đã cập nhật báo cáo');
              } else {
                addWeeklyReport({ ...data, id: makeId('wr'), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as WeeklyReport);
                toast.success('Đã tạo báo cáo');
              }
              setShowForm(false); setEditItem(null);
            }}
          />
        </ErrorBoundary>
      )}

      {/* ── trình xem báo cáo (chia sẻ, tải HTML, in, sửa nội dung nằm ở đây) ── */}
      {viewingReport && (
        <WeeklyReportViewer
          report={viewingReport}
          canEdit={isManager}
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

/* ─────────────────────────────────────────── small pieces ── */

function Delta({ value, suffix }: { value: number | null; suffix?: string }) {
  if (value === null) return <span className="wr-delta wr-delta-none">{suffix ? `chưa có dữ liệu ${suffix}` : '—'}</span>;
  const cls = value > 0 ? 'wr-delta-up' : value < 0 ? 'wr-delta-down' : 'wr-delta-flat';
  return (
    <span className={`wr-delta ${cls}`}>
      {value > 0 ? '▲' : value < 0 ? '▼' : '='} {Math.abs(value)}%{suffix && <span className="wr-hide-sm"> {suffix}</span>}
    </span>
  );
}

function StatusChip({ report }: { report: WeeklyReport | undefined }) {
  if (!report) return <span className="wr-chip wr-chip-warn"><AlertTriangle size={11} /> Chưa lập báo cáo</span>;
  if (report.locked) return <span className="wr-chip wr-chip-ok"><Lock size={11} /> Đã chốt</span>;
  return <span className="wr-chip wr-chip-draft"><Edit3 size={11} /> Bản nháp</span>;
}

/* ─────────────────────────────────────────── WeekOverview ── */

type TrendPoint = { key: string; links: number; points: number; report?: WeeklyReport; isCurrent: boolean };

function WeekOverview({ currentWeekStart, currentReport, thisWeek, trend, onOpenReport }: {
  currentWeekStart: string;
  currentReport: WeeklyReport | undefined;
  thisWeek: { cur: { links: number; points: number }; prev: { links: number; points: number }; dayNo: number };
  trend: TrendPoint[];
  onOpenReport: (r: WeeklyReport) => void;
}) {
  const max = Math.max(...trend.map(t => t.links), 1);
  const BAR_H = 96;
  const missing = trend.filter(t => !t.isCurrent && !t.report).length;

  return (
    <div className="card wr-overview">
      {/* trái: tuần này */}
      <div className="wr-now">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700 }}>Tuần này</span>
          <span style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>{formatWeek(currentWeekStart)}</span>
        </div>
        <div style={{ marginTop: '6px' }}><StatusChip report={currentReport} /></div>

        <div className="wr-kpis">
          <div>
            <div className="wr-kpi-label">Link đã nộp</div>
            <div className="wr-kpi-value">{thisWeek.cur.links.toLocaleString('vi-VN')}</div>
            <Delta value={pct(thisWeek.cur.links, thisWeek.prev.links)} />
          </div>
          <div>
            <div className="wr-kpi-label">Điểm</div>
            <div className="wr-kpi-value">{Math.round(thisWeek.cur.points).toLocaleString('vi-VN')}</div>
            <Delta value={pct(thisWeek.cur.points, thisWeek.prev.points)} />
          </div>
        </div>
        <div className="wr-note">
          Tính đến hôm nay (ngày {thisWeek.dayNo}/7), so với cùng kỳ tuần trước
          ({thisWeek.prev.links} link · {Math.round(thisWeek.prev.points)} điểm).
        </div>
      </div>

      {/* phải: trend 8 tuần */}
      <div className="wr-trend">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700 }}>Link theo tuần</span>
          <span style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>8 tuần gần nhất · số liệu thực tế</span>
          {missing > 0 && (
            <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--warning)', fontWeight: 600 }}>
              {missing} tuần chưa lập báo cáo
            </span>
          )}
        </div>
        <div className="wr-bars">
          {trend.map(t => {
            const h = t.links > 0 ? Math.max(4, Math.round((t.links / max) * BAR_H)) : 2;
            const clickable = !!t.report;
            const title = `${formatWeek(t.key)}\n${t.links} link · ${Math.round(t.points)} điểm\n`
              + (t.isCurrent ? 'Tuần đang diễn ra' : t.report ? 'Bấm để mở báo cáo' : 'Chưa lập báo cáo');
            return (
              <button key={t.key} type="button" className="wr-bar-col" title={title}
                disabled={!clickable} onClick={() => t.report && onOpenReport(t.report)}>
                <span className="wr-bar-val">{t.links || ''}</span>
                <span className="wr-bar-track" style={{ height: BAR_H }}>
                  <span className={`wr-bar ${t.isCurrent ? 'wr-bar-current' : ''}`} style={{ height: h }} />
                </span>
                <span className={`wr-bar-label ${t.isCurrent ? 'is-current' : ''}`}>
                  {t.isCurrent ? 'Tuần này' : formatWeekShort(t.key)}
                </span>
                <span className={`wr-dot ${t.report ? 'has' : t.isCurrent ? 'cur' : 'none'}`} />
              </button>
            );
          })}
        </div>
        <div className="wr-legend">
          <span><span className="wr-dot has" /> Đã có báo cáo</span>
          <span><span className="wr-dot none" /> Chưa lập báo cáo</span>
          <span><span className="wr-legend-cur" /> Tuần đang diễn ra</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────── ReportTable ── */

function ReportTable({ reports, reportByWeek, currentWeekStart, onView, onEdit, onCopy, onDelete }: {
  reports: WeeklyReport[];
  reportByWeek: Map<string, WeeklyReport>;
  currentWeekStart: string;
  onView: (r: WeeklyReport) => void;
  onEdit: (r: WeeklyReport) => void;
  onCopy: (r: WeeklyReport) => void;
  onDelete: (r: WeeklyReport) => void;
}) {
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const rows: React.ReactNode[] = [];
  reports.forEach((r, idx) => {
    const prevWeek = reportByWeek.get(shiftKey(r.weekStart, -7));
    const linkDelta = prevWeek ? pct(r.totalLinks, prevWeek.totalLinks) : null;
    const avg = avgProgress(r);
    const isCurrent = r.weekStart === currentWeekStart;

    rows.push(
      <div key={r.id} className="wr-row" role="button" tabIndex={0}
        onClick={() => onView(r)}
        onKeyDown={e => { if (e.key === 'Enter') onView(r); }}>
        <div className="wr-c-week">
          <div style={{ fontWeight: 600 }}>{formatWeek(r.weekStart)}</div>
          <div style={{ marginTop: '3px', display: 'flex', gap: '6px', alignItems: 'center' }}>
            <StatusChip report={r} />
            {isCurrent && <span className="wr-chip wr-chip-cur">Tuần này</span>}
          </div>
        </div>
        <div className="wr-c-num">
          <div className="wr-num">{r.totalLinks.toLocaleString('vi-VN')}</div>
          {prevWeek && <Delta value={linkDelta} suffix="vs tuần trước" />}
        </div>
        <div className="wr-c-num"><div className="wr-num">{Math.round(r.totalPoints).toLocaleString('vi-VN')}</div></div>
        <div className="wr-c-num wr-c-hide-sm"><div className="wr-num">{r.projectProgress.length}</div></div>
        <div className="wr-c-prog wr-c-hide-sm">
          {avg === null ? <span style={{ color: 'var(--text-tertiary)' }}>—</span> : (
            <>
              <div className="wr-prog-track"><div className="wr-prog-fill" style={{ width: `${Math.min(100, avg)}%`, background: progressColor(avg) }} /></div>
              <span style={{ fontWeight: 700, fontSize: '0.8rem', color: progressColor(avg), minWidth: 34, textAlign: 'right' }}>{avg}%</span>
            </>
          )}
        </div>
        <div className="wr-c-act" onClick={e => e.stopPropagation()}>
          <button className="btn btn-ghost btn-sm" onClick={() => onView(r)}>Xem</button>
          <div style={{ position: 'relative' }}>
            <button className="btn btn-icon btn-ghost" aria-label="Thêm thao tác"
              onClick={() => setMenuFor(menuFor === r.id ? null : r.id)}>
              <MoreHorizontal size={16} />
            </button>
            {menuFor === r.id && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setMenuFor(null)} />
                <div className="wr-menu">
                  {!r.locked && (
                    <button onClick={() => { setMenuFor(null); onEdit(r); }}><Edit3 size={14} /> Cập nhật số liệu</button>
                  )}
                  <button onClick={() => { setMenuFor(null); onCopy(r); }}><Copy size={14} /> Copy nội dung (text)</button>
                  {!r.locked && (
                    <button className="danger" onClick={() => { setMenuFor(null); onDelete(r); }}><Trash2 size={14} /> Xóa báo cáo</button>
                  )}
                  {r.locked && <div className="wr-menu-note">Báo cáo đã chốt — không sửa/xóa được</div>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>,
    );

    /* khoảng trống giữa 2 báo cáo liên tiếp */
    const next = reports[idx + 1];
    if (next) {
      const gapWeeks = Math.round((Date.parse(r.weekStart) - Date.parse(next.weekStart)) / (7 * 86400000)) - 1;
      if (gapWeeks > 0) {
        const firstMissing = shiftKey(next.weekStart, 7);
        const lastMissing  = shiftKey(r.weekStart, -7);
        rows.push(
          <div key={`gap-${r.id}`} className="wr-gap">
            <AlertTriangle size={12} /> Không có báo cáo {gapWeeks} tuần
            ({gapWeeks === 1 ? formatWeek(firstMissing) : `${formatWeekShort(firstMissing)} → ${formatWeek(lastMissing).split(' – ')[1]}`})
          </div>,
        );
      }
    }
  });

  return (
    <div className="wr-table">
      <div className="wr-row wr-row-head">
        <div className="wr-c-week">Tuần</div>
        <div className="wr-c-num">Link</div>
        <div className="wr-c-num">Điểm</div>
        <div className="wr-c-num wr-c-hide-sm">Dự án</div>
        <div className="wr-c-prog wr-c-hide-sm" title="Trung bình % tiến độ các dự án có trong báo cáo">Tiến độ dự án (TB)</div>
        <div className="wr-c-act" />
      </div>
      {rows}
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
  const availableProjects = useMemo(() => projects.filter(p => p.status !== 'Hủy'), [projects]);
  const activeCount = useMemo(() => availableProjects.filter(p => p.status === 'Đang chạy').length, [availableProjects]);
  const doneCount = useMemo(() => availableProjects.filter(p => p.status === 'Hoàn thành').length, [availableProjects]);

  const [tab, setTab] = useState<TabKey>('data');
  const [projFilterTab, setProjFilterTab] = useState<'active' | 'done' | 'all'>('active');
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tempAdditionalContext, setTempAdditionalContext] = useState('');
  const [tempCustomerComments, setTempCustomerComments] = useState('');

  /* ── build 1 project helper ── */
  const buildWeeklyReportProject = (p: (typeof projects)[0], isPriority = false, existing?: WeeklyReportProject): WeeklyReportProject => {
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
      if (mode === 'milestone') {
        target = 1;
        progress = t.manualProgress !== undefined ? t.manualProgress : (t.isDone ? 100 : 0);
        completed = progress >= 100 ? 1 : (progress > 0 ? 0.5 : 0);
      } else if (mode === 'quantity' && t.targetQuantity && t.targetQuantity > 0) {
        completed = matched.reduce((sum, s) => sum + (s.quantity ?? 0), 0);
        target = t.targetQuantity;
        progress = Math.min(100, Math.round((completed / target) * 100));
      } else {
        completed = matched.reduce((sum, s) => sum + s.links.length, 0);
        target = Math.max(t.targetLinks, 1);
        progress = Math.min(100, Math.round((completed / target) * 100));
      }
      return {
        taskName: t.name,
        targetLinks: target,
        completedLinks: completed,
        progress,
        trackingMode: mode,
        isMilestone: mode === 'milestone',
      };
    });
    const tasksTotal     = breakdown.reduce((s, x) => s + x.targetLinks, 0);
    const tasksCompleted = Math.round(breakdown.reduce((s, x) => s + x.completedLinks, 0));
    const progress       = breakdown.length > 0
      ? Math.round(breakdown.reduce((s, x) => s + x.progress, 0) / breakdown.length)
      : (p.manualProgress ?? (p.status === 'Hoàn thành' ? 100 : 0));
    return {
      projectId: p.id, projectName: p.name,
      progress: existing?.progress ?? progress,
      tasksCompleted: existing?.tasksCompleted ?? tasksCompleted,
      tasksTotal: existing?.tasksTotal ?? tasksTotal,
      notes: existing?.notes ?? '',
      remarks: existing?.remarks ?? '',
      attentionNotes: existing?.attentionNotes ?? '',
      taskBreakdown: breakdown, isPriority,
    };
  };

  /* ── project selector state ── */
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(() => {
    if (item) return new Set((item.projectProgress || []).map(p => p.projectId));
    const set = new Set<string>();
    const wsTime = new Date(currentWeekStart).getTime();
    const weTime = wsTime + 7 * 86400000;
    (availableProjects || []).forEach(p => {
      if (p.status === 'Đang chạy') {
        set.add(p.id);
      } else if (p.status === 'Hoàn thành') {
        const hasSubThisWeek = (submissions || []).some(s => {
          if (s.projectId !== p.id) return false;
          const t = new Date(s.submittedAt).getTime();
          return !isNaN(t) && t >= wsTime && t <= weTime;
        });
        if (hasSubThisWeek) set.add(p.id);
      }
    });
    return set;
  });

  const [priorityProjectIds, setPriorityProjectIds] = useState<Set<string>>(
    () => item
      ? new Set((item.projectProgress || []).filter(p => p.isPriority).map(p => p.projectId))
      : new Set<string>()
  );

  /* ── recalc helper ── */
  const recalcFromWeek = (
    weekStart: string,
    targetProjectIds?: Set<string>,
    existingProjectProgress?: WeeklyReportProject[]
  ) => {
    const ws = new Date(weekStart);
    const we = new Date(ws); we.setDate(ws.getDate() + 6); we.setHours(23, 59, 59);
    const inRange = (submissions || []).filter(s => {
      const t = new Date(s.submittedAt).getTime();
      return !isNaN(t) && t >= ws.getTime() && t <= we.getTime();
    });
    const totalLinks  = inRange.reduce((sum, s) => sum + (s.links ? s.links.length : 0), 0);
    const totalPoints = inRange.reduce((sum, s) => sum + (s.totalPoints || 0), 0);

    const activeSelected = targetProjectIds || selectedProjectIds;
    const filteredProjects = availableProjects.filter(p => activeSelected.has(p.id));
    const existingMap = new Map((existingProjectProgress || []).map(p => [p.projectId, p]));
    const pp: WeeklyReportProject[] = filteredProjects.map(p => {
      const isPriority = priorityProjectIds.has(p.id);
      return buildWeeklyReportProject(p, isPriority, existingMap.get(p.id));
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
    const auto = recalcFromWeek(weekStart, undefined, form.projectProgress);
    setForm(f => ({ ...f, weekStart, ...auto, summary: auto.autoSummary, nextWeekPlan: auto.autoNextPlan }));
  };

  const handleAutoFill = () => {
    if (!form.weekStart) return;
    const auto = recalcFromWeek(form.weekStart, undefined, form.projectProgress);
    setForm(f => ({ ...f, ...auto, summary: auto.autoSummary, nextWeekPlan: auto.autoNextPlan }));
    toast.success('Đã làm mới toàn bộ số liệu!');
  };

  const handleAIGenerate = async () => {
    setAiLoading(true);
    try {
      const ws = form.weekStart || currentWeekStart;
      const calc = recalcFromWeek(ws, undefined, form.projectProgress);
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

  const toggleProjectSelect = (p: (typeof projects)[0]) => {
    const isSelected = selectedProjectIds.has(p.id);
    const nextSelected = new Set(selectedProjectIds);
    let nextPP = [...(form.projectProgress || [])];

    if (isSelected) {
      nextSelected.delete(p.id);
      nextPP = nextPP.filter(x => x.projectId !== p.id);
      setPriorityProjectIds(prev => {
        const n = new Set(prev);
        n.delete(p.id);
        return n;
      });
    } else {
      nextSelected.add(p.id);
      if (!nextPP.some(x => x.projectId === p.id)) {
        nextPP.push(buildWeeklyReportProject(p, priorityProjectIds.has(p.id)));
      }
    }

    setSelectedProjectIds(nextSelected);
    setForm(f => ({ ...f, projectProgress: nextPP }));
  };

  const toggleProjectPriority = (pId: string) => {
    const nextPriority = new Set(priorityProjectIds);
    const willBePriority = !nextPriority.has(pId);
    if (willBePriority) nextPriority.add(pId);
    else nextPriority.delete(pId);
    setPriorityProjectIds(nextPriority);

    const nextPP = (form.projectProgress || []).map(p =>
      p.projectId === pId ? { ...p, isPriority: willBePriority } : p
    );
    setForm(f => ({ ...f, projectProgress: nextPP }));
  };

  const displayedProjects = useMemo(() => {
    if (projFilterTab === 'active') return availableProjects.filter(p => p.status === 'Đang chạy');
    if (projFilterTab === 'done') return availableProjects.filter(p => p.status === 'Hoàn thành');
    return availableProjects;
  }, [availableProjects, projFilterTab]);

  const handleSelectAll = (projs: (typeof projects)) => {
    const nextSelected = new Set(selectedProjectIds);
    const nextPP = [...(form.projectProgress || [])];

    projs.forEach(p => {
      nextSelected.add(p.id);
      if (!nextPP.some(x => x.projectId === p.id)) {
        nextPP.push(buildWeeklyReportProject(p, priorityProjectIds.has(p.id)));
      }
    });

    setSelectedProjectIds(nextSelected);
    setForm(f => ({ ...f, projectProgress: nextPP }));
  };

  const handleDeselectAll = () => {
    setSelectedProjectIds(new Set());
    setPriorityProjectIds(new Set());
    setForm(f => ({ ...f, projectProgress: [] }));
  };

  const selectedProjectsAvgProgress = useMemo(() => {
    const pps = form.projectProgress || [];
    if (pps.length === 0) return 0;
    return Math.round(pps.reduce((s, p) => s + p.progress, 0) / pps.length);
  }, [form.projectProgress]);

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
              <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '14px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,.03)' }}>
                {secH('📦 Chọn dự án đưa vào báo cáo',
                  `Đã chọn ${selectedProjectIds.size}/${availableProjects.length} dự án · Tiến độ TB: ${selectedProjectsAvgProgress}%`,
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button type="button" onClick={() => handleSelectAll(displayedProjects)}
                      style={{ fontSize: '12px', padding: '5px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
                      Chọn tab này ({displayedProjects.length})
                    </button>
                    <button type="button" onClick={handleDeselectAll}
                      style={{ fontSize: '12px', padding: '5px 12px', background: '#f8fafc', border: '1px solid #cbd5e1', color: '#64748b', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
                      Bỏ chọn tất cả
                    </button>
                  </div>
                )}

                {/* Filter tabs: Đang chạy / Hoàn thành / Tất cả */}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                  {[
                    { key: 'active', label: `Đang chạy (${activeCount})` },
                    { key: 'done', label: `Đã hoàn thành (${doneCount})` },
                    { key: 'all', label: `Tất cả (${availableProjects.length})` },
                  ].map(tabItem => {
                    const isActive = projFilterTab === tabItem.key;
                    return (
                      <button
                        key={tabItem.key}
                        type="button"
                        onClick={() => setProjFilterTab(tabItem.key as 'active' | 'done' | 'all')}
                        style={{
                          fontSize: '12px',
                          fontWeight: isActive ? 700 : 500,
                          padding: '4px 12px',
                          borderRadius: '20px',
                          border: isActive ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                          background: isActive ? '#eff6ff' : '#fff',
                          color: isActive ? '#1d4ed8' : '#64748b',
                          cursor: 'pointer',
                          transition: 'all .15s',
                        }}>
                        {tabItem.label}
                      </button>
                    );
                  })}
                </div>

                {/* Project chips list */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {displayedProjects.length === 0 ? (
                    <div style={{ fontSize: '13px', color: '#94a3b8', padding: '12px 0' }}>
                      Không có dự án nào trong mục này.
                    </div>
                  ) : (
                    displayedProjects.map(p => {
                      const isSelected = selectedProjectIds.has(p.id);
                      const isPriority = priorityProjectIds.has(p.id);
                      const currentProgress = form.projectProgress?.find(x => x.projectId === p.id)?.progress ?? p.manualProgress ?? (p.status === 'Hoàn thành' ? 100 : 0);
                      const isDone = p.status === 'Hoàn thành';
                      const isPaused = p.status === 'Tạm dừng';

                      return (
                        <div
                          key={p.id}
                          onClick={() => toggleProjectSelect(p)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '6px 12px', borderRadius: '10px', cursor: 'pointer',
                            background: isSelected ? (isPriority ? '#fef9c3' : '#eff6ff') : '#f8fafc',
                            border: `1.5px solid ${isSelected ? (isPriority ? '#fde047' : '#bfdbfe') : '#e2e8f0'}`,
                            transition: 'all .15s', userSelect: 'none',
                          }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleProjectSelect(p)}
                            onClick={e => e.stopPropagation()}
                            style={{ accentColor: '#1d4ed8', cursor: 'pointer', width: '14px', height: '14px' }}
                          />
                          <span style={{ fontSize: '13px', fontWeight: isSelected ? 600 : 500, color: isSelected ? '#1e40af' : '#475569' }}>
                            {p.name}
                          </span>

                          {/* Status badge */}
                          {isDone ? (
                            <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: '#dcfce7', color: '#15803d', fontWeight: 700 }}>
                              ✓ Xong
                            </span>
                          ) : isPaused ? (
                            <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: '#fef3c7', color: '#b45309', fontWeight: 600 }}>
                              Tạm dừng
                            </span>
                          ) : null}

                          {/* Progress pill */}
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            color: currentProgress >= 80 ? '#16a34a' : currentProgress >= 40 ? '#2563eb' : '#ea580c',
                            background: currentProgress >= 80 ? '#f0fdf4' : currentProgress >= 40 ? '#f0f9ff' : '#fff7ed',
                            padding: '1px 5px',
                            borderRadius: '4px',
                          }}>
                            {currentProgress}%
                          </span>

                          {/* Priority Star */}
                          {isSelected && (
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                toggleProjectPriority(p.id);
                              }}
                              title={isPriority ? 'Bỏ trọng điểm' : 'Đánh dấu trọng điểm'}
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer', padding: '0',
                                color: isPriority ? '#ca8a04' : '#cbd5e1', lineHeight: 1, display: 'flex',
                              }}>
                              <Star size={13} fill={isPriority ? '#ca8a04' : 'none'} />
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div>💡 Dự án được chọn sẽ xuất hiện trong báo cáo và tính vào tiến độ trung bình (<b>{selectedProjectsAvgProgress}%</b>).</div>
                  <div>💡 Với dự án mới tạo (chưa triển khai), bạn có thể bỏ chọn để không kéo giảm tiến độ chung của toàn team.</div>
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
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: pBg, flexWrap: 'wrap', gap: '10px' }}>
                            <div style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {p.isPriority && <Star size={12} fill="#ca8a04" color="#ca8a04" />}
                              {p.projectName}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
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
                                  style={{ width: '55px', textAlign: 'center', fontSize: '13px', border: '1.5px solid #e2e8f0', borderRadius: '6px', padding: '3px 6px', outline: 'none', fontWeight: 600 }} />
                                <span style={{ color: '#94a3b8' }}>/</span>
                                <input type="number" min="0" value={p.tasksTotal}
                                  onChange={e => updateProjectProgress(idx, 'tasksTotal', parseInt(e.target.value) || 0)}
                                  style={{ width: '55px', textAlign: 'center', fontSize: '13px', border: '1.5px solid #e2e8f0', borderRadius: '6px', padding: '3px 6px', outline: 'none', fontWeight: 600 }} />
                              </div>
                            </div>
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
                                const isM = t.isMilestone || t.trackingMode === 'milestone';
                                const tProg = t.targetLinks > 0 ? Math.min(100, Math.round((t.completedLinks / t.targetLinks) * 100)) : 0;
                                const tColor = tProg >= 80 ? '#16a34a' : tProg >= 40 ? '#6366f1' : '#ea580c';
                                return (
                                  <div key={ti} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto auto', gap: '8px', alignItems: 'center', padding: '6px 8px', background: '#fff', borderRadius: '7px', border: '1px solid #f1f5f9' }}>
                                    <span style={{ fontSize: '12px', color: '#334155', fontWeight: 500 }}>
                                      {isM ? '🎯 ' : '↳ '}{t.taskName}{isM ? ' (Mốc quản lý)' : ''}
                                    </span>
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

                          {/* Remarks & Attention Notes section */}
                          <div style={{ padding: '12px 16px', background: '#fafbfc', borderTop: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                              {/* Remarks */}
                              <div>
                                <div style={{ fontSize: '11px', fontWeight: 700, color: '#2563eb', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  💬 NHẬN XÉT TIẾN ĐỘ & CHẤT LƯỢNG TUẦN
                                </div>
                                <textarea
                                  rows={2}
                                  value={p.remarks || ''}
                                  onChange={e => updateProjectProgress(idx, 'remarks', e.target.value)}
                                  placeholder="Đánh giá chất lượng, tiến độ, phản hồi brand..."
                                  style={{
                                    width: '100%', fontSize: '12px', border: '1.5px solid #bfdbfe',
                                    borderRadius: '8px', padding: '6px 10px', outline: 'none',
                                    fontFamily: 'inherit', resize: 'vertical', background: '#f8fafc',
                                    boxSizing: 'border-box',
                                  }}
                                />
                              </div>

                              {/* Attention Notes */}
                              <div>
                                <div style={{ fontSize: '11px', fontWeight: 700, color: '#b45309', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  ⚠️ LƯU Ý & ĐIỂM NGHẼN CẦN THÁO GỠ
                                </div>
                                <textarea
                                  rows={2}
                                  value={p.attentionNotes || ''}
                                  onChange={e => updateProjectProgress(idx, 'attentionNotes', e.target.value)}
                                  placeholder="Lưu ý rủi ro, chờ duyệt, thiếu visual, deadline dồn..."
                                  style={{
                                    width: '100%', fontSize: '12px', border: '1.5px solid #fed7aa',
                                    borderRadius: '8px', padding: '6px 10px', outline: 'none',
                                    fontFamily: 'inherit', resize: 'vertical', background: '#fffbeb',
                                    boxSizing: 'border-box',
                                  }}
                                />
                              </div>
                            </div>

                            {/* Quick chips */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '11px', color: '#94a3b8' }}>Gợi ý nhanh:</span>
                              {[
                                { text: '✓ Đúng tiến độ', target: 'remarks' as const },
                                { text: '⏳ Chờ khách/brand duyệt', target: 'attentionNotes' as const },
                                { text: '🎨 Thiếu visual/ảnh', target: 'attentionNotes' as const },
                                { text: '👥 Cần thêm nhân sự', target: 'attentionNotes' as const },
                                { text: '🔥 Đẩy mạnh tuần tới', target: 'remarks' as const },
                              ].map(chip => (
                                <button
                                  key={chip.text}
                                  type="button"
                                  onClick={() => {
                                    const curr = p[chip.target] || '';
                                    const next = curr ? `${curr}; ${chip.text}` : chip.text;
                                    updateProjectProgress(idx, chip.target, next);
                                  }}
                                  style={{
                                    background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '999px',
                                    padding: '2px 8px', fontSize: '11px', color: '#475569', cursor: 'pointer',
                                  }}
                                >
                                  + {chip.text}
                                </button>
                              ))}
                            </div>
                          </div>
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
