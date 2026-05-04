import { useState, useMemo } from 'react';
import {
  Wallet, Plus, Edit3, Trash2, X, Save, Search, Filter, Calendar,
  TrendingUp, DollarSign, FolderKanban, FileText
} from 'lucide-react';
import { useAppStore } from '@/shared/store/appStore';
import type { Expense } from '@/shared/types';
import toast from 'react-hot-toast';

function generateId(prefix = 'exp'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function formatCurrency(n: number): string {
  return n.toLocaleString('vi-VN') + 'đ';
}

const EXPENSE_CATEGORIES = [
  'Nhân sự', 'Công cụ / Phần mềm', 'Quảng cáo', 'Nội dung', 'Thiết kế',
  'Vận hành', 'Đào tạo', 'Outsource', 'Khác',
];

export default function ExpensesPage() {
  const {
    currentUser, expenses, projects,
    addExpense, updateExpense, deleteExpense,
  } = useAppStore();

  const isManagerOrLeader = currentUser?.role === 'Manager' || currentUser?.role === 'Leader';

  // ── Filters ──
  const [search, setSearch] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const now = new Date();
  const [dateFrom, setDateFrom] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  );
  const [dateTo, setDateTo] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`
  );

  // ── Form modal ──
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<Expense | null>(null);

  // ── Filtered data ──
  const filtered = useMemo(() => {
    return expenses
      .filter(e => {
        if (filterProject && e.projectId !== filterProject) return false;
        if (filterCategory && e.category !== filterCategory) return false;
        if (dateFrom && e.date < dateFrom) return false;
        if (dateTo && e.date > dateTo) return false;
        if (search) {
          const q = search.toLowerCase();
          return (
            e.category.toLowerCase().includes(q) ||
            e.notes.toLowerCase().includes(q) ||
            e.createdBy.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [expenses, search, filterProject, filterCategory, dateFrom, dateTo]);

  // ── Stats ──
  const totalAmount = filtered.reduce((s, e) => s + e.amount, 0);
  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach(e => map.set(e.category, (map.get(e.category) ?? 0) + e.amount));
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1]);
  }, [filtered]);
  const projectBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach(e => {
      const pName = projects.find(p => p.id === e.projectId)?.name ?? 'Không gắn dự án';
      map.set(pName, (map.get(pName) ?? 0) + e.amount);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1]);
  }, [filtered, projects]);

  // ── Unique categories from data ──
  const allCategories = useMemo(() => {
    const set = new Set(expenses.map(e => e.category));
    EXPENSE_CATEGORIES.forEach(c => set.add(c));
    return Array.from(set).sort();
  }, [expenses]);

  const openAdd = () => { setEditItem(null); setFormOpen(true); };
  const openEdit = (e: Expense) => { setEditItem(e); setFormOpen(true); };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">
            <span className="icon"><Wallet size={20} /></span>
            Quản lý Chi phí
          </h2>
          <p className="page-subtitle">
            Theo dõi và quản lý chi phí dự án, vận hành
          </p>
        </div>
        {isManagerOrLeader && (
          <button className="btn btn-primary" onClick={openAdd}>
            <Plus size={14} /> Thêm chi phí
          </button>
        )}
      </div>

      {/* ── Stats Cards ── */}
      <div className="stats-grid" style={{ marginBottom: '20px' }}>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--primary-50)', color: 'var(--primary-600)' }}>
            <DollarSign size={20} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{formatCurrency(totalAmount)}</div>
            <div className="stat-label">Tổng chi phí</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--accent-50)', color: 'var(--accent-600)' }}>
            <FileText size={20} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{filtered.length}</div>
            <div className="stat-label">Khoản mục</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
            <FolderKanban size={20} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{projectBreakdown.length}</div>
            <div className="stat-label">Dự án liên quan</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>
            <TrendingUp size={20} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{categoryBreakdown.length}</div>
            <div className="stat-label">Loại chi phí</div>
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 200px' }}>
            <Search size={14} color="var(--text-tertiary)" />
            <input className="form-input" placeholder="Tìm hạng mục, ghi chú, người tạo..."
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ fontSize: '0.85rem' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Filter size={14} color="var(--text-tertiary)" />
            <select className="form-select" style={{ maxWidth: '180px', fontSize: '0.85rem' }}
              value={filterProject} onChange={e => setFilterProject(e.target.value)}>
              <option value="">Tất cả dự án</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <select className="form-select" style={{ maxWidth: '160px', fontSize: '0.85rem' }}
            value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
            <option value="">Tất cả loại</option>
            {allCategories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Calendar size={14} color="var(--text-tertiary)" />
            <input className="form-input" type="date" value={dateFrom}
              onChange={e => setDateFrom(e.target.value)} style={{ fontSize: '0.82rem', maxWidth: '140px' }} />
            <span style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>→</span>
            <input className="form-input" type="date" value={dateTo}
              onChange={e => setDateTo(e.target.value)} style={{ fontSize: '0.82rem', maxWidth: '140px' }} />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '16px', alignItems: 'flex-start' }}>
        {/* ── Table ── */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Danh sách chi phí ({filtered.length})</span>
          </div>
          {filtered.length === 0 ? (
            <div className="card-body" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
              Không có khoản chi phí nào.
            </div>
          ) : (
            <div className="data-table-wrapper" style={{ border: 'none', boxShadow: 'none' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Hạng mục</th>
                    <th>Dự án</th>
                    <th>Số tiền</th>
                    <th>Ngày</th>
                    <th>Người ghi</th>
                    <th>Ghi chú</th>
                    {isManagerOrLeader && <th>Thao tác</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(e => {
                    const proj = projects.find(p => p.id === e.projectId);
                    return (
                      <tr key={e.id}>
                        <td className="cell-title">
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                            background: 'var(--primary-50)', color: 'var(--primary-700)',
                            fontSize: '0.8rem', fontWeight: 600,
                          }}>{e.category}</span>
                        </td>
                        <td className="cell-secondary" style={{ fontSize: '0.82rem' }}>
                          {proj ? proj.name : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                        </td>
                        <td style={{ fontWeight: 700, color: 'var(--danger)', whiteSpace: 'nowrap' }}>
                          -{formatCurrency(e.amount)}
                        </td>
                        <td className="cell-secondary">{e.date}</td>
                        <td className="cell-secondary">{e.createdBy}</td>
                        <td className="cell-secondary" style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {e.notes || '—'}
                        </td>
                        {isManagerOrLeader && (
                          <td>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button className="btn btn-icon btn-ghost" onClick={() => openEdit(e)}>
                                <Edit3 size={13} />
                              </button>
                              <button className="btn btn-icon btn-ghost" style={{ color: 'var(--danger)' }}
                                onClick={() => {
                                  if (window.confirm(`Xóa chi phí "${e.category}" — ${formatCurrency(e.amount)}?`)) {
                                    deleteExpense(e.id);
                                    toast.success('Đã xóa chi phí');
                                  }
                                }}>
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 700 }}>
                    <td colSpan={2}>Tổng cộng</td>
                    <td style={{ color: 'var(--danger)' }}>-{formatCurrency(totalAmount)}</td>
                    <td colSpan={isManagerOrLeader ? 4 : 3}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* ── Breakdown sidebar ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* By category */}
          <div className="card" style={{ padding: '16px' }}>
            <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '12px',
                          display: 'flex', alignItems: 'center', gap: '6px' }}>
              <TrendingUp size={14} color="var(--primary-500)" /> Theo loại chi phí
            </div>
            {categoryBreakdown.length === 0 && (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>Chưa có dữ liệu</div>
            )}
            {categoryBreakdown.map(([cat, amount]) => {
              const pct = totalAmount > 0 ? Math.round((amount / totalAmount) * 100) : 0;
              return (
                <div key={cat} style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '3px' }}>
                    <span style={{ fontWeight: 600 }}>{cat}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{formatCurrency(amount)} ({pct}%)</span>
                  </div>
                  <div className="progress-bar-bg" style={{ height: 5 }}>
                    <div className="progress-bar-fill high" style={{ width: `${pct}%` }}></div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* By project */}
          <div className="card" style={{ padding: '16px' }}>
            <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '12px',
                          display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FolderKanban size={14} color="var(--accent-600)" /> Theo dự án
            </div>
            {projectBreakdown.length === 0 && (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>Chưa có dữ liệu</div>
            )}
            {projectBreakdown.map(([pName, amount]) => {
              const pct = totalAmount > 0 ? Math.round((amount / totalAmount) * 100) : 0;
              return (
                <div key={pName} style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '3px' }}>
                    <span style={{ fontWeight: 600 }}>{pName}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{formatCurrency(amount)} ({pct}%)</span>
                  </div>
                  <div className="progress-bar-bg" style={{ height: 5 }}>
                    <div className="progress-bar-fill medium" style={{ width: `${pct}%` }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Form Modal ── */}
      {formOpen && (
        <ExpenseFormModal
          item={editItem}
          projects={projects}
          categories={allCategories}
          createdBy={currentUser?.name ?? ''}
          onClose={() => setFormOpen(false)}
          onSave={(data) => {
            if (editItem) {
              updateExpense(editItem.id, data);
              toast.success('Đã cập nhật chi phí');
            } else {
              addExpense({ id: generateId('exp'), ...data } as Expense);
              toast.success('Đã thêm chi phí');
            }
            setFormOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ── Expense Form Modal ──
function ExpenseFormModal({ item, projects, categories, createdBy, onClose, onSave }: {
  item: Expense | null;
  projects: { id: string; name: string }[];
  categories: string[];
  createdBy: string;
  onClose: () => void;
  onSave: (data: Partial<Expense>) => void;
}) {
  const [form, setForm] = useState<Partial<Expense>>(item || {
    projectId: '', category: categories[0] ?? '', amount: 0,
    date: new Date().toISOString().slice(0, 10), createdBy, notes: '',
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <h3 className="modal-title">{item ? 'Chỉnh sửa chi phí' : 'Thêm chi phí mới'}</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={e => {
          e.preventDefault();
          if (!form.category) { toast.error('Chọn hạng mục'); return; }
          if (!form.amount || form.amount <= 0) { toast.error('Nhập số tiền'); return; }
          onSave(form);
        }}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Dự án *</label>
              <select className="form-select" value={form.projectId ?? ''}
                onChange={e => setForm({ ...form, projectId: e.target.value })}>
                <option value="">— Không gắn dự án —</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Hạng mục *</label>
                <select className="form-select" value={form.category ?? ''}
                  onChange={e => setForm({ ...form, category: e.target.value })}>
                  {categories.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Số tiền (VNĐ) *</label>
                <input className="form-input" type="number" min="1000" step="1000"
                  value={form.amount ?? 0}
                  onChange={e => setForm({ ...form, amount: parseInt(e.target.value) || 0 })}
                  placeholder="VD: 5000000" />
                {(form.amount ?? 0) > 0 && (
                  <p style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', marginTop: 4 }}>
                    = {formatCurrency(form.amount!)}
                  </p>
                )}
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Ngày</label>
                <input className="form-input" type="date" value={form.date ?? ''}
                  onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Người ghi</label>
                <input className="form-input" value={form.createdBy ?? ''}
                  onChange={e => setForm({ ...form, createdBy: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Ghi chú</label>
              <textarea className="form-textarea" rows={2} value={form.notes ?? ''}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Mô tả chi tiết khoản chi..." />
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
