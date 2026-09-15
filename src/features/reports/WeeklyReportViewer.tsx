import { useState } from 'react';
import { X, Edit3, Save, Printer, Download, Share2, ChevronDown, ChevronUp, Star } from 'lucide-react';
import type { WeeklyReport } from '@/shared/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import toast from 'react-hot-toast';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Always returns dd/MM/yyyy — guaranteed slash separator */
function fmt(date: Date, opts: { year?: boolean } = {}): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  if (opts.year) return `${dd}/${mm}/${date.getFullYear()}`;
  return `${dd}/${mm}`;
}

function formatWeekLabel(weekStart: string): string {
  const d = new Date(weekStart);
  const end = new Date(d);
  end.setDate(d.getDate() + 6);
  return `${fmt(d)} — ${fmt(end, { year: true })}`;
}

function pStatus(p: number): { label: string; color: string; bg: string; bar: string } {
  if (p === 0) return { label: 'Critical',     color: '#dc2626', bg: '#fef2f2', bar: 'linear-gradient(90deg,#dc2626,#fb7185)' };
  if (p < 30)  return { label: 'Risk',         color: '#dc2626', bg: '#fef2f2', bar: 'linear-gradient(90deg,#dc2626,#fb7185)' };
  if (p < 60)  return { label: 'Watch',        color: '#b45309', bg: '#fffbeb', bar: 'linear-gradient(90deg,#f59e0b,#f97316)' };
  if (p < 80)  return { label: 'In progress',  color: '#2563eb', bg: '#eff6ff', bar: 'linear-gradient(90deg,#2563eb,#7c3aed)' };
  if (p >= 100) return { label: '✓ Hoàn thành', color: '#16a34a', bg: '#ecfdf5', bar: 'linear-gradient(90deg,#16a34a,#059669)' };
  return              { label: '✓ On track',   color: '#16a34a', bg: '#ecfdf5', bar: 'linear-gradient(90deg,#16a34a,#059669)' };
}

const AUTO = (
  <span style={{
    fontSize: '9px', fontWeight: 800, letterSpacing: '.5px', textTransform: 'uppercase',
    background: '#ecfdf5', color: '#16a34a', padding: '1px 4px',
    borderRadius: '3px', border: '1px solid #bbf7d0', lineHeight: 1.4,
    display: 'inline-block', marginLeft: '5px', verticalAlign: 'middle',
  }}>AUTO</span>
);

// ─── HTML Export ─────────────────────────────────────────────────────────────

function buildWeeklyHtml(report: WeeklyReport, weekLabel: string): string {
  const riskCount = report.projectProgress.filter(p => p.progress < 30).length;
  const totalLinks = report.totalLinks;
  const totalPoints = Math.round(report.totalPoints);
  const pctTarget = (a: number, b?: number) => b ? Math.round((a / b) * 100) : 0;

  const projectRows = report.projectProgress.map(p => {
    const s = pStatus(p.progress);
    const backlog = Math.max(0, p.tasksTotal - p.tasksCompleted);
    const taskRows = (p.taskBreakdown || []).map(t => {
      const isMilestone = t.isMilestone || t.trackingMode === 'milestone';
      const tColor = t.progress >= 80 ? '#16a34a' : t.progress >= 40 ? '#2563eb' : '#ea580c';
      const tProgressText = isMilestone
        ? (t.progress >= 100 ? '✓ Đã xong (Mốc)' : `${t.progress}% (Mốc)`)
        : `${t.completedLinks}/${t.targetLinks} (${t.progress}%)`;
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:#f8fafc;border-left:3px solid ${tColor};border-radius:0 6px 6px 0;margin-bottom:4px">
        <span style="font-size:12px;color:#475569">${isMilestone ? '🎯' : '↳'} ${t.taskName}</span>
        <span style="font-size:12px;font-weight:700;color:${tColor}">${tProgressText}</span>
      </div>`;
    }).join('');
    const priorityBadge = p.isPriority
      ? `<span style="font-size:11px;background:#fef9c3;color:#ca8a04;border:1px solid #fde047;border-radius:999px;padding:2px 8px;margin-left:6px">⭐ Trọng điểm</span>`
      : '';
    return `
      <div style="border:1px solid ${p.isPriority ? '#fde047' : '#e2e8f0'};border-top:3px solid ${s.color};border-radius:12px;padding:16px;background:#fff;box-shadow:${p.isPriority ? '0 0 0 2px #fef08a' : 'none'}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
          <div>
            <div style="font-weight:700;font-size:14px;color:#0f172a">${p.projectName}${priorityBadge}</div>
            <div style="font-size:11px;color:#64748b;margin-top:4px">
              <span style="background:#f1f5f9;padding:2px 6px;border-radius:4px">Hoàn thành: <b>${p.tasksCompleted}/${p.tasksTotal}</b></span>
              ${backlog > 0 ? `<span style="background:#fff1f2;color:#e11d48;padding:2px 6px;border-radius:4px;margin-left:6px">Tồn đọng: <b>${backlog}</b></span>` : ''}
            </div>
          </div>
          <span style="font-size:11px;font-weight:800;color:${s.color};background:${s.bg};padding:4px 10px;border-radius:999px;border:1px solid ${s.color}33">${s.label}</span>
        </div>
        <div style="height:10px;border-radius:999px;background:#e5e7eb;overflow:hidden;margin:8px 0">
          <div style="height:100%;width:${p.progress}%;background:${s.bar};border-radius:999px"></div>
        </div>
        <b style="color:#0f172a;font-size:14px">${p.progress}%</b>
        ${p.remarks ? `<div style="background:#f8fafc;border-left:3px solid #3b82f6;padding:6px 10px;border-radius:0 6px 6px 0;margin-top:8px;font-size:12px;color:#1e293b">💬 <b>Đánh giá:</b> ${p.remarks}</div>` : ''}
        ${p.attentionNotes ? `<div style="background:#fffbeb;border-left:3px solid #f59e0b;padding:6px 10px;border-radius:0 6px 6px 0;margin-top:6px;font-size:12px;color:#92400e">⚠️ <b>Lưu ý/Rủi ro:</b> ${p.attentionNotes}</div>` : ''}
        ${!p.remarks && !p.attentionNotes && p.notes ? `<div style="font-size:12px;color:#64748b;font-style:italic;margin-top:6px">↳ ${p.notes}</div>` : ''}
        ${taskRows ? `<div style="margin-top:10px">${taskRows}</div>` : ''}
      </div>`;
  }).join('');

  const teamRows = (report.taskBreakdownByTeam || []).map(team => {
    const tl = team.items.reduce((s, i) => s + i.links, 0);
    const tp = Math.round(team.items.reduce((s, i) => s + i.points, 0));
    const itemRows = team.items.map(item => `
      <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px dashed #e2e8f0;font-size:12px">
        <span style="color:#475569">${item.label}</span>
        <span style="font-weight:600;color:#0f172a">${item.links} · <span style="color:#16a34a">${Math.round(item.points)}</span></span>
      </div>`).join('');
    return `
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
        <div style="padding:10px 14px;border-bottom:1px solid #f1f5f9;background:#f8fafc;display:flex;justify-content:space-between;align-items:center">
          <div style="display:flex;align-items:center;gap:8px">
            <div style="width:10px;height:10px;border-radius:50%;background:${team.color}"></div>
            <b style="font-size:13px">${team.team}</b>
          </div>
          <div><b style="font-size:14px">${tl} link</b> · <b style="color:#16a34a">${tp} điểm</b></div>
        </div>
        <div style="padding:8px 14px">${itemRows}</div>
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Báo cáo tuần — ${weekLabel}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter', sans-serif; background: #f1f5f9; color: #0f172a; }
.page { width: min(1120px, calc(100% - 32px)); margin: 24px auto 60px; }
h2 { font-size: 22px; font-weight: 700; letter-spacing: -.5px; color: #0f172a; margin-bottom: 14px; }
.sub { font-size: 13px; color: #64748b; float: right; }
.hero { position: relative; overflow: hidden; border-radius: 28px; padding: 32px; color: #fff;
  background: linear-gradient(135deg,#0f172a 0%,#1d4ed8 56%,#7c3aed 100%);
  box-shadow: 0 18px 48px rgba(15,23,42,.18); margin-bottom: 24px; }
.hero-grid { display: grid; grid-template-columns: 1.5fr .85fr; gap: 24px; align-items: end; }
.hero-badge { display:inline-flex;gap:8px;align-items:center;padding:6px 12px;border-radius:999px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.24);font-size:13px;margin-bottom:10px }
.hero h1 { font-size: clamp(26px,4vw,46px); letter-spacing:-1.5px; line-height:1.06; font-weight:900; margin-bottom:10px }
.hero p { color:rgba(255,255,255,.82); font-size:14px; line-height:1.65; max-width:640px }
.mini-stats { background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.22); border-radius:22px; padding:18px; }
.mini-stats .big { font-size:40px; font-weight:900; line-height:1; margin-bottom:4px }
.mini-stats .label { color:rgba(255,255,255,.75); font-size:13px; margin-bottom:14px }
.mini-stats .row { display:flex; justify-content:space-between; font-size:13px; color:rgba(255,255,255,.8); margin-bottom:6px }
.kpi-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:24px }
.kpi-card { background:rgba(255,255,255,.92); border:1px solid #e2e8f0; border-radius:20px; padding:18px; box-shadow:0 6px 20px rgba(15,23,42,.05) }
.kpi-icon { width:42px;height:42px;border-radius:13px;display:grid;place-items:center;font-size:20px;margin-bottom:12px }
.kpi-val { font-size:24px; font-weight:900; letter-spacing:-1px; color:#0f172a; line-height:1 }
.kpi-note { font-size:12px; font-weight:600; margin-top:8px }
.proj-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; margin-bottom:24px }
.team-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:16px; margin-bottom:24px }
.bottleneck { padding:20px; border-radius:20px; background:linear-gradient(135deg,#fff1f2,#ffe4e6); border:1px solid #fda4af; margin-bottom:0 }
.action { padding:20px; border-radius:20px; background:linear-gradient(135deg,#eff6ff,#faf5ff); border:1px solid #dbeafe; color:#1e3a8a }
.two-col { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:24px }
.footer { text-align:center; color:#94a3b8; font-size:11px; padding-top:18px; border-top:1px solid #e2e8f0; margin-top:8px }
@media (max-width:860px) { .hero-grid,.proj-grid,.two-col { grid-template-columns:1fr !important } .kpi-grid { grid-template-columns:repeat(2,1fr) } }
</style>
</head>
<body>
<div class="page">
  <div class="hero">
    <div style="position:absolute;right:-80px;top:-80px;width:260px;height:260px;border-radius:50%;background:rgba(255,255,255,.08);pointer-events:none"></div>
    <div class="hero-grid">
      <div>
        <div class="hero-badge">📊 Weekly Report · Team Content</div>
        <h1>Báo cáo tuần<br><span style="font-size:.72em;letter-spacing:-.4px">${weekLabel}</span></h1>
        <p>${report.summary || 'Tổng hợp kết quả hoạt động và tiến độ dự án trong tuần.'}</p>
      </div>
      <div class="mini-stats">
        <div class="big">${totalLinks}</div>
        <div class="label">Tổng link trong tuần <span style="font-size:9px;font-weight:800;background:#ecfdf5;color:#16a34a;padding:1px 4px;border-radius:3px;border:1px solid #bbf7d0">AUTO</span></div>
        <div class="row"><span>Tổng điểm</span><b>${totalPoints}</b></div>
        <div class="row"><span>Dự án theo dõi</span><b>${report.projectProgress.length}</b></div>
        <div class="row"><span>Dự án rủi ro</span><b style="color:${riskCount > 0 ? '#fca5a5' : '#86efac'}">${riskCount}</b></div>
      </div>
    </div>
  </div>

  <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:14px">
    <h2>1. KPI Tuần &amp; Chất lượng</h2><span class="sub">Thực tế so với mục tiêu đặt ra</span>
  </div>
  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-icon" style="background:#eff6ff">🔗</div>
      <div style="font-size:12px;color:#64748b;margin-bottom:4px">Tổng link</div>
      <div class="kpi-val">${totalLinks}/${report.kpiTargetLinks || 0}</div>
      <div class="kpi-note" style="color:#2563eb">Đạt ${pctTarget(totalLinks, report.kpiTargetLinks)}% target</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon" style="background:#ecfdf5">🏁</div>
      <div style="font-size:12px;color:#64748b;margin-bottom:4px">Tổng điểm</div>
      <div class="kpi-val">${totalPoints}/${Math.round(report.kpiTargetPoints || 0)}</div>
      <div class="kpi-note" style="color:#16a34a">Đạt ${pctTarget(totalPoints, report.kpiTargetPoints)}% target</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon" style="background:#f5f3ff">✨</div>
      <div style="font-size:12px;color:#64748b;margin-bottom:4px">Chất lượng</div>
      <div class="kpi-val">${report.kpiQuality ?? 100}%</div>
      <div class="kpi-note" style="color:#7c3aed">Tỉ lệ bài viết Pass</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon" style="background:#fef2f2">🚧</div>
      <div style="font-size:12px;color:#64748b;margin-bottom:4px">Dự án rủi ro</div>
      <div class="kpi-val">${riskCount}</div>
      <div class="kpi-note" style="color:#dc2626">Dưới 30% tiến độ</div>
    </div>
  </div>

  ${report.projectProgress.length > 0 ? `
  <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:14px">
    <h2>2. Tiến độ dự án &amp; Backlog</h2><span class="sub">Tự động tính từ dữ liệu dự án</span>
  </div>
  <div class="proj-grid">${projectRows}</div>
  ` : ''}

  ${(report.taskBreakdownByTeam || []).length > 0 ? `
  <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:14px">
    <h2>3. Chi tiết đầu việc</h2><span class="sub">Sản lượng và điểm gộp theo Team</span>
  </div>
  <div class="team-grid">${teamRows}</div>
  ` : ''}

  <div class="two-col">
    <div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:14px">
        <h2>4. Điểm nghẽn &amp; Rủi ro</h2><span class="sub">Phân loại theo mức độ ảnh hưởng</span>
      </div>
      <div class="bottleneck">
        <div style="font-size:13px;color:#9f1239;line-height:1.7">${(report.bottlenecks || 'Chưa ghi nhận điểm nghẽn nào.').replace(/\n/g, '<br>')}</div>
      </div>
    </div>
    <div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:14px">
        <h2>5. Action plan tuần tới</h2><span class="sub">Ưu tiên xử lý</span>
      </div>
      <div class="action">
        <div style="font-size:13px;line-height:1.7;font-weight:500">${(report.nextWeekPlan || 'Chưa có kế hoạch.').replace(/\n/g, '<br>')}</div>
      </div>
    </div>
  </div>

  ${report.managerAssessment ? `
  <div style="padding:16px 18px;border-radius:16px;background:#f0fdf4;border:1px solid #bbf7d0;margin-bottom:20px">
    <div style="font-weight:700;color:#15803d;margin-bottom:8px;font-size:14px">✅ Nhận xét manager</div>
    <div style="font-size:13px;color:#166534;line-height:1.7">${report.managerAssessment.replace(/\n/g, '<br>')}</div>
  </div>` : ''}

  ${report.aiAssessment ? `
  <div style="padding:16px 18px;border-radius:16px;background:#f5f3ff;border:1px solid #ddd6fe;margin-bottom:20px">
    <div style="font-weight:700;color:#6d28d9;margin-bottom:8px;font-size:14px">✨ Đánh giá AI</div>
    <div style="font-size:13px;color:#4c1d95;line-height:1.7">${report.aiAssessment.replace(/\n/g, '<br>')}</div>
  </div>` : ''}

  <div class="footer">Long Châu Content Studio · Weekly Content Dashboard · Xuất lúc ${new Date().toLocaleString('vi-VN')}</div>
</div>
</body>
</html>`;
}

// ─── component ──────────────────────────────────────────────────────────────

interface Props {
  report: WeeklyReport;
  canEdit: boolean;
  onClose: () => void;
  onSave: (updates: Partial<WeeklyReport>) => void;
  /** Khi true: ẩn nút edit/save, hiển thị như trang share công khai */
  isShareMode?: boolean;
}

export default function WeeklyReportViewer({ report, canEdit, onClose, onSave, isShareMode = false }: Props) {
  const [editing, setEditing]   = useState(false);
  const [draft, setDraft]       = useState<Partial<WeeklyReport>>({});
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});

  // draft-aware field getter
  const val = <K extends keyof WeeklyReport>(field: K): string =>
    String((draft[field] ?? report[field]) ?? '');

  const set = <K extends keyof WeeklyReport>(field: K, value: string) =>
    setDraft(d => ({ ...d, [field]: value }));

  const handleSave = () => {
    onSave(draft);
    setDraft({});
    setEditing(false);
  };
  const handleCancel = () => { setDraft({}); setEditing(false); };

  // ── auto-calculated values ─────────────────────────────────────────────
  const totalLinks   = report.totalLinks;
  const totalPoints  = Math.round(report.totalPoints);

  const riskCount    = report.projectProgress.filter(p => p.progress < 30).length;
  const weekLabel    = formatWeekLabel(report.weekStart);

  const pctTarget = (act: number, tgt: number | undefined) => tgt ? Math.round((act / tgt) * 100) : 0;

  const handleShareLink = () => {
    const url = `${window.location.origin}/share/weekly-report?id=${report.id}`;
    navigator.clipboard.writeText(url);
    toast.success('Đã sao chép link báo cáo công khai!');
  };

  const handleDownloadHtml = () => {
    const html = buildWeeklyHtml(report, weekLabel);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bao-cao-tuan-${report.weekStart}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Đã tải HTML báo cáo!');
  };

  // ── styles ─────────────────────────────────────────────────────────────
  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 9000,
    background: '#f1f5f9', overflowY: 'auto',
  };
  const toolbar: React.CSSProperties = {
    position: 'sticky', top: 0, zIndex: 10,
    background: 'rgba(255,255,255,.97)', backdropFilter: 'blur(14px)',
    borderBottom: '1px solid #e2e8f0',
    padding: '10px 20px', display: 'flex', gap: '8px', alignItems: 'center',
    boxShadow: '0 2px 12px rgba(0,0,0,.08)',
  };
  const page: React.CSSProperties = {
    width: 'min(1120px, calc(100% - 32px))', margin: '24px auto 60px',
  };

  const sectionTitle = (label: string, sub?: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', margin: '0 0 14px' }}>
      <h2 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-.5px', color: '#0f172a' }}>{label}</h2>
      {sub && <span style={{ fontSize: '13px', color: '#64748b' }}>{sub}</span>}
    </div>
  );



  const editArea = (field: keyof WeeklyReport, rows = 4, placeholder = '') => (
    <textarea
      value={val(field)}
      onChange={e => set(field, e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{
        width: '100%', border: '2px solid #3b82f6', borderRadius: '8px', padding: '10px',
        fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', color: '#334155',
        background: '#fff', outline: 'none', lineHeight: 1.6,
      }}
    />
  );

  // ── team bar chart ─────────────────────────────────────────────────────
  const teamData = report.taskBreakdownByTeam ?? [];
  const maxTeamLinks = Math.max(...teamData.map(t => t.items.reduce((s, i) => s + i.links, 0)), 1);

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={overlay} id="weekly-report-viewer">
      {/* ─ toolbar ─ */}
      <div style={toolbar}>
        <span style={{ fontWeight: 700, fontSize: '0.9rem', flex: 1, color: '#0f172a' }}>
          📊 Báo cáo tuần {weekLabel}
          {report.locked && (
            <span style={{ marginLeft: '10px', fontSize: '11px', background: '#f1f5f9',
              color: '#64748b', borderRadius: '999px', padding: '2px 8px', fontWeight: 600 }}>
              🔒 Đã chốt
            </span>
          )}
        </span>

        {/* Share link button */}
        {!isShareMode && (
          <button className="btn btn-secondary" style={{ fontSize: '13px',
            background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', border: '1px solid #93c5fd', color: '#1d4ed8', fontWeight: 600 }}
            onClick={handleShareLink} title="Copy link xem công khai (không cần đăng nhập)">
            <Share2 size={13} /> Chia sẻ link
          </button>
        )}

        {/* Download HTML */}
        <button className="btn btn-secondary" style={{ fontSize: '13px',
          background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: '1px solid #86efac', color: '#15803d', fontWeight: 600 }}
          onClick={handleDownloadHtml} title="Tải file HTML báo cáo">
          <Download size={13} /> Tải HTML
        </button>

        {canEdit && !report.locked && !editing && !isShareMode && (
          <button className="btn btn-secondary" style={{ fontSize: '13px' }} onClick={() => setEditing(true)}>
            <Edit3 size={13} /> Chỉnh sửa
          </button>
        )}
        {editing && (
          <>
            <button className="btn btn-primary" style={{ fontSize: '13px', background: 'linear-gradient(135deg,#16a34a,#15803d)', border: 'none' }} onClick={handleSave}>
              <Save size={13} /> Lưu
            </button>
            <button className="btn btn-ghost" style={{ fontSize: '13px' }} onClick={handleCancel}>
              <X size={13} /> Huỷ
            </button>
          </>
        )}
        <button className="btn btn-ghost" style={{ fontSize: '13px' }} onClick={() => window.print()}>
          <Printer size={13} /> In PDF
        </button>
        {!isShareMode && (
          <button className="btn btn-icon btn-ghost" onClick={onClose} title="Đóng">
            <X size={16} />
          </button>
        )}
      </div>

      <div style={page}>
        {/* ─ hero ─ */}
        <section style={{
          position: 'relative', overflow: 'hidden', borderRadius: '28px', padding: '32px', color: '#fff',
          background: 'linear-gradient(135deg,#0f172a 0%,#1d4ed8 56%,#7c3aed 100%)',
          boxShadow: '0 18px 48px rgba(15,23,42,.18)', marginBottom: '24px',
        }}>
          <div style={{ position: 'absolute', right: '-80px', top: '-80px', width: '260px', height: '260px',
            borderRadius: '50%', background: 'rgba(255,255,255,.08)', pointerEvents: 'none' }} />
          <div style={{
            position: 'relative', zIndex: 1,
            display: 'grid', gridTemplateColumns: '1.5fr .85fr', gap: '24px', alignItems: 'end',
          }}>
            <div>
              <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center', padding: '6px 12px',
                borderRadius: '999px', background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.24)',
                fontSize: '13px', marginBottom: '10px' }}>
                📊 Weekly Report · Team Content
              </div>
              <h1 style={{ fontSize: 'clamp(26px,4vw,46px)', letterSpacing: '-1.5px', lineHeight: 1.06,
                fontWeight: 900, margin: '0 0 10px' }}>
                Báo cáo tuần<br />
                <span style={{ fontSize: '.72em', letterSpacing: '-.4px' }}>{weekLabel}</span>
              </h1>
              {editing ? (
                <textarea value={val('summary')} onChange={e => set('summary', e.target.value)} rows={2}
                  placeholder="Tổng quan tuần này..."
                  style={{ width: '100%', background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.35)',
                    color: '#fff', borderRadius: '8px', padding: '8px 10px', fontSize: '14px',
                    resize: 'vertical', fontFamily: 'inherit', outline: 'none' }} />
              ) : (
                <p style={{ color: 'rgba(255,255,255,.82)', fontSize: '14px', lineHeight: 1.65, maxWidth: '640px' }}>
                  {val('summary') || 'Tổng hợp kết quả hoạt động và tiến độ dự án trong tuần.'}
                </p>
              )}
            </div>

            {/* mini stats panel */}
            <div style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.22)',
              borderRadius: '22px', padding: '18px', backdropFilter: 'blur(8px)' }}>
              <div style={{ fontSize: '40px', fontWeight: 900, lineHeight: 1, marginBottom: '4px' }}>{totalLinks}</div>
              <div style={{ color: 'rgba(255,255,255,.75)', fontSize: '13px', marginBottom: '14px' }}>
                Tổng link trong tuần {AUTO}
              </div>
              {[
                ['Tổng điểm', `${totalPoints}`],
                ['Dự án theo dõi', `${report.projectProgress.length}`],
                ['Dự án rủi ro',   `${riskCount}`, riskCount > 0 ? '#fca5a5' : '#86efac'],
              ].map(([k, v, c]) => (
                <div key={k as string} style={{ display: 'flex', justifyContent: 'space-between',
                  fontSize: '13px', color: 'rgba(255,255,255,.8)', marginBottom: '6px' }}>
                  <span>{k as string}</span>
                  <b style={{ color: (c as string) || '#fff' }}>{v as string}</b>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─ KPI cards ─ */}
        {sectionTitle('1. KPI Tuần & Chất lượng', 'Thực tế so với mục tiêu đặt ra')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '14px', marginBottom: '24px' }}>
          {([
            { icon: '🔗', label: 'Tổng link',     value: `${totalLinks}/${report.kpiTargetLinks || 0}`, note: `Đạt ${pctTarget(totalLinks, report.kpiTargetLinks)}% target`, iconBg: '#eff6ff',  iconC: '#2563eb', auto: true },
            { icon: '🏁', label: 'Tổng điểm',     value: `${totalPoints}/${Math.round(report.kpiTargetPoints || 0)}`, note: `Đạt ${pctTarget(totalPoints, report.kpiTargetPoints)}% target`, iconBg: '#ecfdf5',  iconC: '#16a34a', auto: true },
            { icon: '✨', label: 'Chất lượng',    value: `${report.kpiQuality ?? 100}%`, note: 'Tỉ lệ bài viết Pass',               iconBg: '#f5f3ff',  iconC: '#7c3aed', auto: false },
            { icon: '🚧', label: 'Dự án rủi ro',  value: riskCount,             note: 'Dưới 30% tiến độ',                              iconBg: '#fef2f2',  iconC: '#dc2626', auto: true },
          ] as const).map((k, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,.92)', border: '1px solid #e2e8f0',
              borderRadius: '20px', padding: '18px', boxShadow: '0 6px 20px rgba(15,23,42,.05)' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '13px', display: 'grid', placeItems: 'center',
                fontSize: '20px', marginBottom: '12px', background: k.iconBg }}>
                {k.icon}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', display: 'flex', alignItems: 'center' }}>
                {k.label}{k.auto ? AUTO : null}
              </div>
              <div style={{ fontSize: '24px', fontWeight: 900, letterSpacing: '-1px', color: '#0f172a', lineHeight: 1 }}>
                {k.value}
              </div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: k.iconC, marginTop: '8px' }}>{k.note}</div>
            </div>
          ))}
        </div>

        {/* ─ project progress ─ */}
        {report.projectProgress.length > 0 && (
          <>
            {sectionTitle('2. Tiến độ dự án & Backlog', 'Tự động tính từ dữ liệu dự án')}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '12px', marginBottom: '24px' }}>
              {report.projectProgress.map((p, i) => {
                const s = pStatus(p.progress);
                const backlog = Math.max(0, p.tasksTotal - p.tasksCompleted);
                const isExpanded = !!expandedProjects[p.projectId];
                const hasTasks = (p.taskBreakdown || []).length > 0;

                return (
                  <div key={i} style={{
                    border: `1px solid ${p.isPriority ? '#fde047' : '#e2e8f0'}`,
                    borderTop: `3px solid ${s.color}`,
                    borderRadius: '16px', padding: '14px', background: '#fff',
                    boxShadow: p.isPriority ? '0 0 0 2px #fef08a' : '0 2px 8px rgba(0,0,0,.04)',
                    transition: 'box-shadow .2s',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                      <div>
                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          {p.projectName}
                          {p.isPriority && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '11px', fontWeight: 700,
                              background: '#fef9c3', color: '#ca8a04', border: '1px solid #fde047',
                              borderRadius: '999px', padding: '2px 8px' }}>
                              <Star size={9} fill="#ca8a04" /> Trọng điểm
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>Hoàn thành: <b>{p.tasksCompleted}/{p.tasksTotal}</b></span>
                          {backlog > 0 && <span style={{ background: '#fff1f2', color: '#e11d48', padding: '2px 6px', borderRadius: '4px' }}>Tồn đọng (Backlog): <b>{backlog}</b></span>}
                        </div>
                      </div>
                      <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: '999px',
                        padding: '4px 10px', fontSize: '11px', fontWeight: 800,
                        background: s.bg, color: s.color, whiteSpace: 'nowrap', border: `1px solid ${s.color}33` }}>
                        {s.label}
                      </span>
                    </div>

                    {/* progress bar */}
                    <div style={{ height: '10px', borderRadius: '999px', background: '#e5e7eb', overflow: 'hidden', margin: '8px 0' }}>
                      <div style={{ height: '100%', width: `${p.progress}%`, borderRadius: '999px',
                        background: s.bar, transition: 'width .4s' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', fontSize: '12px' }}>
                      <b style={{ color: '#0f172a', fontSize: '14px' }}>{p.progress}%</b>
                      {!p.remarks && !p.attentionNotes && p.notes && (
                        <span style={{ fontStyle: 'italic', maxWidth: '70%', textAlign: 'right', lineHeight: 1.4 }}>{p.notes}</span>
                      )}
                    </div>

                    {/* Remarks box */}
                    {p.remarks && (
                      <div style={{
                        background: '#f8fafc', borderLeft: '3px solid #3b82f6',
                        borderRadius: '0 8px 8px 0', padding: '8px 10px', marginTop: '8px',
                        fontSize: '12px', color: '#1e293b',
                      }}>
                        <div style={{ fontWeight: 700, fontSize: '11px', color: '#1d4ed8', marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          💬 ĐÁNH GIÁ TIẾN ĐỘ & CHẤT LƯỢNG
                        </div>
                        <div style={{ lineHeight: 1.5, whiteSpace: 'pre-line' }}>{p.remarks}</div>
                      </div>
                    )}

                    {/* Attention / Risks box */}
                    {p.attentionNotes && (
                      <div style={{
                        background: '#fffbeb', borderLeft: '3px solid #f59e0b',
                        borderRadius: '0 8px 8px 0', padding: '8px 10px', marginTop: '6px',
                        fontSize: '12px', color: '#92400e',
                      }}>
                        <div style={{ fontWeight: 700, fontSize: '11px', color: '#b45309', marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          ⚠️ LƯU Ý & ĐIỂM NGHẼN CẦN THÁO GỠ
                        </div>
                        <div style={{ lineHeight: 1.5, whiteSpace: 'pre-line' }}>{p.attentionNotes}</div>
                      </div>
                    )}

                    {/* expandable task breakdown */}
                    {hasTasks && (
                      <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: '8px', marginTop: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: '#475569', letterSpacing: '.5px' }}>
                            📌 HẠNG MỤC ({p.taskBreakdown!.length})
                          </span>
                          <button
                            onClick={() => setExpandedProjects(prev => ({ ...prev, [p.projectId]: !prev[p.projectId] }))}
                            style={{
                              background: isExpanded ? '#f1f5f9' : '#eff6ff',
                              border: `1px solid ${isExpanded ? '#cbd5e1' : '#bfdbfe'}`,
                              borderRadius: '6px', cursor: 'pointer',
                              fontSize: '11px', fontWeight: 700,
                              color: isExpanded ? '#475569' : '#1d4ed8',
                              display: 'inline-flex', alignItems: 'center', gap: '3px',
                              padding: '4px 10px', transition: 'all .2s',
                            }}
                          >
                            {isExpanded
                              ? <><span>Thu gọn</span><ChevronUp size={11} /></>
                              : <><span>+ Xem {p.taskBreakdown!.length} hạng mục</span><ChevronDown size={11} /></>
                            }
                          </button>
                        </div>

                        {isExpanded && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                            {p.taskBreakdown!.map((t, ti) => {
                              const isMilestone = t.isMilestone || t.trackingMode === 'milestone';
                              const tColor = t.progress >= 80 ? '#10b981' : t.progress >= 40 ? '#2563eb' : '#f59e0b';
                              const tBg = t.progress >= 80 ? '#f0fdf4' : t.progress >= 40 ? '#eff6ff' : '#fffbeb';
                              const tBadge = t.progress >= 80 ? '#dcfce7' : t.progress >= 40 ? '#dbeafe' : '#fef3c7';
                              const tBadgeText = isMilestone
                                ? (t.progress >= 100 ? '✓ Xong (Mốc)' : `${t.progress}% (Mốc)`)
                                : `${t.completedLinks}/${t.targetLinks} (${t.progress}%)`;
                              return (
                                <div key={ti} style={{
                                  background: tBg,
                                  border: `1px solid rgba(226,232,240,.6)`,
                                  borderLeft: `4px solid ${tColor}`,
                                  padding: '8px 10px', borderRadius: '0 8px 8px 0',
                                }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                                    <span style={{ fontWeight: 700, fontSize: '12px', color: '#1e293b', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '170px' }} title={t.taskName}>
                                      {isMilestone ? '🎯 ' : ''}{t.taskName}
                                    </span>
                                    <span style={{ fontSize: '11px', fontWeight: 800, color: tColor, background: tBadge, padding: '2px 8px', borderRadius: '6px' }}>
                                      {tBadgeText}
                                    </span>
                                  </div>
                                  {t.targetLinks > 0 && (
                                    <div style={{ height: '5px', background: '#cbd5e1', borderRadius: '999px', overflow: 'hidden' }}>
                                      <div style={{ width: `${Math.min(100, t.progress)}%`, height: '100%', background: tColor, borderRadius: '999px' }} />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ─ task breakdown table + mini bar chart ─ */}
        {(report.taskBreakdownByTeam ?? []).length > 0 && (
          <>
            {sectionTitle('3. Chi tiết đầu việc', 'Sản lượng và điểm gộp theo Team')}

            {/* Team bar chart */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '16px', marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '12px', letterSpacing: '.3px' }}>📊 So sánh sản lượng theo nhóm</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {teamData.map((team, idx) => {
                  const tl = team.items.reduce((s, i) => s + i.links, 0);
                  const barW = Math.max(4, Math.round((tl / maxTeamLinks) * 100));
                  return (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569', minWidth: '170px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {team.team}
                      </div>
                      <div style={{ flex: 1, height: '20px', background: '#f1f5f9', borderRadius: '6px', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${barW}%`,
                          background: `linear-gradient(90deg, ${team.color}, ${team.color}cc)`,
                          borderRadius: '6px', transition: 'width .5s ease',
                          display: 'flex', alignItems: 'center', paddingLeft: '8px',
                        }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{tl} link</span>
                        </div>
                      </div>
                      <div style={{ fontSize: '12px', color: '#16a34a', fontWeight: 700, minWidth: '60px', textAlign: 'right' }}>
                        {Math.round(team.items.reduce((s, i) => s + i.points, 0))}đ
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              {report.taskBreakdownByTeam!.map((team, idx) => {
                const teamTotalLinks = team.items.reduce((s, i) => s + i.links, 0);
                const teamTotalPoints = Math.round(team.items.reduce((s, i) => s + i.points, 0));
                return (
                  <div key={idx} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: team.color }} />
                        <b style={{ fontSize: '14px', color: '#0f172a' }}>{team.team}</b>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <b style={{ fontSize: '15px', color: '#0f172a' }}>{teamTotalLinks} <span style={{ fontSize: '12px', fontWeight: 400 }}>link</span></b>
                        <span style={{ margin: '0 6px', color: '#cbd5e1' }}>|</span>
                        <b style={{ fontSize: '15px', color: '#16a34a' }}>{teamTotalPoints} <span style={{ fontSize: '12px', fontWeight: 400 }}>điểm</span></b>
                      </div>
                    </div>
                    <div style={{ padding: '8px 16px', maxHeight: '180px', overflowY: 'auto' }}>
                      {team.items.map((item, j) => (
                        <div key={j} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: j < team.items.length - 1 ? '1px dashed #e2e8f0' : 'none' }}>
                          <span style={{ fontSize: '13px', color: '#475569' }}>{item.label}</span>
                          <div style={{ fontSize: '13px', fontWeight: 600 }}>
                            <span style={{ color: '#0f172a' }}>{item.links}</span>
                            <span style={{ margin: '0 4px', color: '#cbd5e1', fontWeight: 400 }}>·</span>
                            <span style={{ color: '#16a34a' }}>{Math.round(item.points)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ─ bottlenecks + action plan ─ */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
          {/* bottlenecks — red-pink */}
          <div>
            {sectionTitle('4. Điểm nghẽn & Rủi ro', 'Phân loại theo mức độ ảnh hưởng')}
            <div style={{
              padding: '20px', borderRadius: '20px',
              background: 'linear-gradient(135deg,#fff1f2,#ffe4e6)',
              border: '1px solid #fda4af',
            }}>
              {editing ? editArea('bottlenecks', 7, 'Mỗi điểm nghẽn cách nhau một dòng trống...') :
              val('bottlenecks') ? (
                <div style={{ fontSize: '13px', color: '#9f1239', lineHeight: 1.65 }}>
                  <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{val('bottlenecks')}</ReactMarkdown></div>
                </div>
              ) : (
                <p style={{ color: '#f43f5e', fontSize: '13px', textAlign: 'center', padding: '24px 0', fontStyle: 'italic' }}>
                  Chưa ghi nhận điểm nghẽn nào. ✅
                </p>
              )}
            </div>
          </div>

          {/* action plan */}
          <div>
            {sectionTitle('5. Action plan tuần tới', 'Ưu tiên xử lý')}
            <div style={{ padding: '20px', borderRadius: '20px',
              background: 'linear-gradient(135deg,#eff6ff,#faf5ff)',
              border: '1px solid #dbeafe', color: '#1e3a8a' }}>
              {editing ? (
                editArea('nextWeekPlan', 7, 'Mỗi action trên một dòng...')
              ) : val('nextWeekPlan') ? (
                <div style={{ fontSize: '13px', lineHeight: 1.65, fontWeight: 500 }}>
                  <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{val('nextWeekPlan')}</ReactMarkdown></div>
                </div>
              ) : (
                <p style={{ color: '#6b7280', fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>
                  Chưa có kế hoạch tuần tới.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ─ issues ─ */}
        {(val('issues') || editing) && (
          <div style={{ padding: '16px 18px', borderRadius: '16px', background: '#fffbeb',
            border: '1px solid #fde68a', marginBottom: '20px' }}>
            <div style={{ fontWeight: 700, color: '#b45309', marginBottom: '8px', fontSize: '14px' }}>
              ⚠️ Việc cần chốt / Cần hỗ trợ
            </div>
            {editing ? editArea('issues', 3, 'Ghi chú các vấn đề cần chốt, người cần chốt...') :
              <div style={{ fontSize: '13px', color: '#92400e', lineHeight: 1.7 }}><div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{val('issues')}</ReactMarkdown></div></div>}
          </div>
        )}

        {/* ─ manager assessment ─ */}
        {(val('managerAssessment') || editing) && (
          <div style={{ padding: '16px 18px', borderRadius: '16px', background: '#f0fdf4',
            border: '1px solid #bbf7d0', marginBottom: '20px' }}>
            <div style={{ fontWeight: 700, color: '#15803d', marginBottom: '8px', fontSize: '14px' }}>
              ✅ Nhận xét manager
            </div>
            {editing ? editArea('managerAssessment', 3, 'Nhận xét của manager...') :
              <div style={{ fontSize: '13px', color: '#166534', lineHeight: 1.7 }}><div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{val('managerAssessment')}</ReactMarkdown></div></div>}
          </div>
        )}

        {/* ─ ai assessment ─ */}
        {val('aiAssessment') && (
          <div style={{ padding: '16px 18px', borderRadius: '16px', background: '#f5f3ff',
            border: '1px solid #ddd6fe', marginBottom: '20px' }}>
            <div style={{ fontWeight: 700, color: '#6d28d9', marginBottom: '8px', fontSize: '14px' }}>
              ✨ Đánh giá AI
            </div>
            <div style={{ fontSize: '13px', color: '#4c1d95', lineHeight: 1.7 }}><div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{val('aiAssessment')}</ReactMarkdown></div></div>
          </div>
        )}

        {/* ─ footer ─ */}
        <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '11px',
          paddingTop: '18px', borderTop: '1px solid #e2e8f0', marginTop: '8px' }}>
          Long Châu Content Studio · Weekly Content Dashboard · Xuất lúc {new Date().toLocaleString('vi-VN')}
        </div>
      </div>

      {/* print styles injected inline */}
      <style>{`
        @media print {
          #weekly-report-viewer > div:first-child { display: none !important; }
          #weekly-report-viewer { position: static !important; background: #fff !important; }
        }
        @media (max-width: 860px) {
          #weekly-report-viewer [data-grid="4"] { grid-template-columns: repeat(2,1fr) !important; }
          #weekly-report-viewer [data-grid="2"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
