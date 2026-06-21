import { useMemo, useState } from 'react';
import { useAppStore } from '@/shared/store/appStore';
import { usePersistedState } from '@/shared/hooks/usePersistedState';
import {
  History, Lock, Trash2, ExternalLink, ChevronDown, ChevronUp, Search, Layers,
  Calendar, X, Hash, Trophy, Link2, Download, Edit3, Save, AlertCircle,
} from 'lucide-react';
import type { KPISubmission, TeamGroup, TaskPointRule } from '@/shared/types';
import { exportCsv } from '@/shared/utils/helpers';
import toast from 'react-hot-toast';

const TEAM_FILTERS: Array<TeamGroup | 'Tất cả'> = ['Tất cả', 'Bài viết', 'Sản phẩm', 'Multimedia - Tin nhanh'];

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay() || 7; // ISO: Mon=1
  x.setDate(x.getDate() - (day - 1));
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfMonth(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  return x;
}

export default function MySubmissionsPage() {
  const { currentUser, submissions, members, projects, deleteSubmission, setQualityCheck, updateSubmission, taskPointRules } = useAppStore();
  const [spotItem, setSpotItem] = useState<KPISubmission | null>(null);
  const [editItem, setEditItem] = useState<KPISubmission | null>(null);
  const openSpotCheck = (s: KPISubmission) => setSpotItem(s);

  const [filterTeam, setFilterTeam] = usePersistedState<TeamGroup | 'Tất cả'>('mysub_team', 'Tất cả');
  const [filterEmp, setFilterEmp] = usePersistedState('mysub_emp', '');
  const [search, setSearch] = usePersistedState('mysub_search', '');
  const [expanded, setExpanded] = useState<string | null>(null);
  // Calendar filter — persisted across navigation
  const [dateFrom, setDateFrom] = usePersistedState('mysub_dateFrom', fmtDate(startOfMonth(new Date())));
  const [dateTo, setDateTo]     = usePersistedState('mysub_dateTo', fmtDate(new Date()));

  const isManager = currentUser?.role === 'Manager';
  const isLeader  = currentUser?.role === 'Leader';

  // Phạm vi xem được:
  //   Manager → tất cả submission
  //   Leader  → submissions của member cùng team
  //   Member  → chỉ của bản thân
  const visibleSubs = useMemo<KPISubmission[]>(() => {
    if (!currentUser) return [];
    if (isManager) return submissions;
    if (isLeader) {
      const me = members.find(m => m.name === currentUser.name || m.id === currentUser.id);
      const team = me?.teamGroup;
      if (!team) return submissions.filter(s => s.employeeName === currentUser.name);
      return submissions.filter(s => {
        const emp = members.find(m => m.name === s.employeeName);
        return emp?.teamGroup === team || s.employeeName === currentUser.name;
      });
    }
    return submissions.filter(s => s.employeeName === currentUser.name);
  }, [submissions, currentUser, members, isManager, isLeader]);

  const filtered = useMemo(() => {
    let data = visibleSubs;
    if (filterTeam !== 'Tất cả') data = data.filter(s => s.teamGroup === filterTeam);
    if (filterEmp) data = data.filter(s => s.employeeName === filterEmp);
    if (dateFrom) {
      const fromMs = new Date(dateFrom + 'T00:00:00').getTime();
      data = data.filter(s => new Date(s.submittedAt).getTime() >= fromMs);
    }
    if (dateTo) {
      const toMs = new Date(dateTo + 'T23:59:59').getTime();
      data = data.filter(s => new Date(s.submittedAt).getTime() <= toMs);
    }
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(s =>
        s.taskType.toLowerCase().includes(q) ||
        s.taskDetail.toLowerCase().includes(q) ||
        s.employeeName.toLowerCase().includes(q) ||
        s.links.some(l => l.toLowerCase().includes(q))
      );
    }
    return data.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }, [visibleSubs, filterTeam, filterEmp, search, dateFrom, dateTo]);

  // Group by date — gọn UI
  const groupedByDate = useMemo(() => {
    const map = new Map<string, KPISubmission[]>();
    filtered.forEach(s => {
      const day = s.submittedAt.slice(0, 10);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(s);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  // Quick range presets
  const setRange = (preset: 'today' | '7d' | 'month' | 'all') => {
    const today = new Date();
    if (preset === 'today') {
      setDateFrom(fmtDate(today));
      setDateTo(fmtDate(today));
    } else if (preset === '7d') {
      const ago = new Date(today); ago.setDate(today.getDate() - 6);
      setDateFrom(fmtDate(ago));
      setDateTo(fmtDate(today));
    } else if (preset === 'month') {
      setDateFrom(fmtDate(startOfMonth(today)));
      setDateTo(fmtDate(today));
    } else {
      setDateFrom('');
      setDateTo('');
    }
  };
  void startOfWeek; // imported above

  const employees = useMemo(
    () => Array.from(new Set(visibleSubs.map(s => s.employeeName))).sort(),
    [visibleSubs]
  );

  const totals = useMemo(() => ({
    submissions: filtered.length,
    links:       filtered.reduce((s, x) => s + x.links.length, 0),
    points:      filtered.reduce((s, x) => s + x.totalPoints, 0),
    employees:   new Set(filtered.map(s => s.employeeName)).size,
  }), [filtered]);

  const handleDelete = (s: KPISubmission) => {
    if (!isManager) {
      toast.error('Chỉ Manager mới có quyền xóa submission đã chốt');
      return;
    }
    if (window.confirm(`Xóa submission "${s.taskDetail}" của ${s.employeeName}? (${s.links.length} link)`)) {
      deleteSubmission(s.id);
      toast.success('Đã xóa');
    }
  };

  if (!currentUser) {
    return <div className="card" style={{ padding: '40px', textAlign: 'center' }}>Cần đăng nhập</div>;
  }

  const handleExport = () => {
    if (filtered.length === 0) { toast.error('Không có dữ liệu để export'); return; }
    const rows = filtered.flatMap(s => s.links.map((link, i) => ({
      employee: s.employeeName,
      submittedAt: s.submittedAt,
      taskType: s.taskType,
      taskDetail: s.taskDetail,
      teamGroup: s.teamGroup,
      siteId: s.siteId ?? '',
      projectId: s.projectId ?? '',
      linkIndex: i + 1,
      link,
      timePerLink: s.timePerLink,
      pointPerLink: s.pointPerLink,
      pointForLink: s.pointPerLink,
      submissionId: s.id,
      notes: s.notes ?? '',
    })));
    const filename = `kpi_${dateFrom || 'all'}_${dateTo || 'all'}_${new Date().toISOString().slice(0, 10)}`;
    exportCsv(rows, filename);
    toast.success(`Đã export ${rows.length} dòng (${filtered.length} submission)`);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">
            <span className="icon"><History size={20} /></span>
            {isManager ? 'KPI đã submit' : isLeader ? 'KPI team' : 'KPI của tôi'}
          </h2>
          <p className="page-subtitle">
            {isManager
              ? 'Toàn bộ KPI nhân sự đã submit, phân loại theo 3 nhóm.'
              : isLeader
                ? 'KPI member trong team của bạn — chỉ xem, không sửa.'
                : 'Toàn bộ KPI bạn đã submit. Đã chốt — không thể chỉnh sửa.'}
          </p>
        </div>
        <button className="btn btn-secondary" onClick={handleExport}
          disabled={filtered.length === 0}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: '20px' }}>
        <Stat label="Lượt submit" value={totals.submissions.toString()} icon={<Hash size={16} />} />
        <Stat label="Tổng link"   value={totals.links.toLocaleString()} icon={<Link2 size={16} />} />
        <Stat label="Tổng điểm"   value={totals.points.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}
              success icon={<Trophy size={16} />} />
        {(isManager || isLeader) && (
          <Stat label="Nhân viên" value={totals.employees.toString()} />
        )}
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '14px', marginBottom: '16px',
                                     display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Date range */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <Calendar size={14} color="var(--primary-500)" />
            <input className="form-input" type="date" value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              style={{ width: 'auto', fontSize: '0.85rem' }} />
            <span style={{ color: 'var(--text-tertiary)' }}>→</span>
            <input className="form-input" type="date" value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              style={{ width: 'auto', fontSize: '0.85rem' }} />
            {(dateFrom || dateTo) && (
              <button className="btn btn-ghost" onClick={() => setRange('all')}
                style={{ padding: '4px 8px', fontSize: '0.78rem' }}>
                <X size={12} /> Bỏ lọc
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button className="btn btn-secondary" onClick={() => setRange('today')}
              style={{ fontSize: '0.78rem', padding: '4px 10px' }}>Hôm nay</button>
            <button className="btn btn-secondary" onClick={() => setRange('7d')}
              style={{ fontSize: '0.78rem', padding: '4px 10px' }}>7 ngày</button>
            <button className="btn btn-secondary" onClick={() => setRange('month')}
              style={{ fontSize: '0.78rem', padding: '4px 10px' }}>Tháng này</button>
          </div>
        </div>

        {/* Team + employee + search */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            {TEAM_FILTERS.map(t => (
              <button key={t} className={`btn btn-${filterTeam === t ? 'primary' : 'secondary'}`}
                onClick={() => setFilterTeam(t)}
                style={{ fontSize: '0.78rem', padding: '4px 10px' }}>
                <Layers size={11} /> {t}
              </button>
            ))}
          </div>

          {(isManager || isLeader) && employees.length > 1 && (
            <select className="form-select" value={filterEmp} onChange={e => setFilterEmp(e.target.value)}
              style={{ width: 'auto', fontSize: '0.85rem' }}>
              <option value="">Tất cả nhân viên</option>
              {employees.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          )}

          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input className="form-input" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Tìm theo loại bài, link, nhân viên..."
              style={{ paddingLeft: 30 }} />
          </div>
        </div>
      </div>

      {/* Group by date */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {groupedByDate.map(([day, list]) => {
          const dayDate = new Date(day);
          const dayLinks  = list.reduce((s, x) => s + x.links.length, 0);
          const dayPoints = list.reduce((s, x) => s + x.totalPoints, 0);
          return (
            <div key={day}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 4px', marginBottom: '6px',
                borderBottom: '2px solid var(--primary-100)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={14} color="var(--primary-500)" />
                  <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>
                    {dayDate.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                  {list.length} submit · {dayLinks} link ·{' '}
                  <strong style={{ color: 'var(--success)' }}>{dayPoints.toFixed(0)}đ</strong>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {list.map(s => {
                  const isExpanded = expanded === s.id;
                  const projectName = s.projectId ? (projects.find(p => p.id === s.projectId)?.name ?? '') : '';
                  return (
                    <div key={s.id} style={{
                      border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-card)', overflow: 'hidden',
                      transition: 'box-shadow var(--transition-fast)',
                      boxShadow: isExpanded ? 'var(--shadow-md)' : 'var(--shadow-sm)',
                    }}>
                      <button onClick={() => setExpanded(isExpanded ? null : s.id)}
                        style={{
                          width: '100%', padding: '14px 16px', display: 'flex',
                          alignItems: 'center', gap: '14px', background: 'transparent',
                          border: 'none', cursor: 'pointer', textAlign: 'left',
                        }}>
                        <span style={{
                          width: 36, height: 36, borderRadius: '12px', flexShrink: 0,
                          background: 'linear-gradient(135deg, var(--primary-500), var(--accent-500))',
                          color: '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 800, fontSize: '0.85rem',
                        }}>
                          {s.employeeName.charAt(0).toUpperCase()}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            {s.taskDetail}
                            <span style={{
                              background: 'var(--accent-100)', color: 'var(--primary-700)',
                              borderRadius: 'var(--radius-full)', padding: '1px 8px',
                              fontSize: '0.7rem', fontWeight: 600,
                            }}>{s.teamGroup}</span>
                            {projectName && (
                              <span style={{
                                background: 'var(--primary-50)', color: 'var(--primary-700)',
                                borderRadius: 4, padding: '1px 6px', fontSize: '0.7rem',
                              }}>📅 {projectName}</span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                            {s.employeeName} · {s.taskType} · {new Date(s.submittedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexShrink: 0 }}>
                          <Stat2 label="Link" value={s.links.length} color="var(--primary-600)" />
                          <Stat2 label="Điểm" value={s.totalPoints} color="var(--success)" />
                          {s.qualityCheck && (
                            <span title={`Spot-check ${s.qualityCheck.score}/5 bởi ${s.qualityCheck.checkedBy}`}
                              style={{
                                background: s.qualityCheck.score >= 4 ? 'var(--success-bg)' : s.qualityCheck.score >= 3 ? 'var(--accent-100)' : 'var(--warning-bg)',
                                color: s.qualityCheck.score >= 4 ? 'var(--success)' : s.qualityCheck.score >= 3 ? 'var(--primary-700)' : '#92400e',
                                borderRadius: 'var(--radius-full)', padding: '2px 8px',
                                fontSize: '0.7rem', fontWeight: 700,
                              }}>
                              ✓ {s.qualityCheck.score}/5
                            </span>
                          )}
                          {s.locked && (
                            <span style={{
                              background: 'var(--warning-bg)', color: '#92400e', borderRadius: 'var(--radius-full)',
                              padding: '2px 8px', fontSize: '0.7rem', fontWeight: 600,
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                            }}>
                              <Lock size={10} /> Locked
                            </span>
                          )}
                          {(isManager || isLeader) && (
                            <button onClick={e => { e.stopPropagation(); openSpotCheck(s); }}
                              className="btn btn-icon btn-ghost"
                              title="Spot-check chất lượng"
                              style={{ color: 'var(--primary-500)' }}>
                              ✓
                            </button>
                          )}
                          {isManager && (
                            <button onClick={e => { e.stopPropagation(); setEditItem(s); }}
                              className="btn btn-icon btn-ghost"
                              style={{ color: 'var(--primary-500)' }}
                              title="Chỉnh sửa submission (Manager)">
                              <Edit3 size={14} />
                            </button>
                          )}
                          {isManager && (
                            <button onClick={e => { e.stopPropagation(); handleDelete(s); }}
                              className="btn btn-icon btn-ghost"
                              style={{ color: 'var(--danger)' }}>
                              <Trash2 size={14} />
                            </button>
                          )}
                          {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </div>
                      </button>

                      {isExpanded && (
                        <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border-light)',
                                      background: 'var(--bg-secondary)' }}>
                          {s.notes && (
                            <div style={{ fontSize: '0.82rem', marginBottom: '8px', color: 'var(--text-secondary)' }}>
                              <strong>Ghi chú:</strong> {s.notes}
                            </div>
                          )}
                          <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', marginBottom: '6px', fontWeight: 600 }}>
                            {s.links.length} LINK · {s.timePerLink}h/link · {s.pointPerLink}đ/link
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: 280, overflowY: 'auto' }}>
                            {s.links.map((l, i) => (
                              <a key={i} href={l} target="_blank" rel="noopener noreferrer"
                                style={{ fontSize: '0.8rem', color: 'var(--primary-500)',
                                         display: 'flex', alignItems: 'center', gap: 4,
                                         wordBreak: 'break-all' }}>
                                <ExternalLink size={11} style={{ flexShrink: 0 }} />
                                <span style={{ color: 'var(--text-tertiary)' }}>{i + 1}.</span> {l}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-tertiary)',
                        background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
            <History size={32} style={{ opacity: 0.4 }} />
            <p style={{ marginTop: 8 }}>Không có submission nào trong khoảng đã chọn.</p>
          </div>
        )}
      </div>

      {spotItem && (
        <SpotCheckModal
          item={spotItem}
          checkedBy={currentUser.name}
          onClose={() => setSpotItem(null)}
          onSave={(score, note) => {
            setQualityCheck(spotItem.id, score, currentUser.name, note);
            toast.success(`Đã spot-check ${score}/5 cho ${spotItem.employeeName}`);
            setSpotItem(null);
          }}
        />
      )}
      {editItem && isManager && (
        <EditSubmissionModal
          item={editItem}
          taskPointRules={taskPointRules}
          onClose={() => setEditItem(null)}
          onSave={(updates) => {
            updateSubmission(editItem.id, updates);
            toast.success('Đã cập nhật submission!');
            setEditItem(null);
          }}
        />
      )}
    </div>
  );
}

function SpotCheckModal({ item, checkedBy, onClose, onSave }: {
  item: KPISubmission;
  checkedBy: string;
  onClose: () => void;
  onSave: (score: number, note?: string) => void;
}) {
  const [score, setScore] = useState<number>(item.qualityCheck?.score ?? 4);
  const [note, setNote]   = useState<string>(item.qualityCheck?.note ?? '');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <h3 className="modal-title">Spot-check chất lượng — {item.employeeName}</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            <strong>{item.taskDetail}</strong> · {item.taskType}
            <br />
            {item.links.length} link · submitted {new Date(item.submittedAt).toLocaleString('vi-VN')}
          </div>
          <div className="form-group">
            <label className="form-label">Chất lượng *</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {[1, 2, 3, 4, 5].map(s => (
                <button key={s} type="button" onClick={() => setScore(s)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                    color: s <= score ? '#F59E0B' : '#E2E8F0', fontSize: '2rem', lineHeight: 1,
                  }}>★</button>
              ))}
              <span style={{ alignSelf: 'center', marginLeft: '12px', fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>
                {score}/5 ·
                {score === 5 ? ' Xuất sắc' : score === 4 ? ' Đạt' : score === 3 ? ' Trung bình' : score === 2 ? ' Cần cải thiện' : ' Yếu'}
              </span>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Ghi chú (tùy chọn)</label>
            <textarea className="form-textarea" rows={3} value={note} onChange={e => setNote(e.target.value)}
              placeholder="Phản hồi cho member: chỗ cần sửa, điều làm tốt..." />
          </div>
          <div style={{ padding: '8px 12px', background: 'var(--accent-50)', borderRadius: 'var(--radius-sm)',
                        fontSize: '0.78rem', color: 'var(--primary-700)' }}>
            ✓ Spot-check bởi <strong>{checkedBy}</strong> · {new Date().toLocaleString('vi-VN')}
            <br />
            Coverage được tính tự động (target ≥20%) → ảnh hưởng Leadership Score.
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
          <button type="button" className="btn btn-primary" onClick={() => onSave(score, note || undefined)}>
            Lưu spot-check
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, success, icon }: { label: string; value: string; success?: boolean; icon?: React.ReactNode }) {
  void icon;
  return (
    <div className="stat-card">
      <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: '1.3rem',
                    color: success ? 'var(--success)' : 'var(--text-primary)', marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}
function Stat2({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 50 }}>
      <div style={{ fontWeight: 700, fontSize: '0.95rem', color }}>{value}</div>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>{label}</div>
    </div>
  );
}

/* ─────────────────────────── EditSubmissionModal (Manager only) ── */

function EditSubmissionModal({ item, taskPointRules, onClose, onSave }: {
  item: KPISubmission;
  taskPointRules: TaskPointRule[];
  onClose: () => void;
  onSave: (updates: Partial<KPISubmission>) => void;
}) {
  const TEAM_OPTIONS: TeamGroup[] = ['Bài viết', 'Sản phẩm', 'Multimedia - Tin nhanh'];
  const { projects, projectTasks } = useAppStore();

  const [taskType,       setTaskType]       = useState(item.taskType);
  const [taskDetail,     setTaskDetail]     = useState(item.taskDetail);
  const [teamGroup,      setTeamGroup]      = useState<TeamGroup>(item.teamGroup);
  const [links,          setLinks]          = useState<string[]>([...item.links]);
  const [notes,          setNotes]          = useState(item.notes ?? '');
  const [auditNote,      setAuditNote]      = useState('');
  const [projectId,      setProjectId]      = useState(item.projectId ?? '');
  const [projectTaskId,  setProjectTaskId]  = useState(item.projectTaskId ?? '');

  // Quantity & direct-point fields (for non-link tracking)
  const [quantity,       setQuantity]       = useState<number>(item.quantity ?? 0);
  const [manualPoints,   setManualPoints]   = useState<number>(item.totalPoints);
  const [useManualPts,   setUseManualPts]   = useState(false);

  // Tasks filtered by selected project
  const availableTasks = projectId
    ? projectTasks.filter(t => t.projectId === projectId)
    : [];

  // Detect selected task's tracking mode
  const selectedTask = projectTaskId
    ? projectTasks.find(t => t.id === projectTaskId)
    : null;
  const isQuantityMode = selectedTask?.trackingMode === 'quantity';

  // Auto-recalc pointPerLink khi taskDetail thay đổi
  const matchedRule = taskPointRules.find(
    r => r.active && (r.taskLabel === taskDetail || r.taskLabel === taskType)
  );
  const newPointPerLink = matchedRule?.pointPerLink ?? item.pointPerLink;
  const cleanLinks      = links.filter(l => l.trim());
  const autoPoints      = parseFloat((newPointPerLink * cleanLinks.length).toFixed(2));

  // Final totalPoints: quantity-mode → manualPoints, link-mode → auto (or manualOverride if toggled)
  const finalTotalPoints = isQuantityMode
    ? manualPoints
    : useManualPts
      ? manualPoints
      : autoPoints;

  const handleLinkChange = (i: number, val: string) => {
    const next = [...links];
    next[i] = val;
    setLinks(next);
  };
  const addLink    = () => setLinks(l => [...l, '']);
  const removeLink = (i: number) => setLinks(l => l.filter((_, idx) => idx !== i));

  const handleSave = () => {
    if (isQuantityMode) {
      if (quantity <= 0) { toast.error('Số lượng phải lớn hơn 0'); return; }
      if (manualPoints < 0) { toast.error('Số điểm không được âm'); return; }
      onSave({
        taskType,
        taskDetail,
        teamGroup,
        quantity,
        totalPoints: manualPoints,
        // keep links as-is (possibly empty for quantity-only tasks)
        links: item.links,
        notes: auditNote ? `[Sửa bởi Manager: ${auditNote}] ${notes}`.trim() : notes || undefined,
        projectId:     projectId || undefined,
        projectTaskId: projectTaskId || undefined,
      });
    } else {
      if (cleanLinks.length === 0) { toast.error('Phải có ít nhất 1 link'); return; }
      onSave({
        taskType,
        taskDetail,
        teamGroup,
        links: cleanLinks,
        notes: auditNote ? `[Sửa bởi Manager: ${auditNote}] ${notes}`.trim() : notes || undefined,
        pointPerLink: newPointPerLink,
        totalPoints:  finalTotalPoints,
        projectId:     projectId || undefined,
        projectTaskId: projectTaskId || undefined,
      });
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}
        style={{ maxWidth: '600px', maxHeight: '90vh', overflow: 'auto', borderRadius: 'var(--radius-xl)' }}>

        {/* header */}
        <div style={{ padding: '18px 22px', background: 'linear-gradient(135deg,#f59e0b,#d97706)', borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ color: '#fff', fontWeight: 800, fontSize: '1rem', margin: 0 }}>✏️ Chỉnh sửa submission</h3>
            <div style={{ color: 'rgba(255,255,255,.8)', fontSize: '0.8rem', marginTop: '2px' }}>
              {item.employeeName} · {new Date(item.submittedAt).toLocaleString('vi-VN')}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 'var(--radius-md)', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
            <X size={16} />
          </button>
        </div>

        {/* warning banner */}
        <div style={{ padding: '10px 16px', background: '#fef3c7', borderBottom: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#92400e' }}>
          <AlertCircle size={14} style={{ flexShrink: 0 }} />
          Chỉ Manager mới có quyền sửa.{' '}
          {isQuantityMode
            ? 'Task này theo dõi bằng số lượng — nhập số lượng và điểm trực tiếp.'
            : 'Điểm sẽ tự tính lại theo số link mới và rule hiện tại.'}
        </div>

        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* taskType */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Đầu việc (taskType)</label>
            <input className="form-input" value={taskType} onChange={e => setTaskType(e.target.value)}
              placeholder="Ví dụ: Bài Góc sức khỏe - Bệnh lý - Thành phần" />
          </div>

          {/* taskDetail */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Chi tiết đầu việc (taskDetail)
              {matchedRule && !isQuantityMode && (
                <span style={{ fontSize: '0.7rem', color: 'var(--primary-600)', fontWeight: 400, marginLeft: '8px' }}>
                  → {newPointPerLink}đ/link (rule: {matchedRule.taskLabel})
                </span>
              )}
            </label>
            <input className="form-input" value={taskDetail} onChange={e => setTaskDetail(e.target.value)}
              placeholder="Ví dụ: SEO, Bài mới, Cập nhật..." />
          </div>

          {/* teamGroup */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Nhóm team</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {TEAM_OPTIONS.map(t => (
                <button key={t} type="button"
                  onClick={() => setTeamGroup(t)}
                  style={{ padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1px solid',
                    borderColor: teamGroup === t ? 'var(--primary-500)' : 'var(--border-medium)',
                    background: teamGroup === t ? 'var(--primary-50)' : 'transparent',
                    color: teamGroup === t ? 'var(--primary-700)' : 'var(--text-secondary)',
                    fontWeight: teamGroup === t ? 700 : 400, fontSize: '0.8rem', cursor: 'pointer' }}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* project assignment */}
          <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              🗂️ Gắn dự án
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Dự án</label>
              <select className="form-input" value={projectId}
                onChange={e => { setProjectId(e.target.value); setProjectTaskId(''); }}
                style={{ fontSize: '0.85rem' }}>
                <option value="">— Không gắn dự án —</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            {projectId && (
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Task nhỏ trong dự án <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(tuỳ chọn)</span></label>
                {availableTasks.length === 0 ? (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', padding: '6px 10px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                    Dự án này chưa có task nhỏ
                  </div>
                ) : (
                  <select className="form-input" value={projectTaskId}
                    onChange={e => setProjectTaskId(e.target.value)}
                    style={{ fontSize: '0.85rem' }}>
                    <option value="">— Không chọn task cụ thể —</option>
                    {availableTasks.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name}{t.trackingMode === 'quantity' ? ' 📦 (Số lượng)' : ' 🔗 (Link)'}
                      </option>
                    ))}
                  </select>
                )}
                {selectedTask && (
                  <div style={{ marginTop: '6px', fontSize: '0.74rem', color: 'var(--text-tertiary)', display: 'flex', gap: '12px' }}>
                    <span>Chế độ: <strong style={{ color: isQuantityMode ? 'var(--primary-600)' : 'var(--success)' }}>
                      {isQuantityMode ? '📦 Số lượng' : '🔗 Link'}
                    </strong></span>
                    {isQuantityMode
                      ? <span>Target: <strong>{selectedTask.targetQuantity ?? selectedTask.targetLinks} đơn vị</strong></span>
                      : <span>Target: <strong>{selectedTask.targetLinks} link</strong></span>
                    }
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── QUANTITY MODE: số lượng + điểm trực tiếp ── */}
          {isQuantityMode ? (
            <div style={{ padding: '14px', borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', border: '2px solid #93c5fd', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1e40af', display: 'flex', alignItems: 'center', gap: '6px' }}>
                📦 Task theo dõi bằng số lượng — không dùng link
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Số lượng hoàn thành *</label>
                  <input className="form-input" type="number" min="0" step="1"
                    value={quantity}
                    onChange={e => setQuantity(Math.max(0, parseInt(e.target.value) || 0))}
                    style={{ fontSize: '1rem', fontWeight: 700, textAlign: 'center' }} />
                  {selectedTask && (
                    <div style={{ fontSize: '0.72rem', color: '#1e40af', marginTop: '4px' }}>
                      Target: {selectedTask.targetQuantity ?? selectedTask.targetLinks} đơn vị
                    </div>
                  )}
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Số điểm KPI *</label>
                  <input className="form-input" type="number" min="0" step="0.5"
                    value={manualPoints}
                    onChange={e => setManualPoints(Math.max(0, parseFloat(e.target.value) || 0))}
                    style={{ fontSize: '1rem', fontWeight: 700, textAlign: 'center', color: 'var(--success)' }} />
                  <div style={{ fontSize: '0.72rem', color: '#1e40af', marginTop: '4px' }}>
                    Điểm cũ: {item.totalPoints.toFixed(1)}đ
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* ── LINK MODE: danh sách link ── */}
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Danh sách link <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>({cleanLinks.length} link hợp lệ)</span></span>
                  <button type="button" onClick={addLink}
                    style={{ fontSize: '0.75rem', padding: '2px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--primary-300)', background: 'var(--primary-50)', color: 'var(--primary-700)', cursor: 'pointer' }}>
                    + Thêm link
                  </button>
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: 240, overflowY: 'auto', paddingRight: '4px' }}>
                  {links.map((l, i) => (
                    <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', minWidth: '18px', textAlign: 'right' }}>{i + 1}.</span>
                      <input className="form-input" value={l} onChange={e => handleLinkChange(i, e.target.value)}
                        placeholder="https://..." style={{ flex: 1, fontSize: '0.82rem' }} />
                      {links.length > 1 && (
                        <button type="button" onClick={() => removeLink(i)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '4px', flexShrink: 0 }}>
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Manual points override — cho task không có rule */}
              <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
                  <input type="checkbox" checked={useManualPts} onChange={e => { setUseManualPts(e.target.checked); if (!e.target.checked) setManualPoints(autoPoints); }}
                    style={{ accentColor: 'var(--primary-500)', width: 14, height: 14 }} />
                  Ghi đè điểm thủ công (thay vì tự tính theo rule)
                </label>
                {useManualPts && (
                  <div style={{ marginTop: '10px' }}>
                    <label className="form-label">Số điểm KPI *</label>
                    <input className="form-input" type="number" min="0" step="0.5"
                      value={manualPoints}
                      onChange={e => setManualPoints(Math.max(0, parseFloat(e.target.value) || 0))}
                      style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--success)' }} />
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                      Điểm tự động (rule): {autoPoints.toFixed(1)}đ → Sẽ lưu: {manualPoints.toFixed(1)}đ
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* notes */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Ghi chú (tùy chọn)</label>
            <textarea className="form-textarea" value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Ghi chú đính kèm submission..." />
          </div>

          {/* audit note — bắt buộc ghi lý do sửa */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ color: '#92400e' }}>⚠️ Lý do chỉnh sửa <span style={{ fontWeight: 400, fontSize: '0.7rem' }}>(sẽ ghi vào ghi chú)</span></label>
            <input className="form-input" value={auditNote} onChange={e => setAuditNote(e.target.value)}
              placeholder="Ví dụ: Nhân viên add nhầm taskDetail, cần sửa lại đúng..." />
          </div>

          {/* recalc preview */}
          <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: '1px solid #86efac', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            {isQuantityMode ? (
              <>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 800, fontSize: '1.3rem', color: '#16a34a' }}>{quantity}</div>
                  <div style={{ fontSize: '0.7rem', color: '#166534' }}>Số lượng</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 800, fontSize: '1.3rem', color: '#16a34a' }}>{manualPoints.toFixed(1)}</div>
                  <div style={{ fontSize: '0.7rem', color: '#166534' }}>Tổng điểm</div>
                </div>
              </>
            ) : (
              <>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 800, fontSize: '1.3rem', color: '#16a34a' }}>{cleanLinks.length}</div>
                  <div style={{ fontSize: '0.7rem', color: '#166534' }}>Link</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 800, fontSize: '1.3rem', color: '#16a34a' }}>{newPointPerLink}</div>
                  <div style={{ fontSize: '0.7rem', color: '#166534' }}>đ/link</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 800, fontSize: '1.3rem', color: '#16a34a' }}>{finalTotalPoints.toFixed(1)}</div>
                  <div style={{ fontSize: '0.7rem', color: '#166534' }}>Tổng điểm{useManualPts ? ' (thủ công)' : ''}</div>
                </div>
              </>
            )}
            {finalTotalPoints !== item.totalPoints && (
              <div style={{ alignSelf: 'center', fontSize: '0.78rem', color: '#92400e', background: '#fef3c7', padding: '3px 10px', borderRadius: '999px' }}>
                Trước: {item.totalPoints.toFixed(1)}đ → Sau: {finalTotalPoints.toFixed(1)}đ
              </div>
            )}
          </div>
        </div>

        {/* footer */}
        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={onClose}>Hủy</button>
          <button className="btn btn-primary" onClick={handleSave}
            style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', border: 'none', boxShadow: '0 4px 12px rgba(245,158,11,.3)' }}>
            <Save size={14} /> Lưu chỉnh sửa
          </button>
        </div>
      </div>
    </div>
  );
}
