import { useMemo, useState } from 'react';
import { useAppStore } from '@/shared/store/appStore';
import {
  Lightbulb, Plus, Edit3, Trash2, X, Save, Calendar,
  Sparkles, CheckCircle2, Clock, Archive
} from 'lucide-react';
import type { RnDLog, RnDStatus } from '@/shared/types';
import { exportCsv } from '@/shared/utils/helpers';
import toast from 'react-hot-toast';

function generateId(): string {
  return `rnd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
}
function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function formatPeriod(p: string): string {
  const [y, m] = p.split('-');
  return `Tháng ${parseInt(m)}/${y}`;
}

const STATUS_LABEL: Record<RnDStatus, { label: string; color: string; bg: string; icon: typeof Clock }> = {
  proposed:    { label: 'Đề xuất',     color: 'var(--text-tertiary)', bg: 'var(--bg-secondary)', icon: Lightbulb },
  in_progress: { label: 'Đang triển khai', color: 'var(--primary-600)', bg: 'var(--primary-50)', icon: Clock },
  completed:   { label: 'Hoàn thành',  color: 'var(--success)', bg: 'var(--success-bg)', icon: CheckCircle2 },
  archived:    { label: 'Lưu trữ',     color: 'var(--text-tertiary)', bg: 'var(--bg-secondary)', icon: Archive },
};

export default function RnDLogsPage() {
  const { rndLogs, members, currentUser, addRnDLog, updateRnDLog, deleteRnDLog } = useAppStore();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<RnDLog | null>(null);
  const [filterPeriod, setFilterPeriod] = useState<string>('');
  const [filterLead,   setFilterLead]   = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<RnDStatus | ''>('');

  const isManager = currentUser?.role === 'Manager';
  const isLeader  = currentUser?.role === 'Leader';
  const canEdit = isManager || isLeader;

  // Phạm vi xem
  const visible = useMemo<RnDLog[]>(() => {
    if (!currentUser) return [];
    if (isManager) return rndLogs;
    if (isLeader) return rndLogs.filter(l => l.leaderName === currentUser.name);
    return [];
  }, [rndLogs, currentUser, isManager, isLeader]);

  const periods = useMemo(() => {
    const set = new Set<string>([currentPeriod()]);
    visible.forEach(l => set.add(l.period));
    return Array.from(set).sort().reverse();
  }, [visible]);

  const leaders = useMemo(() => Array.from(new Set(visible.map(l => l.leaderName))).sort(), [visible]);

  const filtered = useMemo(() => {
    let data = visible;
    if (filterPeriod) data = data.filter(l => l.period === filterPeriod);
    if (filterLead)   data = data.filter(l => l.leaderName === filterLead);
    if (filterStatus) data = data.filter(l => l.status === filterStatus);
    return data.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [visible, filterPeriod, filterLead, filterStatus]);

  const stats = useMemo(() => ({
    total: filtered.length,
    completed: filtered.filter(l => l.status === 'completed').length,
    inProgress: filtered.filter(l => l.status === 'in_progress').length,
    totalImpact: filtered.filter(l => l.status === 'completed').reduce((s, l) => s + l.impact, 0),
  }), [filtered]);

  const handleDelete = (l: RnDLog) => {
    if (!isManager && l.leaderName !== currentUser?.name) {
      toast.error('Chỉ Manager hoặc Lead sở hữu mới được xóa');
      return;
    }
    if (window.confirm(`Xóa R&D log "${l.title}"?`)) {
      deleteRnDLog(l.id);
      toast.success('Đã xóa');
    }
  };

  const handleExport = () => {
    if (filtered.length === 0) return;
    exportCsv(filtered.map(l => ({
      id: l.id, leaderName: l.leaderName, period: l.period,
      title: l.title, description: l.description,
      impact: l.impact, status: l.status, createdAt: l.createdAt,
    })), `rnd_${filterPeriod || 'all'}_${new Date().toISOString().slice(0, 10)}`);
    toast.success(`Đã export ${filtered.length} dòng`);
  };

  if (!currentUser) {
    return <div className="card" style={{ padding: '40px', textAlign: 'center' }}>Cần đăng nhập</div>;
  }

  if (!isManager && !isLeader) {
    return (
      <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
        <Lightbulb size={28} color="var(--warning)" />
        <p style={{ marginTop: '10px' }}>Chỉ Manager / Leader mới truy cập trang R&D Log.</p>
      </div>
    );
  }

  const leadList = isManager
    ? Array.from(new Set([...leaders, ...members.filter(m => m.role === 'Leader' || m.role === 'Manager').map(m => m.name)]))
    : [currentUser.name];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">
            <Lightbulb size={20} style={{ color: '#F59E0B' }} />
            R&D Log — Sáng kiến / Quy trình mới
          </h2>
          <p className="page-subtitle">
            {isManager
              ? 'Theo dõi đầu ra R&D của các Lead — đo bằng số log + impact, ảnh hưởng Leadership Score.'
              : 'Ghi nhận sáng kiến, quy trình mới bạn đề xuất/triển khai. Đây là 1 trong 4 chiều quản lý.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={handleExport}
            disabled={filtered.length === 0}>
            Export CSV
          </button>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => { setEditItem(null); setShowForm(true); }}>
              <Plus size={16} /> Thêm log
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: '20px' }}>
        <div className="stat-card">
          <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Tổng log</div>
          <div style={{ fontWeight: 800, fontSize: '1.6rem', color: 'var(--primary-600)' }}>{stats.total}</div>
        </div>
        <div className="stat-card">
          <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Hoàn thành</div>
          <div style={{ fontWeight: 800, fontSize: '1.6rem', color: 'var(--success)' }}>{stats.completed}</div>
        </div>
        <div className="stat-card">
          <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Đang triển khai</div>
          <div style={{ fontWeight: 800, fontSize: '1.6rem', color: 'var(--accent-500)' }}>{stats.inProgress}</div>
        </div>
        <div className="stat-card">
          <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Tổng impact (đã hoàn thành)</div>
          <div style={{ fontWeight: 800, fontSize: '1.6rem', color: '#F59E0B' }}>
            <Sparkles size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            {stats.totalImpact}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '14px', marginBottom: '16px',
                                     display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <Calendar size={14} color="var(--primary-500)" />
        <select className="form-select" value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)}
          style={{ width: 'auto', fontSize: '0.85rem' }}>
          <option value="">Tất cả tháng</option>
          {periods.map(p => <option key={p} value={p}>{formatPeriod(p)}</option>)}
        </select>
        {isManager && leaders.length > 1 && (
          <select className="form-select" value={filterLead} onChange={e => setFilterLead(e.target.value)}
            style={{ width: 'auto', fontSize: '0.85rem' }}>
            <option value="">Tất cả Lead</option>
            {leaders.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
        <select className="form-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value as RnDStatus | '')}
          style={{ width: 'auto', fontSize: '0.85rem' }}>
          <option value="">Tất cả trạng thái</option>
          {(['proposed', 'in_progress', 'completed', 'archived'] as RnDStatus[]).map(s =>
            <option key={s} value={s}>{STATUS_LABEL[s].label}</option>)}
        </select>
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filtered.map(l => {
          const meta = STATUS_LABEL[l.status];
          const Icon = meta.icon;
          return (
            <div key={l.id} style={{
              display: 'flex', gap: '14px', padding: '14px 16px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-light)',
              borderLeft: `4px solid ${meta.color}`,
              borderRadius: 'var(--radius-md)',
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: '12px', flexShrink: 0,
                background: meta.bg, color: meta.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '0.95rem' }}>{l.title}</strong>
                  <span style={{
                    background: meta.bg, color: meta.color, borderRadius: 'var(--radius-full)',
                    padding: '1px 8px', fontSize: '0.72rem', fontWeight: 600,
                  }}>{meta.label}</span>
                  <span style={{ fontSize: '0.7rem', color: '#F59E0B', fontWeight: 700 }}>
                    Impact: {'★'.repeat(l.impact)}{'☆'.repeat(5 - l.impact)}
                  </span>
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {l.description}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                  {l.leaderName} · {formatPeriod(l.period)} · {new Date(l.createdAt).toLocaleDateString('vi-VN')}
                </div>
              </div>
              {(isManager || l.leaderName === currentUser.name) && (
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button className="btn btn-icon btn-ghost"
                    onClick={() => { setEditItem(l); setShowForm(true); }}>
                    <Edit3 size={14} />
                  </button>
                  <button className="btn btn-icon btn-ghost"
                    style={{ color: 'var(--danger)' }}
                    onClick={() => handleDelete(l)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-tertiary)',
                        background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
            <Lightbulb size={32} style={{ opacity: 0.4 }} />
            <p style={{ marginTop: 8 }}>Chưa có log R&D nào.</p>
          </div>
        )}
      </div>

      {showForm && canEdit && (
        <RnDFormModal
          item={editItem}
          leaders={leadList}
          defaultLeader={isLeader ? currentUser.name : (leadList[0] ?? '')}
          onClose={() => { setShowForm(false); setEditItem(null); }}
          onSave={(data) => {
            if (editItem) {
              updateRnDLog(editItem.id, data);
              toast.success('Đã cập nhật');
            } else {
              addRnDLog({
                id: generateId(), period: currentPeriod(), title: '', description: '',
                impact: 3, status: 'proposed', leaderName: currentUser.name,
                createdAt: new Date().toISOString(), ...data,
              } as RnDLog);
              toast.success('Đã thêm log R&D');
            }
            setShowForm(false);
            setEditItem(null);
          }}
        />
      )}
    </div>
  );
}

function RnDFormModal({ item, leaders, defaultLeader, onClose, onSave }: {
  item: RnDLog | null;
  leaders: string[];
  defaultLeader: string;
  onClose: () => void;
  onSave: (data: Partial<RnDLog>) => void;
}) {
  const [form, setForm] = useState<Partial<RnDLog>>(item || {
    leaderName: defaultLeader, period: currentPeriod(),
    title: '', description: '', impact: 3, status: 'proposed',
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px' }}>
        <div className="modal-header">
          <h3 className="modal-title">{item ? 'Chỉnh sửa R&D Log' : 'Thêm R&D Log'}</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={e => {
          e.preventDefault();
          if (!form.title?.trim()) { toast.error('Cần tiêu đề'); return; }
          onSave(form);
        }}>
          <div className="modal-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Lead phụ trách *</label>
                <select className="form-select" value={form.leaderName ?? ''}
                  onChange={e => setForm({ ...form, leaderName: e.target.value })}>
                  {leaders.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Kỳ áp dụng *</label>
                <input className="form-input" type="month" value={form.period ?? ''}
                  onChange={e => setForm({ ...form, period: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Trạng thái</label>
                <select className="form-select" value={form.status ?? 'proposed'}
                  onChange={e => setForm({ ...form, status: e.target.value as RnDStatus })}>
                  {(['proposed','in_progress','completed','archived'] as RnDStatus[]).map(s =>
                    <option key={s} value={s}>{STATUS_LABEL[s].label}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Tiêu đề *</label>
              <input className="form-input" value={form.title ?? ''}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="VD: Quy trình duyệt FAQ tự động hóa" />
            </div>

            <div className="form-group">
              <label className="form-label">Mô tả</label>
              <textarea className="form-textarea" rows={3} value={form.description ?? ''}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Chi tiết sáng kiến, quy trình, lợi ích..." />
            </div>

            <div className="form-group">
              <label className="form-label">Impact (1-5) *</label>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                {[1, 2, 3, 4, 5].map(s => (
                  <button key={s} type="button" onClick={() => setForm({ ...form, impact: s })}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: s <= (form.impact ?? 3) ? '#F59E0B' : '#E2E8F0',
                      fontSize: '1.6rem', lineHeight: 1, padding: '2px',
                    }}>★</button>
                ))}
                <span style={{ marginLeft: '10px', fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>
                  {form.impact}/5
                </span>
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
            <button type="submit" className="btn btn-primary"><Save size={14} /> Lưu</button>
          </div>
        </form>
      </div>
    </div>
  );
}
