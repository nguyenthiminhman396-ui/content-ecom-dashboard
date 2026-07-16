/**
 * CSV / Excel import helpers — dùng chung cho các màn hình cần đọc file người dùng tải lên
 * (import KPI, import comment khách hàng...). Tách ra từ ImportDataPage / SubmitKPIPage.
 */

/** CSV split — RFC 4180-friendly nhẹ nhàng cho file Google Sheet export */
export function splitCSVLine(line: string): string[] {
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

export function parseCSV(text: string): string[][] {
  // Bỏ BOM nếu có, normalize line endings
  const clean = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = clean.split('\n').filter(l => l.length > 0);
  return lines.map(splitCSVLine);
}

// ── SheetJS lazy load (CDN) ─────────────────────────────────────────────────
export type SheetJSLib = {
  read: (data: unknown, opts?: unknown) => { SheetNames: string[]; Sheets: Record<string, unknown> };
  utils: { sheet_to_csv: (ws: unknown) => string };
};
let _sheetJsPromise: Promise<SheetJSLib | null> | null = null;
export function loadSheetJSFromCDN(): Promise<SheetJSLib | null> {
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

/** Đọc 1 file .csv/.xlsx/.xls thành grid string[][] (hàng 0 = header nếu có). */
export async function readTabularFile(file: File): Promise<string[][]> {
  let text = '';
  if (/\.(xlsx|xls)$/i.test(file.name)) {
    const XLSX = await loadSheetJSFromCDN();
    if (!XLSX) throw new Error('Không tải được thư viện Excel. Hãy export sang .csv rồi thử lại.');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    text = XLSX.utils.sheet_to_csv(ws);
  } else {
    text = await file.text();
  }
  return parseCSV(text);
}

/**
 * Tự động tìm cột chứa văn bản tự do (comment/nhận xét) trong 1 grid có header.
 * Ưu tiên khớp từ khoá header, fallback sang cột có độ dài văn bản trung bình lớn nhất.
 */
export function detectFreeTextColumn(grid: string[][], keywords: string[]): { colIndex: number; colName: string } | null {
  if (grid.length < 1) return null;
  const header = grid[0].map(h => (h ?? '').toString().trim());
  const headerLower = header.map(h => h.toLowerCase());

  const kwIndex = headerLower.findIndex(h => keywords.some(kw => h.includes(kw)));
  if (kwIndex >= 0) return { colIndex: kwIndex, colName: header[kwIndex] || `Cột ${kwIndex + 1}` };

  // Fallback: cột có độ dài trung bình lớn nhất, loại các cột rõ ràng không phải text tự do
  const excludeKw = ['thời gian', 'ngày', 'date', 'link', 'email', 'sđt', 'phone', 'điểm', 'score', 'stt', 'id', 'stt.'];
  const dataRows = grid.slice(1, Math.min(grid.length, 200)); // sample 200 dòng đầu để đo nhanh
  let bestCol = -1;
  let bestAvg = 0;
  for (let c = 0; c < header.length; c++) {
    if (excludeKw.some(kw => headerLower[c]?.includes(kw))) continue;
    const lens = dataRows.map(r => (r[c] ?? '').trim().length).filter(l => l > 0);
    if (lens.length === 0) continue;
    const avg = lens.reduce((a, b) => a + b, 0) / lens.length;
    if (avg > bestAvg) { bestAvg = avg; bestCol = c; }
  }
  if (bestCol < 0 || bestAvg < 8) return null; // không tìm được cột text tự do đáng kể
  return { colIndex: bestCol, colName: header[bestCol] || `Cột ${bestCol + 1}` };
}
