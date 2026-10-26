import { ExternalLink } from 'lucide-react';
import type { CiFinding, CiSeverity } from '@/shared/types';
import { SEVERITY_META, CATEGORY_LABEL, scoreColor, mutedStyle } from './labels';

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



export function FindingDetail({ f }: { f: CiFinding }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: '0.86rem' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <SeverityBadge severity={f.severity} />
        <span className="status-badge status-waiting">{CATEGORY_LABEL[f.category]}</span>
        {f.competitor && <span className="status-badge status-review">So với {f.competitor}</span>}
        {f.verification && <span className="status-badge status-cancelled">{f.verification}</span>}
        <span style={mutedStyle}>Mã {f.id} · Vị trí: {f.location}</span>
      </div>
      {f.quote && <div style={{ padding: '6px 10px', borderLeft: '3px solid var(--primary-300)', background: 'var(--bg-secondary)', borderRadius: 6, color: 'var(--text-secondary)' }}>“{f.quote}”</div>}
      <div><strong>Lý do:</strong> {f.rationale}</div>
      {f.suggestedAction && <div><strong>Đề xuất:</strong> {f.suggestedAction}</div>}
      {f.competitorUrl && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><span style={mutedStyle}>Bài {f.competitor || 'đối thủ'}:</span><UrlLink url={f.competitorUrl} /></div>}
      {f.evidenceUrls.length > 0 && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><span style={mutedStyle}>Bằng chứng:</span>{f.evidenceUrls.map(u => <UrlLink key={u} url={u} />)}</div>}
    </div>
  );
}
