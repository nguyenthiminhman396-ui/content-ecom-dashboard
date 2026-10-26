/**
 * Đọc kết quả QC từ ChatGPT / Google Sheet: TSV (copy từ Sheet), CSV hoặc JSON.
 * Mỗi dòng = 1 phát hiện; các cột của lượt chấm (url, điểm…) lặp lại trên mọi dòng của cùng bài.
 * Dòng không có `severity` = lượt chấm không có phát hiện (chỉ có điểm).
 */
import type { CiCategory, CiCheck, CiFinding, CiScores, CiSeverity } from '@/shared/types';

export const COLUMNS = [
  'url', 'title', 'checked_at', 'check_type',
  'medical_accuracy', 'reader_intent', 'completeness', 'evidence_quality', 'editorial_quality', 'actionability', 'total',
  'summary', 'severity', 'category', 'location', 'quote', 'rationale', 'suggested_action', 'evidence_urls', 'verification',
  'previous_finding_id', 'previous_status',
] as const;
type Col = typeof COLUMNS[number];
type Row = Partial<Record<Col, string>>;

export const SCORE_MAX: Record<Exclude<keyof CiScores, 'total'>, number> = {
  medical_accuracy: 30, reader_intent: 25, completeness: 15, evidence_quality: 15, editorial_quality: 10, actionability: 5,
};

const ALLOWED_HOSTS = ['nhathuoclongchau.com.vn', 'tiemchunglongchau.com.vn'];

const CATEGORY_ALIASES: Record<string, CiCategory> = {
  quality_issue: 'quality_issue', 'lỗi chất lượng': 'quality_issue', 'loi chat luong': 'quality_issue', quality: 'quality_issue',
  content_opportunity: 'content_opportunity', 'cơ hội nội dung': 'content_opportunity', 'cơ hội': 'content_opportunity', opportunity: 'content_opportunity',
  medical_verification: 'medical_verification', 'cần xác minh y khoa': 'medical_verification', 'xác minh y khoa': 'medical_verification', medical: 'medical_verification',
};
const PREV_STATUS_ALIASES: Record<string, 'resolved' | 'unresolved' | 'unable_to_verify'> = {
  resolved: 'resolved', 'đã xử lý': 'resolved', fixed: 'resolved',
  unresolved: 'unresolved', 'chưa xử lý': 'unresolved',
  unable_to_verify: 'unable_to_verify', 'không xác minh được': 'unable_to_verify', unknown: 'unable_to_verify',
};

/** Parser CSV/TSV có hỗ trợ ô trong ngoặc kép (Google Sheet copy ra như vậy khi ô có xuống dòng). */
function parseDelimited(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cell += c;
    } else if (c === '"' && cell === '') inQuotes = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}

export function parseTable(text: string): { rows: Row[]; error?: string } {
  const t = text.trim().replace(/^```(?:json|tsv|csv)?\s*/i, '').replace(/```$/, '').trim();
  if (!t) return { rows: [], error: 'Chưa có dữ liệu.' };
  if (t.startsWith('[') || t.startsWith('{')) {
    try {
      const data = JSON.parse(t);
      const arr = Array.isArray(data) ? data : [data];
      return { rows: arr.map(o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.trim().toLowerCase(), Array.isArray(v) ? v.join(' ') : v == null ? '' : String(v)]))) as Row[] };
    } catch { return { rows: [], error: 'JSON không hợp lệ.' }; }
  }
  const firstLine = t.split(/\r?\n/)[0];
  const delim = firstLine.includes('\t') ? '\t' : ',';
  const table = parseDelimited(t, delim);
  const header = table[0].map(h => h.trim().toLowerCase());
  if (!header.includes('url')) return { rows: [], error: 'Thiếu dòng tiêu đề cột (cần có cột "url"). Hãy copy cả dòng tiêu đề của Sheet.' };
  return { rows: table.slice(1).map(cells => Object.fromEntries(header.map((h, i) => [h, (cells[i] ?? '').trim()])) as Row) };
}

const shortId = (p: string) => `${p}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
const norm = (s?: string) => (s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
const nowVN = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
const pad = (n: string) => n.padStart(2, '0');

/**
 * Chuẩn hoá thời điểm chấm (giờ Việt Nam). Nhận: YYYY-MM-DD, YYYY-MM-DD HH:mm(:ss), DD/MM/YYYY, DD/MM/YYYY HH:mm(:ss)
 * (Google Sheet tiếng Việt hay hiển thị kiểu 27/10/2026 14:30:00). Trả về "YYYY-MM-DD" hoặc "YYYY-MM-DDTHH:mm+07:00".
 */
export function normalizeCheckedAt(raw: string): string | null {
  const v = raw.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::\d{2})?)?$/.exec(v);
  let y: string, mo: string, d: string, h: string | undefined, mi: string | undefined;
  if (m) [, y, mo, d, h, mi] = m;
  else {
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?)?$/.exec(v);
    if (!m) return null;
    [, d, mo, y, h, mi] = m;
  }
  const date = `${y}-${pad(mo)}-${pad(d)}`;
  if (Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) return null;
  if (h === undefined) return date;
  if (Number(h) > 23) return null;
  return `${date}T${pad(h)}:${mi}+07:00`;
}

export interface RecheckRow { checkKey: string; url: string; findingId: string; status: 'resolved' | 'unresolved' | 'unable_to_verify'; note?: string }
export interface ParsedImport {
  checks: CiCheck[];
  findings: CiFinding[];
  recheckRows: RecheckRow[];
  errors: { row: number; message: string }[];
  warnings: { row: number; message: string }[];
  duplicates: number;
}

export function normalizeRows(rows: Row[], ctx: { existingCheckKeys: Set<string>; existingFindingKeys: Set<string>; importedBy: string }): ParsedImport {
  const out: ParsedImport = { checks: [], findings: [], recheckRows: [], errors: [], warnings: [], duplicates: 0 };
  const checksByKey = new Map<string, CiCheck>();
  const now = new Date().toISOString();

  rows.forEach((r, idx) => {
    const line = idx + 2; // +1 tiêu đề, +1 đánh số từ 1
    let url: URL;
    try { url = new URL(r.url || ''); } catch { out.errors.push({ row: line, message: 'URL không hợp lệ' }); return; }
    if (!ALLOWED_HOSTS.some(h => url.hostname === h || url.hostname.endsWith(`.${h}`))) {
      out.errors.push({ row: line, message: `URL không thuộc Nhà thuốc/Tiêm chủng Long Châu: ${url.hostname}` }); return;
    }
    const urlStr = `${url.origin}${url.pathname}`.replace(/\/$/, '');
    let checkedAt: string;
    if (!(r.checked_at || '').trim()) {
      checkedAt = normalizeCheckedAt(nowVN())!;
      out.warnings.push({ row: line, message: 'Thiếu checked_at — dùng thời điểm nhập' });
    } else {
      const n = normalizeCheckedAt(r.checked_at!);
      if (!n) { out.errors.push({ row: line, message: `checked_at không đúng định dạng (YYYY-MM-DD HH:mm): "${r.checked_at}"` }); return; }
      checkedAt = n;
    }
    const type = norm(r.check_type).startsWith('re') ? 'recheck' : 'qc';
    const checkKey = `${urlStr}|${checkedAt}|${type}`;
    if (ctx.existingCheckKeys.has(checkKey)) { out.duplicates++; return; }

    let check = checksByKey.get(checkKey);
    if (!check) {
      const vals = Object.keys(SCORE_MAX).map(k => r[k as Col]?.trim() ?? '');
      let scores: CiScores | null = null;
      if (vals.every(v => v !== '')) {
        const nums = vals.map(v => Math.round(Number(v)));
        if (nums.some(n => Number.isNaN(n))) out.warnings.push({ row: line, message: 'Điểm không phải số — bỏ qua điểm' });
        else {
          const keys = Object.keys(SCORE_MAX) as (keyof typeof SCORE_MAX)[];
          const s = Object.fromEntries(keys.map((k, i) => [k, Math.min(SCORE_MAX[k], Math.max(0, nums[i]))])) as Omit<CiScores, 'total'>;
          const total = keys.reduce((a, k) => a + s[k], 0);
          if (r.total && Number(r.total) !== total) out.warnings.push({ row: line, message: `Tổng điểm ${r.total} ≠ tổng tiêu chí ${total} — dùng ${total}` });
          scores = { ...s, total };
        }
      } else if (vals.some(v => v !== '')) out.warnings.push({ row: line, message: 'Thiếu một số điểm tiêu chí — không lưu điểm cho lượt này' });
      check = { id: shortId('C'), key: checkKey, url: urlStr, title: r.title || urlStr, checkedAt, type, scores, summary: r.summary || undefined, source: 'chatgpt', importedBy: ctx.importedBy, importedAt: now };
      checksByKey.set(checkKey, check);
    }

    if (r.previous_finding_id) {
      const st = PREV_STATUS_ALIASES[norm(r.previous_status)];
      if (!st) { out.errors.push({ row: line, message: `previous_status không hợp lệ: "${r.previous_status}"` }); return; }
      out.recheckRows.push({ checkKey, url: urlStr, findingId: r.previous_finding_id.trim(), status: st, note: r.rationale || undefined });
      return;
    }
    if (!r.severity) return; // lượt chấm không có phát hiện

    const severity = r.severity.trim().toUpperCase() as CiSeverity;
    if (!['P0', 'P1', 'P2', 'P3'].includes(severity)) { out.errors.push({ row: line, message: `severity phải là P0–P3: "${r.severity}"` }); return; }
    const category = CATEGORY_ALIASES[norm(r.category)];
    if (!category) { out.errors.push({ row: line, message: `category không hợp lệ: "${r.category}"` }); return; }
    if (!r.rationale) { out.errors.push({ row: line, message: 'Thiếu rationale (lý do)' }); return; }
    const location = r.location || 'Toàn bài';
    const fKey = `${checkKey}|${norm(location)}|${norm(r.quote) || norm(r.rationale).slice(0, 80)}`;
    if (ctx.existingFindingKeys.has(fKey) || out.findings.some(f => f.key === fKey)) { out.duplicates++; return; }
    const evidenceUrls = (r.evidence_urls || '').split(/[\s,;]+/).filter(u => /^https?:\/\//.test(u));
    if (!evidenceUrls.length && category !== 'content_opportunity') out.warnings.push({ row: line, message: 'Không có URL bằng chứng' });
    out.findings.push({
      id: shortId('F'), key: fKey, checkId: check.id, url: urlStr, title: check.title, severity, category, location,
      quote: r.quote || undefined, rationale: r.rationale, suggestedAction: r.suggested_action || '', evidenceUrls,
      verification: r.verification || undefined, decision: 'pending', status: 'open', createdAt: now,
    });
  });
  out.checks = [...checksByKey.values()];
  return out;
}
