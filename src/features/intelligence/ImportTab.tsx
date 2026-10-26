import { useMemo, useState } from 'react';
import { Copy, Upload, RefreshCw, FileInput, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppStore } from '@/shared/store/appStore';
import { loadSheetJSFromCDN } from '@/shared/utils/csvImport';
import { parseTable, normalizeRows, type ParsedImport } from './importParser';
import { QC_PROMPT, SHEET_HEADER } from './prompts';
import { copyText, fmtCheckedAt, mutedStyle } from './labels';
import { Score, UrlLink } from './ui';

export default function ImportTab() {
  const { currentUser, ciChecks, ciFindings, ciTasks, ciSettings, addCiImport, updateCiTask, setCiSettings } = useAppStore();
  const [text, setText] = useState('');
  const [sheetUrl, setSheetUrl] = useState(ciSettings.sheetCsvUrl || '');
  const [loading, setLoading] = useState(false);

  const parsed: ParsedImport | { error: string } | null = useMemo(() => {
    if (!text.trim()) return null;
    const { rows, error } = parseTable(text);
    if (error) return { error };
    return normalizeRows(rows, {
      existingCheckKeys: new Set(ciChecks.map(c => c.key)),
      existingFindingKeys: new Set(ciFindings.map(f => f.key)),
      importedBy: currentUser?.name || '',
    });
  }, [text, ciChecks, ciFindings, currentUser]);

  const copy = async (t: string, label: string) => {
    if (await copyText(t)) toast.success(label); else toast.error('Trình duyệt không cho copy — hãy chọn và copy thủ công');
  };

  const loadFile = async (file: File) => {
    try {
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        const XLSX = await loadSheetJSFromCDN();
        if (!XLSX) { toast.error('Không tải được thư viện Excel — hãy xuất .csv'); return; }
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        setText(XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]));
      } else setText(await file.text());
    } catch { toast.error('Không đọc được file'); }
  };

  const syncSheet = async () => {
    if (!sheetUrl) return;
    setLoading(true);
    try {
      const res = await fetch(sheetUrl, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      setText(await res.text());
      if (sheetUrl !== ciSettings.sheetCsvUrl) setCiSettings({ ...ciSettings, sheetCsvUrl: sheetUrl });
      toast.success('Đã đọc Google Sheet — kiểm tra bản xem trước rồi bấm Nhập');
    } catch {
      toast.error('Không đọc được link. Hãy dùng link "Publish to web" dạng CSV, hoặc copy các dòng trong Sheet rồi dán.');
    } finally { setLoading(false); }
  };

  const doImport = () => {
    if (!parsed || 'error' in parsed) return;
    addCiImport(parsed.checks, parsed.findings);
    // Kết quả kiểm tra lại → gắn vào task chứa các lỗi cũ
    const byCheck = new Map<string, typeof parsed.recheckRows>();
    for (const r of parsed.recheckRows) byCheck.set(r.checkKey, [...(byCheck.get(r.checkKey) || []), r]);
    let linked = 0;
    for (const [key, rows] of byCheck) {
      const check = parsed.checks.find(c => c.key === key);
      const task = ciTasks.find(t => rows.some(r => t.findingIds.includes(r.findingId)));
      if (!check || !task) continue;
      const ids = (s: string) => rows.filter(r => r.status === s && task.findingIds.includes(r.findingId)).map(r => r.findingId);
      const covered = new Set(rows.map(r => r.findingId));
      updateCiTask(task.id, {
        recheck: {
          checkId: check.id, resolved: ids('resolved'), unresolved: ids('unresolved'),
          unableToVerify: [...ids('unable_to_verify'), ...task.findingIds.filter(id => !covered.has(id))],
          newFindingIds: parsed.findings.filter(f => f.checkId === check.id).map(f => f.id), importedAt: new Date().toISOString(),
        },
        history: [...task.history, { at: new Date().toISOString(), by: currentUser?.name || '', action: 'Nhập kết quả kiểm tra lại' }],
      });
      linked++;
    }
    toast.success(`Đã nhập ${parsed.checks.length} lượt chấm, ${parsed.findings.length} phát hiện${linked ? `, ${linked} kết quả kiểm tra lại` : ''}`);
    setText('');
  };

  const recent = [...ciChecks].sort((a, b) => b.importedAt.localeCompare(a.importedAt)).slice(0, 15);
  const p = parsed && !('error' in parsed) ? parsed : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>1. Chấm bài bằng ChatGPT</div>
        <p style={mutedStyle}>Copy prompt, dán URL và nội dung bài vào ChatGPT. ChatGPT trả về các dòng TSV — dán vào Google Sheet chung (dòng 1 là tiêu đề cột) hoặc dán thẳng xuống dưới.</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => copy(QC_PROMPT, 'Đã copy prompt QC')}><Copy size={13} /> Copy prompt QC</button>
          <button className="btn btn-secondary btn-sm" onClick={() => copy(SHEET_HEADER, 'Đã copy dòng tiêu đề cột cho Sheet')}><Copy size={13} /> Copy tiêu đề cột Sheet</button>
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>2. Đưa kết quả vào dashboard</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
          <input className="form-input" style={{ flex: 1, minWidth: 260 }} placeholder="Link CSV của Google Sheet (File › Chia sẻ › Publish to web › CSV) — tuỳ chọn"
            value={sheetUrl} onChange={e => setSheetUrl(e.target.value)} />
          <button className="btn btn-secondary btn-sm" disabled={!sheetUrl || loading} onClick={syncSheet}><RefreshCw size={13} /> {loading ? 'Đang đọc…' : 'Đọc từ Sheet'}</button>
          <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
            <Upload size={13} /> Tải file .csv/.tsv/.xlsx
            <input type="file" accept=".csv,.tsv,.xlsx,.xls,.json" hidden onChange={e => e.target.files?.[0] && loadFile(e.target.files[0])} />
          </label>
        </div>
        <p style={{ ...mutedStyle, marginBottom: 8 }}>Link "Publish to web" ai có link cũng xem được. Nếu dữ liệu cần kín, hãy chọn các dòng trong Sheet (kèm dòng tiêu đề), Ctrl+C rồi dán vào ô dưới.</p>
        <textarea className="form-textarea" rows={7} value={text} onChange={e => setText(e.target.value)}
          placeholder="Dán dữ liệu từ Google Sheet / kết quả TSV hoặc JSON của ChatGPT (gồm dòng tiêu đề cột)" style={{ fontFamily: 'monospace', fontSize: '0.78rem' }} />

        {parsed && 'error' in parsed && <div style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: 8 }}>{parsed.error}</div>}
        {p && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: '0.85rem' }}>
              Xem trước: <strong>{p.checks.length}</strong> lượt chấm · <strong>{p.findings.length}</strong> phát hiện · <strong>{p.recheckRows.length}</strong> dòng kiểm tra lại
              {p.duplicates > 0 && <> · <span style={{ color: 'var(--text-tertiary)' }}>{p.duplicates} dòng đã nhập trước đó (bỏ qua)</span></>}
            </div>
            {p.errors.length > 0 && <div style={{ color: 'var(--danger)', fontSize: '0.8rem' }}><AlertTriangle size={12} /> {p.errors.length} dòng lỗi sẽ không được nhập: {p.errors.slice(0, 6).map(e => `dòng ${e.row}: ${e.message}`).join(' · ')}</div>}
            {p.warnings.length > 0 && <div style={{ color: '#B45309', fontSize: '0.8rem' }}>Lưu ý: {p.warnings.slice(0, 6).map(e => `dòng ${e.row}: ${e.message}`).join(' · ')}</div>}
            <div><button className="btn btn-primary btn-sm" disabled={!p.checks.length} onClick={doImport}><FileInput size={13} /> Nhập vào dashboard</button></div>
          </div>
        )}
      </div>

      <div className="card data-table-wrapper">
        <table className="data-table">
          <thead><tr><th>Bài</th><th>Thời điểm chấm</th><th>Loại</th><th>Điểm</th><th>Phát hiện</th><th>Nhập bởi</th></tr></thead>
          <tbody>
            {recent.map(c => (
              <tr key={c.id}>
                <td style={{ maxWidth: 380 }}><div style={{ fontWeight: 600 }}>{c.title}</div><UrlLink url={c.url} />{c.summary && <div style={mutedStyle}>{c.summary}</div>}</td>
                <td>{fmtCheckedAt(c.checkedAt)}</td>
                <td>{c.type === 'recheck' ? 'Kiểm tra lại' : 'QC'}</td>
                <td><Score value={c.scores?.total} /></td>
                <td>{ciFindings.filter(f => f.checkId === c.id).length}</td>
                <td style={mutedStyle}>{c.importedBy}</td>
              </tr>
            ))}
            {!recent.length && <tr><td colSpan={6} style={mutedStyle}>Chưa có kết quả nào. Nguồn: ChatGPT — dashboard không tự kiểm chứng trích dẫn/URL, quản lý duyệt ở Review Queue.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
