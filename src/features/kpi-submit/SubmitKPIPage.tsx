import { useState, useMemo, useRef, useEffect } from 'react';
import {
  ClipboardList, Send, Upload, Trash2, AlertTriangle, CheckCircle2, FileSpreadsheet,
  Layers, Tag, Briefcase, Link2, Hash, X, Eye, Clock
} from 'lucide-react';
import { useAppStore } from '@/shared/store/appStore';
import { defaultTaskCategories, TEAM_GROUPS } from '@/shared/data/mockData';
import type { KPISubmission, TaskPointRule, TeamGroup } from '@/shared/types';
import toast from 'react-hot-toast';

// ── Helpers ─────────────────────────────────────────────────────────────────
// Strong unique ID: UUID v4 nếu browser support (crypto.randomUUID), fallback
// timestamp + 14-char random (~ 78 bit entropy) để tránh collision khi 10 người
// submit cùng millisecond. Trùng ID sẽ bị SQL idempotent skip → mất submission.
function generateId(prefix = 'sub'): string {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c && typeof c.randomUUID === 'function') {
      return `${prefix}_${c.randomUUID()}`;
    }
  } catch { /* ignore */ }
  const t = Date.now().toString(36);
  const r1 = Math.random().toString(36).slice(2, 12);
  const r2 = Math.random().toString(36).slice(2, 12);
  return `${prefix}_${t}_${r1}${r2}`;
}


function parseLinks(raw: string): string[] {
  return raw
    .split(/\r?\n|,|\t/)
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .filter(s => /^(https?:\/\/|www\.)/i.test(s));
}

function parseSpreadsheetText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(line => line.split(/[,\t]/)[0]?.trim() ?? '')
    .filter(s => /^(https?:\/\/|www\.)/i.test(s));
}

type SheetJSLib = {
  read: (data: unknown, opts?: unknown) => { SheetNames: string[]; Sheets: Record<string, unknown> };
  utils: { sheet_to_csv: (ws: unknown) => string };
};

let _sheetJsPromise: Promise<SheetJSLib | null> | null = null;
function loadSheetJSFromCDN(): Promise<SheetJSLib | null> {
  if (_sheetJsPromise) return _sheetJsPromise;
  _sheetJsPromise = new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(null);
    const w = window as unknown as { XLSX?: SheetJSLib };
    if (w.XLSX) return resolve(w.XLSX);
    const s = document.createElement('script');
    s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
    s.async = true;
    s.onload = () => resolve(w.XLSX ?? null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return _sheetJsPromise;
}

const PROJECT_TASK_TYPE = 'Công việc dự án';

// ── Component ───────────────────────────────────────────────────────────────
export default function SubmitKPIPage() {
  const { currentUser, taskPointRules, projects, scaleConfig, addSubmissionsBatch, submissions, sites, projectTasks } = useAppStore();

  const [taskType, setTaskType] = useState<string>(defaultTaskCategories[0]?.taskTypeName ?? '');
  const [taskDetail, setTaskDetail] = useState<string>('');
  const [projectId, setProjectId] = useState<string>('');
  const [siteId, setSiteId] = useState<string>('');
  const [projectTaskId, setProjectTaskId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(0);
  const [linksRaw, setLinksRaw] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ── Hour-based mode (Approach A) ──
  const [hoursWorked, setHoursWorked] = useState<number>(0);
  const [projectTeamGroup, setProjectTeamGroup] = useState<TeamGroup>('');
  const [linkTeamGroup, setLinkTeamGroup] = useState<TeamGroup>('');
  const [projectDescription, setProjectDescription] = useState('');

  // ── Auto-pick first matching detail rule khi mount hoặc khi taskPointRules load xong ──
  // Fix: trước đây taskDetail mặc định = '' → dropdown hiện "— Chọn —" → user phải tự chọn
  useEffect(() => {
    if (taskDetail) return; // đã có rồi thì giữ
    const first = taskPointRules.find(r => r.active && r.category === taskType);
    if (first?.taskLabel) setTaskDetail(first.taskLabel);
  }, [taskPointRules, taskType, taskDetail]);

  const isProjectMode = taskType === PROJECT_TASK_TYPE;

  // ── Danh sách taskDetail (rule) khớp với taskType ──
  const detailOptions = useMemo<TaskPointRule[]>(() => {
    return taskPointRules.filter(r => r.active && r.category === taskType);
  }, [taskPointRules, taskType]);

  const onTaskTypeChange = (val: string) => {
    setTaskType(val);
    const first = taskPointRules.find(r => r.active && r.category === val);
    setTaskDetail(first?.taskLabel ?? '');
    
    // Reset hour fields when switching modes
    if (val === PROJECT_TASK_TYPE) {
      setLinksRaw('');
    } else {
      setHoursWorked(0);
      setProjectDescription('');
    }
  };

  const monthlyProjects = useMemo(() => {
    const cm = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    return projects.filter(p => {
      if (!p.isMonthly) return p.status === 'Đang chạy';
      if (!p.activeMonths) return true;
      return p.activeMonths.split(',').map(s => s.trim()).includes(cm);
    });
  }, [projects]);

  const selectedRule = useMemo(() => {
    return taskPointRules.find(r => r.active && r.category === taskType && r.taskLabel === taskDetail) || null;
  }, [taskPointRules, taskType, taskDetail]);

  const links = useMemo(() => parseLinks(linksRaw), [linksRaw]);
  const teamGroup = isProjectMode ? projectTeamGroup : linkTeamGroup;

  // ── Scoring logic ──
  const timePerLink = selectedRule?.timePerLink ?? 0;
  const pointPerLink = selectedRule
    ? Math.round(selectedRule.timePerLink * scaleConfig.pointPerHour * 100) / 100
    : 0;

  // Project mode: points = hours × pointPerHour
  const projectPoints = Math.round(hoursWorked * scaleConfig.pointPerHour * 100) / 100;
  const linkPoints = Math.round(links.length * pointPerLink * 100) / 100;
  const totalPoints = isProjectMode ? projectPoints : linkPoints;
  void totalPoints;

  const mySubs = useMemo(() => {
    if (!currentUser) return [];
    return submissions
      .filter(s => s.employeeName === currentUser.name)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }, [submissions, currentUser]);

  const handleFile = async (file: File) => {
    if (!file) return;
    try {
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        const XLSX = await loadSheetJSFromCDN();
        if (!XLSX) { toast.error('Không tải được thư viện Excel.'); return; }
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const csv = XLSX.utils.sheet_to_csv(ws);
        const found = parseSpreadsheetText(csv);
        if (!found.length) { toast.error('Không tìm thấy link nào'); return; }
        setLinksRaw(prev => (prev ? prev + '\n' : '') + found.join('\n'));
        toast.success(`Đã thêm ${found.length} link từ ${file.name}`);
      } else {
        const text = await file.text();
        const found = parseSpreadsheetText(text);
        if (!found.length) { toast.error('Không tìm thấy link nào'); return; }
        setLinksRaw(prev => (prev ? prev + '\n' : '') + found.join('\n'));
        toast.success(`Đã thêm ${found.length} link từ ${file.name}`);
      }
    } catch (e) {
      toast.error(`Lỗi parse file: ${(e as Error).message}`);
    }
  };

  // ── Submit ──
  const [submitting, setSubmitting] = useState(false);
  // Sync guard chặn double-click trước khi React render kịp button disabled state.
  // useState/setSubmitting cập nhật ở next render → 2 click trong cùng tick vẫn lọt.
  const submittingRef = useRef(false);
  const canSubmit = isProjectMode
    ? (hoursWorked > 0 && taskDetail && projectId && projectTeamGroup)
    : (links.length > 0 && selectedRule && siteId && linkTeamGroup);

  const handleSubmit = async () => {
    if (submittingRef.current) return; // chặn parallel submit
    if (!currentUser) { toast.error('Bạn cần đăng nhập'); return; }
    if (!taskType)    { toast.error('Chọn đầu việc'); return; }
    if (!taskDetail)  { toast.error('Chọn chi tiết đầu việc'); return; }

    submittingRef.current = true;
    if (isProjectMode) {
      if (!projectTeamGroup) { toast.error('Chọn nhóm team'); submittingRef.current = false; return; }
      if (hoursWorked <= 0) { toast.error('Nhập số giờ làm việc'); submittingRef.current = false; return; }
      if (!projectId) { toast.error('Chọn dự án cho công việc này'); submittingRef.current = false; return; }

      const sub: KPISubmission = {
        id:           generateId(),
        employeeName: currentUser.name,
        submittedAt:  new Date().toISOString(),
        taskType,
        taskDetail,
        siteId:       siteId || undefined,
        projectId,
        projectTaskId: projectTaskId || undefined,
        links:        [], // No links for hour-based
        teamGroup:    projectTeamGroup,
        timePerLink:  hoursWorked, // Store total hours in this field
        pointPerLink: scaleConfig.pointPerHour,
        totalPoints:  projectPoints,
        locked:       true,
        notes:        [projectDescription, notes].filter(Boolean).join(' — ') || undefined,
        hoursWorked,
        quantity:     quantity || undefined,
      };

      setSubmitting(true);
      const ok = await addSubmissionsBatch([sub]);
      setSubmitting(false);
      submittingRef.current = false;
      if (ok) {
        toast.success(`✅ Đã lưu vào DB: ${hoursWorked}h · ${projectPoints} điểm`);
        setHoursWorked(0);
        setProjectDescription('');
        setNotes('');
        setProjectId('');
      } else {
        toast.error('❌ Lưu thất bại! Dữ liệu chưa được lưu. Hãy thử lại.', { duration: 6000 });
      }
    } else {
      if (!siteId)        { toast.error('Chọn site đăng bài'); submittingRef.current = false; return; }
      if (!linkTeamGroup) { toast.error('Chọn nhóm team'); submittingRef.current = false; return; }
      if (!links.length)  { toast.error('Chưa có link hợp lệ'); submittingRef.current = false; return; }
      if (!selectedRule)  { toast.error('Không tìm thấy rule điểm'); submittingRef.current = false; return; }

      const sub: KPISubmission = {
        id:           generateId(),
        employeeName: currentUser.name,
        submittedAt:  new Date().toISOString(),
        taskType,
        taskDetail,
        siteId,
        projectId:    projectId || undefined,
        projectTaskId: projectTaskId || undefined,
        links,
        teamGroup,
        timePerLink,
        pointPerLink,
        totalPoints:  linkPoints,
        locked:       true,
        notes:        notes.trim() || undefined,
        quantity:     quantity || undefined,
      };

      setSubmitting(true);
      const ok = await addSubmissionsBatch([sub]);
      setSubmitting(false);
      submittingRef.current = false;
      if (ok) {
        toast.success(`✅ Đã lưu vào DB: ${links.length} link · ${linkPoints}đ`);
        setLinksRaw('');
        setNotes('');
        setProjectId('');
        setProjectTaskId('');
        setQuantity(0);
      } else {
        toast.error('❌ Lưu thất bại! Dữ liệu chưa được lưu. Hãy thử lại.', { duration: 6000 });
      }
    }
    setShowPreview(false);
  };

  if (!currentUser) {
    return (
      <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
        <AlertTriangle size={28} color="var(--warning)" />
        <p style={{ marginTop: '10px' }}>Bạn cần đăng nhập để submit KPI.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">
            <span className="icon"><ClipboardList size={20} /></span>
            Submit KPI
          </h2>
          <p className="page-subtitle">
            Chọn loại bài → paste link hoặc nhập giờ (dự án) → Submit.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '20px', alignItems: 'flex-start' }}>
        {/* ── Form ── */}
        <div className="card" style={{ padding: '22px' }}>
          {/* Đầu việc */}
          <div className="form-group">
            <label className="form-label">
              <Layers size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              Đầu việc *
            </label>
            <select className="form-select" value={taskType} onChange={e => onTaskTypeChange(e.target.value)}>
              {defaultTaskCategories.map(c => (
                <option key={c.id} value={c.taskTypeName}>{c.taskTypeName}</option>
              ))}
            </select>
            {isProjectMode && (
              <p style={{ fontSize: '0.78rem', color: '#6366F1', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={12} /> Chế độ tính theo giờ — nhập số giờ thay vì link
              </p>
            )}
          </div>

          {/* Chi tiết đầu việc */}
          <div className="form-group">
            <label className="form-label">
              <Tag size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              Chi tiết đầu việc *
            </label>
            <select className="form-select" value={taskDetail} onChange={e => setTaskDetail(e.target.value)}>
              <option value="">— Chọn —</option>
              {detailOptions.map(r => (
                <option key={r.id} value={r.taskLabel}>
                  {r.taskLabel} · {r.timePerLink}h · {Math.round(r.timePerLink * scaleConfig.pointPerHour * 100) / 100}đ
                </option>
              ))}
            </select>
            {detailOptions.length === 0 && (
              <p style={{ fontSize: '0.78rem', color: 'var(--warning)', marginTop: '6px' }}>
                Chưa có rule cho đầu việc này. Vào "Cấu hình Điểm" để thêm.
              </p>
            )}
          </div>

          {/* Site (Nhà thuốc / Tiêm chủng / ...) — bắt buộc */}
          {!isProjectMode && (
            <div className="form-group">
              <label className="form-label">
                <Briefcase size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                Site đăng bài *
              </label>
              <select className="form-select" value={siteId} onChange={e => setSiteId(e.target.value)}>
                <option value="">— Chọn —</option>
                {sites.filter(s => s.active).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Nhóm team — bắt buộc, không auto-fill để tránh nhầm */}
          {!isProjectMode && (
            <div className="form-group">
              <label className="form-label">
                <Layers size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                Nhóm team *
              </label>
              <select className="form-select" value={linkTeamGroup}
                onChange={e => setLinkTeamGroup(e.target.value as TeamGroup)}>
                <option value="">— Chọn —</option>
                {TEAM_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">
              <Briefcase size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              Dự án {isProjectMode ? '*' : <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(tùy chọn — chỉ chọn khi gắn task dự án)</span>}
            </label>
            <select className="form-select" value={projectId} onChange={e => { setProjectId(e.target.value); setProjectTaskId(''); }}>
              <option value="">{isProjectMode ? '— Chọn dự án *—' : '— Không gắn dự án —'}</option>
              {monthlyProjects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.isMonthly ? '📅 ' : ''}{p.name}
                </option>
              ))}
            </select>
            {/* Project task sub-selector */}
            {projectId && (() => {
              const tasks = projectTasks.filter(t => t.projectId === projectId);
              if (tasks.length === 0) return null;
              const selectedTask = tasks.find(t => t.id === projectTaskId);
              const isQtyMode = selectedTask?.trackingMode === 'quantity';
              return (
                <>
                  <select className="form-select" style={{ marginTop: '6px' }}
                    value={projectTaskId} onChange={e => { setProjectTaskId(e.target.value); setQuantity(0); }}>
                    <option value="">— (Tùy chọn) Gắn vào task cụ thể —</option>
                    {tasks.map(t => (
                      <option key={t.id} value={t.id}>
                        {(t.trackingMode || 'link') === 'quantity' ? '📊' : '🔗'} {t.name} (target {(t.trackingMode || 'link') === 'quantity' ? `${t.targetQuantity ?? 0} SL` : `${t.targetLinks} link`})
                      </option>
                    ))}
                  </select>
                  {/* Quantity input — đồng bộ tiến độ dự án */}
                  {projectTaskId && (
                    <div style={{ marginTop: '8px', padding: '10px 12px',
                                  background: isQtyMode ? 'var(--primary-50)' : 'var(--bg-secondary)',
                                  borderRadius: 'var(--radius-md)',
                                  border: `1px solid ${isQtyMode ? 'var(--primary-200)' : 'var(--border-light)'}` }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)',
                                      display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                        <Hash size={12} color="var(--primary-500)" />
                        Số lượng hoàn thành
                        {isQtyMode
                          ? <span style={{ fontWeight: 700, color: 'var(--primary-600)', fontSize: '0.72rem' }}>
                              (bắt buộc — task tracking theo SL)
                            </span>
                          : <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>
                              (tùy chọn)
                            </span>
                        }
                      </label>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          className="form-input"
                          type="number"
                          min="0"
                          step="1"
                          value={quantity || ''}
                          onChange={e => setQuantity(parseInt(e.target.value) || 0)}
                          placeholder="VD: 5"
                          style={{ maxWidth: '120px' }}
                        />
                        {selectedTask?.targetQuantity ? (
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                            / target: <strong style={{ color: 'var(--primary-600)' }}>{selectedTask.targetQuantity}</strong> SL
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                            Số lượng bài/sản phẩm đã làm
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          {/* ── HOUR MODE (project) ── */}
          {isProjectMode ? (
            <>
              {/* Team group selector */}
              <div className="form-group">
                <label className="form-label">Nhóm team *</label>
                <select className="form-select" value={projectTeamGroup}
                  onChange={e => setProjectTeamGroup(e.target.value as TeamGroup)}>
                  <option value="">— Chọn —</option>
                  {TEAM_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>

              {/* Hours input */}
              <div className="form-group">
                <label className="form-label">
                  <Clock size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                  Số giờ làm việc *
                </label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    className="form-input"
                    type="number"
                    min="0.5"
                    max="176"
                    step="0.5"
                    value={hoursWorked || ''}
                    onChange={e => setHoursWorked(parseFloat(e.target.value) || 0)}
                    placeholder="VD: 4.5"
                    style={{ maxWidth: '160px' }}
                  />
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    giờ × {scaleConfig.pointPerHour}đ = <strong style={{ color: 'var(--success)' }}>{projectPoints}đ</strong>
                  </span>
                </div>
                <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {[1, 2, 4, 8, 16].map(h => (
                    <button key={h} type="button" className="btn btn-secondary btn-sm"
                      onClick={() => setHoursWorked(h)}
                      style={{ fontSize: '0.75rem', opacity: hoursWorked === h ? 1 : 0.7 }}>
                      {h}h
                    </button>
                  ))}
                </div>
              </div>

              {/* Project description */}
              <div className="form-group">
                <label className="form-label">Mô tả công việc</label>
                <textarea
                  className="form-textarea"
                  rows={3}
                  value={projectDescription}
                  onChange={e => setProjectDescription(e.target.value)}
                  placeholder="VD: Viết brief campaign Tết, nghiên cứu topic cho series mới..."
                />
              </div>
            </>
          ) : (
            /* ── LINK MODE (standard) ── */
            <div className="form-group">
              <label className="form-label">
                <Link2 size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                Danh sách link *
              </label>
              <textarea
                className="form-textarea"
                rows={6}
                value={linksRaw}
                onChange={e => setLinksRaw(e.target.value)}
                placeholder={'Mỗi link 1 dòng. VD:\nhttps://nhathuoclongchau.com.vn/bai-viet/...\nhttps://nhathuoclongchau.com.vn/san-pham/...'}
                style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
              />
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-secondary"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ fontSize: '0.82rem' }}>
                  <Upload size={13} /> Upload Excel/CSV
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".csv,.xlsx,.xls,.tsv,text/csv"
                  style={{ display: 'none' }}
                  onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
                <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                  File chỉ cần cột đầu tiên là link.
                </span>
                {linksRaw && (
                  <button type="button" className="btn btn-ghost" onClick={() => setLinksRaw('')}
                    style={{ fontSize: '0.82rem', color: 'var(--danger)' }}>
                    <Trash2 size={13} /> Xóa hết
                  </button>
                )}
              </div>
              {linksRaw && (
                <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: '6px' }}>
                  {links.length} link hợp lệ / {linksRaw.split('\n').filter(s => s.trim()).length} dòng
                </p>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="form-group">
            <label className="form-label">Ghi chú thêm</label>
            <input className="form-input" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="VD: Bài thuộc campaign Tết 2026..." />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            {!isProjectMode && (
              <button type="button" className="btn btn-secondary"
                disabled={!canSubmit}
                onClick={() => setShowPreview(true)}>
                <Eye size={14} /> Preview
              </button>
            )}
            <button type="button" className="btn btn-primary"
              disabled={!canSubmit || submitting}
              onClick={handleSubmit}>
              <Send size={14} /> {submitting ? 'Đang lưu...' : isProjectMode
                ? `Submit (${hoursWorked}h · ${projectPoints}đ)`
                : `Submit (${links.length} link · ${linkPoints}đ)`}
            </button>
          </div>
        </div>

        {/* ── Sidebar ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Live preview card */}
          <div className="card" style={{ padding: '18px' }}>
            <div style={{ fontWeight: 700, fontSize: '0.92rem', marginBottom: '12px',
                          display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FileSpreadsheet size={14} color="var(--primary-500)" /> Tóm tắt
            </div>
            <SummaryRow label="Loại bài"     value={taskType || '—'} />
            <SummaryRow label="Chi tiết"     value={taskDetail || '—'} />
            <SummaryRow label="Nhóm team"    value={teamGroup || '—'} />
            {isProjectMode ? (
              <>
                <SummaryRow label="Chế độ"       value="⏱ Theo giờ" />
                <SummaryRow label="Số giờ"       value={`${hoursWorked}h`} />
                <SummaryRow label="Hệ số"        value={`${scaleConfig.pointPerHour}đ/giờ`} />
              </>
            ) : (
              <>
                <SummaryRow label="Thời gian/link" value={`${timePerLink}h`} />
                <SummaryRow label="Điểm/link"    value={`${pointPerLink}`} />
              </>
            )}
            <div style={{ borderTop: '1px solid var(--border-light)', marginTop: '8px', paddingTop: '8px' }}>
              {isProjectMode ? (
                <SummaryRow label="Tổng điểm"  value={`${projectPoints}`} bold success />
              ) : (
                <>
                  <SummaryRow label="Số link"    value={`${links.length}`} bold />
                  <SummaryRow label="Tổng điểm"  value={`${linkPoints}`} bold success />
                </>
              )}
            </div>
          </div>

          {/* My recent submissions */}
          <div className="card" style={{ padding: '18px' }}>
            <div style={{ fontWeight: 700, fontSize: '0.92rem', marginBottom: '10px',
                          display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle2 size={14} color="var(--success)" /> Đã submit gần đây
            </div>
            {mySubs.length === 0 && (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>Chưa có lượt submit nào.</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
              {mySubs.slice(0, 8).map(s => (
                <div key={s.id} style={{
                  padding: '8px 10px', background: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-sm)', fontSize: '0.8rem',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                    <strong>{s.taskDetail}</strong>
                    <span style={{ color: 'var(--text-tertiary)', fontSize: '0.72rem' }}>
                      {s.hoursWorked ? '⏱' : '🔒'} {s.hoursWorked ? `${s.hoursWorked}h` : 'Locked'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                    <Hash size={10} style={{ verticalAlign: 'middle' }} />
                    {s.hoursWorked ? ` ${s.hoursWorked}h` : ` ${s.links.length} link`} · {s.totalPoints}đ
                    · {new Date(s.submittedAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Preview modal (link mode only) */}
      {showPreview && !isProjectMode && (
        <div className="modal-overlay" onClick={() => setShowPreview(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '720px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Preview {links.length} link sắp submit</h3>
              <button className="modal-close" onClick={() => setShowPreview(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '12px', display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '0.85rem' }}>
                <span><strong>Đầu việc:</strong> {taskType}</span>
                <span><strong>Chi tiết:</strong> {taskDetail}</span>
                <span><strong>Nhóm:</strong> {teamGroup}</span>
                <span><strong>Tổng điểm:</strong> <span style={{ color: 'var(--success)', fontWeight: 700 }}>{linkPoints}</span></span>
              </div>
              <div style={{ maxHeight: '380px', overflowY: 'auto', border: '1px solid var(--border-light)',
                            borderRadius: 'var(--radius-md)', padding: '8px' }}>
                {links.map((l, i) => (
                  <div key={i} style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-light)',
                                        fontSize: '0.82rem', wordBreak: 'break-all' }}>
                    <span style={{ color: 'var(--text-tertiary)', marginRight: 8 }}>{i + 1}.</span>
                    {l}
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowPreview(false)}>Đóng</button>
              <button type="button" className="btn btn-primary" onClick={() => { setShowPreview(false); handleSubmit(); }}>
                <Send size={14} /> Xác nhận Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryRow({ label, value, bold, success }: {
  label: string; value: string; bold?: boolean; success?: boolean;
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: '4px 0', fontSize: '0.85rem',
    }}>
      <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{
        fontWeight: bold ? 700 : 500,
        color: success ? 'var(--success)' : 'var(--text-primary)',
      }}>{value}</span>
    </div>
  );
}
