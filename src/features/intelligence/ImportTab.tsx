import { useMemo, useState } from 'react';
import { Copy, Upload, RefreshCw, FileInput, AlertTriangle, Trash2 } from 'lucide-react';
import { confirmAndRun, deleteCheck } from './deleteActions';
import toast from 'react-hot-toast';
import { useAppStore } from '@/shared/store/appStore';
import { loadSheetJSFromCDN } from '@/shared/utils/csvImport';
import { parseTable, normalizeRows, type ParsedImport } from './importParser';
import { normalizeOpportunityRows, OPPORTUNITY_COLUMNS, type ParsedOpportunities } from './opportunityParser';
import { QC_PROMPT, SHEET_HEADER } from './prompts';
import { copyText, fmtCheckedAt, mutedStyle } from './labels';
import { applyQcImport, syncSheets, summarizeSync } from './sheetSync';
import { Score, UrlLink } from './ui';

type Kind = 'qc' | 'competitor';
type Parsed = { kind: 'qc'; data: ParsedImport } | { kind: 'competitor'; data: ParsedOpportunities } | { error: string } | null;

/** Nhận diện loại dữ liệu theo dòng tiêu đề: có cột "topic" → phân tích đối thủ, còn lại → QC. */
function detectKind(text: string): Kind {
  const first = text.trim().split(/\r?\n/)[0].toLowerCase();
  return /(^|[\t,"])topic([\t,"]|$)/.test(first) ? 'competitor' : 'qc';
}

export default function ImportTab({ canManage }: { canManage: boolean }) {
  const { currentUser, ciChecks, ciFindings, ciOpportunities, ciSettings, addCiOpportunities, setCiSettings } = useAppStore();
  const [kind, setKind] = useState<Kind>('qc');
  const [text, setText] = useState('');
  const [qcUrl, setQcUrl] = useState(ciSettings.sheetCsvUrl || '');
  const [oppUrl, setOppUrl] = useState(ciSettings.opportunitySheetCsvUrl || '');
  const [loading, setLoading] = useState(false);
  const sheetUrl = kind === 'qc' ? qcUrl : oppUrl;
  const setSheetUrl = kind === 'qc' ? setQcUrl : setOppUrl;

  const parsed: Parsed = useMemo(() => {
    if (!text.trim()) return null;
    const { rows, error } = parseTable(text);
    if (error) return { error };
    if (detectKind(text) === 'competitor') {
      return { kind: 'competitor', data: normalizeOpportunityRows(rows, { existingKeys: new Set(ciOpportunities.map(o => o.key)), importedBy: currentUser?.name || '' }) };
    }
    return { kind: 'qc', data: normalizeRows(rows, { existingChecks: new Map(ciChecks.map(c => [c.key, c])), existingFindingKeys: new Set(ciFindings.map(f => f.key)), importedBy: currentUser?.name || '' }) };
  }, [text, ciChecks, ciFindings, ciOpportunities, currentUser]);

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
      const key = kind === 'qc' ? 'sheetCsvUrl' : 'opportunitySheetCsvUrl';
      if (sheetUrl !== ciSettings[key]) setCiSettings({ ...ciSettings, [key]: sheetUrl });
      toast.success('Đã đọc Google Sheet — kiểm tra bản xem trước rồi bấm Nhập');
    } catch {
      toast.error('Không đọc được link. Hãy dùng link "Publish to web" dạng CSV của đúng tab, hoặc copy các dòng trong Sheet rồi dán.');
    } finally { setLoading(false); }
  };

  const importQc = (p: ParsedImport) => {
    const linked = applyQcImport(p);
    toast.success(`Đã nhập ${p.checks.length} lượt chấm, ${p.findings.length} lỗi${linked ? `, ${linked} kết quả kiểm tra lại` : ''}`);
  };

  const syncNow = async () => {
    setLoading(true);
    try {
      const log = await syncSheets({ auto: false });
      if (!log) toast.error('Chưa lưu link Sheet nào.');
      else { const { text, hasErrors } = summarizeSync(log); (hasErrors ? toast.error : toast.success)(text || 'Không có dữ liệu mới'); }
    } finally { setLoading(false); }
  };

  const doImport = () => {
    if (!parsed || 'error' in parsed) return;
    if (parsed.kind === 'qc') importQc(parsed.data);
    else {
      addCiOpportunities(parsed.data.items);
      toast.success(`Đã nhập ${parsed.data.items.length} cơ hội nội dung — xem ở tab Cơ hội nội dung`);
    }
    setText('');
  };

  const issues = parsed && !('error' in parsed) ? parsed.data : null;
  const importable = !parsed || 'error' in parsed ? 0 : parsed.kind === 'qc' ? parsed.data.checks.length + parsed.data.findings.length : parsed.data.items.length;
  const recentChecks = [...ciChecks].sort((a, b) => b.importedAt.localeCompare(a.importedAt)).slice(0, 15);
  const recentOpps = [...ciOpportunities].sort((a, b) => b.importedAt.localeCompare(a.importedAt)).slice(0, 15);

  const last = ciSettings.lastSync;
  const lastErrors = last ? [
    ...(last.qc && 'error' in last.qc ? [last.qc.error] : last.qc?.errors.map(e => `QC ${e}`) || []),
    ...(last.competitor && 'error' in last.competitor ? [last.competitor.error] : last.competitor?.errors.map(e => `Đối thủ ${e}`) || []),
  ] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <strong>Đồng bộ Google Sheet</strong>
            <div style={mutedStyle}>Tự đồng bộ khi Manager/Leader mở trang (tối đa 1 lần / 30 phút cho cả team). Cần lưu link CSV của 2 tab bên dưới.</div>
          </div>
          <button className="btn btn-secondary btn-sm" disabled={loading || (!ciSettings.sheetCsvUrl && !ciSettings.opportunitySheetCsvUrl)} onClick={syncNow}>
            <RefreshCw size={13} /> {loading ? 'Đang đồng bộ…' : 'Đồng bộ ngay'}
          </button>
        </div>
        {last ? (
          <div style={{ marginTop: 8, fontSize: '0.84rem' }}>
            Lần gần nhất: {new Date(last.at).toLocaleString('vi-VN')} · {last.auto ? 'tự động' : 'thủ công'} bởi {last.by}
            {(last.qc || last.competitor) ? <> — {summarizeSync(last).text}</> : <span style={mutedStyle}> — đang chạy…</span>}
            {lastErrors.length > 0 && <div style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: 4 }}>{lastErrors.slice(0, 8).join(' · ')}{lastErrors.length > 8 ? ` · … (${lastErrors.length} lỗi)` : ''}</div>}
          </div>
        ) : <div style={{ ...mutedStyle, marginTop: 8 }}>Chưa đồng bộ lần nào.</div>}
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          <button className={`btn btn-sm ${kind === 'qc' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setKind('qc')}>QC bài Long Châu (cần sửa gì)</button>
          <button className={`btn btn-sm ${kind === 'competitor' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setKind('competitor')}>Phân tích đối thủ (nên phát triển gì)</button>
        </div>
        {kind === 'qc' ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => copy(QC_PROMPT, 'Đã copy prompt QC')}><Copy size={13} /> Copy prompt QC</button>
            <button className="btn btn-secondary btn-sm" onClick={() => copy(SHEET_HEADER, 'Đã copy tiêu đề cột tab QC')}><Copy size={13} /> Copy tiêu đề cột tab QC</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => copy(OPPORTUNITY_COLUMNS.join('\t'), 'Đã copy tiêu đề cột tab đối thủ')}><Copy size={13} /> Copy tiêu đề cột tab đối thủ</button>
            <span style={mutedStyle}>Cột: {OPPORTUNITY_COLUMNS.join(', ')}</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '12px 0 8px' }}>
          <input className="form-input" style={{ flex: 1, minWidth: 260 }} placeholder={`Link CSV "Publish to web" của tab ${kind === 'qc' ? 'QC' : 'phân tích đối thủ'} (tuỳ chọn)`}
            value={sheetUrl} onChange={e => setSheetUrl(e.target.value)} />
          <button className="btn btn-secondary btn-sm" disabled={!sheetUrl || loading} onClick={syncSheet}><RefreshCw size={13} /> {loading ? 'Đang đọc…' : 'Đọc từ Sheet'}</button>
          <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
            <Upload size={13} /> Tải file .csv/.tsv/.xlsx
            <input type="file" accept=".csv,.tsv,.xlsx,.xls,.json" hidden onChange={e => e.target.files?.[0] && loadFile(e.target.files[0])} />
          </label>
        </div>
        <textarea className="form-textarea" rows={7} value={text} onChange={e => setText(e.target.value)}
          placeholder="Hoặc copy các dòng trong Sheet (kèm dòng tiêu đề) rồi dán vào đây — hệ thống tự nhận ra dữ liệu QC hay phân tích đối thủ"
          style={{ fontFamily: 'monospace', fontSize: '0.78rem' }} />

        {parsed && 'error' in parsed && <div style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: 8 }}>{parsed.error}</div>}
        {parsed && !('error' in parsed) && issues && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: '0.85rem' }}>
              {parsed.kind === 'qc'
                ? <>Dữ liệu <strong>QC</strong>: <strong>{parsed.data.checks.length}</strong> lượt chấm · <strong>{parsed.data.findings.length}</strong> lỗi · <strong>{parsed.data.recheckRows.length}</strong> dòng kiểm tra lại</>
                : <>Dữ liệu <strong>phân tích đối thủ</strong>: <strong>{parsed.data.items.length}</strong> cơ hội nội dung</>}
              {issues.duplicates > 0 && <span style={{ color: 'var(--text-tertiary)' }}> · {issues.duplicates} dòng đã nhập trước đó (bỏ qua)</span>}
            </div>
            {issues.errors.length > 0 && <div style={{ color: 'var(--danger)', fontSize: '0.8rem' }}><AlertTriangle size={12} /> {issues.errors.length} dòng lỗi sẽ không được nhập: {issues.errors.slice(0, 6).map(e => `dòng ${e.row}: ${e.message}`).join(' · ')}</div>}
            {issues.warnings.length > 0 && <div style={{ color: '#B45309', fontSize: '0.8rem' }}>Lưu ý: {issues.warnings.slice(0, 6).map(e => `dòng ${e.row}: ${e.message}`).join(' · ')}</div>}
            <div><button className="btn btn-primary btn-sm" disabled={!importable} onClick={doImport}><FileInput size={13} /> Nhập vào dashboard</button></div>
          </div>
        )}
      </div>

      <div className="card data-table-wrapper">
        {kind === 'qc' ? (
          <table className="data-table">
            <thead><tr><th>Bài</th><th>Thời điểm chấm</th><th>Loại</th><th>Điểm</th><th>Lỗi</th><th>Nhập bởi</th>{canManage && <th></th>}</tr></thead>
            <tbody>
              {recentChecks.map(c => (
                <tr key={c.id}>
                  <td style={{ maxWidth: 380 }}><div style={{ fontWeight: 600 }}>{c.title}</div><UrlLink url={c.url} />{c.summary && <div style={mutedStyle}>{c.summary}</div>}</td>
                  <td>{fmtCheckedAt(c.checkedAt)}</td>
                  <td>{c.type === 'recheck' ? 'Kiểm tra lại' : 'QC'}</td>
                  <td><Score value={c.scores?.total} /></td>
                  <td>{ciFindings.filter(f => f.checkId === c.id).length}</td>
                  <td style={mutedStyle}>{c.importedBy}</td>
                  {canManage && (
                    <td>
                      <button className="btn btn-ghost btn-sm" title="Xoá lượt chấm này và toàn bộ lỗi của nó" style={{ color: 'var(--danger)' }}
                        onClick={() => confirmAndRun(`Xoá lượt chấm “${c.title}” (${fmtCheckedAt(c.checkedAt)}) cùng ${ciFindings.filter(f => f.checkId === c.id).length} lỗi? Không hoàn tác được.`, () => deleteCheck(c.id))}>
                        <Trash2 size={13} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {!recentChecks.length && <tr><td colSpan={7} style={mutedStyle}>Chưa có dữ liệu QC.</td></tr>}
            </tbody>
          </table>
        ) : (
          <table className="data-table">
            <thead><tr><th>Chủ đề</th><th>Đối thủ</th><th>Loại</th><th>Ưu tiên</th><th>Ngày phân tích</th></tr></thead>
            <tbody>
              {recentOpps.map(o => (
                <tr key={o.id}>
                  <td style={{ maxWidth: 380, fontWeight: 600 }}>{o.topic}</td>
                  <td>{o.competitor || '—'}</td>
                  <td>{o.type === 'new_article' ? 'Bài mới' : 'Bổ sung bài'}</td>
                  <td>{o.priority === 'high' ? 'Cao' : o.priority === 'low' ? 'Thấp' : 'Trung bình'}</td>
                  <td>{fmtCheckedAt(o.checkedAt)}</td>
                </tr>
              ))}
              {!recentOpps.length && <tr><td colSpan={5} style={mutedStyle}>Chưa có dữ liệu phân tích đối thủ.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
