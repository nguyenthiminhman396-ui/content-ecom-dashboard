import { useState } from 'react';
import { X, Edit3, Save, Printer } from 'lucide-react';
import type { WeeklyReport } from '@/shared/types';

// ─── helpers ────────────────────────────────────────────────────────────────

function formatWeekLabel(weekStart: string): string {
  const d = new Date(weekStart);
  const end = new Date(d);
  end.setDate(d.getDate() + 6);
  return `${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} — ${end.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
}

function pStatus(p: number): { label: string; color: string; bg: string; bar: string } {
  if (p === 0) return { label: 'Critical',     color: '#dc2626', bg: '#fef2f2', bar: 'linear-gradient(90deg,#dc2626,#fb7185)' };
  if (p < 30)  return { label: 'Risk',         color: '#dc2626', bg: '#fef2f2', bar: 'linear-gradient(90deg,#dc2626,#fb7185)' };
  if (p < 60)  return { label: 'Watch',        color: '#b45309', bg: '#fffbeb', bar: 'linear-gradient(90deg,#f59e0b,#f97316)' };
  if (p < 80)  return { label: 'In progress',  color: '#2563eb', bg: '#eff6ff', bar: 'linear-gradient(90deg,#2563eb,#7c3aed)' };
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

// ─── component ──────────────────────────────────────────────────────────────

interface Props {
  report: WeeklyReport;
  canEdit: boolean;
  onClose: () => void;
  onSave: (updates: Partial<WeeklyReport>) => void;
}

export default function WeeklyReportViewer({ report, canEdit, onClose, onSave }: Props) {
  const [editing, setEditing]   = useState(false);
  const [draft, setDraft]       = useState<Partial<WeeklyReport>>({});

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
  const totalPoints  = report.totalPoints;
  const mediaLinks   = (report.taskBreakdownByTeam ?? [])
    .filter(t => /multi|video|hình|ảnh/i.test(t.team))
    .reduce((s, t) => s + t.items.reduce((ss, i) => ss + i.links, 0), 0);
  const articleLinks = totalLinks - mediaLinks;
  const riskCount    = report.projectProgress.filter(p => p.progress < 30).length;
  const weekLabel    = formatWeekLabel(report.weekStart);

  // ── parse free-text fields ─────────────────────────────────────────────
  const bottleneckLines = val('bottlenecks').split('\n\n').filter(Boolean);
  const actionLines     = val('nextWeekPlan').split('\n').filter(Boolean);

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

  const card = (children: React.ReactNode, extra?: React.CSSProperties) => (
    <div style={{
      background: 'rgba(255,255,255,.92)', border: '1px solid #e2e8f0',
      borderRadius: '20px', padding: '18px',
      boxShadow: '0 6px 22px rgba(15,23,42,.05)',
      ...extra,
    }}>{children}</div>
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

        {canEdit && !report.locked && !editing && (
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
        <button className="btn btn-icon btn-ghost" onClick={onClose} title="Đóng">
          <X size={16} />
        </button>
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
                ['Tổng điểm', `${totalPoints.toFixed(1)}đ`],
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '14px', marginBottom: '24px' }}>
          {([
            { icon: '🔗', label: 'Tổng link',     value: totalLinks,            note: `${articleLinks} bài viết · ${mediaLinks} media`, iconBg: '#eff6ff',  iconC: '#2563eb', auto: true },
            { icon: '🏁', label: 'Tổng điểm',     value: totalPoints.toFixed(1),note: 'Điểm tuần này',                                  iconBg: '#ecfdf5',  iconC: '#16a34a', auto: true },
            { icon: '📦', label: 'Dự án',          value: report.projectProgress.length, note: `${riskCount} cần chú ý`,               iconBg: '#f5f3ff',  iconC: '#7c3aed', auto: true },
            { icon: '🚧', label: 'Dự án rủi ro',   value: riskCount,             note: 'Dưới 30% tiến độ',                              iconBg: '#fef2f2',  iconC: '#dc2626', auto: true },
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
              <div style={{ fontSize: '32px', fontWeight: 900, letterSpacing: '-1px', color: '#0f172a', lineHeight: 1 }}>
                {k.value}
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>{k.note}</div>
            </div>
          ))}
        </div>

        {/* ─ project progress ─ */}
        {report.projectProgress.length > 0 && (
          <>
            {sectionTitle('2. Tiến độ dự án', 'Tự động tính từ dữ liệu dự án')}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '12px', marginBottom: '24px' }}>
              {report.projectProgress.map((p, i) => {
                const s = pStatus(p.progress);
                return (
                  <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: '16px', padding: '14px', background: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                      <div>
                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '14px' }}>{p.projectName}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                          {p.tasksCompleted}/{p.tasksTotal} hạng mục
                        </div>
                      </div>
                      <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: '999px',
                        padding: '4px 10px', fontSize: '11px', fontWeight: 800,
                        background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>
                        {s.label}
                      </span>
                    </div>
                    <div style={{ height: '10px', borderRadius: '999px', background: '#e5e7eb', overflow: 'hidden', margin: '8px 0' }}>
                      <div style={{ height: '100%', width: `${p.progress}%`, borderRadius: '999px',
                        background: s.bar, transition: 'width .4s' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '12px' }}>
                      <b style={{ color: '#0f172a', fontSize: '14px' }}>{p.progress}%</b>
                      <span style={{ fontStyle: 'italic', maxWidth: '70%', textAlign: 'right', lineHeight: 1.4 }}>{p.notes}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ─ task breakdown table ─ */}
        {(report.taskBreakdownByTeam ?? []).length > 0 && (
          <>
            {sectionTitle('4. Chi tiết đầu việc', 'Sản lượng và điểm trong tuần')}
            {card(
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Nhóm', 'Đầu việc', 'Link', 'Điểm'].map(h => (
                      <th key={h} style={{ padding: '11px 14px', background: '#f8fafc', color: '#475569',
                        fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.5px',
                        textAlign: 'left', fontWeight: 700, borderBottom: '1px solid #e2e8f0' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.taskBreakdownByTeam!.flatMap(team =>
                    team.items.map((item, j) => (
                      <tr key={`${team.team}-${j}`}>
                        {j === 0 && (
                          <td rowSpan={team.items.length}
                            style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9',
                              fontWeight: 700, color: '#0f172a', verticalAlign: 'top', fontSize: '13px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%',
                                background: team.color, display: 'inline-block', flexShrink: 0 }} />
                              {team.team}
                            </span>
                          </td>
                        )}
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', fontSize: '13px', color: '#334155' }}>
                          {item.label}
                        </td>
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9',
                          fontWeight: 700, color: '#0f172a', fontSize: '14px' }}>
                          {item.links}
                        </td>
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9',
                          fontWeight: 700, color: '#16a34a', fontSize: '14px' }}>
                          {item.points.toFixed(1)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>,
              { padding: 0, overflow: 'hidden', marginBottom: '24px' }
            )}
          </>
        )}

        {/* ─ bottlenecks + action plan ─ */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
          {/* bottlenecks */}
          <div>
            {sectionTitle('3. Điểm nghẽn', 'Phân loại theo mức độ ảnh hưởng')}
            {card(
              editing ? editArea('bottlenecks', 7, 'Mỗi điểm nghẽn trên một dòng...') :
              bottleneckLines.length > 0 ? (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {bottleneckLines.map((line, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '32px 1fr', gap: '10px',
                      padding: '12px', borderRadius: '14px', border: '1px solid #fee2e2', background: '#fff9f9' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '10px',
                        display: 'grid', placeItems: 'center', background: '#fef2f2',
                        color: '#dc2626', fontWeight: 900, fontSize: '13px' }}>{i+1}</div>
                      <p style={{ fontSize: '13px', color: '#475569', margin: 0, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{line}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>
                  Chưa ghi nhận điểm nghẽn nào.
                </p>
              )
            )}
          </div>

          {/* action plan */}
          <div>
            {sectionTitle('5. Action plan tuần tới', 'Ưu tiên xử lý')}
            <div style={{ padding: '20px', borderRadius: '20px',
              background: 'linear-gradient(135deg,#eff6ff,#faf5ff)',
              border: '1px solid #dbeafe', color: '#1e3a8a' }}>
              {editing ? (
                editArea('nextWeekPlan', 7, 'Mỗi action trên một dòng...')
              ) : actionLines.length > 0 ? (
                <ol style={{ paddingLeft: '18px' }}>
                  {actionLines.map((line, i) => (
                    <li key={i} style={{ margin: '9px 0', fontWeight: 600, fontSize: '13px', lineHeight: 1.65 }}>{line}</li>
                  ))}
                </ol>
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
              <p style={{ fontSize: '13px', color: '#92400e', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{val('issues')}</p>}
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
              <p style={{ fontSize: '13px', color: '#166534', lineHeight: 1.7 }}>{val('managerAssessment')}</p>}
          </div>
        )}

        {/* ─ ai assessment ─ */}
        {val('aiAssessment') && (
          <div style={{ padding: '16px 18px', borderRadius: '16px', background: '#f5f3ff',
            border: '1px solid #ddd6fe', marginBottom: '20px' }}>
            <div style={{ fontWeight: 700, color: '#6d28d9', marginBottom: '8px', fontSize: '14px' }}>
              ✨ Đánh giá AI
            </div>
            <p style={{ fontSize: '13px', color: '#4c1d95', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{val('aiAssessment')}</p>
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
