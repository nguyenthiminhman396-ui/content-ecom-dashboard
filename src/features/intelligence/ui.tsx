import { ExternalLink, Calendar, Search, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import type { CiFinding, CiOpportunity, CiSeverity } from '@/shared/types';
import { SEVERITY_META, CATEGORY_LABEL, scoreColor, mutedStyle, todayVN, type DateFilterValue, type DatePreset } from './labels';

export function SeverityBadge({ severity }: { severity: CiSeverity }) {
  const m = SEVERITY_META[severity];
  return <span className="status-badge" style={{ background: m.bg, color: m.color }} title={m.label}>{severity}</span>;
}

export function Score({ value }: { value?: number | null }) {
  if (value == null) return <span style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>Chưa có điểm</span>;
  return <strong style={{ color: scoreColor(value) }}>{value}<span style={{ fontSize: '0.75em', color: 'var(--text-tertiary)' }}>/100</span></strong>;
}

export function UrlLink({ url, label }: { url: string; label?: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-link)', fontSize: '0.8rem', wordBreak: 'break-all', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      {label || url.replace(/^https?:\/\//, '')} <ExternalLink size={11} />
    </a>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Tìm nhanh tiêu đề, URL, nội dung…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', minWidth: 210, flex: '1 1 210px', maxWidth: 320 }}>
      <Search size={14} style={{ position: 'absolute', left: 10, color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
      <input
        className="form-input"
        style={{ paddingLeft: 30, paddingRight: value ? 28 : 10, width: '100%' }}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          title="Xoá tìm kiếm"
          style={{ position: 'absolute', right: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', padding: 2 }}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

export function DateFilterControl({ value, onChange, label = 'Ngày' }: { value: DateFilterValue; onChange: (v: DateFilterValue) => void; label?: string }) {
  const setPreset = (preset: DatePreset) => {
    if (preset === 'custom' && !value.from && !value.to) {
      const t = todayVN();
      onChange({ preset, from: t, to: t });
    } else {
      onChange({ ...value, preset });
    }
  };
  return (
    <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
        <Calendar size={13} style={{ position: 'absolute', left: 10, color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
        <select
          className="form-select"
          style={{ width: 'auto', paddingLeft: 28 }}
          value={value.preset}
          onChange={e => setPreset(e.target.value as DatePreset)}
          title={`Lọc theo ${label.toLowerCase()}`}
        >
          <option value="all">{label}: Mọi ngày</option>
          <option value="today">{label}: Hôm nay</option>
          <option value="7d">{label}: 7 ngày qua</option>
          <option value="30d">{label}: 30 ngày qua</option>
          <option value="month">{label}: Tháng này</option>
          <option value="custom">{label}: Tuỳ chọn…</option>
        </select>
      </div>
      {value.preset === 'custom' && (
        <>
          <input
            type="date"
            className="form-input"
            style={{ width: 'auto', padding: '5px 8px', fontSize: '0.82rem' }}
            value={value.from}
            onChange={e => onChange({ ...value, from: e.target.value })}
            title="Từ ngày"
          />
          <span style={mutedStyle}>→</span>
          <input
            type="date"
            className="form-input"
            style={{ width: 'auto', padding: '5px 8px', fontSize: '0.82rem' }}
            value={value.to}
            onChange={e => onChange({ ...value, to: e.target.value })}
            title="Đến ngày"
          />
        </>
      )}
    </div>
  );
}

export function PaginationBar({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  unit = 'mục',
  pageSizeOptions = [10, 20, 50],
}: {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  unit?: string;
  pageSizeOptions?: number[];
}) {
  if (total <= 0) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(total, safePage * pageSize);

  const pages: (number | 'ellipsis')[] = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - safePage) <= 1) {
      pages.push(p);
    } else if (pages[pages.length - 1] !== 'ellipsis') {
      pages.push('ellipsis');
    }
  }

  return (
    <div className="card" style={{ padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={mutedStyle}>
          Hiển thị <strong>{start}–{end}</strong> / <strong>{total}</strong> {unit}
        </span>
        {onPageSizeChange && (
          <select
            className="form-select"
            style={{ width: 'auto', padding: '4px 24px 4px 8px', fontSize: '0.8rem' }}
            value={pageSize}
            onChange={e => { onPageSizeChange(Number(e.target.value)); onPageChange(1); }}
          >
            {pageSizeOptions.map(n => <option key={n} value={n}>{n} {unit} / trang</option>)}
          </select>
        )}
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '4px 7px' }} disabled={safePage <= 1} onClick={() => onPageChange(1)} title="Trang đầu">
            <ChevronsLeft size={13} />
          </button>
          <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '4px 8px' }} disabled={safePage <= 1} onClick={() => onPageChange(safePage - 1)} title="Trang trước">
            <ChevronLeft size={13} /> Trước
          </button>
          {pages.map((p, idx) =>
            p === 'ellipsis' ? (
              <span key={`e-${idx}`} style={{ ...mutedStyle, padding: '0 4px' }}>…</span>
            ) : (
              <button
                key={p}
                type="button"
                className={`btn btn-sm ${p === safePage ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '4px 10px', minWidth: 30 }}
                onClick={() => onPageChange(p)}
              >
                {p}
              </button>
            )
          )}
          <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '4px 8px' }} disabled={safePage >= totalPages} onClick={() => onPageChange(safePage + 1)} title="Trang sau">
            Sau <ChevronRight size={13} />
          </button>
          <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '4px 7px' }} disabled={safePage >= totalPages} onClick={() => onPageChange(totalPages)} title="Trang cuối">
            <ChevronsRight size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

export function FindingDetail({ f, compact = false }: { f: CiFinding; compact?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: '0.86rem' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <SeverityBadge severity={f.severity} />
        <span className="status-badge status-waiting">{CATEGORY_LABEL[f.category]}</span>
        {f.verification && <span className="status-badge status-cancelled">{f.verification}</span>}
        <span style={mutedStyle}>Mã {f.id} · Vị trí: <strong>{f.location}</strong></span>
      </div>
      {!compact && f.quote && <div style={{ padding: '6px 10px', borderLeft: '3px solid var(--primary-300)', background: 'var(--bg-secondary)', borderRadius: 6, color: 'var(--text-secondary)' }}>“{f.quote}”</div>}
      <div><strong>Lý do:</strong> {f.rationale}</div>
      {f.suggestedAction && <div><strong>Đề xuất:</strong> {f.suggestedAction}</div>}
      {!compact && f.evidenceUrls.length > 0 && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><span style={mutedStyle}>Bằng chứng:</span>{f.evidenceUrls.map(u => <UrlLink key={u} url={u} />)}</div>}
    </div>
  );
}

/** Nội dung một insight đối thủ (dùng ở tab Cơ hội nội dung và Assignments). */
export function OpportunityDetail({ o, compact = false }: { o: CiOpportunity; compact?: boolean }) {
  if (compact) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: '0.84rem' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {(o.competitor || o.competitorUrl) && (
            <span><span style={mutedStyle}>Đối thủ: </span><strong>{o.competitor || '—'}</strong>{o.competitorUrl && <> (<UrlLink url={o.competitorUrl} label="link" />)</>}</span>
          )}
          {o.lcUrl && <span><span style={mutedStyle}>Bài LC: </span><UrlLink url={o.lcUrl} /></span>}
        </div>
        {o.lcGap && <div style={{ color: 'var(--text-secondary)' }}><strong>Thiếu hụt:</strong> {o.lcGap}</div>}
        {!o.lcGap && o.suggestedAction && <div style={{ color: 'var(--text-secondary)' }}><strong>Đề xuất:</strong> {o.suggestedAction.split('\n')[0]}</div>}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.86rem' }}>
      {(o.competitor || o.competitorUrl) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={mutedStyle}>Đối thủ:</span><strong>{o.competitor || '—'}</strong>{o.competitorUrl && <UrlLink url={o.competitorUrl} />}
        </div>
      )}
      {o.lcUrl && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><span style={mutedStyle}>Bài Long Châu:</span><UrlLink url={o.lcUrl} /></div>}
      {o.competitorObservation && <div><strong>Đối thủ làm gì:</strong> {o.competitorObservation}</div>}
      {o.lcGap && <div><strong>Long Châu còn thiếu:</strong> {o.lcGap}</div>}
      {o.userValue && <div><strong>Giá trị cho người đọc:</strong> {o.userValue}</div>}
      {o.suggestedAction && <div style={{ whiteSpace: 'pre-wrap' }}><strong>Đề xuất:</strong> {o.suggestedAction}</div>}
      {o.evidenceUrls.length > 0 && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><span style={mutedStyle}>Bằng chứng:</span>{o.evidenceUrls.map(u => <UrlLink key={u} url={u} />)}</div>}
      {(o.insightType || o.verification || o.sheetStatus) && (
        <div style={mutedStyle}>{[o.insightType && `insight_type: ${o.insightType}`, o.verification && `verification: ${o.verification}`, o.sheetStatus && `status (sheet): ${o.sheetStatus}`].filter(Boolean).join(' · ')}</div>
      )}
    </div>
  );
}
