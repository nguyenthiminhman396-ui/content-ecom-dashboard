import { useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/shared/store/appStore';
import { defaultTaskCategories } from '@/shared/data/mockData';
import {
  Database, Upload, AlertTriangle, CheckCircle2, X, Send,
  FileSpreadsheet, Lock
} from 'lucide-react';
import type { KPISubmission, TeamGroup, TaskPointRule } from '@/shared/types';
import toast from 'react-hot-toast';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Parse "dd/MM/yyyy HH:mm:ss" hoặc "dd/MM/yyyy" → ISO string. Không parse được → '' */
function parseVNDate(s: string): string {
  if (!s) return '';
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (!m) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? '' : d.toISOString();
  }
  const [, dd, mm, yyyy, hh = '0', mi = '0', ss = '0'] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss));
  return isNaN(d.getTime()) ? '' : d.toISOString();
}

/** Stable id từ chuỗi */
function shortHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

/** Alias để map taskType cũ → taskType chuẩn của code mới (cho lookup category) */
const TASK_TYPE_ALIAS: Record<string, string> = {
  'Nội dung mới': 'Multimedia',
};

/** Resolve TeamGroup từ taskType, fallback teamName của TaskCategory */
function resolveTeamGroup(taskType: string): TeamGroup {
  const aliased = TASK_TYPE_ALIAS[taskType] ?? taskType;
  const cat = defaultTaskCategories.find(c => c.taskTypeName === aliased);
  if (!cat) return '';
  if (cat.teamName === 'Bài viết' || cat.teamName === 'Sản phẩm' || cat.teamName === 'Multimedia - Tin nhanh') {
    return cat.teamName;
  }
  return '';
}

// ── Types nội bộ ────────────────────────────────────────────────────────────
interface ParsedRow {
  rowIndex: number;
  raw: string[];
  timestamp: string;       // ISO
  employeeName: string;
  taskType: string;
  taskDetail: string;
  links: string[];
  // resolved
  teamGroup: TeamGroup;
  rule: TaskPointRule | null;
  warnings: string[];      // các vấn đề khi map
  // computed
  pointPerLink: number;
  timePerLink: number;
  totalPoints: number;
  projectId?: string;
}

/** CSV split — RFC 4180-friendly nhẹ nhàng cho file Google Sheet export */
function splitCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseCSV(text: string): string[][] {
  // Bỏ BOM nếu có, normalize line endings
  const clean = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = clean.split('\n').filter(l => l.length > 0);
  return lines.map(splitCSVLine);
}

// ── Component ───────────────────────────────────────────────────────────────
export default function ImportDataPage() {
  const { currentUser, taskPointRules, scaleConfig, projects, addSubmissionsBatch, submissions } = useAppStore();
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const isManager = currentUser?.role === 'Manager';

  // ── Parse file ────────────────────────────────────────────────────────────
  const handleFile = async (file: File) => {
    if (!file) return;
    setFileName(file.name);

    let text = '';
    if (/\.(xlsx|xls)$/i.test(file.name)) {
      // SheetJS lazy load CDN
      const XLSX = await loadSheetJSFromCDN();
      if (!XLSX) { toast.error('Không tải được thư viện Excel. Hãy export sang .csv rồi thử lại.'); return; }
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      text = XLSX.utils.sheet_to_csv(ws);
    } else {
      text = await file.text();
    }

    const grid = parseCSV(text);
    if (grid.length < 2) { toast.error('File không có dữ liệu'); return; }

    const header = grid[0].map(h => (h ?? '').toString().toLowerCase().trim());
    const findCol = (...keywords: string[]): number =>
      header.findIndex(h => keywords.some(kw => h.includes(kw.toLowerCase())));

    const COL = {
      timestamp:  findCol('dấu thời gian', 'thời gian', 'timestamp', 'date'),
      employee:   findCol('nhân viên', 'employee', 'staff'),
      taskType:   findCol('đầu việc content', 'đầu việc', 'task type'),
      taskDetail: findCol('chi tiết', 'task detail'),
    };
    const linkCols = header
      .map((h, i) => ({ h, i }))
      .filter(({ h }) => h.includes('link') && !h.includes('count'))
      .map(({ i }) => i);

    if (COL.employee < 0 || COL.taskType < 0 || COL.taskDetail < 0) {
      toast.error('File thiếu cột bắt buộc: Nhân viên / Đầu việc / Chi tiết đầu việc');
      return;
    }

    const parsed: ParsedRow[] = grid.slice(1).map((r, idx) => {
      const employeeName = (r[COL.employee] ?? '').trim();
      const taskType = (r[COL.taskType] ?? '').trim();
      const taskDetail = (r[COL.taskDetail] ?? '').trim();
      const timestamp = parseVNDate((r[COL.timestamp] ?? '').trim());
      const links = linkCols
        .map(c => (r[c] ?? '').trim())
        .filter(l => /^(https?:\/\/|www\.)/i.test(l));

      const teamGroup = resolveTeamGroup(taskType);
      const rule = taskPointRules.find(rl =>
        rl.active && rl.taskLabel.toLowerCase() === taskDetail.toLowerCase()
      ) ?? null;

      const warnings: string[] = [];
      if (!employeeName) warnings.push('Thiếu nhân viên');
      if (!timestamp)    warnings.push('Sai định dạng thời gian');
      if (!taskType)     warnings.push('Thiếu đầu việc');
      if (!taskDetail)   warnings.push('Thiếu chi tiết đầu việc');
      if (!teamGroup)    warnings.push(`Không map được team từ "${taskType}"`);
      if (!rule)         warnings.push(`Không có rule điểm cho "${taskDetail}"`);
      if (links.length === 0) warnings.push('Không có link hợp lệ');

      const timePerLink  = rule?.timePerLink ?? 0;
      const pointPerLink = rule
        ? Math.round(rule.timePerLink * scaleConfig.pointPerHour * 100) / 100
        : 0;
      const totalPoints  = Math.round(links.length * pointPerLink * 100) / 100;

      // Auto-resolve projectId từ link đầu tiên
      let projectId: string | undefined;
      if (links[0]) {
        if (links[0].includes('nhathuoclongchau')) projectId = 'p_nhathuoc';
        else if (links[0].includes('tiemchunglongchau')) projectId = 'p_tiemchung';
      }

      return {
        rowIndex: idx + 2, // 1-based + header
        raw: r,
        timestamp, employeeName, taskType, taskDetail, links,
        teamGroup, rule,
        warnings,
        timePerLink, pointPerLink, totalPoints,
        projectId,
      };
    });

    setRows(parsed);
    toast.success(`Đã parse ${parsed.length} hàng từ ${file.name}`);
  };

  // ── Stats preview ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const valid = rows.filter(r => r.warnings.length === 0);
    const warnings = rows.filter(r => r.warnings.length > 0);
    const byMonth: Record<string, number> = {};
    const byEmp: Record<string, number> = {};
    const byTeam: Record<string, number> = { 'Bài viết': 0, 'Sản phẩm': 0, 'Multimedia - Tin nhanh': 0 };
    let totalLinks = 0;
    let totalPoints = 0;
    for (const r of valid) {
      const month = r.timestamp.slice(0, 7);
      byMonth[month] = (byMonth[month] ?? 0) + 1;
      byEmp[r.employeeName] = (byEmp[r.employeeName] ?? 0) + 1;
      if (r.teamGroup && r.teamGroup in byTeam) byTeam[r.teamGroup] += r.links.length;
      totalLinks += r.links.length;
      totalPoints += r.totalPoints;
    }
    return { valid: valid.length, warnings: warnings.length, byMonth, byEmp, byTeam, totalLinks, totalPoints };
  }, [rows]);

  const warningRows = useMemo(() => rows.filter(r => r.warnings.length > 0), [rows]);

  // ── Detect duplicate (đã import rồi) ──────────────────────────────────────
  const existingKeys = useMemo(() => {
    const set = new Set<string>();
    for (const s of submissions) {
      set.add(`${s.employeeName}|${s.submittedAt}|${s.taskDetail}|${s.links.length}`);
    }
    return set;
  }, [submissions]);

  const dupCount = useMemo(() => {
    return rows.filter(r => existingKeys.has(`${r.employeeName}|${r.timestamp}|${r.taskDetail}|${r.links.length}`)).length;
  }, [rows, existingKeys]);

  // ── Import ────────────────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!isManager) { toast.error('Chỉ Manager mới được import'); return; }
    const valid = rows.filter(r => r.warnings.length === 0);
    if (valid.length === 0) { toast.error('Không có hàng hợp lệ để import'); return; }

    // Loại trừ duplicate
    const fresh = valid.filter(r =>
      !existingKeys.has(`${r.employeeName}|${r.timestamp}|${r.taskDetail}|${r.links.length}`)
    );
    if (fresh.length === 0) {
      toast.error('Toàn bộ hàng hợp lệ đã có trong submissions (duplicate)');
      return;
    }

    if (!window.confirm(
      `Import ${fresh.length} submissions (${stats.totalLinks} link, ${stats.totalPoints.toFixed(0)} điểm)?\n\n` +
      `Đã skip: ${valid.length - fresh.length} duplicate, ${stats.warnings} hàng có warning.\n\n` +
      `Toàn bộ sẽ được khóa (locked) — Member không sửa được.`
    )) return;

    setIsImporting(true);
    try {
      const subs: KPISubmission[] = fresh.map(r => ({
        id: `imp_${shortHash(r.timestamp + r.employeeName + r.taskDetail + r.rowIndex)}`,
        employeeName: r.employeeName,
        submittedAt: r.timestamp,
        taskType: r.taskType,
        taskDetail: r.taskDetail,
        projectId: r.projectId,
        links: r.links,
        teamGroup: r.teamGroup,
        timePerLink: r.timePerLink,
        pointPerLink: r.pointPerLink,
        totalPoints: r.totalPoints,
        locked: true,
        notes: 'Import từ data cũ',
      }));

      addSubmissionsBatch(subs);
      toast.success(`Đã import ${subs.length} submissions thành công!`);
      setRows([]);
      setFileName('');
    } catch (e) {
      toast.error(`Lỗi import: ${(e as Error).message}`);
    } finally {
      setIsImporting(false);
    }
  };

  if (!isManager) {
    return (
      <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
        <AlertTriangle size={28} color="var(--warning)" />
        <p style={{ marginTop: '10px' }}>Chỉ Manager mới có quyền import dữ liệu cũ.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">
            <span className="icon"><Database size={20} /></span>
            Import dữ liệu cũ
          </h2>
          <p className="page-subtitle">
            Upload file CSV/Excel chứa KPI nhiều tháng → app tự parse, phân loại, tính điểm theo thang hiện tại.
          </p>
        </div>
      </div>

      {/* Upload zone */}
      {rows.length === 0 && (
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={e => {
            e.preventDefault(); e.stopPropagation();
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          style={{
            border: '2px dashed var(--primary-300)',
            borderRadius: 'var(--radius-lg)',
            padding: '60px 20px', textAlign: 'center',
            background: 'var(--primary-50)', cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          <Upload size={36} style={{ color: 'var(--primary-500)', marginBottom: '12px' }} />
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>Kéo thả file vào đây hoặc bấm để chọn</div>
          <p style={{ marginTop: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Hỗ trợ <strong>.csv</strong> · <strong>.xlsx</strong> · <strong>.xls</strong> · <strong>.tsv</strong>
          </p>
          <p style={{ marginTop: '10px', fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
            Header chuẩn: Dấu thời gian · Nhân viên · Đầu việc content · Link 1..N · Chi tiết đầu việc
          </p>
          <input ref={fileRef} type="file"
            accept=".csv,.xlsx,.xls,.tsv,text/csv"
            style={{ display: 'none' }}
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
        </div>
      )}

      {/* Preview */}
      {rows.length > 0 && (
        <>
          {/* File info */}
          <div className="card" style={{ padding: '14px 18px', marginBottom: '16px',
                                         display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <FileSpreadsheet size={18} color="var(--primary-500)" />
              <div>
                <div style={{ fontWeight: 700 }}>{fileName}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                  {rows.length} hàng · {stats.valid} hợp lệ · {stats.warnings} có warning · {dupCount} đã tồn tại
                </div>
              </div>
            </div>
            <button className="btn btn-ghost" onClick={() => { setRows([]); setFileName(''); }}>
              <X size={14} /> Chọn file khác
            </button>
          </div>

          {/* Summary stats */}
          <div className="stats-grid" style={{ marginBottom: '16px' }}>
            <StatCard label="Sẽ import" value={`${stats.valid - dupCount}`} sub={`${dupCount} duplicate · ${stats.warnings} skip`} color="var(--success)" />
            <StatCard label="Tổng link" value={stats.totalLinks.toLocaleString()} color="var(--primary-500)" />
            <StatCard label="Tổng điểm" value={stats.totalPoints.toLocaleString('vi-VN', { maximumFractionDigits: 0 })} color="var(--accent-500)" />
            <StatCard label="Số nhân viên" value={Object.keys(stats.byEmp).length.toString()} color="#7a9af6" />
          </div>

          {/* Phân bổ */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <BreakdownCard title="Theo tháng" rows={Object.entries(stats.byMonth).sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => ({ label: k, value: v }))} />
            <BreakdownCard title="Theo nhóm team" rows={Object.entries(stats.byTeam)
              .map(([k, v]) => ({ label: k, value: v, suffix: ' link' }))} />
            <BreakdownCard title="Theo nhân viên (top 10)" rows={Object.entries(stats.byEmp)
              .sort(([, a], [, b]) => b - a).slice(0, 10)
              .map(([k, v]) => ({ label: k, value: v }))} />
          </div>

          {/* Warnings */}
          {warningRows.length > 0 && (
            <div className="card" style={{ padding: '14px', marginBottom: '16px',
                                           background: 'var(--warning-bg)', border: '1px solid var(--warning)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#92400e',
                            marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertTriangle size={14} /> {warningRows.length} hàng có warning (sẽ bị skip khi import)
              </div>
              <div style={{ maxHeight: '180px', overflowY: 'auto', fontSize: '0.8rem' }}>
                {warningRows.slice(0, 50).map(w => (
                  <div key={w.rowIndex} style={{
                    padding: '4px 6px', borderBottom: '1px solid rgba(0,0,0,0.05)',
                  }}>
                    <strong>Hàng {w.rowIndex}:</strong> {w.employeeName || '?'} ·{' '}
                    {w.taskDetail || '?'} — <span style={{ color: '#92400e' }}>{w.warnings.join('; ')}</span>
                  </div>
                ))}
                {warningRows.length > 50 && (
                  <div style={{ padding: '4px 6px', fontStyle: 'italic', color: 'var(--text-tertiary)' }}>
                    … và {warningRows.length - 50} hàng nữa
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => { setRows([]); setFileName(''); }}>
              Hủy
            </button>
            <button className="btn btn-primary"
              disabled={isImporting || stats.valid - dupCount === 0}
              onClick={handleImport}>
              {isImporting ? '...' : <><Send size={14} /> Import {stats.valid - dupCount} submissions</>}
            </button>
          </div>

          <div style={{ marginTop: '14px', padding: '10px 14px', background: 'var(--bg-secondary)',
                        borderRadius: 'var(--radius-md)', fontSize: '0.78rem', color: 'var(--text-secondary)',
                        display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Lock size={12} /> Tất cả submission được import sẽ ở trạng thái <strong>locked</strong> — Member không thể sửa.
            {projects.length === 0 && <> · Không có project nào → projectId tự suy luận từ URL (nhathuoclongchau / tiemchunglongchau).</>}
          </div>
        </>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="stat-card">
      <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: '1.5rem', color, marginTop: '2px' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>{sub}</div>}
    </div>
  );
}

function BreakdownCard({ title, rows }: {
  title: string;
  rows: { label: string; value: number; suffix?: string }[];
}) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return (
    <div className="card" style={{ padding: '14px' }}>
      <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <CheckCircle2 size={13} color="var(--primary-500)" /> {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {rows.map(r => (
          <div key={r.label} style={{ fontSize: '0.82rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>{r.label}</span>
              <strong>{r.value.toLocaleString()}{r.suffix ?? ''}</strong>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-secondary)' }}>
              <div style={{ height: '100%', borderRadius: 2,
                            background: 'var(--primary-500)',
                            width: `${(r.value / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── SheetJS lazy load ───────────────────────────────────────────────────────
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
