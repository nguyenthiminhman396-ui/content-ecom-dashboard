import { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppStore } from '@/shared/store/appStore';
import {
  Gift, Plus, Edit3, Trash2, X, Save, Calendar, Search,
  TrendingUp, TrendingDown, Trophy, Briefcase, CheckCircle2, XCircle, Clock
} from 'lucide-react';
import type { BonusPoint, BonusStatus, MemberRole } from '@/shared/types';
import { exportCsv } from '@/shared/utils/helpers';
import toast from 'react-hot-toast';

function generateId(): string {
  return `bp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
}

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatPeriod(p: string): string {
  const [y, m] = p.split('-');
  return `Tháng ${parseInt(m)}/${y}`;
}

export default function BonusPointsPage() {
  const {
    bonusPoints, members, projects, currentUser, submissions,
    addBonusPoint, updateBonusPoint, deleteBonusPoint,
    approveBonusPoint, rejectBonusPoint,
  } = useAppStore();

  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<BonusPoint | null>(null);
  const [filterPeriod, setFilterPeriod] = useState<string>('');
  const [filterEmp,    setFilterEmp]    = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<BonusStatus | ''>('');
  const [search,       setSearch]       = useState('');
  const [presetEmployee, setPresetEmployee] = useState<string>('');
  const [presetPeriod,   setPresetPeriod]   = useState<string>('');

  // Auto-open form when navigated with ?employee=&period=
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const emp = searchParams.get('employee');
    const per = searchParams.get('period');
    if (emp || per) {
      setPresetEmployee(emp ?? '');
      setPresetPeriod(per ?? '');
      setEditItem(null);
      setShowForm(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isManager = currentUser?.role === 'Manager';
  const isLeader  = currentUser?.role === 'Leader';
  const canEdit = isManager || isLeader;

  // ── Phạm vi xem ──────────────────────────────────────────────────────────
  const visible = useMemo<BonusPoint[]>(() => {
    if (!currentUser) return [];
    if (isManager) return bonusPoints;
    if (isLeader) {
      const me = members.find(m => m.name === currentUser.name);
      if (!me?.teamGroup) return bonusPoints.filter(b => b.employeeName === currentUser.name);
      return bonusPoints.filter(b => {
        const emp = members.find(mm => mm.name === b.employeeName);
        return emp?.teamGroup === me.teamGroup || b.employeeName === currentUser.name;
      });
    }
    return bonusPoints.filter(b => b.employeeName === currentUser.name);
  }, [bonusPoints, currentUser, members, isManager, isLeader]);

  const periods = useMemo(() => {
    const set = new Set<string>([currentPeriod()]);
    visible.forEach(b => b.period && set.add(b.period));
    return Array.from(set).sort().reverse();
  }, [visible]);

  const employees = useMemo(() => {
    return Array.from(new Set([
      ...visible.map(b => b.employeeName),
      ...submissions.map(s => s.employeeName),
    ])).sort();
  }, [visible, submissions]);

  const pendingCount = useMemo(() => visible.filter(b => b.status === 'pending').length, [visible]);

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let data = visible;
    if (filterPeriod) data = data.filter(b => b.period === filterPeriod);
    if (filterEmp)    data = data.filter(b => b.employeeName === filterEmp);
    if (filterStatus) data = data.filter(b => b.status === filterStatus);
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(b =>
        b.employeeName.toLowerCase().includes(q) ||
        b.reason.toLowerCase().includes(q)
      );
    }
    return data.sort((a, b) => {
      // Pending first, then by date
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (b.status === 'pending' && a.status !== 'pending') return 1;
      return b.awardedAt.localeCompare(a.awardedAt);
    });
  }, [visible, filterPeriod, filterEmp, filterStatus, search]);

  // ── Stats — chỉ tính bonus đã APPROVED ───────────────────────────────────
  const stats = useMemo(() => {
    const approved = filtered.filter(b => b.status === 'approved');
    const total = approved.reduce((s, b) => s + b.amount, 0);
    const positive = approved.filter(b => b.amount > 0);
    const negative = approved.filter(b => b.amount < 0);
    const byEmp = new Map<string, number>();
    approved.forEach(b => byEmp.set(b.employeeName, (byEmp.get(b.employeeName) ?? 0) + b.amount));
    const top = Array.from(byEmp.entries()).sort((a, b) => b[1] - a[1])[0];
    return {
      total,
      positive: positive.reduce((s, b) => s + b.amount, 0),
      negative: negative.reduce((s, b) => s + b.amount, 0),
      count: filtered.length,
      approvedCount: approved.length,
      pendingCount: filtered.filter(b => b.status === 'pending').length,
      topEmployee: top ? { name: top[0], amount: top[1] } : null,
    };
  }, [filtered]);

  const handleDelete = (b: BonusPoint) => {
    if (!isManager) { toast.error('Chỉ Manager được xóa'); return; }
    if (window.confirm(`Xóa bonus ${b.amount}đ của ${b.employeeName}?`)) {
      deleteBonusPoint(b.id);
      toast.success('Đã xóa');
    }
  };

  const handleApprove = (b: BonusPoint) => {
    if (!isManager) { toast.error('Chỉ Manager được duyệt'); return; }
    approveBonusPoint(b.id, currentUser!.name);
    toast.success(`Đã duyệt bonus ${b.amount}đ cho ${b.employeeName}`);
  };

  const handleReject = (b: BonusPoint) => {
    if (!isManager) { toast.error('Chỉ Manager được từ chối'); return; }
    const note = window.prompt(`Lý do từ chối bonus ${b.amount}đ của ${b.employeeName}? (tùy chọn)`);
    if (note === null) return; // Cancel
    rejectBonusPoint(b.id, currentUser!.name, note || undefined);
    toast(`Đã từ chối bonus của ${b.employeeName}`, { icon: '✋' });
  };

  const handleExport = () => {
    if (filtered.length === 0) { toast.error('Không có dữ liệu'); return; }
    exportCsv(filtered.map(b => ({
      employee: b.employeeName,
      amount: b.amount,
      reason: b.reason,
      project: b.projectId ? (projects.find(p => p.id === b.projectId)?.name ?? '') : '',
      period: b.period,
      awardedAt: b.awardedAt,
      awardedBy: b.awardedBy,
    })), `bonus_${filterPeriod || 'all'}_${new Date().toISOString().slice(0, 10)}`);
    toast.success(`Đã export ${filtered.length} dòng`);
  };

  if (!currentUser) {
    return <div className="card" style={{ padding: '40px', textAlign: 'center' }}>Cần đăng nhập</div>;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">
            <Gift size={20} style={{ color: 'var(--accent-500)' }} />
            Điểm thưởng
            {isManager && pendingCount > 0 && (
              <span style={{
                marginLeft: 8, padding: '2px 10px',
                background: 'var(--warning-bg)', color: '#92400e',
                borderRadius: 'var(--radius-full)', fontSize: '0.75rem',
                fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                <Clock size={11} /> {pendingCount} chờ duyệt
              </span>
            )}
          </h2>
          <p className="page-subtitle">
            {isManager
              ? `Cấp bonus trực tiếp hoặc duyệt đề xuất từ Leader. ${pendingCount > 0 ? `🟡 ${pendingCount} đề xuất chờ duyệt.` : ''}`
              : isLeader
                ? 'Đề xuất bonus cho chính mình hoặc member trong team — Manager sẽ duyệt.'
                : 'Lịch sử điểm thưởng bạn đã nhận.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={handleExport}
            disabled={filtered.length === 0}>
            <Briefcase size={14} /> Export CSV
          </button>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => { setEditItem(null); setShowForm(true); }}>
              <Plus size={16} /> Cấp điểm thưởng
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: '20px' }}>
        <div className="stat-card">
          <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Tổng bonus</div>
          <div style={{ fontWeight: 800, fontSize: '1.6rem', marginTop: '2px',
                        color: stats.total >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {stats.total >= 0 ? '+' : ''}{stats.total.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}đ
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
            {stats.count} lượt cấp
          </div>
        </div>
        <div className="stat-card">
          <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Bonus tích cực</div>
          <div style={{ fontWeight: 800, fontSize: '1.6rem', color: 'var(--success)', marginTop: '2px' }}>
            +{stats.positive.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}đ
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
            <TrendingUp size={11} style={{ verticalAlign: 'middle' }} /> Thưởng
          </div>
        </div>
        <div className="stat-card">
          <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Bonus tiêu cực</div>
          <div style={{ fontWeight: 800, fontSize: '1.6rem', color: 'var(--danger)', marginTop: '2px' }}>
            {stats.negative.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}đ
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
            <TrendingDown size={11} style={{ verticalAlign: 'middle' }} /> Trừ điểm
          </div>
        </div>
        <div className="stat-card">
          <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Top nhận bonus</div>
          <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--primary-600)', marginTop: '2px' }}>
            {stats.topEmployee?.name ?? '—'}
          </div>
          {stats.topEmployee && (
            <div style={{ fontSize: '0.78rem', color: 'var(--success)', marginTop: '2px' }}>
              <Trophy size={11} style={{ verticalAlign: 'middle' }} /> {stats.topEmployee.amount.toFixed(0)}đ
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '14px', marginBottom: '16px',
                                     display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <Calendar size={14} color="var(--primary-500)" />
          <select className="form-select" value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)}
            style={{ width: 'auto', fontSize: '0.85rem' }}>
            <option value="">Tất cả tháng</option>
            {periods.map(p => <option key={p} value={p}>{formatPeriod(p)}</option>)}
          </select>
        </div>

        {(isManager || isLeader) && employees.length > 1 && (
          <select className="form-select" value={filterEmp} onChange={e => setFilterEmp(e.target.value)}
            style={{ width: 'auto', fontSize: '0.85rem' }}>
            <option value="">Tất cả nhân viên</option>
            {employees.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        )}

        <select className="form-select" value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as BonusStatus | '')}
          style={{ width: 'auto', fontSize: '0.85rem' }}>
          <option value="">Tất cả trạng thái</option>
          <option value="pending">🟡 Chờ duyệt</option>
          <option value="approved">✅ Đã duyệt</option>
          <option value="rejected">❌ Từ chối</option>
        </select>

        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input className="form-input" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Tìm theo tên, lý do..."
            style={{ paddingLeft: 30 }} />
        </div>
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {filtered.map(b => {
          const projectName = b.projectId ? (projects.find(p => p.id === b.projectId)?.name ?? '') : '';
          const isPositive = b.amount >= 0;
          const statusColor = b.status === 'approved' ? 'var(--success)'
                             : b.status === 'rejected' ? 'var(--danger)'
                             : 'var(--warning)';
          const cardOpacity = b.status === 'rejected' ? 0.55 : 1;
          const StatusIcon = b.status === 'approved' ? CheckCircle2
                             : b.status === 'rejected' ? XCircle
                             : Clock;
          return (
            <div key={b.id} style={{
              display: 'flex', alignItems: 'center', gap: '14px',
              padding: '14px 16px', background: 'var(--bg-card)',
              border: `1px solid var(--border-light)`,
              borderLeft: `4px solid ${statusColor}`,
              borderRadius: 'var(--radius-md)', opacity: cardOpacity,
              transition: 'opacity 0.2s',
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: '12px', flexShrink: 0,
                background: isPositive ? 'var(--success-bg)' : 'var(--danger-bg)',
                color: isPositive ? 'var(--success)' : 'var(--danger)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Gift size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {b.employeeName}
                  <span style={{ fontWeight: 800, fontSize: '1rem',
                                 color: isPositive ? 'var(--success)' : 'var(--danger)' }}>
                    {isPositive ? '+' : ''}{b.amount.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}đ
                  </span>
                  {/* Status badge */}
                  <span style={{
                    background: b.status === 'approved' ? 'var(--success-bg)'
                              : b.status === 'rejected' ? 'var(--danger-bg)'
                              : 'var(--warning-bg)',
                    color: b.status === 'approved' ? 'var(--success)'
                         : b.status === 'rejected' ? 'var(--danger)'
                         : '#92400e',
                    borderRadius: 'var(--radius-full)', padding: '2px 10px',
                    fontSize: '0.7rem', fontWeight: 700,
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                    <StatusIcon size={10} />
                    {b.status === 'approved' ? 'Đã duyệt'
                     : b.status === 'rejected' ? 'Từ chối'
                     : 'Chờ duyệt'}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontWeight: 400 }}>
                    · {formatPeriod(b.period)}
                  </span>
                  {projectName && (
                    <span style={{
                      background: 'var(--accent-100)', color: 'var(--primary-700)',
                      borderRadius: 'var(--radius-full)', padding: '1px 8px', fontSize: '0.72rem',
                    }}>📅 {projectName}</span>
                  )}
                </div>
                <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {b.reason}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                  Đề xuất bởi <strong>{b.awardedBy}</strong>{' '}
                  · {new Date(b.awardedAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}
                  {b.approvedBy && b.status === 'approved' && (
                    <> · <span style={{ color: 'var(--success)' }}>
                      Duyệt bởi {b.approvedBy} · {new Date(b.approvedAt!).toLocaleDateString('vi-VN')}
                    </span></>
                  )}
                  {b.approvedBy && b.status === 'rejected' && (
                    <> · <span style={{ color: 'var(--danger)' }}>
                      Từ chối bởi {b.approvedBy}
                      {b.rejectionNote && ` — "${b.rejectionNote}"`}
                    </span></>
                  )}
                </div>
              </div>
              {/* Action buttons */}
              {b.status === 'pending' && isManager && (
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button className="btn btn-primary"
                    style={{ fontSize: '0.78rem', padding: '4px 10px' }}
                    onClick={() => handleApprove(b)}>
                    <CheckCircle2 size={12} /> Duyệt
                  </button>
                  <button className="btn btn-secondary"
                    style={{ fontSize: '0.78rem', padding: '4px 10px', color: 'var(--danger)' }}
                    onClick={() => handleReject(b)}>
                    <XCircle size={12} /> Từ chối
                  </button>
                </div>
              )}
              {canEdit && b.status !== 'pending' && (
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button className="btn btn-icon btn-ghost"
                    onClick={() => { setEditItem(b); setShowForm(true); }}>
                    <Edit3 size={14} />
                  </button>
                  {isManager && (
                    <button className="btn btn-icon btn-ghost"
                      style={{ color: 'var(--danger)' }}
                      onClick={() => handleDelete(b)}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              )}
              {b.status === 'pending' && isLeader && b.awardedBy === currentUser?.name && (
                <button className="btn btn-icon btn-ghost"
                  style={{ color: 'var(--danger)' }}
                  onClick={() => {
                    if (window.confirm('Hủy đề xuất bonus này?')) {
                      deleteBonusPoint(b.id);
                      toast.success('Đã hủy đề xuất');
                    }
                  }}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-tertiary)',
                        background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
            <Gift size={32} style={{ opacity: 0.4 }} />
            <p style={{ marginTop: 8 }}>Chưa có điểm thưởng nào.</p>
          </div>
        )}
      </div>

      {showForm && canEdit && (
        <BonusFormModal
          item={editItem}
          isManager={isManager}
          currentUserName={currentUser.name}
          presetEmployee={presetEmployee}
          presetPeriod={presetPeriod}
          allMembers={members}
          // Leader chỉ chọn member trong team mình; Manager chọn được mọi role
          eligibleEmployees={isManager
            ? members.map(m => m.name)
            : (() => {
                const me = members.find(m => m.name === currentUser.name);
                if (!me?.teamGroup) return [currentUser.name];
                // Leader có thể thêm bonus cho chính mình + member trong team
                return [currentUser.name, ...members.filter(m => m.teamGroup === me.teamGroup && m.name !== currentUser.name).map(m => m.name)];
              })()}
          projects={projects}
          onClose={() => { setShowForm(false); setEditItem(null); }}
          onSave={(data, targetRole) => {
            // Quyết định status:
            // - Manager tạo → 'approved' luôn
            // - Leader tạo cho Member → 'pending' (chờ Manager duyệt)
            // - Leader không được tạo cho Leader/Manager (validate ở form đã chặn)
            let status: BonusStatus = 'approved';
            let approvedBy: string | undefined = currentUser.name;
            let approvedAt: string | undefined = new Date().toISOString();
            if (!isManager) {
              status = 'pending';
              approvedBy = undefined;
              approvedAt = undefined;
            }

            if (editItem) {
              updateBonusPoint(editItem.id, data);
              toast.success('Đã cập nhật bonus');
            } else {
              addBonusPoint({
                id: generateId(),
                employeeName: '',
                amount: 0,
                reason: '',
                period: currentPeriod(),
                awardedAt: new Date().toISOString(),
                awardedBy: currentUser.name,
                status,
                approvedBy,
                approvedAt,
                ...data,
              } as BonusPoint);
              if (isManager) {
                toast.success(`Đã cấp bonus${targetRole && targetRole !== 'Member' ? ` cho ${targetRole}` : ''}`);
              } else {
                toast.success('Đã gửi đề xuất — chờ Manager duyệt');
              }
            }
            setShowForm(false);
            setEditItem(null);
          }}
        />
      )}
    </div>
  );
}

// ── Form modal ────────────────────────────────────────────────────────────
function BonusFormModal({ item, isManager, currentUserName, presetEmployee, presetPeriod, allMembers, eligibleEmployees, projects, onClose, onSave }: {
  item: BonusPoint | null;
  isManager: boolean;
  currentUserName: string;
  presetEmployee?: string;
  presetPeriod?: string;
  allMembers: { name: string; role: MemberRole; teamGroup?: string }[];
  eligibleEmployees: string[];
  projects: { id: string; name: string }[];
  onClose: () => void;
  onSave: (data: Partial<BonusPoint>, targetRole?: MemberRole) => void;
}) {
  const [form, setForm] = useState<Partial<BonusPoint>>(item || {
    employeeName: presetEmployee || eligibleEmployees[0] || '',
    amount: 5,
    reason: '',
    projectId: '',
    period: presetPeriod || currentPeriod(),
    awardedAt: new Date().toISOString(),
    awardedBy: currentUserName,
  });

  const targetMember = allMembers.find(m => m.name === form.employeeName);
  const targetRole = targetMember?.role;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px' }}>
        <div className="modal-header">
          <h3 className="modal-title">{item ? 'Chỉnh sửa Bonus' : (isManager ? 'Cấp Điểm thưởng' : 'Đề xuất Điểm thưởng')}</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={e => {
          e.preventDefault();
          if (!form.employeeName) { toast.error('Chọn nhân viên'); return; }
          if (!form.reason?.trim()) { toast.error('Nhập lý do'); return; }
          if (form.amount === 0) { toast.error('Số điểm phải khác 0'); return; }
          // Validate: Leader chỉ đề xuất cho bản thân hoặc member trong team (đã lọc ở eligibleEmployees)
          if (!isManager && targetRole === 'Manager') {
            toast.error('Leader không được đề xuất bonus cho Manager.');
            return;
          }
          onSave(form, targetRole);
        }}>
          <div className="modal-body">
            {!isManager && (
              <div style={{ padding: '10px 12px', background: 'var(--warning-bg)',
                            border: '1px solid var(--warning)', borderRadius: 'var(--radius-md)',
                            fontSize: '0.82rem', color: '#92400e', marginBottom: '14px',
                            display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <Clock size={14} style={{ marginTop: 2, flexShrink: 0 }} />
                <span>
                  Đề xuất sẽ được gửi đến <strong>Manager</strong> để duyệt. Chỉ khi được duyệt,
                  bonus mới được cộng vào KPI của member.
                </span>
              </div>
            )}

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Nhân viên *</label>
                <select className="form-select" value={form.employeeName ?? ''}
                  onChange={e => setForm({ ...form, employeeName: e.target.value })}>
                  <option value="">— Chọn —</option>
                  {eligibleEmployees.map(e => {
                    const m = allMembers.find(x => x.name === e);
                    return (
                      <option key={e} value={e}>
                        {e}{m?.role && m.role !== 'Member' ? ` [${m.role}]` : ''}
                      </option>
                    );
                  })}
                </select>
                {!isManager && eligibleEmployees.length === 0 && (
                  <p style={{ fontSize: '0.74rem', color: 'var(--danger)', marginTop: 4 }}>
                    Bạn chưa được assign team — không có member nào để đề xuất.
                  </p>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Số điểm * <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(âm = trừ điểm)</span></label>
                <input className="form-input" type="number" step="0.5" value={form.amount ?? 0}
                  onChange={e => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="form-group">
                <label className="form-label">Kỳ áp dụng *</label>
                <input className="form-input" type="month" value={form.period ?? ''}
                  onChange={e => setForm({ ...form, period: e.target.value })} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Dự án liên quan (tùy chọn)</label>
              <select className="form-select" value={form.projectId ?? ''}
                onChange={e => setForm({ ...form, projectId: e.target.value })}>
                <option value="">— Không gắn dự án —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Lý do *</label>
              <textarea className="form-textarea" rows={3} value={form.reason ?? ''}
                onChange={e => setForm({ ...form, reason: e.target.value })}
                placeholder="VD: Hỗ trợ team Sản phẩm xử lý gấp 5 SKU ngoài task cứng, đề xuất ý tưởng campaign Tết..." />
            </div>

            {isManager && (
              <div style={{ padding: '10px 12px', background: 'var(--accent-50)', border: '1px solid var(--accent-200)',
                            borderRadius: 'var(--radius-md)', fontSize: '0.78rem', color: 'var(--primary-700)' }}>
                ✅ Bonus sẽ được <strong>duyệt ngay</strong> và cộng vào KPI tháng{' '}
                <strong>{form.period && formatPeriod(form.period)}</strong>.
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
            <button type="submit" className="btn btn-primary">
              <Save size={14} /> {isManager ? 'Cấp + Duyệt' : 'Gửi đề xuất'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
