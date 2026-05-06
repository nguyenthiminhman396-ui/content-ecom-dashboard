import { useMemo, useState } from 'react';
import { useAppStore } from '@/shared/store/appStore';
import { defaultTaskCategories, TEAM_GROUPS } from '@/shared/data/mockData';
import {
  Target, Plus, Edit3, Trash2, X, Save, Calendar, Copy, ChevronDown, ChevronUp
} from 'lucide-react';
import type { MonthlyKPITarget, TeamGroup } from '@/shared/types';
import toast from 'react-hot-toast';

function generateId(): string {
  return `kt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
}

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shiftPeriod(p: string, delta: number): string {
  const [y, m] = p.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatPeriod(p: string): string {
  const [y, m] = p.split('-');
  return `Tháng ${parseInt(m)}/${y}`;
}

const TEAM_COLORS: Record<string, string> = {
  'Bài viết': '#1D9E75',
  'Sản phẩm': '#8B5CF6',
  'Multimedia - Tin nhanh': '#F59E0B',
  'Tất cả team': '#64748B',
};

export default function KPITargetsPage() {
  const { kpiTargets, sites, currentUser, members, addKpiTarget, updateKpiTarget, deleteKpiTarget, submissions } = useAppStore();
  const [period, setPeriod] = useState<string>(currentPeriod());
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<MonthlyKPITarget | null>(null);
  const [memberFormMode, setMemberFormMode] = useState(false); // true = form phân KPI cá nhân
  const [expandedTaskType, setExpandedTaskType] = useState<string | null>(null);

  const isManager = currentUser?.role === 'Manager';
  const isLeader  = currentUser?.role === 'Leader';
  const isMember  = !isManager && !isLeader;
  const canEdit   = isManager || isLeader;

  // Team của Leader
  const myTeamGroup = useMemo(() => {
    if (!currentUser) return null;
    const me = members.find(m => m.name === currentUser.name || m.id === currentUser.id);
    return me?.teamGroup ?? null;
  }, [currentUser, members]);

  // Members trong team (cho Leader phân KPI cá nhân)
  const teamMembers = useMemo(() => {
    if (isManager) return members;
    if (isLeader && myTeamGroup) return members.filter(m => m.teamGroup === myTeamGroup);
    return [];
  }, [members, isManager, isLeader, myTeamGroup]);

  // Targets của period đang chọn
  const periodTargets = useMemo(
    () => kpiTargets.filter(t => t.period === period),
    [kpiTargets, period]
  );

  // Tất cả periods đã có target
  const availablePeriods = useMemo(() => {
    const set = new Set<string>([currentPeriod(), period]);
    kpiTargets.forEach(t => set.add(t.period));
    return Array.from(set).sort().reverse();
  }, [kpiTargets, period]);

  // Tính actual cho mỗi target
  const targetsWithActual = useMemo(() => {
    // Member chỉ thấy target cá nhân của mình
    const filtered = isMember
      ? periodTargets.filter(t => t.employeeName === currentUser?.name)
      : periodTargets;
    return filtered.map(t => {
      const actualSubs = submissions.filter(s => {
        if (!s.submittedAt.startsWith(period)) return false;
        // Target cá nhân → match theo người, bỏ qua teamGroup (vì member có thể nộp cross-team)
        if (t.employeeName) {
          if (s.employeeName !== t.employeeName) return false;
        } else {
          // Target tổng nhóm → filter theo teamGroup
          if (s.teamGroup !== t.teamGroup) return false;
        }
        if (t.siteId && s.siteId !== t.siteId) return false;
        if (t.taskType && s.taskType !== t.taskType) return false;
        return true;
      });
      const actualLinks = actualSubs.reduce((sum, s) => sum + s.links.length, 0);
      const progress = t.targetLinks > 0 ? Math.round((actualLinks / t.targetLinks) * 100) : 0;
      return { target: t, actualLinks, progress, actualSubs: actualSubs.length };
    }).sort((a, b) => {
      // Sort by teamGroup → siteId → taskType
      if (a.target.teamGroup !== b.target.teamGroup) return a.target.teamGroup.localeCompare(b.target.teamGroup);
      if ((a.target.siteId ?? '') !== (b.target.siteId ?? '')) return (a.target.siteId ?? '').localeCompare(b.target.siteId ?? '');
      return (a.target.taskType ?? '').localeCompare(b.target.taskType ?? '');
    });
  }, [periodTargets, submissions, period, isMember, currentUser]);

  // Tổng theo đầu việc (cross-team)
  // Rule: Có KPI tổng → đó là target chính thức (không cộng thêm cá nhân).
  //        Không có KPI tổng → fallback cộng cá nhân.
  const taskTypeSummary = useMemo(() => {
    const grouped: Record<string, Record<string, {
      teamTarget: number;
      individualTarget: number;
      teamActual: number;      // Actual từ Tổng nhóm (= tổng team)
      individualActual: number; // Cộng actual cá nhân
    }>> = {};

    targetsWithActual.forEach(({ target, actualLinks }) => {
      const taskKey = target.taskType || '(Tất cả đầu việc)';
      const team = target.teamGroup;
      if (!grouped[taskKey]) grouped[taskKey] = {};
      if (!grouped[taskKey][team]) grouped[taskKey][team] = {
        teamTarget: 0, individualTarget: 0, teamActual: 0, individualActual: 0
      };
      if (target.employeeName) {
        grouped[taskKey][team].individualTarget += target.targetLinks;
        grouped[taskKey][team].individualActual += actualLinks; // Giờ đúng per-person
      } else {
        grouped[taskKey][team].teamTarget += target.targetLinks;
        grouped[taskKey][team].teamActual = actualLinks; // Tổng nhóm = team total
      }
    });

    return Object.entries(grouped)
      .map(([taskType, teams]) => {
        // Kiểm tra: đầu việc này CÓ KPI tổng nào không?
        const hasAnyTeamTarget = Object.values(teams).some(d => d.teamTarget > 0);

        let totalTarget = 0;
        let totalActual = 0;
        const teamList: string[] = [];
        const perTeam: { team: string; displayName: string; target: number; actual: number; progress: number }[] = [];

        for (const [team, d] of Object.entries(teams)) {
          teamList.push(team);
          let t: number;
          if (hasAnyTeamTarget) {
            if (d.teamTarget > 0) {
              t = d.teamTarget;
            } else {
              t = d.individualTarget;
            }
          } else {
            t = d.individualTarget;
          }
          // Actual: dùng giá trị lớn hơn giữa tổng nhóm và cộng cá nhân
          const a = Math.max(d.teamActual, d.individualActual);
          if (hasAnyTeamTarget) {
            totalTarget += d.teamTarget;
          } else {
            totalTarget += t;
          }
          totalActual += a;
          perTeam.push({
            team, displayName: team, target: t, actual: a,
            progress: t > 0 ? Math.round((a / t) * 100) : 0,
          });
        }
        perTeam.sort((a, b) => b.target - a.target);

        return {
          taskType,
          target: totalTarget,
          actual: totalActual,
          teams: teamList,
          progress: totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0,
          perTeam,
        };
      })
      .filter(x => x.target > 0)
      .sort((a, b) => b.target - a.target);
  }, [targetsWithActual]);

  const handleDelete = (t: MonthlyKPITarget) => {
    if (!canEdit) return;
    // Leader chỉ xóa được target cá nhân (có employeeName) của team mình
    if (isLeader && (!t.employeeName || t.teamGroup !== myTeamGroup)) {
      toast.error('Leader chỉ xóa được target cá nhân trong team.');
      return;
    }
    if (window.confirm(`Xóa target ${t.targetLinks} link${t.employeeName ? ` cho ${t.employeeName}` : ` cho ${t.teamGroup}`}?`)) {
      deleteKpiTarget(t.id);
      toast.success('Đã xóa');
    }
  };

  const handleCopyFromPrev = () => {
    if (!canEdit) return;
    const prevPeriod = shiftPeriod(period, -1);
    const prevTargets = kpiTargets.filter(t => t.period === prevPeriod);
    if (prevTargets.length === 0) {
      toast.error(`Không có target nào ở ${formatPeriod(prevPeriod)}`);
      return;
    }
    if (!window.confirm(`Copy ${prevTargets.length} target từ ${formatPeriod(prevPeriod)} sang ${formatPeriod(period)}?`)) return;
    prevTargets.forEach(t => {
      addKpiTarget({
        ...t,
        id: generateId(),
        period,
      });
    });
    toast.success(`Đã copy ${prevTargets.length} target`);
  };

  if (!currentUser) {
    return <div className="card" style={{ padding: '40px', textAlign: 'center' }}>Cần đăng nhập</div>;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">
            <Target size={20} style={{ color: 'var(--primary-500)' }} />
            KPI Target / Tháng
          </h2>
          <p className="page-subtitle">
            {isManager
              ? 'Manager set target tổng nhóm. Leader phân KPI cá nhân cho từng member.'
              : isLeader
                ? `Phân KPI cá nhân cho từng thành viên nhóm ${myTeamGroup || ''}.`
                : `KPI cá nhân của bạn — ${currentUser?.name || ''}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {canEdit && (
            <button className="btn btn-secondary" onClick={handleCopyFromPrev}>
              <Copy size={14} /> Copy từ tháng trước
            </button>
          )}
          {isManager && (
            <button className="btn btn-primary" onClick={() => { setEditItem(null); setMemberFormMode(false); setShowForm(true); }}>
              <Plus size={16} /> Target tổng nhóm
            </button>
          )}
          {canEdit && (
            <button className="btn btn-primary" style={{ background: 'var(--success)' }}
              onClick={() => { setEditItem(null); setMemberFormMode(true); setShowForm(true); }}>
              <Plus size={16} /> Phân KPI cá nhân
            </button>
          )}
        </div>
      </div>

      {/* Period selector */}
      <div className="card" style={{ padding: '14px', marginBottom: '16px',
                                     display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Calendar size={16} color="var(--primary-500)" />
        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Kỳ áp dụng:</span>
        <select className="form-select" value={period} onChange={e => setPeriod(e.target.value)}
          style={{ width: 'auto', fontSize: '0.9rem' }}>
          {availablePeriods.map(p => <option key={p} value={p}>{formatPeriod(p)}</option>)}
        </select>
        <input className="form-input" type="month" value={period} onChange={e => setPeriod(e.target.value)}
          style={{ width: 'auto', fontSize: '0.85rem' }} />
        <span style={{ marginLeft: 'auto', fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>
          {periodTargets.length} target trong kỳ này
        </span>
      </div>

      {/* Summary theo đầu việc (cross-team) */}
      {taskTypeSummary.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(taskTypeSummary.length, 3)}, 1fr)`, gap: '12px', marginBottom: '20px' }}>
          {taskTypeSummary.map(({ taskType, target, actual, teams, progress, perTeam }) => {
            const mainColor = TEAM_COLORS[teams[0]] ?? '#3B82F6';
            const isExpanded = expandedTaskType === taskType;
            return (
              <div key={taskType} className="card" style={{
                padding: '16px', borderLeft: `4px solid ${mainColor}`,
              }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{taskType}</div>
                <div style={{ fontWeight: 800, fontSize: '1.4rem', color: mainColor, marginTop: 4 }}>
                  {actual.toLocaleString()} / {target.toLocaleString()} link
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem',
                              color: 'var(--text-tertiary)', marginTop: 4 }}>
                  <span>Tiến độ</span>
                  <strong style={{ color: progress >= 100 ? 'var(--success)' : progress >= 70 ? mainColor : 'var(--warning)' }}>
                    {progress}%
                  </strong>
                </div>
                <div style={{ height: 5, background: 'var(--bg-secondary)', borderRadius: 3, marginTop: 4 }}>
                  <div style={{ height: '100%', borderRadius: 3, background: mainColor,
                                width: `${Math.min(100, progress)}%` }} />
                </div>

                {/* Toggle per-team dropdown */}
                {perTeam.length > 0 && (
                  <>
                    <button onClick={() => setExpandedTaskType(isExpanded ? null : taskType)}
                      style={{ marginTop: '8px', background: 'none', border: 'none', cursor: 'pointer',
                               display: 'flex', alignItems: 'center', gap: '4px', width: '100%',
                               padding: '4px 0', fontSize: '0.74rem', color: 'var(--primary-600)', fontWeight: 600 }}>
                      {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      Chi tiết {perTeam.length} nhóm
                    </button>

                    {isExpanded && (
                      <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {perTeam.map(pt => {
                          const teamColor = TEAM_COLORS[pt.team] ?? '#94A3B8';
                          return (
                            <div key={pt.team} style={{ padding: '8px 10px', background: 'var(--bg-secondary)',
                                                        borderRadius: 'var(--radius-sm)', borderLeft: `3px solid ${teamColor}` }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.78rem', color: teamColor }}>{pt.displayName}</span>
                                <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                                  <strong>{pt.actual.toLocaleString()}</strong>
                                  <span style={{ color: 'var(--text-tertiary)' }}> / {pt.target.toLocaleString()}</span>
                                  <strong style={{ marginLeft: 6,
                                    color: pt.progress >= 100 ? 'var(--success)' : pt.progress >= 50 ? teamColor : 'var(--warning)'
                                  }}>{pt.progress}%</strong>
                                </span>
                              </div>
                              <div style={{ height: 3, background: 'var(--bg-card)', borderRadius: 2, marginTop: 4 }}>
                                <div style={{ height: '100%', borderRadius: 2, background: teamColor,
                                              width: `${Math.min(100, pt.progress)}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* List targets */}
      <div className="card" style={{ padding: 0 }}>
        {targetsWithActual.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
            <Target size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
            <p>Chưa có target nào cho {formatPeriod(period)}.</p>
            {isManager && <p style={{ fontSize: '0.82rem', marginTop: 6 }}>
              Bấm "Thêm target" để tạo, hoặc "Copy từ tháng trước" để nhanh.
            </p>}
          </div>
        ) : (
          <div className="data-table-wrapper" style={{ margin: 0 }}>
            <table className="data-table" style={{ marginBottom: 0 }}>
              <thead>
                <tr>
                  <th>Nhóm team</th>
                  <th>Nhân viên</th>
                  <th>Site</th>
                  <th>Đầu việc</th>
                  <th style={{ textAlign: 'center' }}>Target link</th>
                  <th style={{ textAlign: 'center' }}>Đã đạt</th>
                  <th style={{ textAlign: 'center', width: 200 }}>Tiến độ</th>
                  <th>Ghi chú</th>
                  {canEdit && <th>Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {targetsWithActual.map(({ target, actualLinks, progress }) => {
                  const site = target.siteId ? sites.find(s => s.id === target.siteId) : null;
                  const color = TEAM_COLORS[target.teamGroup] ?? '#94A3B8';
                  return (
                    <tr key={target.id}>
                      <td>
                        <span style={{
                          background: `${color}15`, color, padding: '2px 8px',
                          borderRadius: 'var(--radius-full)', fontSize: '0.78rem', fontWeight: 600,
                        }}>
                          {target.teamGroup || 'Tổng nhóm'}
                          {!target.employeeName && taskTypeSummary.find(s => s.taskType === target.taskType)?.perTeam.some(pt => pt.team !== target.teamGroup) && target.teamGroup !== 'Tất cả team' ? ' +' : ''}
                        </span>
                      </td>
                      <td className="cell-secondary">
                        {target.employeeName
                          ? <span style={{ fontWeight: 600, color: 'var(--primary-600)' }}>{target.employeeName}</span>
                          : <em style={{ color: 'var(--text-tertiary)' }}>Tổng nhóm</em>}
                      </td>
                      <td className="cell-secondary">
                        {site ? site.name : <em style={{ color: 'var(--text-tertiary)' }}>Cả 2 site</em>}
                      </td>
                      <td className="cell-secondary">
                        {target.taskType ?? <em style={{ color: 'var(--text-tertiary)' }}>Tất cả</em>}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>
                        {target.targetLinks.toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--primary-600)' }}>
                        {actualLinks.toLocaleString()}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ flex: 1, height: 6, background: 'var(--bg-secondary)', borderRadius: 3 }}>
                            <div style={{ height: '100%', borderRadius: 3,
                                          background: progress >= 100 ? 'var(--success)' : progress >= 70 ? color : 'var(--warning)',
                                          width: `${Math.min(100, progress)}%` }} />
                          </div>
                          <span style={{ fontWeight: 700, fontSize: '0.82rem',
                                         color: progress >= 100 ? 'var(--success)' : progress >= 70 ? color : 'var(--warning)',
                                         minWidth: 38, textAlign: 'right' }}>
                            {progress}%
                          </span>
                        </div>
                      </td>
                      <td className="cell-secondary" style={{ fontSize: '0.78rem' }}>{target.notes}</td>
                      {isManager && (
                        <td>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button className="btn btn-icon btn-ghost"
                              onClick={() => { setEditItem(target); setMemberFormMode(!!target.employeeName); setShowForm(true); }}>
                              <Edit3 size={13} />
                            </button>
                            <button className="btn btn-icon btn-ghost" style={{ color: 'var(--danger)' }}
                              onClick={() => handleDelete(target)}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      )}
                      {isLeader && (
                        <td>
                          {(target.employeeName && target.teamGroup === myTeamGroup) ? (
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button className="btn btn-icon btn-ghost"
                                onClick={() => { setEditItem(target); setMemberFormMode(true); setShowForm(true); }}>
                                <Edit3 size={13} />
                              </button>
                              <button className="btn btn-icon btn-ghost" style={{ color: 'var(--danger)' }}
                                onClick={() => handleDelete(target)}>
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && canEdit && (
        <TargetFormModal
          item={editItem}
          period={period}
          sites={sites.filter(s => s.active)}
          memberMode={memberFormMode}
          teamMembers={teamMembers}
          isLeader={isLeader}
          myTeamGroup={myTeamGroup}
          currentUser={currentUser}
          onClose={() => { setShowForm(false); setEditItem(null); }}
          onSave={(data) => {
            if (editItem) {
              updateKpiTarget(editItem.id, data);
              toast.success('Đã cập nhật target');
            } else {
              addKpiTarget({
                id: generateId(), period, teamGroup: 'Bài viết', targetLinks: 0,
                ...data,
              } as MonthlyKPITarget);
              toast.success('Đã thêm target');
            }
            setShowForm(false);
            setEditItem(null);
          }}
        />
      )}
    </div>
  );
}

function TargetFormModal({ item, period, sites, memberMode, teamMembers, isLeader, myTeamGroup, currentUser, onClose, onSave }: {
  item: MonthlyKPITarget | null;
  period: string;
  sites: { id: string; name: string }[];
  memberMode: boolean;
  teamMembers: { id: string; name: string; teamGroup?: string }[];
  isLeader: boolean;
  myTeamGroup: string | null;
  currentUser: { name: string } | null;
  onClose: () => void;
  onSave: (data: Partial<MonthlyKPITarget>) => void;
}) {
  const [form, setForm] = useState<Partial<MonthlyKPITarget>>(item || {
    period,
    teamGroup: (isLeader && myTeamGroup ? myTeamGroup : 'Bài viết') as TeamGroup,
    siteId: '', taskType: '', employeeName: '',
    targetLinks: 100, notes: '',
    createdBy: currentUser?.name || '',
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px' }}>
        <div className="modal-header">
          <h3 className="modal-title">{item ? 'Chỉnh sửa Target' : memberMode ? 'Phân KPI cá nhân' : 'Thêm Target tổng nhóm'}</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={e => {
          e.preventDefault();
          if (!form.targetLinks || form.targetLinks <= 0) { toast.error('Cần target > 0'); return; }
          onSave(form);
        }}>
          <div className="modal-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Kỳ áp dụng *</label>
                <input className="form-input" type="month" value={form.period ?? ''}
                  onChange={e => setForm({ ...form, period: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Nhóm team *</label>
                <select className="form-select" value={form.teamGroup ?? ''}
                  onChange={e => setForm({ ...form, teamGroup: e.target.value as TeamGroup })}
                  disabled={isLeader}>
                  {TEAM_GROUPS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {/* Nhân viên (chỉ hiển khi memberMode) */}
            {memberMode && (
              <div className="form-group">
                <label className="form-label">Nhân viên *</label>
                <select className="form-select" value={form.employeeName ?? ''}
                  onChange={e => setForm({ ...form, employeeName: e.target.value || undefined })}>
                  <option value="">— Chọn nhân viên —</option>
                  {teamMembers
                    .filter(m => !isLeader || m.teamGroup === myTeamGroup)
                    .map(m => <option key={m.id} value={m.name}>{m.name}{m.teamGroup ? ` (${m.teamGroup})` : ''}</option>)}
                </select>
              </div>
            )}

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Site (tùy chọn)</label>
                <select className="form-select" value={form.siteId ?? ''}
                  onChange={e => setForm({ ...form, siteId: e.target.value || undefined })}>
                  <option value="">— Cả 2 site (tổng) —</option>
                  {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Đầu việc cụ thể (tùy chọn)</label>
                <select className="form-select" value={form.taskType ?? ''}
                  onChange={e => setForm({ ...form, taskType: e.target.value || undefined })}>
                  <option value="">— Tất cả đầu việc trong nhóm —</option>
                  {defaultTaskCategories.map(c =>
                    <option key={c.id} value={c.taskTypeName}>{c.taskTypeName}</option>
                  )}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Target số link *</label>
              <input className="form-input" type="number" min="1" value={form.targetLinks ?? 0}
                onChange={e => setForm({ ...form, targetLinks: parseInt(e.target.value) || 0 })} />
            </div>

            <div className="form-group">
              <label className="form-label">Ghi chú</label>
              <input className="form-input" value={form.notes ?? ''}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="VD: Push campaign Tết, ưu tiên 5 SKU mới..." />
            </div>

            <div style={{ padding: '10px 12px', background: 'var(--accent-50)',
                          borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', color: 'var(--primary-700)' }}>
              💡 Có thể tạo target ở nhiều cấp:
              <br />• <strong>Tổng nhóm</strong>: Bài viết = 2500 link (cả 2 site, mọi đầu việc)
              <br />• <strong>Theo site</strong>: Bài viết × Nhà thuốc = 1500 link
              <br />• <strong>Cụ thể</strong>: Bài viết × Nhà thuốc × Bài SEO = 800 link
              <br />Hệ thống tự cộng dồn theo cấp khi tính tiến độ.
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
            <button type="submit" className="btn btn-primary"><Save size={14} /> Lưu target</button>
          </div>
        </form>
      </div>
    </div>
  );
}
